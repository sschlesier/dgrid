use std::path::Path;

use notify::{Event, EventKind, RecommendedWatcher, RecursiveMode, Watcher};
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager, State};

use crate::error::DgridError;
use crate::file_validation::{allowed_extensions_display, is_allowed_extension, is_path_safe, MAX_FILE_SIZE};
use crate::state::AppState;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FileReadResponse {
    pub content: String,
    pub path: String,
    pub name: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FileWriteRequest {
    pub path: String,
    pub content: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FileWriteResponse {
    pub success: bool,
    pub path: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FileChangedEvent {
    pub path: String,
    pub content: String,
}

/// Validate a file path for safety and extension.
fn validate_path(file_path: &str) -> Result<(), DgridError> {
    if file_path.is_empty() {
        return Err(DgridError::Validation("File path is required".into()));
    }
    if !is_path_safe(file_path) {
        return Err(DgridError::Validation(
            "Access to this path is not allowed".into(),
        ));
    }
    if !is_allowed_extension(file_path) {
        return Err(DgridError::Validation(format!(
            "File type not allowed. Allowed: {}",
            allowed_extensions_display()
        )));
    }
    Ok(())
}

#[tauri::command]
pub async fn read_file(path: String) -> Result<FileReadResponse, DgridError> {
    validate_path(&path)?;

    let file_path = Path::new(&path);

    // Check file exists
    if !file_path.exists() {
        return Err(DgridError::NotFound {
            entity: "File".into(),
            id: path,
        });
    }

    let content = tokio::fs::read_to_string(&path).await?;

    if content.len() > MAX_FILE_SIZE {
        return Err(DgridError::Validation(format!(
            "File exceeds maximum size of {} bytes",
            MAX_FILE_SIZE
        )));
    }

    let name = file_path
        .file_name()
        .map(|n| n.to_string_lossy().into_owned())
        .unwrap_or_default();

    Ok(FileReadResponse {
        content,
        path,
        name,
    })
}

#[tauri::command]
pub async fn write_file(request: FileWriteRequest) -> Result<FileWriteResponse, DgridError> {
    validate_path(&request.path)?;

    if request.content.len() > MAX_FILE_SIZE {
        return Err(DgridError::Validation(format!(
            "Content exceeds maximum size of {} bytes",
            MAX_FILE_SIZE
        )));
    }

    let file_path = Path::new(&request.path);

    // Ensure parent directory exists
    if let Some(parent) = file_path.parent() {
        tokio::fs::create_dir_all(parent).await?;
    }

    tokio::fs::write(&request.path, &request.content).await?;

    Ok(FileWriteResponse {
        success: true,
        path: request.path,
    })
}

#[tauri::command]
pub async fn watch_file(
    path: String,
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<(), DgridError> {
    validate_path(&path)?;

    let file_path = Path::new(&path);
    if !file_path.exists() {
        return Err(DgridError::NotFound {
            entity: "File".into(),
            id: path,
        });
    }

    let mut watchers = state
        .file_watchers
        .lock()
        .map_err(|e| DgridError::Storage(e.to_string()))?;

    // Already watching
    if watchers.contains_key(&path) {
        return Ok(());
    }

    let watch_path = path.clone();
    let emitter = app.clone();

    let mut watcher = RecommendedWatcher::new(
        move |result: Result<Event, notify::Error>| {
            if let Ok(event) = result {
                if matches!(event.kind, EventKind::Modify(_)) {
                    // Read the file and emit the content
                    let watch_path = watch_path.clone();
                    let emitter = emitter.clone();
                    // Use std::fs since we're in a sync callback
                    if let Ok(content) = std::fs::read_to_string(&watch_path) {
                        let _ = emitter.emit(
                            "file-changed",
                            FileChangedEvent {
                                path: watch_path,
                                content,
                            },
                        );
                    }
                }
            }
        },
        notify::Config::default(),
    )
    .map_err(|e| DgridError::Storage(format!("Failed to create file watcher: {}", e)))?;

    watcher
        .watch(file_path, RecursiveMode::NonRecursive)
        .map_err(|e| DgridError::Storage(format!("Failed to watch file: {}", e)))?;

    watchers.insert(path, watcher);

    Ok(())
}

#[tauri::command]
pub async fn unwatch_file(
    path: String,
    state: State<'_, AppState>,
) -> Result<(), DgridError> {
    let mut watchers = state
        .file_watchers
        .lock()
        .map_err(|e| DgridError::Storage(e.to_string()))?;

    // Remove drops the watcher, which stops watching
    watchers.remove(&path);

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;
    use tempfile::NamedTempFile;

    #[tokio::test]
    async fn read_file_returns_content() {
        let mut tmp = NamedTempFile::with_suffix(".js").unwrap();
        write!(tmp, "db.users.find({{}})").unwrap();
        let path = tmp.path().to_string_lossy().to_string();

        let result = read_file(path.clone()).await.unwrap();
        assert_eq!(result.content, "db.users.find({})");
        assert_eq!(result.path, path);
        assert!(result.name.ends_with(".js"));
    }

    #[tokio::test]
    async fn read_file_rejects_missing_file() {
        let result = read_file("/tmp/nonexistent_test_file.js".into()).await;
        assert!(result.is_err());
        let err = result.unwrap_err();
        assert!(matches!(err, DgridError::NotFound { .. }));
    }

    #[tokio::test]
    async fn read_file_rejects_unsafe_path() {
        let result = read_file("/etc/passwd".into()).await;
        assert!(result.is_err());
        let err = result.unwrap_err();
        assert!(matches!(err, DgridError::Validation(_)));
        assert!(err.to_string().contains("not allowed"));
    }

    #[tokio::test]
    async fn read_file_rejects_bad_extension() {
        let tmp = NamedTempFile::with_suffix(".txt").unwrap();
        let path = tmp.path().to_string_lossy().to_string();

        let result = read_file(path).await;
        assert!(result.is_err());
        let err = result.unwrap_err();
        assert!(matches!(err, DgridError::Validation(_)));
        assert!(err.to_string().contains("File type not allowed"));
    }

    #[tokio::test]
    async fn read_file_rejects_empty_path() {
        let result = read_file("".into()).await;
        assert!(result.is_err());
        let err = result.unwrap_err();
        assert!(matches!(err, DgridError::Validation(_)));
    }

    #[tokio::test]
    async fn write_file_creates_and_writes() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("test.js").to_string_lossy().to_string();

        let request = FileWriteRequest {
            path: path.clone(),
            content: "console.log('hello')".into(),
        };
        let result = write_file(request).await.unwrap();

        assert!(result.success);
        assert_eq!(result.path, path);
        assert_eq!(
            std::fs::read_to_string(&path).unwrap(),
            "console.log('hello')"
        );
    }

    #[tokio::test]
    async fn write_file_creates_parent_directories() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir
            .path()
            .join("sub/dir/test.js")
            .to_string_lossy()
            .to_string();

        let request = FileWriteRequest {
            path: path.clone(),
            content: "// nested".into(),
        };
        let result = write_file(request).await.unwrap();

        assert!(result.success);
        assert_eq!(std::fs::read_to_string(&path).unwrap(), "// nested");
    }

    #[tokio::test]
    async fn write_file_rejects_unsafe_path() {
        let request = FileWriteRequest {
            path: "/etc/test.js".into(),
            content: "bad".into(),
        };
        let result = write_file(request).await;
        assert!(result.is_err());
        assert!(matches!(result.unwrap_err(), DgridError::Validation(_)));
    }

    #[tokio::test]
    async fn write_file_rejects_bad_extension() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("test.py").to_string_lossy().to_string();

        let request = FileWriteRequest {
            path,
            content: "print('bad')".into(),
        };
        let result = write_file(request).await;
        assert!(result.is_err());
        assert!(matches!(result.unwrap_err(), DgridError::Validation(_)));
    }

    #[tokio::test]
    async fn write_file_rejects_oversized_content() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("big.js").to_string_lossy().to_string();

        let request = FileWriteRequest {
            path,
            content: "x".repeat(MAX_FILE_SIZE + 1),
        };
        let result = write_file(request).await;
        assert!(result.is_err());
        let err = result.unwrap_err();
        assert!(err.to_string().contains("maximum size"));
    }

    #[tokio::test]
    async fn validate_path_rejects_traversal() {
        let result = read_file("/home/user/../etc/passwd".into()).await;
        assert!(result.is_err());
    }
}
