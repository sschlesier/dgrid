use tauri::State;

use crate::cancellation;
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
    let token = cancellation::register(&state.cancellation_tokens, tab_id.as_deref()).await;

    let result = shell::execute_shell(&state.pool, &id, request, token.clone()).await;

    cancellation::release(&state.cancellation_tokens, tab_id.as_deref(), &token).await;
    result
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::cancellation::TokenMap;
    use crate::pool::{ConnectionPool, MongoConnectionOptions};

    /// What the `cancel_query` command does with the token map.
    async fn cancel_query(tokens: &TokenMap, tab_id: &str) {
        if let Some(token) = tokens.write().await.remove(tab_id) {
            token.cancel();
        }
    }

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
        let token = cancellation::register(&tokens, Some("tab-1")).await;
        let request = ExecuteShellRequest {
            script: "sleep(120000)".into(),
            database: "dgrid_shell_tab_cancel_test".into(),
            tab_id: Some("tab-1".into()),
        };

        let (result, _) = tokio::join!(
            shell::execute_shell(&pool, "shell-cancel", request, token.clone()),
            async {
                tokio::time::sleep(std::time::Duration::from_secs(2)).await;
                cancel_query(&tokens, "tab-1").await;
            }
        );
        cancellation::release(&tokens, Some("tab-1"), &token).await;

        assert!(matches!(result, Err(DgridError::QueryCancelled)));
        assert!(tokens.read().await.is_empty());
        pool.force_disconnect("shell-cancel").await;
    }
}
