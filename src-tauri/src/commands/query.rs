use mongodb::Database;
use serde::Deserialize;
use tauri::State;
use tokio_util::sync::CancellationToken;

use crate::cancellation;
use crate::error::DgridError;
use crate::executor::{self, ExecuteQueryResponse, ParsedQuery, QueryOptions};
use crate::server_stop;
use crate::state::AppState;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExecuteQueryRequest {
    pub query: ParsedQuery,
    pub database: String,
    pub page: Option<i64>,
    pub page_size: Option<i64>,
    pub tab_id: Option<String>,
}

#[tauri::command]
pub async fn execute_query(
    state: State<'_, AppState>,
    id: String,
    request: ExecuteQueryRequest,
) -> Result<ExecuteQueryResponse, DgridError> {
    let db = state
        .pool
        .get_db(&id, Some(&request.database))
        .await
        .ok_or_else(|| DgridError::NotFound {
            entity: "Connection".into(),
            id: id.clone(),
        })?;

    let options = QueryOptions {
        page: request.page.unwrap_or(1),
        page_size: request.page_size.unwrap_or(50),
    };

    let tab_id = request.tab_id.as_deref();
    let token = cancellation::register(&state.cancellation_tokens, tab_id).await;

    let result = run_query(&db, request.query, options, &token).await;

    cancellation::release(&state.cancellation_tokens, tab_id, &token).await;
    result
}

/// Run `query` in its own driver session. When `token` is cancelled first, the query is
/// dropped and its session is killed on the server, so a long write stops there too.
pub async fn run_query(
    db: &Database,
    query: ParsedQuery,
    options: QueryOptions,
    token: &CancellationToken,
) -> Result<ExecuteQueryResponse, DgridError> {
    let mut session = server_stop::start_session(db).await?;
    let session_id = session.id().clone();

    let finished = tokio::select! {
        result = executor::execute_query(db, &mut session, query, options) => Some(result),
        _ = token.cancelled() => None,
    };

    match finished {
        Some(result) => result.map_err(DgridError::QueryExecution),
        None => {
            let client = db.client();
            Err(
                server_stop::finish_cancel(server_stop::kill_sessions(client, vec![session_id]))
                    .await,
            )
        }
    }
}

#[tauri::command]
pub async fn cancel_query(state: State<'_, AppState>, tab_id: String) -> Result<(), DgridError> {
    let mut tokens = state.cancellation_tokens.write().await;
    if let Some(token) = tokens.remove(&tab_id) {
        token.cancel();
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use std::time::Duration;

    use mongodb::bson::{Bson, Document};

    use super::*;
    use crate::server_stop::test_support::{
        client, ops_on, seed, slow_filter, slow_never_filter, wait_for_op, written, SLOW_DOCS,
    };

    fn json(doc: Document) -> serde_json::Value {
        Bson::Document(doc).into_relaxed_extjson()
    }

    fn query(value: serde_json::Value) -> ParsedQuery {
        serde_json::from_value(value).unwrap()
    }

    /// Start `query` on `db`, cancel it once it is running on the server, and return the
    /// run's result.
    async fn cancel_while_running(
        db: &Database,
        query: ParsedQuery,
    ) -> Result<ExecuteQueryResponse, DgridError> {
        let token = CancellationToken::new();
        let namespace = format!("{}.items", db.name());
        let (result, _) = tokio::join!(
            run_query(db, query, QueryOptions::default(), &token),
            async {
                wait_for_op(db.client(), &namespace).await;
                tokio::time::sleep(Duration::from_millis(500)).await;
                token.cancel();
            }
        );
        result
    }

    #[tokio::test]
    #[ignore]
    async fn killop_cancelled_slow_write_stops_on_the_server() {
        let client = client().await;
        let db = client.database("dgrid_killop_query_write_test");
        seed(&db).await;

        let result = cancel_while_running(
            &db,
            query(serde_json::json!({
                "type": "collection",
                "collection": "items",
                "operation": "updateMany",
                "filter": json(slow_filter()),
                "update": { "$inc": { "n": 1 } },
            })),
        )
        .await;

        assert!(
            matches!(result, Err(DgridError::QueryCancelled)),
            "{result:?}"
        );
        tokio::time::sleep(Duration::from_secs(1)).await;
        let after_one_second = written(&db).await;
        tokio::time::sleep(Duration::from_secs(1)).await;
        assert_eq!(written(&db).await, after_one_second, "the write kept going");
        assert!(after_one_second < SLOW_DOCS as u64);
        assert_eq!(
            ops_on(&client, "dgrid_killop_query_write_test.items").await,
            0
        );

        // The pool still runs queries after one of its sessions was killed.
        let token = CancellationToken::new();
        let count = run_query(
            &db,
            query(serde_json::json!({
                "type": "collection",
                "collection": "items",
                "operation": "count",
            })),
            QueryOptions::default(),
            &token,
        )
        .await
        .unwrap();
        assert_eq!(count.documents[0]["count"], SLOW_DOCS);

        db.drop().await.unwrap();
    }

    #[tokio::test]
    #[ignore]
    async fn killop_cancelled_slow_aggregation_stops_on_the_server() {
        let client = client().await;
        let db = client.database("dgrid_killop_query_aggregate_test");
        seed(&db).await;

        let result = cancel_while_running(
            &db,
            query(serde_json::json!({
                "type": "collection",
                "collection": "items",
                "operation": "aggregate",
                "pipeline": [{ "$match": json(slow_never_filter()) }],
            })),
        )
        .await;

        assert!(
            matches!(result, Err(DgridError::QueryCancelled)),
            "{result:?}"
        );
        tokio::time::sleep(Duration::from_secs(1)).await;
        assert_eq!(
            ops_on(&client, "dgrid_killop_query_aggregate_test.items").await,
            0
        );

        db.drop().await.unwrap();
    }
}
