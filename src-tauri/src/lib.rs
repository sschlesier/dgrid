mod bson_ser;
mod commands;
mod config;
mod credentials;
mod csv;
mod error;
mod executor;
mod file_validation;
mod keyring;
mod pool;
mod state;
mod storage;
mod updater;

use state::AppState;

pub fn run() {
    let builder = tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init());

    #[cfg(debug_assertions)]
    let builder = builder.plugin(tauri_plugin_webdriver::init());

    builder
        .setup(|_app| {
            // On macOS, the default menu contains a "Close Window" item (Cmd+W) in both
            // the File and Window submenus. macOS dispatches menu key-equivalents before
            // the keystroke reaches the webview, so without this override Cmd+W closes
            // the app window instead of triggering the frontend's close-tab handler.
            // We replace the default menu with one that omits close_window so Cmd+W
            // passes through to JavaScript, where TabBar registers it as close-tab.
            #[cfg(target_os = "macos")]
            {
                let app = _app;
                use tauri::menu::{AboutMetadata, PredefinedMenuItem, Submenu};

                let pkg_info = app.package_info();
                let config = app.config();

                let about_metadata = AboutMetadata {
                    name: Some(pkg_info.name.clone()),
                    version: Some(pkg_info.version.to_string()),
                    copyright: config.bundle.copyright.clone(),
                    authors: config.bundle.publisher.clone().map(|p| vec![p]),
                    ..Default::default()
                };

                // App submenu (DGrid): About, Services, Hide, Quit — standard macOS shape
                let app_submenu = Submenu::with_items(
                    app,
                    pkg_info.name.clone(),
                    true,
                    &[
                        &PredefinedMenuItem::about(app, None, Some(about_metadata))?,
                        &PredefinedMenuItem::separator(app)?,
                        &PredefinedMenuItem::services(app, None)?,
                        &PredefinedMenuItem::separator(app)?,
                        &PredefinedMenuItem::hide(app, None)?,
                        &PredefinedMenuItem::hide_others(app, None)?,
                        &PredefinedMenuItem::show_all(app, None)?,
                        &PredefinedMenuItem::separator(app)?,
                        &PredefinedMenuItem::quit(app, None)?,
                    ],
                )?;

                // Edit submenu: standard text-editing commands
                let edit_submenu = Submenu::with_items(
                    app,
                    "Edit",
                    true,
                    &[
                        &PredefinedMenuItem::undo(app, None)?,
                        &PredefinedMenuItem::redo(app, None)?,
                        &PredefinedMenuItem::separator(app)?,
                        &PredefinedMenuItem::cut(app, None)?,
                        &PredefinedMenuItem::copy(app, None)?,
                        &PredefinedMenuItem::paste(app, None)?,
                        &PredefinedMenuItem::select_all(app, None)?,
                    ],
                )?;

                // View submenu
                let view_submenu = Submenu::with_items(
                    app,
                    "View",
                    true,
                    &[&PredefinedMenuItem::fullscreen(app, None)?],
                )?;

                // Window submenu: omits close_window (Cmd+W) so it reaches the webview.
                // The red traffic-light button and Cmd+Q (Quit) still close/quit the app.
                let window_submenu = Submenu::with_items(
                    app,
                    "Window",
                    true,
                    &[
                        &PredefinedMenuItem::minimize(app, None)?,
                        &PredefinedMenuItem::maximize(app, None)?,
                    ],
                )?;

                let menu = tauri::menu::MenuBuilder::new(app)
                    .items(&[&app_submenu, &edit_submenu, &view_submenu, &window_submenu])
                    .build()?;

                app.set_menu(menu)?;
            }

            Ok(())
        })
        .manage(AppState::new())
        .invoke_handler(tauri::generate_handler![
            commands::version::get_version,
            commands::version::check_for_updates,
            commands::connections::list_connections,
            commands::connections::get_connection,
            commands::connections::create_connection,
            commands::connections::update_connection,
            commands::connections::delete_connection,
            commands::connections::test_connection,
            commands::connections::test_saved_connection,
            commands::connections::cancel_test_connection,
            commands::connections::connect_to_connection,
            commands::connections::cancel_connect_to_connection,
            commands::connections::disconnect_from_connection,
            commands::databases::get_databases,
            commands::databases::get_collections,
            commands::databases::get_collections_fast,
            commands::databases::get_all_collection_stats,
            commands::databases::get_collection_stats_cmd,
            commands::databases::get_schema,
            commands::databases::list_indexes,
            commands::query::execute_query,
            commands::query::cancel_query,
            commands::documents::update_field,
            commands::documents::update_document,
            commands::documents::insert_document,
            commands::documents::delete_document,
            commands::export::export_csv,
            commands::export::export_csv_to_string,
            commands::export::cancel_export,
            commands::files::read_file,
            commands::files::write_file,
            commands::files::watch_file,
            commands::files::unwatch_file,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
