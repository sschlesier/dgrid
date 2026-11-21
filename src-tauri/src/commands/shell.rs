use tauri::State;

use crate::cancellation::{self, TokenMap};
use crate::error::DgridError;
use crate::pool::ConnectionPool;
use crate::shell::{self, ExecuteShellRequest, ExecuteShellResponse};
use crate::state::AppState;

/// Run a script through mongosh. Cancelled with `cancel_query` and the same `tabId`.
#[tauri::command]
pub async fn execute_shell(
    state: State<'_, AppState>,
    id: String,
    request: ExecuteShellRequest,
) -> Result<ExecuteShellResponse, DgridError> {
    run_with_tab_token(&state.cancellation_tokens, &state.pool, &id, request).await
}

/// The command's body, without Tauri `State`: run the script under a token stored by tab id.
async fn run_with_tab_token(
    tokens: &TokenMap,
    pool: &ConnectionPool,
    id: &str,
    request: ExecuteShellRequest,
) -> Result<ExecuteShellResponse, DgridError> {
    let tab_id = request.tab_id.clone();
    let token = cancellation::register(tokens, tab_id.as_deref()).await;

    let result = shell::execute_shell(pool, id, request, token.clone()).await;

    cancellation::release(tokens, tab_id.as_deref(), &token).await;
    result
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::cancellation::cancel_for_test as cancel_query;
    use crate::pool::MongoConnectionOptions;

    // Needs a real MongoDB and `mongosh` on PATH.
    // Run with: MONGODB_TEST_URI=mongodb://localhost:27017 cargo test -- --ignored shell
    #[tokio::test]
    #[ignore]
    async fn shell_run_is_cancelled_through_its_tab_id() {
        let uri = std::env::var("MONGODB_TEST_URI").unwrap();
        let pool = ConnectionPool::new();
        pool.connect(
            "shell-cancel",
            MongoConnectionOptions {
                uri,
                database: None,
            },
        )
        .await
        .unwrap();
        let tokens = TokenMap::default();
        let request = ExecuteShellRequest {
            script: "sleep(120000)".into(),
            database: "dgrid_shell_tab_cancel_test".into(),
            tab_id: Some("tab-1".into()),
        };

        let (result, _) = tokio::join!(
            run_with_tab_token(&tokens, &pool, "shell-cancel", request),
            async {
                tokio::time::sleep(std::time::Duration::from_secs(2)).await;
                cancel_query(&tokens, "tab-1").await;
            }
        );

        assert!(matches!(result, Err(DgridError::QueryCancelled)));
        assert!(tokens.read().await.is_empty());
        pool.force_disconnect("shell-cancel").await;
    }
}
