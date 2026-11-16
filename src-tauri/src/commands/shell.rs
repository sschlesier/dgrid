use std::collections::HashMap;

use tauri::State;
use tokio::sync::RwLock;
use tokio_util::sync::CancellationToken;

use crate::error::DgridError;
use crate::shell::{self, ExecuteShellRequest, ExecuteShellResponse};
use crate::state::AppState;

type TokenMap = RwLock<HashMap<String, CancellationToken>>;

/// Run a script through mongosh. Cancelled with `cancel_query` and the same `tabId`.
#[tauri::command]
pub async fn execute_shell(
    state: State<'_, AppState>,
    id: String,
    request: ExecuteShellRequest,
) -> Result<ExecuteShellResponse, DgridError> {
    let tab_id = request.tab_id.clone();
    let token = register_token(&state.cancellation_tokens, tab_id.as_deref()).await;

    let result = shell::execute_shell(&state.pool, &id, request, token.clone()).await;

    release_token(&state.cancellation_tokens, tab_id.as_deref(), &token).await;
    result
}

/// Make a token for this run and store it under the tab, cancelling the tab's previous run.
async fn register_token(tokens: &TokenMap, tab_id: Option<&str>) -> CancellationToken {
    let token = CancellationToken::new();
    if let Some(tab_id) = tab_id {
        let mut tokens = tokens.write().await;
        if let Some(old) = tokens.remove(tab_id) {
            old.cancel();
        }
        tokens.insert(tab_id.to_string(), token.clone());
    }
    token
}

/// Remove the tab's entry when it still belongs to this run. A cancelled token is no
/// longer in the map under this run: `cancel_query` removed it, or a newer run replaced
/// it, and that newer run's entry must stay.
async fn release_token(tokens: &TokenMap, tab_id: Option<&str>, token: &CancellationToken) {
    if token.is_cancelled() {
        return;
    }
    if let Some(tab_id) = tab_id {
        tokens.write().await.remove(tab_id);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::pool::{ConnectionPool, MongoConnectionOptions};

    /// What the `cancel_query` command does with the token map.
    async fn cancel_query(tokens: &TokenMap, tab_id: &str) {
        if let Some(token) = tokens.write().await.remove(tab_id) {
            token.cancel();
        }
    }

    #[tokio::test]
    async fn register_stores_a_token_under_the_tab() {
        let tokens = TokenMap::default();

        let token = register_token(&tokens, Some("tab-1")).await;

        cancel_query(&tokens, "tab-1").await;
        assert!(token.is_cancelled());
    }

    #[tokio::test]
    async fn register_without_a_tab_stores_nothing() {
        let tokens = TokenMap::default();

        register_token(&tokens, None).await;

        assert!(tokens.read().await.is_empty());
    }

    #[tokio::test]
    async fn register_cancels_the_tabs_previous_run() {
        let tokens = TokenMap::default();
        let first = register_token(&tokens, Some("tab-1")).await;

        let second = register_token(&tokens, Some("tab-1")).await;

        assert!(first.is_cancelled());
        assert!(!second.is_cancelled());
    }

    #[tokio::test]
    async fn release_removes_the_runs_own_token() {
        let tokens = TokenMap::default();
        let token = register_token(&tokens, Some("tab-1")).await;

        release_token(&tokens, Some("tab-1"), &token).await;

        assert!(tokens.read().await.is_empty());
    }

    #[tokio::test]
    async fn release_keeps_a_newer_runs_token() {
        let tokens = TokenMap::default();
        let first = register_token(&tokens, Some("tab-1")).await;
        let second = register_token(&tokens, Some("tab-1")).await;

        release_token(&tokens, Some("tab-1"), &first).await;

        cancel_query(&tokens, "tab-1").await;
        assert!(
            second.is_cancelled(),
            "the newer run can still be cancelled"
        );
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
        let token = register_token(&tokens, Some("tab-1")).await;
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
        release_token(&tokens, Some("tab-1"), &token).await;

        assert!(matches!(result, Err(DgridError::QueryCancelled)));
        assert!(tokens.read().await.is_empty());
        pool.force_disconnect("shell-cancel").await;
    }
}
