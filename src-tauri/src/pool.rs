use std::collections::HashMap;

use mongodb::bson::doc;
use mongodb::options::ClientOptions;
use mongodb::{Client, Database};
use tokio::sync::RwLock;

use crate::error::DgridError;

pub struct MongoConnectionOptions {
    pub uri: String,
    pub database: Option<String>,
}

struct PooledConnection {
    client: Client,
    options: MongoConnectionOptions,
}

/// In-memory MongoDB connection pool.
pub struct ConnectionPool {
    connections: RwLock<HashMap<String, PooledConnection>>,
}

impl ConnectionPool {
    pub fn new() -> Self {
        Self {
            connections: RwLock::new(HashMap::new()),
        }
    }

    pub async fn connect(
        &self,
        id: &str,
        options: MongoConnectionOptions,
    ) -> Result<(), DgridError> {
        {
            let conns = self.connections.read().await;
            if conns.contains_key(id) {
                return Err(DgridError::Connection(format!(
                    "Connection '{id}' already exists"
                )));
            }
        }

        let client_options = ClientOptions::parse(&options.uri)
            .await
            .map_err(|e| DgridError::Connection(e.to_string()))?;

        let client =
            Client::with_options(client_options).map_err(|e| DgridError::Connection(e.to_string()))?;

        // Verify connectivity with a ping
        client
            .database("admin")
            .run_command(doc! { "ping": 1 })
            .await
            .map_err(|e| DgridError::Connection(e.to_string()))?;

        let mut conns = self.connections.write().await;
        conns.insert(id.to_string(), PooledConnection { client, options });

        Ok(())
    }

    pub async fn disconnect(&self, id: &str) -> Result<(), DgridError> {
        let mut conns = self.connections.write().await;
        let conn = conns.remove(id).ok_or_else(|| DgridError::NotFound {
            entity: "Connection".into(),
            id: id.into(),
        })?;

        // Client drop handles cleanup; explicit shutdown is not required
        drop(conn);
        Ok(())
    }

    /// Remove and close a connection, swallowing errors. No-op if not connected.
    pub async fn force_disconnect(&self, id: &str) {
        let mut conns = self.connections.write().await;
        if let Some(conn) = conns.remove(id) {
            drop(conn);
        }
    }

    pub async fn get_client(&self, id: &str) -> Option<Client> {
        let conns = self.connections.read().await;
        conns.get(id).map(|c| c.client.clone())
    }

    pub async fn get_db(&self, id: &str, db_name: Option<&str>) -> Option<Database> {
        let conns = self.connections.read().await;
        let conn = conns.get(id)?;
        let database = db_name
            .map(|s| s.to_string())
            .or_else(|| conn.options.database.clone())?;
        Some(conn.client.database(&database))
    }

    pub async fn is_connected(&self, id: &str) -> bool {
        let conns = self.connections.read().await;
        conns.contains_key(id)
    }
}

#[cfg(test)]
impl ConnectionPool {
    pub async fn list_connections(&self) -> Vec<String> {
        let conns = self.connections.read().await;
        conns.keys().cloned().collect()
    }

    pub async fn disconnect_all(&self) {
        let mut conns = self.connections.write().await;
        conns.clear();
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn new_pool_has_no_connections() {
        let pool = ConnectionPool::new();
        assert!(pool.list_connections().await.is_empty());
    }

    #[tokio::test]
    async fn is_connected_returns_false_for_unknown() {
        let pool = ConnectionPool::new();
        assert!(!pool.is_connected("unknown").await);
    }

    #[tokio::test]
    async fn get_client_returns_none_for_unknown() {
        let pool = ConnectionPool::new();
        assert!(pool.get_client("unknown").await.is_none());
    }

    #[tokio::test]
    async fn get_db_returns_none_for_unknown() {
        let pool = ConnectionPool::new();
        assert!(pool.get_db("unknown", None).await.is_none());
    }

    #[tokio::test]
    async fn force_disconnect_noop_for_unknown() {
        let pool = ConnectionPool::new();
        pool.force_disconnect("unknown").await; // Should not panic
    }

    #[tokio::test]
    async fn disconnect_errors_for_unknown() {
        let pool = ConnectionPool::new();
        let result = pool.disconnect("unknown").await;
        assert!(result.is_err());
        assert!(result.unwrap_err().to_string().contains("not found"));
    }

    #[tokio::test]
    async fn disconnect_all_clears_pool() {
        let pool = ConnectionPool::new();
        pool.disconnect_all().await;
        assert!(pool.list_connections().await.is_empty());
    }

    // Integration tests requiring a real MongoDB instance are guarded by MONGODB_TEST_URI.
    // Run with: MONGODB_TEST_URI=mongodb://localhost:27017 cargo test pool -- --include-ignored
    #[tokio::test]
    #[ignore]
    async fn connect_disconnect_lifecycle() {
        let uri = std::env::var("MONGODB_TEST_URI").unwrap();
        let pool = ConnectionPool::new();

        pool.connect(
            "test-conn",
            MongoConnectionOptions {
                uri: uri.clone(),
                database: Some("test".into()),
            },
        )
        .await
        .unwrap();

        assert!(pool.is_connected("test-conn").await);
        assert!(pool.get_client("test-conn").await.is_some());
        assert!(pool.get_db("test-conn", None).await.is_some());
        assert!(pool.get_db("test-conn", Some("other_db")).await.is_some());
        assert_eq!(pool.list_connections().await, vec!["test-conn"]);

        pool.disconnect("test-conn").await.unwrap();
        assert!(!pool.is_connected("test-conn").await);
    }

    #[tokio::test]
    #[ignore]
    async fn connect_duplicate_rejected() {
        let uri = std::env::var("MONGODB_TEST_URI").unwrap();
        let pool = ConnectionPool::new();

        pool.connect(
            "dup-conn",
            MongoConnectionOptions {
                uri: uri.clone(),
                database: None,
            },
        )
        .await
        .unwrap();

        let result = pool
            .connect(
                "dup-conn",
                MongoConnectionOptions {
                    uri,
                    database: None,
                },
            )
            .await;
        assert!(result.is_err());
        assert!(result.unwrap_err().to_string().contains("already exists"));

        pool.force_disconnect("dup-conn").await;
    }
}
