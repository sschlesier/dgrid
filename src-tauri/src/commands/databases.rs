use mongodb::bson::{doc, Bson, Document};
use serde::Serialize;
use tauri::State;

use crate::error::DgridError;
use crate::state::AppState;

// --- Response types (matching contracts.ts) ---

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DatabaseInfo {
    pub name: String,
    pub size_on_disk: i64,
    pub empty: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CollectionInfo {
    pub name: String,
    #[serde(rename = "type")]
    pub collection_type: String,
    pub document_count: i64,
    pub avg_document_size: f64,
    pub total_size: i64,
    pub indexes: usize,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CollectionSchemaResponse {
    pub fields: Vec<String>,
    pub sample_size: usize,
}

// --- Helpers ---

async fn get_collection_stats(
    db: &mongodb::Database,
    collection_name: &str,
) -> (i64, f64, i64) {
    // Try $collStats first
    if let Ok(mut cursor) = db
        .collection::<Document>(collection_name)
        .aggregate(vec![doc! { "$collStats": { "storageStats": {} } }])
        .await
    {
        use futures_util::StreamExt;
        if let Some(Ok(result)) = cursor.next().await {
            if let Some(storage_stats) = result.get_document("storageStats").ok() {
                let count = get_i64(storage_stats, "count").unwrap_or(0);
                let avg_obj_size = get_f64(storage_stats, "avgObjSize").unwrap_or(0.0);
                let size = get_i64(storage_stats, "size").unwrap_or(0);
                return (count, avg_obj_size, size);
            }
        }
    }

    // Fallback: just get document count
    let count = db
        .collection::<Document>(collection_name)
        .count_documents(doc! {})
        .await
        .unwrap_or(0);

    (count as i64, 0.0, 0)
}

fn get_i64(doc: &Document, key: &str) -> Option<i64> {
    match doc.get(key)? {
        Bson::Int32(v) => Some(*v as i64),
        Bson::Int64(v) => Some(*v),
        Bson::Double(v) => Some(*v as i64),
        _ => None,
    }
}

fn get_f64(doc: &Document, key: &str) -> Option<f64> {
    match doc.get(key)? {
        Bson::Int32(v) => Some(*v as f64),
        Bson::Int64(v) => Some(*v as f64),
        Bson::Double(v) => Some(*v),
        _ => None,
    }
}

/// Recursively flatten a BSON document using dot-notation keys,
/// collecting just the key names (for schema discovery).
fn flatten_document_keys(doc: &Document, prefix: &str, keys: &mut Vec<String>) {
    for (key, value) in doc.iter() {
        let full_key = if prefix.is_empty() {
            key.clone()
        } else {
            format!("{prefix}.{key}")
        };

        match value {
            Bson::Document(inner) => {
                flatten_document_keys(inner, &full_key, keys);
            }
            _ => {
                keys.push(full_key);
            }
        }
    }
}

/// Collect the union of all flattened keys from a batch of documents, with _id first.
fn collect_columns(docs: &[Document]) -> Vec<String> {
    let mut key_set = indexmap::IndexSet::new();
    for doc in docs {
        let mut keys = Vec::new();
        flatten_document_keys(doc, "", &mut keys);
        for key in keys {
            key_set.insert(key);
        }
    }

    let mut columns = Vec::new();
    if key_set.swap_remove("_id") {
        columns.push("_id".to_string());
    }
    for key in key_set {
        columns.push(key);
    }
    columns
}

// --- Commands ---

#[tauri::command]
pub async fn get_databases(
    state: State<'_, AppState>,
    id: String,
) -> Result<Vec<DatabaseInfo>, DgridError> {
    let client = state
        .pool
        .get_client(&id)
        .await
        .ok_or_else(|| DgridError::NotFound {
            entity: "Connection".into(),
            id: id.clone(),
        })?;

    let result = client
        .database("admin")
        .run_command(doc! { "listDatabases": 1 })
        .await
        .map_err(|e| DgridError::Database(e.to_string()))?;

    let databases = result
        .get_array("databases")
        .map_err(|e| DgridError::Database(e.to_string()))?;

    let mut infos = Vec::new();
    for db in databases {
        if let Bson::Document(db_doc) = db {
            infos.push(DatabaseInfo {
                name: db_doc
                    .get_str("name")
                    .unwrap_or_default()
                    .to_string(),
                size_on_disk: get_i64(db_doc, "sizeOnDisk").unwrap_or(0),
                empty: db_doc.get_bool("empty").unwrap_or(false),
            });
        }
    }

    Ok(infos)
}

#[tauri::command]
pub async fn get_collections(
    state: State<'_, AppState>,
    id: String,
    database: String,
) -> Result<Vec<CollectionInfo>, DgridError> {
    let client = state
        .pool
        .get_client(&id)
        .await
        .ok_or_else(|| DgridError::NotFound {
            entity: "Connection".into(),
            id: id.clone(),
        })?;

    let db = client.database(&database);

    use futures_util::TryStreamExt;
    let collections: Vec<mongodb::results::CollectionSpecification> = db
        .list_collections()
        .await
        .map_err(|e| DgridError::Database(e.to_string()))?
        .try_collect()
        .await
        .map_err(|e| DgridError::Database(e.to_string()))?;

    let mut infos = Vec::new();
    for coll in &collections {
        let (count, avg_size, total_size) = get_collection_stats(&db, &coll.name).await;

        let indexes = if let Ok(cursor) = db
            .collection::<Document>(&coll.name)
            .list_indexes()
            .await
        {
            use futures_util::StreamExt;
            let index_results: Vec<Result<mongodb::IndexModel, mongodb::error::Error>> =
                cursor.collect().await;
            index_results.into_iter().filter(|r| r.is_ok()).count()
        } else {
            0
        };

        let coll_type = match coll.collection_type {
            mongodb::results::CollectionType::View => "view",
            _ => "collection",
        };

        infos.push(CollectionInfo {
            name: coll.name.clone(),
            collection_type: coll_type.to_string(),
            document_count: count,
            avg_document_size: avg_size,
            total_size,
            indexes,
        });
    }

    infos.sort_by(|a, b| a.name.cmp(&b.name));
    Ok(infos)
}

#[tauri::command]
pub async fn get_collection_stats_cmd(
    state: State<'_, AppState>,
    id: String,
    database: String,
    collection: String,
) -> Result<CollectionInfo, DgridError> {
    let client = state
        .pool
        .get_client(&id)
        .await
        .ok_or_else(|| DgridError::NotFound {
            entity: "Connection".into(),
            id: id.clone(),
        })?;

    let db = client.database(&database);
    let (count, avg_size, total_size) = get_collection_stats(&db, &collection).await;

    let indexes = if let Ok(cursor) = db
        .collection::<Document>(&collection)
        .list_indexes()
        .await
    {
        use futures_util::StreamExt;
        cursor
            .collect::<Vec<_>>()
            .await
            .into_iter()
            .filter_map(|r| r.ok())
            .count()
    } else {
        0
    };

    Ok(CollectionInfo {
        name: collection,
        collection_type: "collection".to_string(),
        document_count: count,
        avg_document_size: avg_size,
        total_size,
        indexes,
    })
}

#[tauri::command]
pub async fn get_schema(
    state: State<'_, AppState>,
    id: String,
    database: String,
    collection: String,
) -> Result<CollectionSchemaResponse, DgridError> {
    let client = state
        .pool
        .get_client(&id)
        .await
        .ok_or_else(|| DgridError::NotFound {
            entity: "Connection".into(),
            id: id.clone(),
        })?;

    let db = client.database(&database);

    use futures_util::TryStreamExt;
    let docs: Vec<Document> = db
        .collection::<Document>(&collection)
        .aggregate(vec![doc! { "$sample": { "size": 100 } }])
        .await
        .map_err(|e| DgridError::Database(e.to_string()))?
        .try_collect()
        .await
        .map_err(|e| DgridError::Database(e.to_string()))?;

    let fields = collect_columns(&docs);
    let sample_size = docs.len();

    Ok(CollectionSchemaResponse {
        fields,
        sample_size,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn flatten_simple_document() {
        let doc = doc! {
            "_id": "123",
            "name": "Alice",
            "age": 30
        };
        let mut keys = Vec::new();
        flatten_document_keys(&doc, "", &mut keys);
        assert!(keys.contains(&"_id".to_string()));
        assert!(keys.contains(&"name".to_string()));
        assert!(keys.contains(&"age".to_string()));
    }

    #[test]
    fn flatten_nested_document() {
        let doc = doc! {
            "user": {
                "name": "Alice",
                "address": {
                    "city": "NYC"
                }
            }
        };
        let mut keys = Vec::new();
        flatten_document_keys(&doc, "", &mut keys);
        assert!(keys.contains(&"user.name".to_string()));
        assert!(keys.contains(&"user.address.city".to_string()));
    }

    #[test]
    fn flatten_array_not_recursed() {
        let doc = doc! {
            "tags": ["a", "b"],
            "name": "test"
        };
        let mut keys = Vec::new();
        flatten_document_keys(&doc, "", &mut keys);
        assert!(keys.contains(&"tags".to_string()));
        assert!(keys.contains(&"name".to_string()));
    }

    #[test]
    fn collect_columns_id_first() {
        let docs = vec![
            doc! { "name": "Alice", "_id": "1", "age": 30 },
            doc! { "_id": "2", "email": "bob@test.com" },
        ];
        let columns = collect_columns(&docs);
        assert_eq!(columns[0], "_id");
        assert!(columns.contains(&"name".to_string()));
        assert!(columns.contains(&"age".to_string()));
        assert!(columns.contains(&"email".to_string()));
    }

    #[test]
    fn collect_columns_no_id() {
        let docs = vec![doc! { "name": "Alice" }];
        let columns = collect_columns(&docs);
        assert_eq!(columns, vec!["name"]);
    }

    #[test]
    fn collect_columns_empty() {
        let columns = collect_columns(&[]);
        assert!(columns.is_empty());
    }
}
