use std::time::{Duration, Instant};

use serde::Serialize;
use tauri::State;

use crate::state::{AppState, CachedUpdateCheck};
use crate::updater;

const CACHE_TTL: Duration = Duration::from_secs(60 * 60); // 1 hour

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VersionResponse {
    pub version: String,
    pub install_method: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub update: Option<UpdateInfoResponse>,
}

#[derive(Debug, Clone, Serialize)]
pub struct UpdateInfoResponse {
    pub version: String,
    pub url: String,
}

#[tauri::command]
pub fn get_version() -> String {
    env!("CARGO_PKG_VERSION").to_string()
}

#[tauri::command]
pub async fn check_for_updates(state: State<'_, AppState>) -> Result<VersionResponse, String> {
    let version = env!("CARGO_PKG_VERSION").to_string();

    // Check cache first
    {
        let cache = state.update_cache.read().await;
        if let Some(ref cached) = *cache {
            if cached.checked_at.elapsed() < CACHE_TTL {
                return Ok(VersionResponse {
                    version: version.clone(),
                    install_method: updater::detect_install_method().to_string(),
                    update: cached.update.as_ref().map(|u| UpdateInfoResponse {
                        version: u.version.clone(),
                        url: u.url.clone(),
                    }),
                });
            }
        }
    }

    // Perform the check
    let update = updater::check_for_update(&version).await;

    // Cache the result
    let response = VersionResponse {
        version: version.clone(),
        install_method: updater::detect_install_method().to_string(),
        update: update.as_ref().map(|u| UpdateInfoResponse {
            version: u.version.clone(),
            url: u.url.clone(),
        }),
    };

    {
        let mut cache = state.update_cache.write().await;
        *cache = Some(CachedUpdateCheck {
            update,
            checked_at: Instant::now(),
        });
    }

    Ok(response)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn returns_package_version() {
        let version = get_version();
        assert_eq!(version, env!("CARGO_PKG_VERSION"));
    }

    #[test]
    fn version_response_serializes_without_update() {
        let response = VersionResponse {
            version: "0.6.0".to_string(),
            install_method: "direct".to_string(),
            update: None,
        };
        let json = serde_json::to_value(&response).unwrap();
        assert_eq!(json["version"], "0.6.0");
        assert_eq!(json["installMethod"], "direct");
        assert!(json.get("update").is_none());
    }

    #[test]
    fn version_response_serializes_with_update() {
        let response = VersionResponse {
            version: "0.6.0".to_string(),
            install_method: "homebrew".to_string(),
            update: Some(UpdateInfoResponse {
                version: "0.7.0".to_string(),
                url: "https://github.com/sschlesier/dgrid/releases/tag/v0.7.0".to_string(),
            }),
        };
        let json = serde_json::to_value(&response).unwrap();
        assert_eq!(json["version"], "0.6.0");
        assert_eq!(json["installMethod"], "homebrew");
        assert_eq!(json["update"]["version"], "0.7.0");
        assert_eq!(
            json["update"]["url"],
            "https://github.com/sschlesier/dgrid/releases/tag/v0.7.0"
        );
    }

    #[test]
    fn detect_install_method_returns_valid_value() {
        let method = super::updater::detect_install_method();
        assert!(method == "homebrew" || method == "direct");
    }
}
