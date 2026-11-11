mod project;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .invoke_handler(tauri::generate_handler![
            project::project_load,
            project::project_write_page,
            project::project_create_folder,
            project::project_rename,
            project::project_remove,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Cursive");
}
