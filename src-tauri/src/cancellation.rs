//! Per-tab cancellation tokens shared by queries, exports and shell runs.
//!
//! A run registers a token under its tab when it starts and releases it when it ends.
//! `cancel_query` and `cancel_export` remove the tab's token and cancel it.

use std::collections::HashMap;

use tokio::sync::RwLock;
use tokio_util::sync::CancellationToken;

pub type TokenMap = RwLock<HashMap<String, CancellationToken>>;

/// Make a token for this run and store it under the key, cancelling the key's previous run.
/// Without a key the token is not stored, so nothing can cancel it.
pub async fn register(tokens: &TokenMap, key: Option<&str>) -> CancellationToken {
    let token = CancellationToken::new();
    if let Some(key) = key {
        let mut tokens = tokens.write().await;
        if let Some(old) = tokens.remove(key) {
            old.cancel();
        }
        tokens.insert(key.to_string(), token.clone());
    }
    token
}

/// Remove the key's entry only when it is still this run's token. A newer run may have
/// registered under the same key since; its entry must stay so it can be cancelled.
///
/// The check and the removal happen under one write lock: checking first and locking
/// after would let a newer run register in between and lose its entry.
pub async fn release(tokens: &TokenMap, key: Option<&str>, token: &CancellationToken) {
    let Some(key) = key else { return };
    let mut tokens = tokens.write().await;
    // `CancellationToken` equality is identity: only clones of this run's token match.
    if tokens.get(key) == Some(token) {
        tokens.remove(key);
    }
}

/// What the `cancel_query` and `cancel_export` commands do with the token map.
#[cfg(test)]
pub(crate) async fn cancel_for_test(tokens: &TokenMap, key: &str) {
    if let Some(token) = tokens.write().await.remove(key) {
        token.cancel();
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    use cancel_for_test as cancel;

    #[tokio::test]
    async fn register_stores_a_token_under_the_key() {
        let tokens = TokenMap::default();

        let token = register(&tokens, Some("tab-1")).await;

        cancel(&tokens, "tab-1").await;
        assert!(token.is_cancelled());
    }

    #[tokio::test]
    async fn register_cancels_the_keys_previous_run() {
        let tokens = TokenMap::default();
        let first = register(&tokens, Some("tab-1")).await;

        let second = register(&tokens, Some("tab-1")).await;

        assert!(first.is_cancelled());
        assert!(!second.is_cancelled());
    }

    #[tokio::test]
    async fn release_removes_the_runs_own_token() {
        let tokens = TokenMap::default();
        let token = register(&tokens, Some("tab-1")).await;

        release(&tokens, Some("tab-1"), &token).await;

        assert!(tokens.read().await.is_empty());
    }

    #[tokio::test]
    async fn release_after_a_newer_run_registered_keeps_the_newer_token() {
        let tokens = TokenMap::default();
        let first = register(&tokens, Some("tab-1")).await;
        let second = register(&tokens, Some("tab-1")).await;

        release(&tokens, Some("tab-1"), &first).await;

        assert!(tokens.read().await.get("tab-1") == Some(&second));
        cancel(&tokens, "tab-1").await;
        assert!(
            second.is_cancelled(),
            "the newer run can still be cancelled"
        );
    }

    #[tokio::test]
    async fn release_waiting_for_the_lock_keeps_a_token_registered_meanwhile() {
        let tokens = std::sync::Arc::new(TokenMap::default());
        let first = register(&tokens, Some("tab-1")).await;
        let mut guard = tokens.write().await;

        let releasing = tokio::spawn({
            let tokens = tokens.clone();
            let first = first.clone();
            async move { release(&tokens, Some("tab-1"), &first).await }
        });
        // On this single-threaded runtime, one yield runs `release` up to the held lock.
        tokio::task::yield_now().await;
        assert!(!releasing.is_finished(), "release is waiting for the lock");

        // A newer run registers while release waits, as `register` would.
        let second = CancellationToken::new();
        if let Some(old) = guard.remove("tab-1") {
            old.cancel();
        }
        guard.insert("tab-1".into(), second.clone());
        drop(guard);
        releasing.await.unwrap();

        assert!(tokens.read().await.get("tab-1") == Some(&second));
    }

    #[tokio::test]
    async fn release_of_a_cancelled_run_keeps_a_token_registered_after_the_cancel() {
        let tokens = TokenMap::default();
        let first = register(&tokens, Some("tab-1")).await;
        cancel(&tokens, "tab-1").await;
        let second = register(&tokens, Some("tab-1")).await;

        release(&tokens, Some("tab-1"), &first).await;

        assert!(first.is_cancelled());
        assert!(tokens.read().await.get("tab-1") == Some(&second));
    }

    #[tokio::test]
    async fn release_of_a_cancelled_run_with_no_newer_run_leaves_the_map_empty() {
        let tokens = TokenMap::default();
        let token = register(&tokens, Some("tab-1")).await;
        cancel(&tokens, "tab-1").await;

        release(&tokens, Some("tab-1"), &token).await;

        assert!(tokens.read().await.is_empty());
    }

    #[tokio::test]
    async fn a_run_without_a_key_stores_and_removes_nothing() {
        let tokens = TokenMap::default();
        let other = register(&tokens, Some("tab-1")).await;

        let token = register(&tokens, None).await;
        assert_eq!(tokens.read().await.len(), 1);
        release(&tokens, None, &token).await;

        assert!(tokens.read().await.get("tab-1") == Some(&other));
        assert!(!other.is_cancelled());
    }

    #[tokio::test]
    async fn release_leaves_other_keys_alone() {
        let tokens = TokenMap::default();
        let first = register(&tokens, Some("tab-1")).await;
        let other = register(&tokens, Some("tab-2")).await;

        release(&tokens, Some("tab-1"), &first).await;

        assert!(tokens.read().await.get("tab-2") == Some(&other));
        assert_eq!(tokens.read().await.len(), 1);
    }
}
