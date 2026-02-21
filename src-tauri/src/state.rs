use std::collections::HashMap;
use std::sync::Mutex;

use notify::RecommendedWatcher;
use tokio::sync::RwLock;
use tokio_util::sync::CancellationToken;

use crate::keyring::{KeyringPasswordStorage, PasswordStorage};
use crate::pool::ConnectionPool;
use crate::storage::ConnectionStorage;

/// Shared application state managed by Tauri.
pub struct AppState {
    pub storage: Mutex<ConnectionStorage>,
    pub passwords: Box<dyn PasswordStorage>,
    pub pool: ConnectionPool,
    pub cancellation_tokens: RwLock<HashMap<String, CancellationToken>>,
    pub file_watchers: Mutex<HashMap<String, RecommendedWatcher>>,
}

impl AppState {
    pub fn new() -> Self {
        let data_dir = dirs::home_dir()
            .expect("could not determine home directory")
            .join(".dgrid");

        Self {
            storage: Mutex::new(ConnectionStorage::new(&data_dir)),
            passwords: Box::new(KeyringPasswordStorage::new()),
            pool: ConnectionPool::new(),
            cancellation_tokens: RwLock::new(HashMap::new()),
            file_watchers: Mutex::new(HashMap::new()),
        }
    }
}
