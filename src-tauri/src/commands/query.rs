use serde::Deserialize;
use tauri::State;

use crate::cancellation;
use crate::error::DgridError;
use crate::executor::{self, ExecuteQueryResponse, ParsedQuery, QueryOptions};
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

    let result = tokio::select! {
        result = executor::execute_query(&db, request.query, options) => {
            result.map_err(DgridError::QueryExecution)
        }
        _ = token.cancelled() => Err(DgridError::QueryCancelled),
    };

    cancellation::release(&state.cancellation_tokens, tab_id, &token).await;
    result
}

#[tauri::command]
pub async fn cancel_query(state: State<'_, AppState>, tab_id: String) -> Result<(), DgridError> {
    let mut tokens = state.cancellation_tokens.write().await;
    if let Some(token) = tokens.remove(&tab_id) {
        token.cancel();
    }
    Ok(())
}
