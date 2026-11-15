use tauri::State;
use tokio_util::sync::CancellationToken;

use crate::error::DgridError;
use crate::shell::{self, ExecuteShellRequest, ExecuteShellResponse};
use crate::state::AppState;

/// Run a script through mongosh. Cancelled with `cancel_query` and the same `tabId`.
#[tauri::command]
pub async fn execute_shell(
    state: State<'_, AppState>,
    id: String,
    request: ExecuteShellRequest,
) -> Result<ExecuteShellResponse, DgridError> {
    let tab_id = request.tab_id.clone();

    let token = CancellationToken::new();
    if let Some(ref tab_id) = tab_id {
        let mut tokens = state.cancellation_tokens.write().await;
        if let Some(old) = tokens.remove(tab_id) {
            old.cancel();
        }
        tokens.insert(tab_id.clone(), token.clone());
    }

    let result = shell::execute_shell(&state.pool, &id, request, token).await;

    // A cancelled run's token is already gone, and the tab may hold a newer run's token.
    if !matches!(result, Err(DgridError::QueryCancelled)) {
        if let Some(ref tab_id) = tab_id {
            let mut tokens = state.cancellation_tokens.write().await;
            tokens.remove(tab_id);
        }
    }

    result
}
