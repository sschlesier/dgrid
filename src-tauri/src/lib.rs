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
        .invoke_handler(tauri::generate_handler![
            commands::version::get_version,
            commands::connections::list_connections,
            commands::connections::get_connection,
            commands::connections::create_connection,
            commands::connections::update_connection,
            commands::connections::delete_connection,
            commands::connections::test_connection,
            commands::connections::test_saved_connection,
            commands::connections::connect_to_connection,
            commands::connections::disconnect_from_connection,
            commands::databases::get_databases,
            commands::databases::get_collections,
            commands::databases::get_collection_stats_cmd,
            commands::databases::get_schema,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
