/// Shared application state managed by Tauri.
///
/// Populated in later phases with connection pools, file watchers, etc.
pub struct AppState {}

impl AppState {
    pub fn new() -> Self {
        Self {}
    }
}
