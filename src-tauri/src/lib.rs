mod commands;
mod credentials;
mod error;
mod keyring;
mod pool;
mod state;
mod storage;

use state::AppState;

pub fn run() {
    tauri::Builder::default()
        .manage(AppState::new())
        .invoke_handler(tauri::generate_handler![commands::version::get_version])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
