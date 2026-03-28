use serde::{Deserialize, Serialize};
use std::time::Instant;
use tauri::State;
use tokio_util::sync::CancellationToken;

use crate::credentials::{get_database_from_uri, inject_credentials, strip_credentials};
use crate::error::DgridError;
use crate::pool::MongoConnectionOptions;
use crate::state::AppState;
use crate::storage::{CreateConnectionInput, StoredConnection, UpdateConnectionInput};

// --- Request/Response types (matching contracts.ts) ---

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateConnectionRequest {
    pub name: String,
    pub uri: String,
    #[serde(default = "default_true")]
    pub save_password: bool,
}

fn default_true() -> bool {
    true
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateConnectionRequest {
    pub name: Option<String>,
    pub uri: Option<String>,
    pub save_password: Option<bool>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ConnectionResponse {
    pub id: String,
    pub name: String,
    pub uri: String,
    pub username: Option<String>,
    pub save_password: bool,
    pub is_connected: bool,
    pub created_at: String,
    pub updated_at: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TestConnectionRequest {
    pub uri: String,
    pub operation_id: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TestConnectionResponse {
    pub success: bool,
    pub message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub latency_ms: Option<u64>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConnectRequest {
    pub password: Option<String>,
    pub save_password: Option<bool>,
}

// --- Helper ---

fn to_connection_response(conn: &StoredConnection, is_connected: bool) -> ConnectionResponse {
    ConnectionResponse {
        id: conn.id.clone(),
        name: conn.name.clone(),
        uri: conn.uri.clone(),
        username: conn.username.clone(),
        save_password: conn.save_password,
        is_connected,
        created_at: conn.created_at.clone(),
        updated_at: conn.updated_at.clone(),
        error: conn.error.clone(),
    }
}

// --- Commands ---

#[tauri::command]
pub async fn list_connections(
    state: State<'_, AppState>,
) -> Result<Vec<ConnectionResponse>, DgridError> {
    let connections = {
        let storage = state.storage.lock().unwrap();
        storage.list()?
    };

    let mut responses = Vec::new();
    for conn in &connections {
        let is_connected = state.pool.is_connected(&conn.id).await;
        responses.push(to_connection_response(conn, is_connected));
    }
    Ok(responses)
}

#[tauri::command]
pub async fn get_connection(
    state: State<'_, AppState>,
    id: String,
) -> Result<ConnectionResponse, DgridError> {
    let conn = {
        let storage = state.storage.lock().unwrap();
        storage.get(&id)?
    };

    let conn = conn.ok_or_else(|| DgridError::NotFound {
        entity: "Connection".into(),
        id: id.clone(),
    })?;

    let is_connected = state.pool.is_connected(&id).await;
    Ok(to_connection_response(&conn, is_connected))
}

#[tauri::command]
pub async fn create_connection(
    state: State<'_, AppState>,
    request: CreateConnectionRequest,
) -> Result<ConnectionResponse, DgridError> {
    let stripped = strip_credentials(&request.uri);

    let conn = {
        let storage = state.storage.lock().unwrap();
        storage.create(CreateConnectionInput {
            name: request.name,
            uri: stripped.stripped_uri,
            username: if stripped.username.is_empty() {
                None
            } else {
                Some(stripped.username.clone())
            },
            save_password: request.save_password,
        })?
    };

    if !stripped.password.is_empty() && request.save_password {
        state.passwords.set(&conn.id, &stripped.password)?;
    }

    Ok(to_connection_response(&conn, false))
}

#[tauri::command]
pub async fn update_connection(
    state: State<'_, AppState>,
    id: String,
    request: UpdateConnectionRequest,
) -> Result<ConnectionResponse, DgridError> {
    let mut input = UpdateConnectionInput {
        name: request.name,
        uri: None,
        username: None,
        save_password: request.save_password,
    };

    // Determine effective savePassword
    let effective_save_password = match request.save_password {
        Some(sp) => sp,
        None => {
            let storage = state.storage.lock().unwrap();
            storage.get(&id)?.map(|c| c.save_password).unwrap_or(true)
        }
    };

    if let Some(uri) = &request.uri {
        let stripped = strip_credentials(uri);
        input.uri = Some(stripped.stripped_uri);
        input.username = Some(if stripped.username.is_empty() {
            None
        } else {
            Some(stripped.username)
        });

        if !stripped.password.is_empty() && effective_save_password {
            state.passwords.set(&id, &stripped.password)?;
        } else {
            state.passwords.delete(&id);
        }
    } else if request.save_password == Some(false) {
        state.passwords.delete(&id);
    }

    let conn = {
        let storage = state.storage.lock().unwrap();
        storage.update(&id, input)?
    };

    let is_connected = state.pool.is_connected(&id).await;
    Ok(to_connection_response(&conn, is_connected))
}

#[tauri::command]
pub async fn delete_connection(state: State<'_, AppState>, id: String) -> Result<(), DgridError> {
    if state.pool.is_connected(&id).await {
        state.pool.disconnect(&id).await?;
    }

    {
        let storage = state.storage.lock().unwrap();
        storage.delete(&id)?;
    }

    state.passwords.delete(&id);
    Ok(())
}

#[tauri::command]
pub async fn test_connection(
    state: State<'_, AppState>,
    request: TestConnectionRequest,
) -> Result<TestConnectionResponse, DgridError> {
    execute_test_connection(&state, request.uri, request.operation_id).await
}

async fn execute_test_connection(
    state: &AppState,
    uri: String,
    operation_id: Option<String>,
) -> Result<TestConnectionResponse, DgridError> {
    let start = Instant::now();

    let token = CancellationToken::new();
    if let Some(ref operation_id) = operation_id {
        let mut tokens = state.test_connection_tokens.write().await;
        if let Some(old) = tokens.remove(operation_id) {
            old.cancel();
        }
        tokens.insert(operation_id.clone(), token.clone());
    }

    let result = tokio::select! {
        result = async {
            let client_options = mongodb::options::ClientOptions::parse(&uri)
                .await
                .map_err(|e| DgridError::Connection(e.to_string()))?;

            let mut opts = client_options;
            opts.server_selection_timeout = Some(std::time::Duration::from_secs(5));
            opts.connect_timeout = Some(std::time::Duration::from_secs(5));

            let client = mongodb::Client::with_options(opts)
                .map_err(|e| DgridError::Connection(e.to_string()))?;

            match client
                .database("admin")
                .run_command(mongodb::bson::doc! { "ping": 1 })
                .await
            {
                Ok(_) => {
                    let latency_ms = start.elapsed().as_millis() as u64;
                    Ok(TestConnectionResponse {
                        success: true,
                        message: "Connection successful".to_string(),
                        latency_ms: Some(latency_ms),
                    })
                }
                Err(e) => Ok(TestConnectionResponse {
                    success: false,
                    message: e.to_string(),
                    latency_ms: None,
                }),
            }
        } => result,
        _ = token.cancelled() => Err(DgridError::TestConnectionCancelled),
    };

    if let Some(ref operation_id) = operation_id {
        let mut tokens = state.test_connection_tokens.write().await;
        tokens.remove(operation_id);
    }

    result
}

#[tauri::command]
pub async fn cancel_test_connection(
    state: State<'_, AppState>,
    operation_id: String,
) -> Result<(), DgridError> {
    let mut tokens = state.test_connection_tokens.write().await;
    if let Some(token) = tokens.remove(&operation_id) {
        token.cancel();
    }
    Ok(())
}

#[tauri::command]
pub async fn test_saved_connection(
    state: State<'_, AppState>,
    id: String,
    password: Option<String>,
    operation_id: Option<String>,
) -> Result<TestConnectionResponse, DgridError> {
    let conn = {
        let storage = state.storage.lock().unwrap();
        storage.get(&id)?
    };

    let conn = conn.ok_or_else(|| DgridError::NotFound {
        entity: "Connection".into(),
        id: id.clone(),
    })?;

    if let Some(err) = &conn.error {
        return Err(DgridError::Validation(err.clone()));
    }

    let resolved_password = password.or_else(|| state.passwords.get(&conn.id));
    let uri = if let Some(username) = &conn.username {
        inject_credentials(&conn.uri, username, &resolved_password.unwrap_or_default())
    } else {
        conn.uri.clone()
    };

    execute_test_connection(&state, uri, operation_id).await
}

#[tauri::command]
pub async fn connect_to_connection(
    state: State<'_, AppState>,
    id: String,
    request: Option<ConnectRequest>,
) -> Result<ConnectionResponse, DgridError> {
    let request = request.unwrap_or(ConnectRequest {
        password: None,
        save_password: None,
    });

    // Force-disconnect stale entry so reconnect always works
    if state.pool.is_connected(&id).await {
        state.pool.force_disconnect(&id).await;
    }

    let conn = {
        let storage = state.storage.lock().unwrap();
        storage.get(&id)?
    };

    let mut conn = conn.ok_or_else(|| DgridError::NotFound {
        entity: "Connection".into(),
        id: id.clone(),
    })?;

    if let Some(err) = &conn.error {
        return Err(DgridError::Validation(err.clone()));
    }

    // "Remember password" flow
    if request.save_password == Some(true) {
        if let Some(ref password) = request.password {
            state.passwords.set(&id, password)?;
            let storage = state.storage.lock().unwrap();
            conn = storage.update(
                &id,
                UpdateConnectionInput {
                    name: None,
                    uri: None,
                    username: None,
                    save_password: Some(true),
                },
            )?;
        }
    }

    let resolved_password = request.password.or_else(|| state.passwords.get(&conn.id));
    let uri = if let Some(username) = &conn.username {
        inject_credentials(&conn.uri, username, &resolved_password.unwrap_or_default())
    } else {
        conn.uri.clone()
    };
    let database = get_database_from_uri(&conn.uri);

    let token = CancellationToken::new();
    {
        let mut tokens = state.connection_tokens.write().await;
        if let Some(old) = tokens.remove(&id) {
            old.cancel();
        }
        tokens.insert(id.clone(), token.clone());
    }

    let result = tokio::select! {
        result = state.pool.connect(&id, MongoConnectionOptions { uri, database }) => result,
        _ = token.cancelled() => Err(DgridError::ConnectionCancelled),
    };

    {
        let mut tokens = state.connection_tokens.write().await;
        tokens.remove(&id);
    }

    if matches!(result, Err(DgridError::ConnectionCancelled)) {
        state.pool.force_disconnect(&id).await;
    }

    result?;

    Ok(to_connection_response(&conn, true))
}

#[tauri::command]
pub async fn cancel_connect_to_connection(
    state: State<'_, AppState>,
    id: String,
) -> Result<(), DgridError> {
    let mut tokens = state.connection_tokens.write().await;
    if let Some(token) = tokens.remove(&id) {
        token.cancel();
    }
    Ok(())
}

#[tauri::command]
pub async fn disconnect_from_connection(
    state: State<'_, AppState>,
    id: String,
) -> Result<ConnectionResponse, DgridError> {
    let conn = {
        let storage = state.storage.lock().unwrap();
        storage.get(&id)?
    };

    let conn = conn.ok_or_else(|| DgridError::NotFound {
        entity: "Connection".into(),
        id: id.clone(),
    })?;

    state.pool.force_disconnect(&id).await;
    Ok(to_connection_response(&conn, false))
}
