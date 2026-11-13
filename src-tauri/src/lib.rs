mod account;
mod files;
mod history;
mod link;
mod project;
mod projects;
mod zotero;

/// Opens the system's print window for the app's window. An export
/// puts its pages there, and the print window saves them as a PDF.
#[tauri::command]
fn print_window(window: tauri::WebviewWindow) -> Result<(), String> {
    window.print().map_err(|error| error.to_string())
}

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
            history::project_history_list,
            history::project_history_keep,
            project::project_files,
            project::project_read_file,
            project::project_write_file,
            project::project_open_file,
            projects::projects_list,
            projects::projects_create,
            projects::projects_opened,
            projects::projects_rename,
            projects::projects_trash,
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
            files::link_upload_file,
            files::link_download_file,
            zotero::zotero_local_fetch,
            zotero::zotero_key_get,
            zotero::zotero_key_set,
            zotero::zotero_key_delete,
            print_window,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Cursive");
}
