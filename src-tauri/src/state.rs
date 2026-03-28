use std::collections::HashMap;
use std::sync::Mutex;
use std::time::Instant;

use notify::RecommendedWatcher;
use tokio::sync::RwLock;
use tokio_util::sync::CancellationToken;

use crate::config::AppConfig;
use crate::keyring::{KeyringPasswordStorage, MemoryPasswordStorage, PasswordStorage};
use crate::pool::ConnectionPool;
use crate::storage::ConnectionStorage;
use crate::updater::UpdateInfo;

/// Cached update check result with timestamp.
pub struct CachedUpdateCheck {
    pub update: Option<UpdateInfo>,
    pub checked_at: Instant,
}

/// Shared application state managed by Tauri.
pub struct AppState {
    pub config: AppConfig,
    pub storage: Mutex<ConnectionStorage>,
    pub passwords: Box<dyn PasswordStorage>,
    pub pool: ConnectionPool,
    pub cancellation_tokens: RwLock<HashMap<String, CancellationToken>>,
    pub connection_tokens: RwLock<HashMap<String, CancellationToken>>,
    pub test_connection_tokens: RwLock<HashMap<String, CancellationToken>>,
    pub file_watchers: Mutex<HashMap<String, RecommendedWatcher>>,
    pub update_cache: RwLock<Option<CachedUpdateCheck>>,
}

impl AppState {
    pub fn new() -> Self {
        let config = AppConfig::from_env();
        let passwords: Box<dyn PasswordStorage> = if config.use_mock_passwords {
            Box::new(MemoryPasswordStorage::new())
        } else {
            Box::new(KeyringPasswordStorage::new())
        };

        Self {
            config: config.clone(),
            storage: Mutex::new(ConnectionStorage::new(&config.data_dir)),
            passwords,
            pool: ConnectionPool::new(),
            cancellation_tokens: RwLock::new(HashMap::new()),
            connection_tokens: RwLock::new(HashMap::new()),
            test_connection_tokens: RwLock::new(HashMap::new()),
            file_watchers: Mutex::new(HashMap::new()),
            update_cache: RwLock::new(None),
        }
    }
}
