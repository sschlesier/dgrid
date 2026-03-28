use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};

use crate::error::DgridError;

/// A stored connection as persisted to JSON.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StoredConnection {
    pub id: String,
    pub name: String,
    #[serde(default)]
    pub uri: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub username: Option<String>,
    #[serde(default = "default_save_password")]
    pub save_password: bool,
    pub created_at: String,
    pub updated_at: String,
    /// Set when the connection uses the old format (host/port instead of URI).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

fn default_save_password() -> bool {
    true
}

/// Raw connection as stored on disk — may include old-format fields.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct RawStoredConnection {
    id: String,
    name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    uri: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    username: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    save_password: Option<bool>,
    // Old-format fields (v1)
    #[serde(skip_serializing_if = "Option::is_none")]
    host: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    port: Option<u16>,
    #[serde(skip_serializing_if = "Option::is_none")]
    database: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    auth_source: Option<String>,
    created_at: String,
    updated_at: String,
}

/// Check if a raw connection is old-format (missing uri field).
fn is_old_format(conn: &RawStoredConnection) -> bool {
    conn.uri.is_none() && conn.host.is_some()
}

/// Convert a raw connection to StoredConnection, flagging old-format ones.
fn to_stored_connection(raw: &RawStoredConnection) -> StoredConnection {
    if is_old_format(raw) {
        StoredConnection {
            id: raw.id.clone(),
            name: raw.name.clone(),
            uri: String::new(),
            username: raw.username.clone(),
            save_password: raw.save_password.unwrap_or(true),
            created_at: raw.created_at.clone(),
            updated_at: raw.updated_at.clone(),
            error: Some(
                "This connection uses an old format. Please delete and re-create it.".to_string(),
            ),
        }
    } else {
        StoredConnection {
            id: raw.id.clone(),
            name: raw.name.clone(),
            uri: raw.uri.clone().unwrap_or_default(),
            username: raw.username.clone(),
            save_password: raw.save_password.unwrap_or(true),
            created_at: raw.created_at.clone(),
            updated_at: raw.updated_at.clone(),
            error: None,
        }
    }
}

#[derive(Debug, Serialize, Deserialize)]
struct ConnectionsFile {
    version: u32,
    connections: Vec<RawStoredConnection>,
}

/// Input for creating a new connection.
pub struct CreateConnectionInput {
    pub name: String,
    pub uri: String,
    pub username: Option<String>,
    pub save_password: bool,
}

/// Input for updating an existing connection.
pub struct UpdateConnectionInput {
    pub name: Option<String>,
    pub uri: Option<String>,
    pub username: Option<Option<String>>,
    pub save_password: Option<bool>,
}

/// File-based connection storage with atomic writes.
pub struct ConnectionStorage {
    file_path: PathBuf,
}

impl ConnectionStorage {
    pub fn new(data_dir: &Path) -> Self {
        Self {
            file_path: data_dir.join("connections.json"),
        }
    }

    fn read_file(&self) -> Result<ConnectionsFile, DgridError> {
        match fs::read_to_string(&self.file_path) {
            Ok(content) => {
                let data: ConnectionsFile = serde_json::from_str(&content)?;
                Ok(data)
            }
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(ConnectionsFile {
                version: 1,
                connections: Vec::new(),
            }),
            Err(e) => Err(e.into()),
        }
    }

    fn write_file(&self, data: &ConnectionsFile) -> Result<(), DgridError> {
        // Ensure parent directory exists
        if let Some(parent) = self.file_path.parent() {
            fs::create_dir_all(parent)?;
        }

        // Atomic write: write to temp file, then rename
        let temp_path = self.file_path.with_extension(format!(
            "tmp.{}",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap_or_default()
                .as_millis()
        ));

        let content = serde_json::to_string_pretty(data)?;
        fs::write(&temp_path, &content)?;
        fs::rename(&temp_path, &self.file_path)?;

        Ok(())
    }

    pub fn list(&self) -> Result<Vec<StoredConnection>, DgridError> {
        let data = self.read_file()?;
        Ok(data.connections.iter().map(to_stored_connection).collect())
    }

    pub fn get(&self, id: &str) -> Result<Option<StoredConnection>, DgridError> {
        let data = self.read_file()?;
        Ok(data
            .connections
            .iter()
            .find(|c| c.id == id)
            .map(to_stored_connection))
    }

    pub fn create(&self, input: CreateConnectionInput) -> Result<StoredConnection, DgridError> {
        let mut data = self.read_file()?;

        let now = chrono::Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Millis, true);
        let id = uuid::Uuid::new_v4().to_string();

        let raw = RawStoredConnection {
            id: id.clone(),
            name: input.name.clone(),
            uri: Some(input.uri.clone()),
            username: input.username.clone(),
            save_password: Some(input.save_password),
            host: None,
            port: None,
            database: None,
            auth_source: None,
            created_at: now.clone(),
            updated_at: now.clone(),
        };

        data.connections.push(raw);
        self.write_file(&data)?;

        Ok(StoredConnection {
            id,
            name: input.name,
            uri: input.uri,
            username: input.username,
            save_password: input.save_password,
            created_at: now.clone(),
            updated_at: now,
            error: None,
        })
    }

    pub fn update(
        &self,
        id: &str,
        input: UpdateConnectionInput,
    ) -> Result<StoredConnection, DgridError> {
        let mut data = self.read_file()?;
        let index = data
            .connections
            .iter()
            .position(|c| c.id == id)
            .ok_or_else(|| DgridError::NotFound {
                entity: "Connection".into(),
                id: id.into(),
            })?;

        let raw = &mut data.connections[index];
        let now = chrono::Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Millis, true);

        if let Some(name) = &input.name {
            raw.name = name.clone();
        }
        if let Some(uri) = &input.uri {
            raw.uri = Some(uri.clone());
        }
        if let Some(username) = &input.username {
            raw.username = username.clone();
        }
        if let Some(save_password) = input.save_password {
            raw.save_password = Some(save_password);
        }
        raw.updated_at = now;

        let result = to_stored_connection(&data.connections[index]);
        self.write_file(&data)?;

        Ok(result)
    }

    pub fn delete(&self, id: &str) -> Result<(), DgridError> {
        let mut data = self.read_file()?;
        let index = data
            .connections
            .iter()
            .position(|c| c.id == id)
            .ok_or_else(|| DgridError::NotFound {
                entity: "Connection".into(),
                id: id.into(),
            })?;

        data.connections.remove(index);
        self.write_file(&data)?;

        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn make_storage(dir: &Path) -> ConnectionStorage {
        ConnectionStorage::new(dir)
    }

    mod list_tests {
        use super::*;

        #[test]
        fn returns_empty_when_no_connections() {
            let dir = tempfile::tempdir().unwrap();
            let storage = make_storage(dir.path());
            let connections = storage.list().unwrap();
            assert!(connections.is_empty());
        }

        #[test]
        fn returns_all_connections() {
            let dir = tempfile::tempdir().unwrap();
            let storage = make_storage(dir.path());

            storage
                .create(CreateConnectionInput {
                    name: "Conn 1".into(),
                    uri: "mongodb://localhost:27017".into(),
                    username: None,
                    save_password: true,
                })
                .unwrap();
            storage
                .create(CreateConnectionInput {
                    name: "Conn 2".into(),
                    uri: "mongodb://localhost:27018".into(),
                    username: None,
                    save_password: true,
                })
                .unwrap();

            let connections = storage.list().unwrap();
            assert_eq!(connections.len(), 2);
            assert_eq!(connections[0].name, "Conn 1");
            assert_eq!(connections[1].name, "Conn 2");
        }
    }

    mod get_tests {
        use super::*;

        #[test]
        fn returns_none_for_nonexistent() {
            let dir = tempfile::tempdir().unwrap();
            let storage = make_storage(dir.path());
            let conn = storage.get("non-existent").unwrap();
            assert!(conn.is_none());
        }

        #[test]
        fn returns_connection_by_id() {
            let dir = tempfile::tempdir().unwrap();
            let storage = make_storage(dir.path());
            let created = storage
                .create(CreateConnectionInput {
                    name: "Test".into(),
                    uri: "mongodb://localhost:27017".into(),
                    username: None,
                    save_password: true,
                })
                .unwrap();

            let conn = storage.get(&created.id).unwrap();
            assert!(conn.is_some());
            assert_eq!(conn.unwrap().name, "Test");
        }
    }

    mod create_tests {
        use super::*;

        #[test]
        fn creates_with_generated_uuid() {
            let dir = tempfile::tempdir().unwrap();
            let storage = make_storage(dir.path());
            let conn = storage
                .create(CreateConnectionInput {
                    name: "Test".into(),
                    uri: "mongodb://localhost:27017".into(),
                    username: None,
                    save_password: true,
                })
                .unwrap();

            assert!(!conn.id.is_empty());
            // UUID v4 format
            let re = regex_lite::Regex::new(
                r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$",
            )
            .unwrap();
            assert!(
                re.is_match(&conn.id),
                "ID should be UUID format: {}",
                conn.id
            );
        }

        #[test]
        fn sets_timestamps() {
            let dir = tempfile::tempdir().unwrap();
            let storage = make_storage(dir.path());

            let before = chrono::Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Millis, true);
            let conn = storage
                .create(CreateConnectionInput {
                    name: "Test".into(),
                    uri: "mongodb://localhost:27017".into(),
                    username: None,
                    save_password: true,
                })
                .unwrap();
            let after = chrono::Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Millis, true);

            assert!(!conn.created_at.is_empty());
            assert!(!conn.updated_at.is_empty());
            assert!(conn.created_at >= before);
            assert!(conn.created_at <= after);
            assert_eq!(conn.created_at, conn.updated_at);
        }

        #[test]
        fn persists_to_storage() {
            let dir = tempfile::tempdir().unwrap();
            let storage = make_storage(dir.path());
            let conn = storage
                .create(CreateConnectionInput {
                    name: "Persistent".into(),
                    uri: "mongodb://localhost:27017/mydb".into(),
                    username: Some("user".into()),
                    save_password: true,
                })
                .unwrap();

            // New storage instance to verify persistence
            let new_storage = make_storage(dir.path());
            let retrieved = new_storage.get(&conn.id).unwrap().unwrap();
            assert_eq!(retrieved.name, "Persistent");
            assert_eq!(retrieved.uri, "mongodb://localhost:27017/mydb");
            assert_eq!(retrieved.username.as_deref(), Some("user"));
        }

        #[test]
        fn creates_directory_if_missing() {
            let dir = tempfile::tempdir().unwrap();
            let nested = dir.path().join("nested").join("path");
            let storage = make_storage(&nested);

            let conn = storage
                .create(CreateConnectionInput {
                    name: "Test".into(),
                    uri: "mongodb://localhost:27017".into(),
                    username: None,
                    save_password: true,
                })
                .unwrap();

            assert!(!conn.id.is_empty());

            let retrieved = storage.get(&conn.id).unwrap();
            assert!(retrieved.is_some());
        }
    }

    mod update_tests {
        use super::*;

        #[test]
        fn updates_fields() {
            let dir = tempfile::tempdir().unwrap();
            let storage = make_storage(dir.path());
            let created = storage
                .create(CreateConnectionInput {
                    name: "Original".into(),
                    uri: "mongodb://localhost:27017".into(),
                    username: None,
                    save_password: true,
                })
                .unwrap();

            let updated = storage
                .update(
                    &created.id,
                    UpdateConnectionInput {
                        name: Some("Updated".into()),
                        uri: Some("mongodb://localhost:27018".into()),
                        username: None,
                        save_password: None,
                    },
                )
                .unwrap();

            assert_eq!(updated.name, "Updated");
            assert_eq!(updated.uri, "mongodb://localhost:27018");
        }

        #[test]
        fn updates_timestamp() {
            let dir = tempfile::tempdir().unwrap();
            let storage = make_storage(dir.path());
            let created = storage
                .create(CreateConnectionInput {
                    name: "Test".into(),
                    uri: "mongodb://localhost:27017".into(),
                    username: None,
                    save_password: true,
                })
                .unwrap();

            // Small sleep to ensure timestamp difference
            std::thread::sleep(std::time::Duration::from_millis(10));

            let updated = storage
                .update(
                    &created.id,
                    UpdateConnectionInput {
                        name: Some("Updated".into()),
                        uri: None,
                        username: None,
                        save_password: None,
                    },
                )
                .unwrap();

            assert!(updated.updated_at > created.updated_at);
            assert_eq!(updated.created_at, created.created_at);
        }

        #[test]
        fn errors_for_nonexistent() {
            let dir = tempfile::tempdir().unwrap();
            let storage = make_storage(dir.path());

            let result = storage.update(
                "non-existent",
                UpdateConnectionInput {
                    name: Some("Updated".into()),
                    uri: None,
                    username: None,
                    save_password: None,
                },
            );

            assert!(result.is_err());
            let err = result.unwrap_err();
            assert!(err.to_string().contains("not found"));
        }

        #[test]
        fn persists_updates() {
            let dir = tempfile::tempdir().unwrap();
            let storage = make_storage(dir.path());
            let created = storage
                .create(CreateConnectionInput {
                    name: "Original".into(),
                    uri: "mongodb://localhost:27017".into(),
                    username: None,
                    save_password: true,
                })
                .unwrap();

            storage
                .update(
                    &created.id,
                    UpdateConnectionInput {
                        name: Some("Updated".into()),
                        uri: None,
                        username: None,
                        save_password: None,
                    },
                )
                .unwrap();

            let new_storage = make_storage(dir.path());
            let retrieved = new_storage.get(&created.id).unwrap().unwrap();
            assert_eq!(retrieved.name, "Updated");
        }
    }

    mod delete_tests {
        use super::*;

        #[test]
        fn deletes_connection() {
            let dir = tempfile::tempdir().unwrap();
            let storage = make_storage(dir.path());
            let created = storage
                .create(CreateConnectionInput {
                    name: "To Delete".into(),
                    uri: "mongodb://localhost:27017".into(),
                    username: None,
                    save_password: true,
                })
                .unwrap();

            storage.delete(&created.id).unwrap();

            let retrieved = storage.get(&created.id).unwrap();
            assert!(retrieved.is_none());
        }

        #[test]
        fn errors_for_nonexistent() {
            let dir = tempfile::tempdir().unwrap();
            let storage = make_storage(dir.path());

            let result = storage.delete("non-existent");
            assert!(result.is_err());
            assert!(result.unwrap_err().to_string().contains("not found"));
        }

        #[test]
        fn persists_deletion() {
            let dir = tempfile::tempdir().unwrap();
            let storage = make_storage(dir.path());
            let created = storage
                .create(CreateConnectionInput {
                    name: "To Delete".into(),
                    uri: "mongodb://localhost:27017".into(),
                    username: None,
                    save_password: true,
                })
                .unwrap();

            storage.delete(&created.id).unwrap();

            let new_storage = make_storage(dir.path());
            let connections = new_storage.list().unwrap();
            assert!(connections.is_empty());
        }
    }

    mod old_format_tests {
        use super::*;

        #[test]
        fn flags_old_format_connections() {
            let dir = tempfile::tempdir().unwrap();
            let file_path = dir.path().join("connections.json");

            let old_data = serde_json::json!({
                "version": 1,
                "connections": [{
                    "id": "old-conn-id",
                    "name": "Old Connection",
                    "host": "localhost",
                    "port": 27017,
                    "database": "mydb",
                    "username": "user",
                    "authSource": "admin",
                    "createdAt": "2024-01-01T00:00:00.000Z",
                    "updatedAt": "2024-01-01T00:00:00.000Z"
                }]
            });

            fs::write(&file_path, serde_json::to_string(&old_data).unwrap()).unwrap();

            let storage = make_storage(dir.path());
            let connections = storage.list().unwrap();
            assert_eq!(connections.len(), 1);
            assert_eq!(
                connections[0].error.as_deref(),
                Some("This connection uses an old format. Please delete and re-create it.")
            );
            assert_eq!(connections[0].uri, "");
        }

        #[test]
        fn does_not_flag_new_format() {
            let dir = tempfile::tempdir().unwrap();
            let storage = make_storage(dir.path());
            let conn = storage
                .create(CreateConnectionInput {
                    name: "New Connection".into(),
                    uri: "mongodb://localhost:27017".into(),
                    username: None,
                    save_password: true,
                })
                .unwrap();

            let retrieved = storage.get(&conn.id).unwrap().unwrap();
            assert!(retrieved.error.is_none());
        }
    }
}
