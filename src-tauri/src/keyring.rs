use crate::error::DgridError;

const DEFAULT_SERVICE_NAME: &str = "dgrid-mongodb-gui";

/// Trait for password storage backends.
pub trait PasswordStorage: Send + Sync {
    fn get(&self, connection_id: &str) -> Option<String>;
    fn set(&self, connection_id: &str, password: &str) -> Result<(), DgridError>;
    fn delete(&self, connection_id: &str);
}

/// OS keyring-based password storage.
pub struct KeyringPasswordStorage {
    service_name: String,
}

impl KeyringPasswordStorage {
    pub fn new() -> Self {
        Self {
            service_name: DEFAULT_SERVICE_NAME.to_string(),
        }
    }
}

impl PasswordStorage for KeyringPasswordStorage {
    fn get(&self, connection_id: &str) -> Option<String> {
        let entry = keyring::Entry::new(&self.service_name, connection_id).ok()?;
        entry.get_password().ok()
    }

    fn set(&self, connection_id: &str, password: &str) -> Result<(), DgridError> {
        let entry = keyring::Entry::new(&self.service_name, connection_id)
            .map_err(|e| DgridError::Keyring(format!("Failed to store password: {e}")))?;
        entry
            .set_password(password)
            .map_err(|e| DgridError::Keyring(format!("Failed to store password: {e}")))
    }

    fn delete(&self, connection_id: &str) {
        if let Ok(entry) = keyring::Entry::new(&self.service_name, connection_id) {
            let _ = entry.delete_credential();
        }
    }
}

/// In-memory mock password storage for testing.
#[cfg(test)]
pub mod mock {
    use super::*;
    use std::collections::HashMap;
    use std::sync::Mutex;

    pub struct MockPasswordStorage {
        store: Mutex<HashMap<String, String>>,
    }

    impl MockPasswordStorage {
        pub fn new() -> Self {
            Self {
                store: Mutex::new(HashMap::new()),
            }
        }
    }

    impl PasswordStorage for MockPasswordStorage {
        fn get(&self, connection_id: &str) -> Option<String> {
            self.store.lock().unwrap().get(connection_id).cloned()
        }

        fn set(&self, connection_id: &str, password: &str) -> Result<(), DgridError> {
            self.store
                .lock()
                .unwrap()
                .insert(connection_id.to_string(), password.to_string());
            Ok(())
        }

        fn delete(&self, connection_id: &str) {
            self.store.lock().unwrap().remove(connection_id);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::mock::MockPasswordStorage;
    use super::*;

    #[test]
    fn mock_get_returns_none_when_empty() {
        let storage = MockPasswordStorage::new();
        assert!(storage.get("conn-1").is_none());
    }

    #[test]
    fn mock_set_and_get() {
        let storage = MockPasswordStorage::new();
        storage.set("conn-1", "secret123").unwrap();
        assert_eq!(storage.get("conn-1"), Some("secret123".to_string()));
    }

    #[test]
    fn mock_delete() {
        let storage = MockPasswordStorage::new();
        storage.set("conn-1", "secret123").unwrap();
        storage.delete("conn-1");
        assert!(storage.get("conn-1").is_none());
    }

    #[test]
    fn mock_delete_nonexistent_is_noop() {
        let storage = MockPasswordStorage::new();
        storage.delete("conn-1"); // Should not panic
    }

    #[test]
    fn mock_multiple_connections() {
        let storage = MockPasswordStorage::new();
        storage.set("conn-1", "pass1").unwrap();
        storage.set("conn-2", "pass2").unwrap();

        assert_eq!(storage.get("conn-1"), Some("pass1".to_string()));
        assert_eq!(storage.get("conn-2"), Some("pass2".to_string()));
    }

    #[test]
    fn mock_overwrite_password() {
        let storage = MockPasswordStorage::new();
        storage.set("conn-1", "old").unwrap();
        storage.set("conn-1", "new").unwrap();
        assert_eq!(storage.get("conn-1"), Some("new".to_string()));
    }

    #[test]
    fn keyring_storage_compiles() {
        // Just verify the real implementation compiles
        let _storage = KeyringPasswordStorage::new();
    }
}
