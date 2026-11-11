//! Links: which project in the account a folder syncs with, and the
//! copy of that project's document the sync works from
//! (`src/lib/link-sync.ts`). They are kept in the app's data folder,
//! one file per project folder, so the folder itself holds nothing but
//! the pages.

use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::fs;
use std::path::{Path, PathBuf};
use tauri::Manager;

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Link {
    /// The server the project is on.
    pub server: String,
    pub project_id: String,
    /// The document as of the last sync: a Yjs update, base64.
    pub state: String,
}

/// The link's file for a project folder: named after the folder's real
/// path, so the same folder always finds its link.
fn link_file(links_dir: &Path, project_dir: &str) -> Result<PathBuf, String> {
    let real = fs::canonicalize(project_dir)
        .map_err(|e| format!("the project folder can't be opened: {e}"))?;
    let digest = Sha256::digest(real.to_string_lossy().as_bytes());
    let name: String = digest.iter().take(16).map(|b| format!("{b:02x}")).collect();
    Ok(links_dir.join(format!("{name}.json")))
}

pub fn load(links_dir: &Path, project_dir: &str, server: &str) -> Result<Option<Link>, String> {
    let file = link_file(links_dir, project_dir)?;
    let Ok(json) = fs::read_to_string(file) else {
        return Ok(None);
    };
    // A link to another server is not this account's.
    Ok(serde_json::from_str::<Link>(&json)
        .ok()
        .filter(|link| link.server == server))
}

pub fn save(links_dir: &Path, project_dir: &str, link: &Link) -> Result<(), String> {
    fs::create_dir_all(links_dir).map_err(|e| e.to_string())?;
    let file = link_file(links_dir, project_dir)?;
    let json = serde_json::to_string(link).map_err(|e| e.to_string())?;
    let tmp = file.with_extension(format!("tmp-{}", std::process::id()));
    fs::write(&tmp, json).map_err(|e| e.to_string())?;
    fs::rename(&tmp, &file).map_err(|e| {
        let _ = fs::remove_file(&tmp);
        e.to_string()
    })
}

pub fn remove(links_dir: &Path, project_dir: &str) -> Result<(), String> {
    match fs::remove_file(link_file(links_dir, project_dir)?) {
        Ok(()) => Ok(()),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(e) => Err(e.to_string()),
    }
}

fn links_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    Ok(app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join("links"))
}

#[tauri::command]
pub fn link_load(app: tauri::AppHandle, dir: String) -> Result<Option<Link>, String> {
    load(&links_dir(&app)?, &dir, &crate::account::server()?)
}

#[tauri::command]
pub fn link_save(
    app: tauri::AppHandle,
    dir: String,
    project_id: String,
    state: String,
) -> Result<(), String> {
    let link = Link {
        server: crate::account::server()?,
        project_id,
        state,
    };
    save(&links_dir(&app)?, &dir, &link)
}

#[tauri::command]
pub fn link_remove(app: tauri::AppHandle, dir: String) -> Result<(), String> {
    remove(&links_dir(&app)?, &dir)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("cursive-link-{name}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn saves_loads_and_removes_a_link() {
        let links = temp("links");
        let project = temp("project");
        let dir = project.to_str().unwrap();
        assert_eq!(load(&links, dir, "https://a.example").unwrap(), None);

        let link = Link {
            server: "https://a.example".into(),
            project_id: "p1".into(),
            state: "AAA=".into(),
        };
        save(&links, dir, &link).unwrap();
        assert_eq!(load(&links, dir, "https://a.example").unwrap(), Some(link));
        // Another server's account doesn't see it.
        assert_eq!(load(&links, dir, "https://b.example").unwrap(), None);
        // No temp file is left behind.
        assert_eq!(fs::read_dir(&links).unwrap().count(), 1);

        remove(&links, dir).unwrap();
        assert_eq!(load(&links, dir, "https://a.example").unwrap(), None);
        remove(&links, dir).unwrap();
        let _ = fs::remove_dir_all(links);
        let _ = fs::remove_dir_all(project);
    }

    #[test]
    fn finds_the_same_link_through_another_spelling_of_the_folder() {
        let links = temp("links2");
        let project = temp("project2");
        fs::create_dir_all(project.join("sub")).unwrap();
        let plain = project.to_str().unwrap().to_string();
        let roundabout = project.join("sub").join("..").to_str().unwrap().to_string();
        let link = Link {
            server: "s".into(),
            project_id: "p".into(),
            state: String::new(),
        };
        save(&links, &plain, &link).unwrap();
        assert_eq!(load(&links, &roundabout, "s").unwrap(), Some(link));
        let _ = fs::remove_dir_all(links);
        let _ = fs::remove_dir_all(project);
    }
}
