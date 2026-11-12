mod account;
mod link;
mod project;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .invoke_handler(tauri::generate_handler![
            project::project_load,
            project::project_write_page,
            project::project_create_folder,
            project::project_rename,
            project::project_remove,
            account::account_signed_in,
            account::account_server,
            account::account_sign_in,
            account::account_cancel_sign_in,
            account::account_sign_out,
            account::open_in_browser,
            account::server_request,
            account::server_download,
            link::link_load,
            link::link_save,
            link::link_remove,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Cursive");
}
