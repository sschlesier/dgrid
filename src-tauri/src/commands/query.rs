use serde::Deserialize;
use tauri::State;
use tokio_util::sync::CancellationToken;

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

    // Set up cancellation token if tab_id provided
    let token = CancellationToken::new();
    if let Some(ref tab_id) = request.tab_id {
        let mut tokens = state.cancellation_tokens.write().await;
        // Cancel any existing token for this tab
        if let Some(old) = tokens.remove(tab_id) {
            old.cancel();
        }
        tokens.insert(tab_id.clone(), token.clone());
    }

    let result = tokio::select! {
        result = executor::execute_query(&db, request.query, options) => result,
        _ = token.cancelled() => {
            return Err(DgridError::QueryCancelled);
        }
    };

    // Clean up token
    if let Some(ref tab_id) = request.tab_id {
        let mut tokens = state.cancellation_tokens.write().await;
        tokens.remove(tab_id);
    }

    result.map_err(DgridError::QueryExecution)
}

#[tauri::command]
pub async fn cancel_query(
    state: State<'_, AppState>,
    tab_id: String,
) -> Result<(), DgridError> {
    let mut tokens = state.cancellation_tokens.write().await;
    if let Some(token) = tokens.remove(&tab_id) {
        token.cancel();
    }
    Ok(())
}
