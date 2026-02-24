use std::io::Write;

use mongodb::bson::Document;
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, State};
use tokio_util::sync::CancellationToken;

use crate::bson_ser;
use crate::csv;
use crate::error::DgridError;
use crate::executor::{CollectionOperation, ParsedCollectionQuery, ParsedQuery};
use crate::state::AppState;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportCsvRequest {
    pub query: ParsedQuery,
    pub database: String,
    pub file_path: String,
    pub tab_id: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportProgress {
    pub tab_id: String,
    pub exported_count: u64,
    pub total_count: u64,
    pub done: bool,
    pub error: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportCsvResponse {
    pub success: bool,
    pub exported_count: u64,
}

const BUFFER_SIZE: usize = 100;

#[tauri::command]
pub async fn export_csv(
    app: AppHandle,
    state: State<'_, AppState>,
    id: String,
    request: ExportCsvRequest,
) -> Result<ExportCsvResponse, DgridError> {
    // Validate query type: only find and aggregate are supported
    let collection_query = match &request.query {
        ParsedQuery::Collection(q)
            if q.operation == CollectionOperation::Find
                || q.operation == CollectionOperation::Aggregate =>
        {
            q
        }
        _ => {
            return Err(DgridError::Validation(
                "CSV export only supports find and aggregate queries.".into(),
            ));
        }
    };

    let db = state
        .pool
        .get_db(&id, Some(&request.database))
        .await
        .ok_or_else(|| DgridError::NotFound {
            entity: "Connection".into(),
            id: id.clone(),
        })?;

    // Set up cancellation token
    let token = CancellationToken::new();
    {
        let mut tokens = state.cancellation_tokens.write().await;
        if let Some(old) = tokens.remove(&request.tab_id) {
            old.cancel();
        }
        tokens.insert(request.tab_id.clone(), token.clone());
    }

    let result = export_csv_inner(
        &app,
        &db,
        collection_query,
        &request.file_path,
        &request.tab_id,
        &token,
    )
    .await;

    // Clean up token
    {
        let mut tokens = state.cancellation_tokens.write().await;
        tokens.remove(&request.tab_id);
    }

    match result {
        Ok(count) => Ok(ExportCsvResponse {
            success: true,
            exported_count: count,
        }),
        Err(e) => {
            // Emit error progress event
            let _ = app.emit(
                "export-progress",
                ExportProgress {
                    tab_id: request.tab_id.clone(),
                    exported_count: 0,
                    total_count: 0,
                    done: true,
                    error: Some(e.to_string()),
                },
            );
            Err(e)
        }
    }
}

#[tauri::command]
pub async fn cancel_export(
    state: State<'_, AppState>,
    tab_id: String,
) -> Result<(), DgridError> {
    let mut tokens = state.cancellation_tokens.write().await;
    if let Some(token) = tokens.remove(&tab_id) {
        token.cancel();
    }
    Ok(())
}

async fn export_csv_inner(
    app: &AppHandle,
    db: &mongodb::Database,
    query: &ParsedCollectionQuery,
    file_path: &str,
    tab_id: &str,
    token: &CancellationToken,
) -> Result<u64, DgridError> {
    let collection = db.collection::<Document>(&query.collection);

    // Get total count for progress
    let total_count = get_total_count(&collection, query).await?;

    if total_count == 0 {
        // Write empty file
        std::fs::write(file_path, "").map_err(|e| DgridError::Storage(e.to_string()))?;
        let _ = app.emit(
            "export-progress",
            ExportProgress {
                tab_id: tab_id.to_string(),
                exported_count: 0,
                total_count: 0,
                done: true,
                error: None,
            },
        );
        return Ok(0);
    }

    // Open cursor
    let mut cursor = open_cursor(&collection, query).await?;

    // Buffer first batch for column detection
    let mut buffer: Vec<Document> = Vec::new();
    for _ in 0..BUFFER_SIZE {
        if token.is_cancelled() {
            return Err(DgridError::QueryCancelled);
        }

        use futures_util::StreamExt;
        match cursor.next().await {
            Some(Ok(doc)) => buffer.push(doc),
            Some(Err(e)) => return Err(DgridError::Database(e.to_string())),
            None => break,
        }
    }

    if buffer.is_empty() {
        std::fs::write(file_path, "").map_err(|e| DgridError::Storage(e.to_string()))?;
        let _ = app.emit(
            "export-progress",
            ExportProgress {
                tab_id: tab_id.to_string(),
                exported_count: 0,
                total_count: 0,
                done: true,
                error: None,
            },
        );
        return Ok(0);
    }

    let columns = csv::collect_columns(&buffer);

    // Open file for writing
    let mut file =
        std::fs::File::create(file_path).map_err(|e| DgridError::Storage(e.to_string()))?;

    // Write header
    let header_row: String = columns
        .iter()
        .map(|c| csv::escape_csv_field(c))
        .collect::<Vec<_>>()
        .join(",");
    writeln!(file, "{header_row}").map_err(|e| DgridError::Storage(e.to_string()))?;

    // Write buffered rows
    let mut exported_count: u64 = 0;
    for doc in &buffer {
        if token.is_cancelled() {
            return Err(DgridError::QueryCancelled);
        }
        let row = csv::build_csv_row(doc, &columns);
        writeln!(file, "{row}").map_err(|e| DgridError::Storage(e.to_string()))?;
        exported_count += 1;
    }

    // Emit initial progress
    let _ = app.emit(
        "export-progress",
        ExportProgress {
            tab_id: tab_id.to_string(),
            exported_count,
            total_count: total_count as u64,
            done: false,
            error: None,
        },
    );

    // Stream remaining rows
    use futures_util::StreamExt;
    while let Some(result) = cursor.next().await {
        if token.is_cancelled() {
            return Err(DgridError::QueryCancelled);
        }

        let doc = result.map_err(|e| DgridError::Database(e.to_string()))?;
        let row = csv::build_csv_row(&doc, &columns);
        writeln!(file, "{row}").map_err(|e| DgridError::Storage(e.to_string()))?;
        exported_count += 1;

        // Emit progress every 100 rows
        if exported_count % 100 == 0 {
            let _ = app.emit(
                "export-progress",
                ExportProgress {
                    tab_id: tab_id.to_string(),
                    exported_count,
                    total_count: total_count as u64,
                    done: false,
                    error: None,
                },
            );
        }
    }

    // Final progress event
    let _ = app.emit(
        "export-progress",
        ExportProgress {
            tab_id: tab_id.to_string(),
            exported_count,
            total_count: total_count as u64,
            done: true,
            error: None,
        },
    );

    Ok(exported_count)
}

async fn get_total_count(
    collection: &mongodb::Collection<Document>,
    query: &ParsedCollectionQuery,
) -> Result<i64, DgridError> {
    match query.operation {
        CollectionOperation::Find => {
            let filter = match &query.filter {
                Some(v) => bson_ser::json_to_document(v)
                    .map_err(|e| DgridError::Validation(e))?,
                None => Document::new(),
            };
            collection
                .count_documents(filter)
                .await
                .map(|c| c as i64)
                .map_err(|e| DgridError::Database(e.to_string()))
        }
        CollectionOperation::Aggregate => {
            let pipeline_vals = query.pipeline.as_deref().unwrap_or(&[]);
            let mut pipeline: Vec<Document> = pipeline_vals
                .iter()
                .map(|v| bson_ser::json_to_document(v))
                .collect::<Result<Vec<_>, _>>()
                .map_err(DgridError::Validation)?;
            pipeline.push(mongodb::bson::doc! { "$count": "total" });

            use futures_util::TryStreamExt;
            let results: Vec<Document> = collection
                .aggregate(pipeline)
                .await
                .map_err(|e| DgridError::Database(e.to_string()))?
                .try_collect()
                .await
                .map_err(|e| DgridError::Database(e.to_string()))?;

            Ok(results
                .first()
                .and_then(|d| match d.get("total") {
                    Some(mongodb::bson::Bson::Int32(n)) => Some(*n as i64),
                    Some(mongodb::bson::Bson::Int64(n)) => Some(*n),
                    _ => None,
                })
                .unwrap_or(0))
        }
        _ => Err(DgridError::Validation(
            "CSV export only supports find and aggregate queries.".into(),
        )),
    }
}

async fn open_cursor(
    collection: &mongodb::Collection<Document>,
    query: &ParsedCollectionQuery,
) -> Result<mongodb::Cursor<Document>, DgridError> {
    match query.operation {
        CollectionOperation::Find => {
            let filter = match &query.filter {
                Some(v) => bson_ser::json_to_document(v)
                    .map_err(|e| DgridError::Validation(e))?,
                None => Document::new(),
            };

            let mut opts = mongodb::options::FindOptions::default();
            if let Some(ref proj) = query.projection {
                opts.projection = Some(
                    bson_ser::json_to_document(proj)
                        .map_err(|e| DgridError::Validation(e))?,
                );
            }
            if let Some(ref sort) = query.sort {
                opts.sort = Some(
                    bson_ser::json_to_document(sort)
                        .map_err(|e| DgridError::Validation(e))?,
                );
            }

            collection
                .find(filter)
                .with_options(opts)
                .await
                .map_err(|e| DgridError::Database(e.to_string()))
        }
        CollectionOperation::Aggregate => {
            let pipeline_vals = query.pipeline.as_deref().unwrap_or(&[]);
            let pipeline: Vec<Document> = pipeline_vals
                .iter()
                .map(|v| bson_ser::json_to_document(v))
                .collect::<Result<Vec<_>, _>>()
                .map_err(DgridError::Validation)?;

            collection
                .aggregate(pipeline)
                .await
                .map_err(|e| DgridError::Database(e.to_string()))
        }
        _ => Err(DgridError::Validation(
            "CSV export only supports find and aggregate queries.".into(),
        )),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn deserialize_export_request() {
        let json = serde_json::json!({
            "query": {
                "type": "collection",
                "collection": "users",
                "operation": "find",
                "filter": {"active": true},
            },
            "database": "testdb",
            "filePath": "/tmp/export.csv",
            "tabId": "tab-1",
        });
        let req: ExportCsvRequest = serde_json::from_value(json).unwrap();
        assert_eq!(req.database, "testdb");
        assert_eq!(req.file_path, "/tmp/export.csv");
        assert_eq!(req.tab_id, "tab-1");
    }

    #[test]
    fn deserialize_export_request_aggregate() {
        let json = serde_json::json!({
            "query": {
                "type": "collection",
                "collection": "orders",
                "operation": "aggregate",
                "pipeline": [{"$match": {"status": "completed"}}],
            },
            "database": "testdb",
            "filePath": "/tmp/orders.csv",
            "tabId": "tab-2",
        });
        let req: ExportCsvRequest = serde_json::from_value(json).unwrap();
        assert_eq!(req.database, "testdb");
        assert_eq!(req.tab_id, "tab-2");
    }

    #[test]
    fn serialize_export_progress() {
        let progress = ExportProgress {
            tab_id: "tab-1".to_string(),
            exported_count: 50,
            total_count: 100,
            done: false,
            error: None,
        };
        let json = serde_json::to_value(&progress).unwrap();
        assert_eq!(json["tabId"], "tab-1");
        assert_eq!(json["exportedCount"], 50);
        assert_eq!(json["totalCount"], 100);
        assert_eq!(json["done"], false);
        assert!(json["error"].is_null());
    }

    #[test]
    fn serialize_export_progress_with_error() {
        let progress = ExportProgress {
            tab_id: "tab-1".to_string(),
            exported_count: 0,
            total_count: 0,
            done: true,
            error: Some("Export failed".to_string()),
        };
        let json = serde_json::to_value(&progress).unwrap();
        assert_eq!(json["done"], true);
        assert_eq!(json["error"], "Export failed");
    }

    #[test]
    fn serialize_export_response() {
        let resp = ExportCsvResponse {
            success: true,
            exported_count: 1000,
        };
        let json = serde_json::to_value(&resp).unwrap();
        assert_eq!(json["success"], true);
        assert_eq!(json["exportedCount"], 1000);
    }

    #[test]
    fn rejects_non_collection_query() {
        let json = serde_json::json!({
            "query": {
                "type": "db-command",
                "command": "getCollectionNames",
                "args": [],
            },
            "database": "testdb",
            "filePath": "/tmp/export.csv",
            "tabId": "tab-1",
        });
        let req: ExportCsvRequest = serde_json::from_value(json).unwrap();
        match &req.query {
            ParsedQuery::Collection(q)
                if q.operation == CollectionOperation::Find
                    || q.operation == CollectionOperation::Aggregate =>
            {
                panic!("Should not match find/aggregate");
            }
            _ => {} // This is the expected path — not find/aggregate
        }
    }

    #[test]
    fn rejects_non_find_collection_query() {
        let json = serde_json::json!({
            "query": {
                "type": "collection",
                "collection": "users",
                "operation": "count",
                "filter": {},
            },
            "database": "testdb",
            "filePath": "/tmp/export.csv",
            "tabId": "tab-1",
        });
        let req: ExportCsvRequest = serde_json::from_value(json).unwrap();
        match &req.query {
            ParsedQuery::Collection(q)
                if q.operation == CollectionOperation::Find
                    || q.operation == CollectionOperation::Aggregate =>
            {
                panic!("Should not match find/aggregate");
            }
            _ => {} // count is correctly rejected
        }
    }
}
