//! Stopping a cancelled run's operations on the MongoDB server.
//!
//! Dropping a driver call or killing mongosh does not stop what the server is doing: a
//! plain `updateMany` keeps running after its client disconnects. On cancel, a run kills
//! its server sessions with `killSessions`, which also ends their open cursors.

use std::future::Future;
use std::time::Duration;

use mongodb::bson::{doc, Bson, Document};
use mongodb::{Client, ClientSession, Database};

use crate::error::DgridError;

/// How long a cancelled run waits for the server stop before giving up.
pub const STOP_TIMEOUT: Duration = Duration::from_secs(5);

/// Run `stop` for a cancelled run, bounded by [`STOP_TIMEOUT`], and return the error the
/// run ends with: `QueryCancelled` when the stop succeeded, `CancelledServerStillRunning`
/// when it failed or got no answer in time.
pub async fn finish_cancel<F>(stop: F) -> DgridError
where
    F: Future<Output = Result<(), String>>,
{
    match tokio::time::timeout(STOP_TIMEOUT, stop).await {
        Ok(Ok(())) => DgridError::QueryCancelled,
        Ok(Err(reason)) => DgridError::CancelledServerStillRunning(reason),
        Err(_) => DgridError::CancelledServerStillRunning(format!(
            "no answer within {} s",
            STOP_TIMEOUT.as_secs()
        )),
    }
}

/// Start the driver session a run executes in. Causal consistency is off, so reads behave
/// as they do with the driver's implicit sessions.
pub async fn start_session(db: &Database) -> Result<ClientSession, DgridError> {
    db.client()
        .start_session()
        .causal_consistency(false)
        .await
        .map_err(session_start_error)
}

/// A server that can't give out sessions can't run cancellable queries; say so instead of
/// showing the driver's wording.
fn session_start_error(error: mongodb::error::Error) -> DgridError {
    if matches!(*error.kind, mongodb::error::ErrorKind::SessionsNotSupported) {
        return DgridError::QueryExecution(
            "This server does not support sessions, which dgrid needs to cancel queries."
                .to_string(),
        );
    }
    DgridError::QueryExecution(error.to_string())
}

/// Kill the given server sessions. Each item is a session id document (`{ id: <UUID> }`).
/// An empty list sends nothing.
pub async fn kill_sessions(client: &Client, session_ids: Vec<Document>) -> Result<(), String> {
    if session_ids.is_empty() {
        return Ok(());
    }
    let ids: Vec<Bson> = session_ids.into_iter().map(Bson::Document).collect();
    client
        .database("admin")
        .run_command(doc! { "killSessions": ids })
        .await
        .map(|_| ())
        .map_err(|e| e.to_string())
}

/// Kill the sessions of a shell run's mongosh connection, found by its `appName` among the
/// current user's own operations. Finding none is a success. Operations without a session
/// (mongosh's monitoring connection) are skipped.
pub async fn stop_app_sessions(client: &Client, app_name: &str) -> Result<(), String> {
    use futures_util::TryStreamExt;

    let ops: Vec<Document> = client
        .database("admin")
        .aggregate(vec![
            doc! { "$currentOp": { "allUsers": false } },
            doc! { "$match": { "appName": app_name } },
        ])
        .await
        .map_err(|e| e.to_string())?
        .try_collect()
        .await
        .map_err(|e| e.to_string())?;

    let mut ids: Vec<Document> = Vec::new();
    for op in &ops {
        let Some(id) = op.get_document("lsid").ok().and_then(|lsid| lsid.get("id")) else {
            continue;
        };
        let id = doc! { "id": id.clone() };
        if !ids.contains(&id) {
            ids.push(id);
        }
    }
    kill_sessions(client, ids).await
}

/// Helpers for the ignored integration tests that cancel slow operations.
/// Run with: MONGODB_TEST_URI=mongodb://localhost:27017 cargo test -- --ignored killop
#[cfg(test)]
pub mod test_support {
    use std::time::Duration;

    use futures_util::TryStreamExt;
    use mongodb::bson::{doc, Document};
    use mongodb::{Client, Database};

    pub const SLOW_DOCS: i32 = 20_000;

    /// A filter that matches every document but costs about 0.5 ms per document on a
    /// local mongod, so a full pass takes several seconds. It is server-side
    /// computation, not JavaScript: the server interrupts JavaScript on client
    /// disconnect, which would let a test pass without the kill.
    pub fn slow_filter() -> Document {
        doc! { "$expr": { "$gte": [
            { "$reduce": {
                "input": { "$range": [0, 10_000] },
                "initialValue": 0,
                "in": { "$add": ["$$value", "$$this"] },
            } },
            0,
        ] } }
    }

    /// The same computation, true for no document: a read through it scans everything.
    pub fn slow_never_filter() -> Document {
        doc! { "$expr": { "$lt": [
            { "$reduce": {
                "input": { "$range": [0, 10_000] },
                "initialValue": 0,
                "in": { "$add": ["$$value", "$$this"] },
            } },
            0,
        ] } }
    }

    pub async fn client() -> Client {
        Client::with_uri_str(std::env::var("MONGODB_TEST_URI").unwrap())
            .await
            .unwrap()
    }

    /// Drop `db`, then fill `db.items` with [`SLOW_DOCS`] documents `{ i }`.
    pub async fn seed(db: &Database) {
        db.drop().await.unwrap();
        let docs: Vec<Document> = (0..SLOW_DOCS).map(|i| doc! { "i": i }).collect();
        db.collection::<Document>("items")
            .insert_many(docs)
            .await
            .unwrap();
    }

    /// Documents the slow write (`$inc: { n: 1 }`) has reached so far.
    pub async fn written(db: &Database) -> u64 {
        db.collection::<Document>("items")
            .count_documents(doc! { "n": { "$gte": 1 } })
            .await
            .unwrap()
    }

    /// Operations of any user on `namespace` that are running now.
    pub async fn ops_on(client: &Client, namespace: &str) -> usize {
        let ops: Vec<Document> = client
            .database("admin")
            .aggregate(vec![
                doc! { "$currentOp": { "allUsers": true } },
                doc! { "$match": { "ns": namespace } },
            ])
            .await
            .unwrap()
            .try_collect()
            .await
            .unwrap();
        ops.len()
    }

    /// Wait until an operation is running on `namespace`, at most 10 s.
    pub async fn wait_for_op(client: &Client, namespace: &str) {
        for _ in 0..200 {
            if ops_on(client, namespace).await > 0 {
                return;
            }
            tokio::time::sleep(Duration::from_millis(50)).await;
        }
        panic!("no operation started on {namespace}");
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_server_without_sessions_gets_a_clear_error() {
        let err = session_start_error(mongodb::error::ErrorKind::SessionsNotSupported.into());

        assert_eq!(
            err.to_string(),
            "This server does not support sessions, which dgrid needs to cancel queries."
        );
    }

    #[test]
    fn another_session_error_keeps_the_drivers_message() {
        let driver_error: mongodb::error::Error = mongodb::error::ErrorKind::Shutdown.into();
        let expected = driver_error.to_string();

        let err = session_start_error(driver_error);

        assert_eq!(err.to_string(), expected);
    }

    #[tokio::test]
    async fn a_stop_that_succeeds_ends_the_run_as_cancelled() {
        let err = finish_cancel(async { Ok(()) }).await;

        assert!(matches!(err, DgridError::QueryCancelled));
    }

    #[tokio::test(start_paused = true)]
    async fn a_stop_that_fails_warns_with_its_reason() {
        let start = tokio::time::Instant::now();

        let err = finish_cancel(async { Err("not authorized on admin".to_string()) }).await;

        assert_eq!(
            err.to_string(),
            "Cancelled, but the server operation may still be running: not authorized on admin"
        );
        assert!(matches!(err, DgridError::CancelledServerStillRunning(_)));
        assert!(start.elapsed() < STOP_TIMEOUT);
    }

    #[tokio::test(start_paused = true)]
    async fn a_stop_with_no_answer_gives_up_after_the_timeout() {
        let start = tokio::time::Instant::now();

        let err = finish_cancel(std::future::pending()).await;

        assert_eq!(
            err.to_string(),
            "Cancelled, but the server operation may still be running: no answer within 5 s"
        );
        assert_eq!(start.elapsed(), STOP_TIMEOUT);
    }

    /// Stopping an `appName` that has no operations succeeds and must not touch anyone
    /// else's session: an empty `killSessions` would otherwise reach the user's other runs.
    #[tokio::test]
    #[ignore]
    async fn killop_stopping_an_app_name_with_no_operations_leaves_other_sessions_alone() {
        use super::test_support::{client, seed, slow_never_filter, wait_for_op};

        let client = client().await;
        let db = client.database("dgrid_killop_no_ops_test");
        seed(&db).await;

        let bystander = tokio::spawn({
            let collection = db.collection::<Document>("items");
            async move { collection.count_documents(slow_never_filter()).await }
        });
        wait_for_op(&client, "dgrid_killop_no_ops_test.items").await;

        let stopped = stop_app_sessions(&client, "dgrid-shell-no-such-run").await;

        assert_eq!(stopped, Ok(()));
        assert_eq!(bystander.await.unwrap().unwrap(), 0);
        db.drop().await.unwrap();
    }
}
