mod commands;
mod error;
mod state;

use state::AppState;

pub fn run() {
    tauri::Builder::default()
        .manage(AppState::new())
        .invoke_handler(tauri::generate_handler![commands::version::get_version])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
