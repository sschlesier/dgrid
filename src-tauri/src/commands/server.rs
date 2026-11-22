use mongodb::bson::{doc, Document};
use serde::Serialize;
use serde_json::{Map, Value};
use tauri::State;

use crate::bson_ser::serialize_bson_value;
use crate::error::DgridError;
use crate::state::AppState;

/// One section of the server info: the whitelisted fields, or the error
/// the server returned for the command that backs it.
#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ServerInfoSection {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub data: Option<Map<String, Value>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ServerInfoResponse {
    pub build: ServerInfoSection,
    pub runtime: ServerInfoSection,
    pub topology: ServerInfoSection,
}

const BUILD_FIELDS: &[&str] = &[
    "version",
    "gitVersion",
    "modules",
    "allocator",
    "javascriptEngine",
    "bits",
    "debug",
    "maxBsonObjectSize",
    "storageEngines",
    "openssl",
];

const RUNTIME_FIELDS: &[&str] = &["host", "process", "pid", "uptime", "localTime"];

const TOPOLOGY_FIELDS: &[&str] = &[
    "setName",
    "isWritablePrimary",
    "primary",
    "hosts",
    "maxWireVersion",
    "minWireVersion",
    "maxMessageSizeBytes",
    "maxWriteBatchSize",
    "logicalSessionTimeoutMinutes",
];

fn insert_present(out: &mut Map<String, Value>, doc: &Document, key: &str, as_key: &str) {
    if let Some(value) = doc.get(key) {
        out.insert(as_key.to_string(), serialize_bson_value(value));
    }
}

fn pick(doc: &Document, fields: &[&str]) -> Map<String, Value> {
    let mut out = Map::new();
    for field in fields {
        insert_present(&mut out, doc, field, field);
    }
    out
}

fn section(result: Result<Map<String, Value>, String>) -> ServerInfoSection {
    match result {
        Ok(data) => ServerInfoSection {
            data: Some(data),
            error: None,
        },
        Err(error) => ServerInfoSection {
            data: None,
            error: Some(error),
        },
    }
}

fn build_section(doc: &Document) -> Map<String, Value> {
    let mut out = pick(doc, BUILD_FIELDS);
    if let Ok(env) = doc.get_document("buildEnvironment") {
        let target = pick(env, &["target_os", "target_arch"]);
        if !target.is_empty() {
            out.insert("buildEnvironment".into(), Value::Object(target));
        }
    }
    out
}

fn runtime_section(doc: &Document) -> Map<String, Value> {
    let mut out = pick(doc, RUNTIME_FIELDS);
    if let Ok(engine) = doc.get_document("storageEngine") {
        insert_present(&mut out, engine, "name", "storageEngine");
    }
    if let Ok(connections) = doc.get_document("connections") {
        insert_present(&mut out, connections, "current", "connectionsCurrent");
        insert_present(&mut out, connections, "available", "connectionsAvailable");
    }
    out
}

/// Builds the response from the three command results (or their error messages).
pub fn build_server_info(
    build_info: Result<Document, String>,
    server_status: Result<Document, String>,
    hello: Result<Document, String>,
) -> ServerInfoResponse {
    ServerInfoResponse {
        build: section(build_info.map(|d| build_section(&d))),
        runtime: section(server_status.map(|d| runtime_section(&d))),
        topology: section(hello.map(|d| pick(&d, TOPOLOGY_FIELDS))),
    }
}

// --- Commands ---

#[tauri::command]
pub async fn get_server_info(
    state: State<'_, AppState>,
    id: String,
) -> Result<ServerInfoResponse, DgridError> {
    let client = state
        .pool
        .get_client(&id)
        .await
        .ok_or_else(|| DgridError::NotFound {
            entity: "Connection".into(),
            id: id.clone(),
        })?;

    let admin = client.database("admin");
    let status_cmd = doc! {
        "serverStatus": 1,
        "repl": 0,
        "metrics": 0,
        "locks": 0,
        "wiredTiger": 0,
        "asserts": 0,
        "opcounters": 0,
        "opcountersRepl": 0,
        "tcmalloc": 0,
        "transactions": 0,
        "network": 0,
        "mem": 0,
        "extra_info": 0,
        "globalLock": 0,
        "flowControl": 0,
        "security": 0,
    };

    let (build_info, server_status, hello) = tokio::join!(
        admin.run_command(doc! { "buildInfo": 1 }),
        admin.run_command(status_cmd),
        admin.run_command(doc! { "hello": 1 }),
    );

    Ok(build_server_info(
        build_info.map_err(|e| e.to_string()),
        server_status.map_err(|e| e.to_string()),
        hello.map_err(|e| e.to_string()),
    ))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sample_build_info() -> Document {
        doc! {
            "version": "7.0.5",
            "gitVersion": "abc123",
            "allocator": "tcmalloc",
            "bits": 64,
            "debug": false,
            "maxBsonObjectSize": 16777216,
            "buildEnvironment": { "target_os": "linux", "target_arch": "x86_64", "cc": "gcc" },
            "ok": 1.0,
        }
    }

    fn sample_server_status() -> Document {
        doc! {
            "host": "db1:27017",
            "process": "mongod",
            "pid": 42_i64,
            "uptime": 3600.0,
            "storageEngine": { "name": "wiredTiger", "persistent": true },
            "connections": { "current": 3, "available": 800 },
            "wiredTiger": { "huge": "dump" },
        }
    }

    #[test]
    fn builds_all_sections_from_whitelisted_fields() {
        let info = build_server_info(
            Ok(sample_build_info()),
            Ok(sample_server_status()),
            Ok(
                doc! { "setName": "rs0", "isWritablePrimary": true, "maxWireVersion": 21, "extra": 1 },
            ),
        );

        let build = info.build.data.unwrap();
        assert_eq!(build["version"], Value::String("7.0.5".into()));
        assert_eq!(build["buildEnvironment"]["target_os"], "linux");
        assert!(build["buildEnvironment"].get("cc").is_none());
        assert!(!build.contains_key("ok"));

        let runtime = info.runtime.data.unwrap();
        assert_eq!(runtime["storageEngine"], "wiredTiger");
        assert_eq!(runtime["connectionsCurrent"], 3);
        assert_eq!(runtime["connectionsAvailable"], 800);
        assert!(!runtime.contains_key("wiredTiger"));

        let topology = info.topology.data.unwrap();
        assert_eq!(topology["setName"], "rs0");
        assert_eq!(topology["isWritablePrimary"], true);
        assert!(!topology.contains_key("extra"));
    }

    #[test]
    fn omits_fields_the_server_does_not_report() {
        let info = build_server_info(
            Ok(doc! { "version": "7.0.5" }),
            Ok(doc! { "host": "db1" }),
            Ok(doc! { "maxWireVersion": 21 }),
        );

        let build = info.build.data.unwrap();
        assert_eq!(build.len(), 1);
        let runtime = info.runtime.data.unwrap();
        assert!(!runtime.contains_key("connectionsCurrent"));
        assert!(!runtime.contains_key("storageEngine"));
        let topology = info.topology.data.unwrap();
        assert!(!topology.contains_key("setName"));
    }

    #[test]
    fn failed_section_carries_error_and_others_still_render() {
        let info = build_server_info(
            Ok(sample_build_info()),
            Err("not authorized on admin to execute command serverStatus".into()),
            Ok(doc! { "maxWireVersion": 21 }),
        );

        assert!(info.build.data.is_some());
        assert!(info.runtime.data.is_none());
        assert_eq!(
            info.runtime.error.as_deref(),
            Some("not authorized on admin to execute command serverStatus")
        );
        assert!(info.topology.data.is_some());
    }

    #[test]
    fn serializes_sections_as_data_or_error() {
        let info = build_server_info(
            Ok(doc! { "version": "7.0.5" }),
            Err("denied".into()),
            Err("x".into()),
        );
        let json = serde_json::to_value(&info).unwrap();
        assert_eq!(json["build"]["data"]["version"], "7.0.5");
        assert!(json["build"].get("error").is_none());
        assert_eq!(json["runtime"]["error"], "denied");
        assert!(json["runtime"].get("data").is_none());
    }
}
