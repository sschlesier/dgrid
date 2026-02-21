//! Query executor — dispatches parsed queries against the MongoDB driver.
//!
//! Ported 1:1 from `src/backend/db/queries.ts` (executor portion, lines 940–1520).

use mongodb::bson::{doc, Bson, Document};
use mongodb::options::FindOptions;
use mongodb::Database;
use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};

use crate::bson_ser;

// --- Serde structs matching TypeScript parser output ---

#[derive(Debug, Deserialize)]
#[serde(tag = "type")]
pub enum ParsedQuery {
    #[serde(rename = "collection")]
    Collection(ParsedCollectionQuery),
    #[serde(rename = "db-command")]
    DbCommand(ParsedDbCommand),
}

#[derive(Debug, Deserialize, Clone, Copy, PartialEq)]
#[serde(rename_all = "camelCase")]
pub enum CollectionOperation {
    Find,
    FindOne,
    Aggregate,
    Count,
    Distinct,
    InsertOne,
    InsertMany,
    UpdateOne,
    UpdateMany,
    ReplaceOne,
    DeleteOne,
    DeleteMany,
    FindOneAndUpdate,
    FindOneAndReplace,
    FindOneAndDelete,
    CreateIndex,
    DropIndex,
    GetIndexes,
    BulkWrite,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ParsedCollectionQuery {
    pub collection: String,
    pub operation: CollectionOperation,
    pub filter: Option<Value>,
    pub projection: Option<Value>,
    pub sort: Option<Value>,
    pub limit: Option<i64>,
    pub skip: Option<i64>,
    pub pipeline: Option<Vec<Value>>,
    pub field: Option<String>,
    pub document: Option<Value>,
    pub documents: Option<Vec<Value>>,
    pub update: Option<Value>,
    pub replacement: Option<Value>,
    pub options: Option<Value>,
    pub index_spec: Option<Value>,
    pub index_name: Option<String>,
    pub operations: Option<Vec<Value>>,
}

#[derive(Debug, Deserialize)]
pub struct ParsedDbCommand {
    pub command: String,
    pub args: Vec<Value>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExecuteQueryResponse {
    pub documents: Vec<Map<String, Value>>,
    pub total_count: i64,
    pub page: i64,
    pub page_size: i64,
    pub has_more: bool,
    pub execution_time_ms: u64,
}

pub struct QueryOptions {
    pub page: i64,
    pub page_size: i64,
    pub timeout_ms: u64,
}

impl Default for QueryOptions {
    fn default() -> Self {
        Self {
            page: 1,
            page_size: 50,
            timeout_ms: 30000,
        }
    }
}

/// Execute a parsed query against a database.
pub async fn execute_query(
    db: &Database,
    query: ParsedQuery,
    options: QueryOptions,
) -> Result<ExecuteQueryResponse, String> {
    match query {
        ParsedQuery::Collection(q) => execute_collection_query(db, q, options).await,
        ParsedQuery::DbCommand(cmd) => execute_db_command(db, cmd, options).await,
    }
}

// --- Collection query executor ---

async fn execute_collection_query(
    db: &Database,
    query: ParsedCollectionQuery,
    options: QueryOptions,
) -> Result<ExecuteQueryResponse, String> {
    let page_skip = (options.page - 1) * options.page_size;
    let start = std::time::Instant::now();
    let collection = db.collection::<Document>(&query.collection);

    match query.operation {
        CollectionOperation::Find => {
            let filter = value_to_doc(&query.filter)?;
            let projection = optional_doc(&query.projection)?;
            let sort = optional_doc(&query.sort)?;

            let total_count = collection
                .count_documents(filter.clone())
                .await
                .map_err(|e| e.to_string())? as i64;

            let query_skip = query.skip.unwrap_or(0);
            let effective_limit = match query.limit {
                Some(l) if l < options.page_size => l,
                _ => options.page_size,
            };

            let mut find_opts = FindOptions::builder()
                .skip((query_skip + page_skip) as u64)
                .limit(effective_limit)
                .build();
            find_opts.projection = projection;
            find_opts.sort = sort;

            use futures_util::TryStreamExt;
            let docs: Vec<Document> = collection
                .find(filter)
                .with_options(find_opts)
                .await
                .map_err(|e| e.to_string())?
                .try_collect()
                .await
                .map_err(|e| e.to_string())?;

            let has_more = query_skip + page_skip + docs.len() as i64 > 0
                && (query_skip + page_skip + docs.len() as i64) < total_count;

            Ok(ExecuteQueryResponse {
                documents: serialize_docs(&docs),
                total_count,
                page: options.page,
                page_size: options.page_size,
                has_more,
                execution_time_ms: start.elapsed().as_millis() as u64,
            })
        }

        CollectionOperation::Aggregate => {
            let pipeline_vals = query.pipeline.unwrap_or_default();
            let mut pipeline: Vec<Document> = pipeline_vals
                .iter()
                .map(|v| bson_ser::json_to_document(v))
                .collect::<Result<Vec<_>, _>>()?;

            // Add pagination stages
            pipeline.push(doc! { "$skip": page_skip as i64 });
            pipeline.push(doc! { "$limit": options.page_size as i64 });

            use futures_util::TryStreamExt;
            let docs: Vec<Document> = collection
                .aggregate(pipeline.clone())
                .await
                .map_err(|e| e.to_string())?
                .try_collect()
                .await
                .map_err(|e| e.to_string())?;

            // Count pipeline (remove our pagination stages)
            let count_pipeline: Vec<Document> = pipeline_vals
                .iter()
                .map(|v| bson_ser::json_to_document(v))
                .collect::<Result<Vec<_>, _>>()?;
            let mut count_pipe = count_pipeline;
            count_pipe.push(doc! { "$count": "total" });

            let count_result: Vec<Document> = collection
                .aggregate(count_pipe)
                .await
                .map_err(|e| e.to_string())?
                .try_collect()
                .await
                .map_err(|e| e.to_string())?;

            let total_count = count_result
                .first()
                .and_then(|d| match d.get("total") {
                    Some(Bson::Int32(n)) => Some(*n as i64),
                    Some(Bson::Int64(n)) => Some(*n),
                    _ => None,
                })
                .unwrap_or(docs.len() as i64);

            Ok(ExecuteQueryResponse {
                documents: serialize_docs(&docs),
                total_count,
                page: options.page,
                page_size: options.page_size,
                has_more: page_skip + docs.len() as i64 > 0
                    && (page_skip + docs.len() as i64) < total_count,
                execution_time_ms: start.elapsed().as_millis() as u64,
            })
        }

        CollectionOperation::Count => {
            let filter = value_to_doc(&query.filter)?;
            let count = collection
                .count_documents(filter)
                .await
                .map_err(|e| e.to_string())? as i64;

            let mut result_doc = Map::new();
            result_doc.insert("count".into(), Value::Number(count.into()));

            Ok(ExecuteQueryResponse {
                documents: vec![result_doc],
                total_count: 1,
                page: options.page,
                page_size: options.page_size,
                has_more: false,
                execution_time_ms: start.elapsed().as_millis() as u64,
            })
        }

        CollectionOperation::Distinct => {
            let field = query.field.as_deref().ok_or("distinct requires a field name")?;
            let filter = value_to_doc(&query.filter)?;

            let values = collection
                .distinct(field, filter)
                .await
                .map_err(|e| e.to_string())?;

            let documents: Vec<Map<String, Value>> = values
                .iter()
                .map(|v| {
                    let mut m = Map::new();
                    m.insert("value".into(), bson_ser::serialize_bson_value(v));
                    m
                })
                .collect();

            let total = documents.len() as i64;
            Ok(ExecuteQueryResponse {
                documents,
                total_count: total,
                page: options.page,
                page_size: options.page_size,
                has_more: false,
                execution_time_ms: start.elapsed().as_millis() as u64,
            })
        }

        CollectionOperation::FindOne => {
            let filter = value_to_doc(&query.filter)?;
            let projection = optional_doc(&query.projection)?;

            let mut opts = mongodb::options::FindOneOptions::default();
            opts.projection = projection;

            let doc = collection
                .find_one(filter)
                .with_options(opts)
                .await
                .map_err(|e| e.to_string())?;

            let (documents, total_count) = match doc {
                Some(d) => (vec![bson_ser::serialize_document(&d)], 1),
                None => (vec![], 0),
            };

            Ok(ExecuteQueryResponse {
                documents,
                total_count,
                page: options.page,
                page_size: options.page_size,
                has_more: false,
                execution_time_ms: start.elapsed().as_millis() as u64,
            })
        }

        CollectionOperation::InsertOne => {
            let document = value_to_doc(&query.document)?;
            let result = collection
                .insert_one(document)
                .await
                .map_err(|e| e.to_string())?;

            let mut m = Map::new();
            m.insert("acknowledged".into(), Value::Bool(true));
            m.insert(
                "insertedId".into(),
                bson_ser::serialize_bson_value(&Bson::ObjectId(result.inserted_id.as_object_id().unwrap_or_default())),
            );

            Ok(ExecuteQueryResponse {
                documents: vec![m],
                total_count: 1,
                page: options.page,
                page_size: options.page_size,
                has_more: false,
                execution_time_ms: start.elapsed().as_millis() as u64,
            })
        }

        CollectionOperation::InsertMany => {
            let doc_vals = query.documents.unwrap_or_default();
            let docs: Vec<Document> = doc_vals
                .iter()
                .map(|v| bson_ser::json_to_document(v))
                .collect::<Result<Vec<_>, _>>()?;

            let result = collection
                .insert_many(docs)
                .await
                .map_err(|e| e.to_string())?;

            let mut ids_map = Map::new();
            for (idx, id) in &result.inserted_ids {
                ids_map.insert(idx.to_string(), bson_ser::serialize_bson_value(id));
            }

            let mut m = Map::new();
            m.insert("acknowledged".into(), Value::Bool(true));
            m.insert(
                "insertedCount".into(),
                Value::Number(result.inserted_ids.len().into()),
            );
            m.insert("insertedIds".into(), Value::Object(ids_map));

            Ok(ExecuteQueryResponse {
                documents: vec![m],
                total_count: 1,
                page: options.page,
                page_size: options.page_size,
                has_more: false,
                execution_time_ms: start.elapsed().as_millis() as u64,
            })
        }

        CollectionOperation::UpdateOne | CollectionOperation::UpdateMany => {
            let filter = value_to_doc(&query.filter)?;
            let update = value_to_doc(&query.update)?;
            let opts = parse_update_options(&query.options)?;

            let result = if query.operation == CollectionOperation::UpdateOne {
                collection
                    .update_one(filter, update)
                    .with_options(opts)
                    .await
                    .map_err(|e| e.to_string())?
            } else {
                collection
                    .update_many(filter, update)
                    .with_options(opts)
                    .await
                    .map_err(|e| e.to_string())?
            };

            let mut m = Map::new();
            m.insert("acknowledged".into(), Value::Bool(true));
            m.insert("matchedCount".into(), Value::Number(result.matched_count.into()));
            m.insert("modifiedCount".into(), Value::Number(result.modified_count.into()));
            m.insert("upsertedCount".into(), Value::Number(if result.upserted_id.is_some() { 1u64 } else { 0u64 }.into()));
            if let Some(id) = &result.upserted_id {
                m.insert("upsertedId".into(), bson_ser::serialize_bson_value(id));
            } else {
                m.insert("upsertedId".into(), Value::Null);
            }

            Ok(ExecuteQueryResponse {
                documents: vec![m],
                total_count: 1,
                page: options.page,
                page_size: options.page_size,
                has_more: false,
                execution_time_ms: start.elapsed().as_millis() as u64,
            })
        }

        CollectionOperation::ReplaceOne => {
            let filter = value_to_doc(&query.filter)?;
            let replacement = value_to_doc(&query.replacement)?;
            let upsert = query
                .options
                .as_ref()
                .and_then(|o| o.get("upsert"))
                .and_then(|v| v.as_bool());

            let mut opts = mongodb::options::ReplaceOptions::default();
            if let Some(u) = upsert {
                opts.upsert = Some(u);
            }

            let result = collection
                .replace_one(filter, replacement)
                .with_options(opts)
                .await
                .map_err(|e| e.to_string())?;

            let mut m = Map::new();
            m.insert("acknowledged".into(), Value::Bool(true));
            m.insert("matchedCount".into(), Value::Number(result.matched_count.into()));
            m.insert("modifiedCount".into(), Value::Number(result.modified_count.into()));
            m.insert("upsertedCount".into(), Value::Number(if result.upserted_id.is_some() { 1u64 } else { 0u64 }.into()));
            if let Some(id) = &result.upserted_id {
                m.insert("upsertedId".into(), bson_ser::serialize_bson_value(id));
            } else {
                m.insert("upsertedId".into(), Value::Null);
            }

            Ok(ExecuteQueryResponse {
                documents: vec![m],
                total_count: 1,
                page: options.page,
                page_size: options.page_size,
                has_more: false,
                execution_time_ms: start.elapsed().as_millis() as u64,
            })
        }

        CollectionOperation::DeleteOne | CollectionOperation::DeleteMany => {
            let filter = value_to_doc(&query.filter)?;

            let result = if query.operation == CollectionOperation::DeleteOne {
                collection.delete_one(filter).await.map_err(|e| e.to_string())?
            } else {
                collection.delete_many(filter).await.map_err(|e| e.to_string())?
            };

            let mut m = Map::new();
            m.insert("acknowledged".into(), Value::Bool(true));
            m.insert("deletedCount".into(), Value::Number(result.deleted_count.into()));

            Ok(ExecuteQueryResponse {
                documents: vec![m],
                total_count: 1,
                page: options.page,
                page_size: options.page_size,
                has_more: false,
                execution_time_ms: start.elapsed().as_millis() as u64,
            })
        }

        CollectionOperation::FindOneAndUpdate => {
            let filter = value_to_doc(&query.filter)?;
            let update = value_to_doc(&query.update)?;
            let return_doc = query
                .options
                .as_ref()
                .and_then(|o| o.get("returnDocument"))
                .and_then(|v| v.as_str());

            let mut opts = mongodb::options::FindOneAndUpdateOptions::default();
            if return_doc == Some("after") {
                opts.return_document = Some(mongodb::options::ReturnDocument::After);
            }

            let result = collection
                .find_one_and_update(filter, update)
                .with_options(opts)
                .await
                .map_err(|e| e.to_string())?;

            let documents = match result {
                Some(d) => vec![bson_ser::serialize_document(&d)],
                None => {
                    let mut m = Map::new();
                    m.insert("value".into(), Value::Null);
                    vec![m]
                }
            };

            Ok(ExecuteQueryResponse {
                documents,
                total_count: 1,
                page: options.page,
                page_size: options.page_size,
                has_more: false,
                execution_time_ms: start.elapsed().as_millis() as u64,
            })
        }

        CollectionOperation::FindOneAndReplace => {
            let filter = value_to_doc(&query.filter)?;
            let replacement = value_to_doc(&query.replacement)?;
            let return_doc = query
                .options
                .as_ref()
                .and_then(|o| o.get("returnDocument"))
                .and_then(|v| v.as_str());

            let mut opts = mongodb::options::FindOneAndReplaceOptions::default();
            if return_doc == Some("after") {
                opts.return_document = Some(mongodb::options::ReturnDocument::After);
            }

            let result = collection
                .find_one_and_replace(filter, replacement)
                .with_options(opts)
                .await
                .map_err(|e| e.to_string())?;

            let documents = match result {
                Some(d) => vec![bson_ser::serialize_document(&d)],
                None => {
                    let mut m = Map::new();
                    m.insert("value".into(), Value::Null);
                    vec![m]
                }
            };

            Ok(ExecuteQueryResponse {
                documents,
                total_count: 1,
                page: options.page,
                page_size: options.page_size,
                has_more: false,
                execution_time_ms: start.elapsed().as_millis() as u64,
            })
        }

        CollectionOperation::FindOneAndDelete => {
            let filter = value_to_doc(&query.filter)?;

            let result = collection
                .find_one_and_delete(filter)
                .await
                .map_err(|e| e.to_string())?;

            let documents = match result {
                Some(d) => vec![bson_ser::serialize_document(&d)],
                None => {
                    let mut m = Map::new();
                    m.insert("value".into(), Value::Null);
                    vec![m]
                }
            };

            Ok(ExecuteQueryResponse {
                documents,
                total_count: 1,
                page: options.page,
                page_size: options.page_size,
                has_more: false,
                execution_time_ms: start.elapsed().as_millis() as u64,
            })
        }

        CollectionOperation::CreateIndex => {
            let index_spec = value_to_doc(&query.index_spec)?;
            let opts_val = query.options.as_ref();

            let mut index_opts = mongodb::options::CreateIndexOptions::default();
            let _ = index_opts; // options are on IndexModel, not CreateIndexOptions

            let mut idx_model_opts = mongodb::options::IndexOptions::default();
            if let Some(o) = opts_val {
                if let Some(unique) = o.get("unique").and_then(|v| v.as_bool()) {
                    idx_model_opts.unique = Some(unique);
                }
            }

            let model = mongodb::IndexModel::builder()
                .keys(index_spec)
                .options(idx_model_opts)
                .build();

            let result = collection
                .create_index(model)
                .await
                .map_err(|e| e.to_string())?;

            let mut m = Map::new();
            m.insert("indexName".into(), Value::String(result.index_name));

            Ok(ExecuteQueryResponse {
                documents: vec![m],
                total_count: 1,
                page: options.page,
                page_size: options.page_size,
                has_more: false,
                execution_time_ms: start.elapsed().as_millis() as u64,
            })
        }

        CollectionOperation::DropIndex => {
            let index_name = query.index_name.as_deref().unwrap_or("");
            collection
                .drop_index(index_name)
                .await
                .map_err(|e| e.to_string())?;

            let mut m = Map::new();
            m.insert("ok".into(), Value::Number(1.into()));
            m.insert(
                "message".into(),
                Value::String(format!("Index '{}' dropped", index_name)),
            );

            Ok(ExecuteQueryResponse {
                documents: vec![m],
                total_count: 1,
                page: options.page,
                page_size: options.page_size,
                has_more: false,
                execution_time_ms: start.elapsed().as_millis() as u64,
            })
        }

        CollectionOperation::GetIndexes => {
            use futures_util::TryStreamExt;
            let indexes: Vec<mongodb::IndexModel> = collection
                .list_indexes()
                .await
                .map_err(|e| e.to_string())?
                .try_collect()
                .await
                .map_err(|e| e.to_string())?;

            let documents: Vec<Map<String, Value>> = indexes
                .iter()
                .map(|idx| {
                    let mut m = Map::new();
                    m.insert(
                        "key".into(),
                        Value::Object(bson_ser::serialize_document(&idx.keys)),
                    );
                    if let Some(opts) = &idx.options {
                        if let Some(name) = &opts.name {
                            m.insert("name".into(), Value::String(name.clone()));
                        }
                        if let Some(unique) = opts.unique {
                            m.insert("unique".into(), Value::Bool(unique));
                        }
                    }
                    m
                })
                .collect();

            let total = documents.len() as i64;
            Ok(ExecuteQueryResponse {
                documents,
                total_count: total,
                page: options.page,
                page_size: options.page_size,
                has_more: false,
                execution_time_ms: start.elapsed().as_millis() as u64,
            })
        }

        CollectionOperation::BulkWrite => {
            let ops_vals = query.operations.unwrap_or_default();
            let ops: Vec<Document> = ops_vals
                .iter()
                .map(|v| bson_ser::json_to_document(v))
                .collect::<Result<Vec<_>, _>>()?;

            // Execute each operation individually and aggregate counts
            let mut inserted_count: u64 = 0;
            let mut matched_count: u64 = 0;
            let mut modified_count: u64 = 0;
            let mut deleted_count: u64 = 0;
            let mut upserted_count: u64 = 0;

            for op in &ops {
                if let Ok(insert) = op.get_document("insertOne") {
                    let document = insert.get_document("document").unwrap_or(insert).clone();
                    collection.insert_one(document).await.map_err(|e| e.to_string())?;
                    inserted_count += 1;
                } else if let Ok(delete) = op.get_document("deleteOne") {
                    let filter = delete.get_document("filter").map(|d| d.clone()).unwrap_or_default();
                    let r = collection.delete_one(filter).await.map_err(|e| e.to_string())?;
                    deleted_count += r.deleted_count;
                } else if let Ok(delete) = op.get_document("deleteMany") {
                    let filter = delete.get_document("filter").map(|d| d.clone()).unwrap_or_default();
                    let r = collection.delete_many(filter).await.map_err(|e| e.to_string())?;
                    deleted_count += r.deleted_count;
                } else if let Ok(update) = op.get_document("updateOne") {
                    let filter = update.get_document("filter").map(|d| d.clone()).unwrap_or_default();
                    let update_doc = update.get_document("update").map(|d| d.clone()).unwrap_or_default();
                    let r = collection.update_one(filter, update_doc).await.map_err(|e| e.to_string())?;
                    matched_count += r.matched_count;
                    modified_count += r.modified_count;
                    if r.upserted_id.is_some() { upserted_count += 1; }
                } else if let Ok(update) = op.get_document("updateMany") {
                    let filter = update.get_document("filter").map(|d| d.clone()).unwrap_or_default();
                    let update_doc = update.get_document("update").map(|d| d.clone()).unwrap_or_default();
                    let r = collection.update_many(filter, update_doc).await.map_err(|e| e.to_string())?;
                    matched_count += r.matched_count;
                    modified_count += r.modified_count;
                    if r.upserted_id.is_some() { upserted_count += 1; }
                } else if let Ok(replace) = op.get_document("replaceOne") {
                    let filter = replace.get_document("filter").map(|d| d.clone()).unwrap_or_default();
                    let replacement = replace.get_document("replacement").map(|d| d.clone()).unwrap_or_default();
                    let r = collection.replace_one(filter, replacement).await.map_err(|e| e.to_string())?;
                    matched_count += r.matched_count;
                    modified_count += r.modified_count;
                    if r.upserted_id.is_some() { upserted_count += 1; }
                }
            }

            let mut m = Map::new();
            m.insert("insertedCount".into(), Value::Number(inserted_count.into()));
            m.insert("matchedCount".into(), Value::Number(matched_count.into()));
            m.insert("modifiedCount".into(), Value::Number(modified_count.into()));
            m.insert("deletedCount".into(), Value::Number(deleted_count.into()));
            m.insert("upsertedCount".into(), Value::Number(upserted_count.into()));

            Ok(ExecuteQueryResponse {
                documents: vec![m],
                total_count: 1,
                page: options.page,
                page_size: options.page_size,
                has_more: false,
                execution_time_ms: start.elapsed().as_millis() as u64,
            })
        }
    }
}

// --- Database command executor ---

async fn execute_db_command(
    db: &Database,
    command: ParsedDbCommand,
    options: QueryOptions,
) -> Result<ExecuteQueryResponse, String> {
    let start = std::time::Instant::now();

    let result: Vec<Map<String, Value>> = match command.command.as_str() {
        "getCollectionNames" => {
            use futures_util::TryStreamExt;
            let collections: Vec<mongodb::results::CollectionSpecification> = db
                .list_collections()
                .await
                .map_err(|e| e.to_string())?
                .try_collect()
                .await
                .map_err(|e| e.to_string())?;

            let mut names: Vec<String> = collections.iter().map(|c| c.name.clone()).collect();
            names.sort();

            names
                .iter()
                .map(|name| {
                    let mut m = Map::new();
                    m.insert("value".into(), Value::String(name.clone()));
                    m
                })
                .collect()
        }

        "listCollections" => {
            let filter = if !command.args.is_empty() {
                bson_ser::json_to_document(&command.args[0])?
            } else {
                Document::new()
            };

            let mut cmd = doc! { "listCollections": 1 };
            if !filter.is_empty() {
                cmd.insert("filter", filter);
            }
            let result = db.run_command(cmd).await.map_err(|e| e.to_string())?;

            // Extract cursor.firstBatch
            let batch = result
                .get_document("cursor")
                .ok()
                .and_then(|c| c.get_array("firstBatch").ok())
                .cloned()
                .unwrap_or_default();

            batch.iter()
                .filter_map(|b| b.as_document())
                .map(|d| bson_ser::serialize_document(d))
                .collect()
        }

        "stats" => {
            let scale = command.args.first()
                .and_then(|a| a.get("scale"))
                .and_then(|v| v.as_i64())
                .unwrap_or(1);

            let result = db
                .run_command(doc! { "dbStats": 1, "scale": scale as i32 })
                .await
                .map_err(|e| e.to_string())?;

            vec![bson_ser::serialize_document(&result)]
        }

        "serverStatus" => {
            let result = db
                .run_command(doc! { "serverStatus": 1 })
                .await
                .map_err(|e| e.to_string())?;

            vec![bson_ser::serialize_document(&result)]
        }

        "hostInfo" => {
            let result = db
                .client()
                .database("admin")
                .run_command(doc! { "hostInfo": 1 })
                .await
                .map_err(|e| e.to_string())?;

            vec![bson_ser::serialize_document(&result)]
        }

        "version" => {
            let result = db
                .client()
                .database("admin")
                .run_command(doc! { "buildInfo": 1 })
                .await
                .map_err(|e| e.to_string())?;

            let version = result.get_str("version").unwrap_or("unknown");
            let mut m = Map::new();
            m.insert("version".into(), Value::String(version.to_string()));
            vec![m]
        }

        "createCollection" => {
            let name = command.args.first()
                .and_then(|v| v.as_str())
                .ok_or("createCollection requires a collection name")?;

            db.create_collection(name)
                .await
                .map_err(|e| e.to_string())?;

            let mut m = Map::new();
            m.insert("ok".into(), Value::Number(1.into()));
            m.insert("message".into(), Value::String(format!("Collection '{name}' created")));
            vec![m]
        }

        "dropCollection" => {
            let name = command.args.first()
                .and_then(|v| v.as_str())
                .ok_or("dropCollection requires a collection name")?;

            db.collection::<Document>(name)
                .drop()
                .await
                .map_err(|e| e.to_string())?;

            let mut m = Map::new();
            m.insert("ok".into(), Value::Number(1.into()));
            m.insert("dropped".into(), Value::Bool(true));
            vec![m]
        }

        "renameCollection" => {
            let from = command.args.first()
                .and_then(|v| v.as_str())
                .ok_or("renameCollection requires source name")?;
            let to = command.args.get(1)
                .and_then(|v| v.as_str())
                .ok_or("renameCollection requires target name")?;

            // MongoDB rename requires admin command
            let admin = db.client().database("admin");
            let namespace = format!("{}.{}", db.name(), from);
            let target = format!("{}.{}", db.name(), to);
            admin
                .run_command(doc! { "renameCollection": namespace, "to": target })
                .await
                .map_err(|e| e.to_string())?;

            let mut m = Map::new();
            m.insert("ok".into(), Value::Number(1.into()));
            m.insert("message".into(), Value::String(format!("Collection renamed from '{from}' to '{to}'")));
            vec![m]
        }

        "getCollectionInfos" => {
            let filter = if !command.args.is_empty() {
                bson_ser::json_to_document(&command.args[0])?
            } else {
                Document::new()
            };

            let mut cmd = doc! { "listCollections": 1 };
            if !filter.is_empty() {
                cmd.insert("filter", filter);
            }
            let result = db.run_command(cmd).await.map_err(|e| e.to_string())?;

            let batch = result
                .get_document("cursor")
                .ok()
                .and_then(|c| c.get_array("firstBatch").ok())
                .cloned()
                .unwrap_or_default();

            batch.iter()
                .filter_map(|b| b.as_document())
                .map(|d| bson_ser::serialize_document(d))
                .collect()
        }

        "currentOp" => {
            let opts = if !command.args.is_empty() {
                bson_ser::json_to_document(&command.args[0])?
            } else {
                Document::new()
            };

            let mut cmd = doc! { "currentOp": 1 };
            for (k, v) in opts {
                cmd.insert(k, v);
            }

            let result = db
                .client()
                .database("admin")
                .run_command(cmd)
                .await
                .map_err(|e| e.to_string())?;

            vec![bson_ser::serialize_document(&result)]
        }

        "killOp" => {
            let op_id = command.args.first()
                .ok_or("killOp requires an op ID")?;
            let bson_id = bson_ser::json_to_bson(op_id)?;

            let result = db
                .client()
                .database("admin")
                .run_command(doc! { "killOp": 1, "op": bson_id })
                .await
                .map_err(|e| e.to_string())?;

            vec![bson_ser::serialize_document(&result)]
        }

        "runCommand" => {
            let cmd = if !command.args.is_empty() {
                bson_ser::json_to_document(&command.args[0])?
            } else {
                return Err("runCommand requires a command document".into());
            };

            let result = db.run_command(cmd).await.map_err(|e| e.to_string())?;
            vec![bson_ser::serialize_document(&result)]
        }

        "adminCommand" => {
            let cmd = if !command.args.is_empty() {
                bson_ser::json_to_document(&command.args[0])?
            } else {
                return Err("adminCommand requires a command document".into());
            };

            let result = db
                .client()
                .database("admin")
                .run_command(cmd)
                .await
                .map_err(|e| e.to_string())?;

            vec![bson_ser::serialize_document(&result)]
        }

        other => return Err(format!("Unsupported database command: {other}")),
    };

    let total = result.len() as i64;
    Ok(ExecuteQueryResponse {
        documents: result,
        total_count: total,
        page: options.page,
        page_size: options.page_size,
        has_more: false,
        execution_time_ms: start.elapsed().as_millis() as u64,
    })
}

// --- Helpers ---

fn value_to_doc(value: &Option<Value>) -> Result<Document, String> {
    match value {
        Some(v) => bson_ser::json_to_document(v),
        None => Ok(Document::new()),
    }
}

fn optional_doc(value: &Option<Value>) -> Result<Option<Document>, String> {
    match value {
        Some(v) => Ok(Some(bson_ser::json_to_document(v)?)),
        None => Ok(None),
    }
}

fn serialize_docs(docs: &[Document]) -> Vec<Map<String, Value>> {
    docs.iter().map(|d| bson_ser::serialize_document(d)).collect()
}

fn parse_update_options(
    value: &Option<Value>,
) -> Result<mongodb::options::UpdateOptions, String> {
    let mut opts = mongodb::options::UpdateOptions::default();
    if let Some(v) = value {
        if let Some(upsert) = v.get("upsert").and_then(|u| u.as_bool()) {
            opts.upsert = Some(upsert);
        }
    }
    Ok(opts)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn deserialize_find_query() {
        let json = serde_json::json!({
            "type": "collection",
            "collection": "users",
            "operation": "find",
            "filter": {"name": "Alice"},
        });
        let query: ParsedQuery = serde_json::from_value(json).unwrap();
        match query {
            ParsedQuery::Collection(q) => {
                assert_eq!(q.collection, "users");
                assert_eq!(q.operation, CollectionOperation::Find);
            }
            _ => panic!("Expected collection query"),
        }
    }

    #[test]
    fn deserialize_aggregate_query() {
        let json = serde_json::json!({
            "type": "collection",
            "collection": "orders",
            "operation": "aggregate",
            "pipeline": [{"$match": {"status": "completed"}}],
        });
        let query: ParsedQuery = serde_json::from_value(json).unwrap();
        match query {
            ParsedQuery::Collection(q) => {
                assert_eq!(q.operation, CollectionOperation::Aggregate);
                assert!(q.pipeline.is_some());
            }
            _ => panic!("Expected collection query"),
        }
    }

    #[test]
    fn deserialize_db_command() {
        let json = serde_json::json!({
            "type": "db-command",
            "command": "getCollectionNames",
            "args": [],
        });
        let query: ParsedQuery = serde_json::from_value(json).unwrap();
        match query {
            ParsedQuery::DbCommand(cmd) => {
                assert_eq!(cmd.command, "getCollectionNames");
                assert!(cmd.args.is_empty());
            }
            _ => panic!("Expected db command"),
        }
    }

    #[test]
    fn deserialize_count_query() {
        let json = serde_json::json!({
            "type": "collection",
            "collection": "users",
            "operation": "count",
            "filter": {"active": true},
        });
        let query: ParsedQuery = serde_json::from_value(json).unwrap();
        match query {
            ParsedQuery::Collection(q) => {
                assert_eq!(q.operation, CollectionOperation::Count);
            }
            _ => panic!("Expected collection query"),
        }
    }

    #[test]
    fn deserialize_insert_one() {
        let json = serde_json::json!({
            "type": "collection",
            "collection": "users",
            "operation": "insertOne",
            "document": {"name": "Alice", "age": 30},
        });
        let query: ParsedQuery = serde_json::from_value(json).unwrap();
        match query {
            ParsedQuery::Collection(q) => {
                assert_eq!(q.operation, CollectionOperation::InsertOne);
                assert!(q.document.is_some());
            }
            _ => panic!("Expected collection query"),
        }
    }

    #[test]
    fn deserialize_update_one() {
        let json = serde_json::json!({
            "type": "collection",
            "collection": "users",
            "operation": "updateOne",
            "filter": {"name": "Alice"},
            "update": {"$set": {"age": 31}},
            "options": {"upsert": true},
        });
        let query: ParsedQuery = serde_json::from_value(json).unwrap();
        match query {
            ParsedQuery::Collection(q) => {
                assert_eq!(q.operation, CollectionOperation::UpdateOne);
                assert!(q.filter.is_some());
                assert!(q.update.is_some());
                assert!(q.options.is_some());
            }
            _ => panic!("Expected collection query"),
        }
    }

    #[test]
    fn deserialize_delete_one() {
        let json = serde_json::json!({
            "type": "collection",
            "collection": "users",
            "operation": "deleteOne",
            "filter": {"name": "Alice"},
        });
        let query: ParsedQuery = serde_json::from_value(json).unwrap();
        match query {
            ParsedQuery::Collection(q) => {
                assert_eq!(q.operation, CollectionOperation::DeleteOne);
            }
            _ => panic!("Expected collection query"),
        }
    }

    #[test]
    fn deserialize_db_command_with_args() {
        let json = serde_json::json!({
            "type": "db-command",
            "command": "createCollection",
            "args": ["newCollection", {"capped": true}],
        });
        let query: ParsedQuery = serde_json::from_value(json).unwrap();
        match query {
            ParsedQuery::DbCommand(cmd) => {
                assert_eq!(cmd.command, "createCollection");
                assert_eq!(cmd.args.len(), 2);
            }
            _ => panic!("Expected db command"),
        }
    }

    #[test]
    fn deserialize_all_operations() {
        let operations = vec![
            "find", "findOne", "aggregate", "count", "distinct",
            "insertOne", "insertMany", "updateOne", "updateMany",
            "replaceOne", "deleteOne", "deleteMany",
            "findOneAndUpdate", "findOneAndReplace", "findOneAndDelete",
            "createIndex", "dropIndex", "getIndexes", "bulkWrite",
        ];
        for op in operations {
            let json = serde_json::json!({
                "type": "collection",
                "collection": "test",
                "operation": op,
            });
            let result: Result<ParsedQuery, _> = serde_json::from_value(json);
            assert!(result.is_ok(), "Failed to deserialize operation: {op}");
        }
    }
}
