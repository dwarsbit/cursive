//! The projects the app knows: the Cursive folder in the home folder,
//! where new projects are made, and the list of projects opened
//! lately, kept in the app's data folder.

use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use tauri::Manager;

/// How many projects the list remembers.
const RECENT_MAX: usize = 20;

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Recent {
    /// The folder's name.
    pub name: String,
    pub path: String,
    /// When it was opened last, in milliseconds since 1970.
    pub opened_at: u64,
}

#[derive(Serialize, Debug)]
pub struct Projects {
    /// The folder new projects are made in.
    pub root: String,
    pub recent: Vec<Recent>,
}

fn now() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

fn name_of(dir: &Path) -> String {
    dir.file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_else(|| "Project".into())
}

/// A project's name is its folder's name, so it has to be one.
fn check_name(name: &str) -> Result<&str, String> {
    let name = name.trim();
    if name.is_empty() {
        return Err("Give the project a name.".into());
    }
    if name.starts_with('.') || name.ends_with('.') {
        return Err("A project's name can't start or end with a dot.".into());
    }
    if name.len() > 120 {
        return Err("That name is too long. Use 120 characters at most.".into());
    }
    if name
        .chars()
        .any(|c| c.is_control() || r#"/\:*?"<>|"#.contains(c))
    {
        return Err(r#"A project's name can't contain / \ : * ? " < > or |."#.into());
    }
    Ok(name)
}

pub fn read_recent(file: &Path) -> Vec<Recent> {
    fs::read_to_string(file)
        .ok()
        .and_then(|json| serde_json::from_str(&json).ok())
        .unwrap_or_default()
}

fn write_recent(file: &Path, recent: &[Recent]) -> Result<(), String> {
    if let Some(parent) = file.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let json = serde_json::to_string(recent).map_err(|e| e.to_string())?;
    let tmp = file.with_extension(format!("tmp-{}", std::process::id()));
    fs::write(&tmp, json).map_err(|e| e.to_string())?;
    fs::rename(&tmp, file).map_err(|e| {
        let _ = fs::remove_file(&tmp);
        e.to_string()
    })
}

/// The list with projects whose folder is gone left out.
pub fn list(file: &Path) -> Vec<Recent> {
    read_recent(file)
        .into_iter()
        .filter(|recent| Path::new(&recent.path).is_dir())
        .collect()
}

/// Puts a folder at the top of the list, as opened now.
pub fn opened(file: &Path, dir: &str) -> Result<Recent, String> {
    let real =
        fs::canonicalize(dir).map_err(|e| format!("the project folder can't be opened: {e}"))?;
    if !real.is_dir() {
        return Err("the project is not a folder".into());
    }
    let entry = Recent {
        name: name_of(&real),
        path: real.to_string_lossy().to_string(),
        opened_at: now(),
    };
    let mut recent = read_recent(file);
    recent.retain(|r| r.path != entry.path);
    recent.insert(0, entry.clone());
    recent.truncate(RECENT_MAX);
    write_recent(file, &recent)?;
    Ok(entry)
}

/// Makes a new project's folder in `root`. With `unique`, a name that
/// is taken gets a number after it; without, it is refused.
pub fn create(root: &Path, name: &str, unique: bool) -> Result<PathBuf, String> {
    let name = check_name(name)?;
    fs::create_dir_all(root).map_err(|e| format!("can't create {}: {e}", root.display()))?;
    let mut dir = root.join(name);
    if dir.exists() {
        if !unique {
            return Err(format!(
                "You already have a project named “{name}”. Choose another name."
            ));
        }
        dir = (2..1000)
            .map(|n| root.join(format!("{name} {n}")))
            .find(|candidate| !candidate.exists())
            .ok_or("no free name for the project's folder")?;
    }
    fs::create_dir(&dir).map_err(|e| format!("can't create the project's folder: {e}"))?;
    fs::canonicalize(&dir).map_err(|e| e.to_string())
}

/// Gives a project's folder another name, in the folder it is in.
pub fn rename(dir: &str, name: &str) -> Result<PathBuf, String> {
    let name = check_name(name)?;
    let real =
        fs::canonicalize(dir).map_err(|e| format!("the project folder can't be opened: {e}"))?;
    let target = real
        .parent()
        .ok_or("the project's folder has no folder around it")?
        .join(name);
    if target == real {
        return Ok(real);
    }
    // On a file system that ignores case, a change of case only finds "itself".
    let same = fs::canonicalize(&target).is_ok_and(|found| found == real);
    if target.exists() && !same {
        return Err(format!(
            "There is already a folder named “{name}” next to this project. Choose another name."
        ));
    }
    fs::rename(&real, &target).map_err(|e| format!("can't rename the project: {e}"))?;
    Ok(target)
}

fn recent_file(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    Ok(app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join("projects.json"))
}

fn root(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    Ok(app
        .path()
        .home_dir()
        .map_err(|e| e.to_string())?
        .join("Cursive"))
}

#[tauri::command]
pub fn projects_list(app: tauri::AppHandle) -> Result<Projects, String> {
    Ok(Projects {
        root: root(&app)?.to_string_lossy().to_string(),
        recent: list(&recent_file(&app)?),
    })
}

/// Makes a project in the Cursive folder and returns its folder.
#[tauri::command]
pub fn projects_create(app: tauri::AppHandle, name: String, unique: bool) -> Result<String, String> {
    let dir = create(&root(&app)?, &name, unique)?;
    Ok(dir.to_string_lossy().to_string())
}

#[tauri::command]
pub fn projects_opened(app: tauri::AppHandle, dir: String) -> Result<Recent, String> {
    opened(&recent_file(&app)?, &dir)
}

/// Renames a project's folder. Its link to the account and its place
/// in the list move with it. Returns the folder's new path.
#[tauri::command]
pub fn projects_rename(app: tauri::AppHandle, dir: String, name: String) -> Result<String, String> {
    let links = crate::link::links_dir(&app)?;
    let old = fs::canonicalize(&dir)
        .map_err(|e| format!("the project folder can't be opened: {e}"))?
        .to_string_lossy()
        .to_string();
    let old_link = crate::link::link_file(&links, &old)?;
    let target = rename(&dir, &name)?;
    let new = target.to_string_lossy().to_string();
    if old_link.exists() {
        let new_link = crate::link::link_file(&links, &new)?;
        fs::rename(&old_link, &new_link).map_err(|e| e.to_string())?;
    }
    let file = recent_file(&app)?;
    let mut recent = read_recent(&file);
    for entry in recent.iter_mut().filter(|entry| entry.path == old) {
        entry.path = new.clone();
        entry.name = name_of(&target);
    }
    write_recent(&file, &recent)?;
    Ok(new)
}

/// Moves a project's folder to the trash and takes it off the list.
#[tauri::command]
pub fn projects_trash(app: tauri::AppHandle, dir: String) -> Result<(), String> {
    let file = recent_file(&app)?;
    let mut recent = read_recent(&file);
    // Only a project on the list: not any folder a script names.
    if !recent.iter().any(|entry| entry.path == dir) {
        return Err("that project is not on the list".into());
    }
    if Path::new(&dir).exists() {
        let _ = crate::link::remove(&crate::link::links_dir(&app)?, &dir);
        trash::delete(&dir).map_err(|e| format!("can't move the project to the trash: {e}"))?;
    }
    recent.retain(|entry| entry.path != dir);
    write_recent(&file, &recent)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp(name: &str) -> PathBuf {
        let dir =
            std::env::temp_dir().join(format!("cursive-projects-{name}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        fs::canonicalize(dir).unwrap()
    }

    #[test]
    fn creates_a_project_and_refuses_a_taken_or_bad_name() {
        let home = temp("create");
        let root = home.join("Cursive");
        let made = create(&root, "  Thesis notes ", false).unwrap();
        assert_eq!(made, root.join("Thesis notes"));
        assert!(made.is_dir());
        assert!(create(&root, "Thesis notes", false).is_err());
        assert_eq!(
            create(&root, "Thesis notes", true).unwrap(),
            root.join("Thesis notes 2")
        );
        for bad in ["", "  ", "a/b", "..", ".hidden", "a:b", "a\\b"] {
            assert!(create(&root, bad, false).is_err(), "{bad:?}");
        }
        let _ = fs::remove_dir_all(home);
    }

    #[test]
    fn lists_opened_projects_newest_first_without_the_ones_that_are_gone() {
        let home = temp("recent");
        let file = home.join("data").join("projects.json");
        let a = create(&home, "A", false).unwrap();
        let b = create(&home, "B", false).unwrap();
        opened(&file, a.to_str().unwrap()).unwrap();
        opened(&file, b.to_str().unwrap()).unwrap();
        opened(&file, a.to_str().unwrap()).unwrap();
        let names = |file: &Path| {
            list(file)
                .into_iter()
                .map(|recent| recent.name)
                .collect::<Vec<_>>()
        };
        assert_eq!(names(&file), vec!["A", "B"]);
        fs::remove_dir_all(&a).unwrap();
        assert_eq!(names(&file), vec!["B"]);
        assert!(opened(&file, a.to_str().unwrap()).is_err());
        let _ = fs::remove_dir_all(home);
    }

    #[test]
    fn renames_a_project_but_not_over_another() {
        let home = temp("rename");
        let a = create(&home, "A", false).unwrap();
        create(&home, "B", false).unwrap();
        fs::write(a.join("page.md"), "text").unwrap();
        assert!(rename(a.to_str().unwrap(), "B").is_err());
        assert!(rename(a.to_str().unwrap(), "x/y").is_err());
        assert_eq!(rename(a.to_str().unwrap(), "A").unwrap(), a);
        let moved = rename(a.to_str().unwrap(), "C").unwrap();
        assert_eq!(moved, home.join("C"));
        assert_eq!(fs::read_to_string(moved.join("page.md")).unwrap(), "text");
        assert!(!a.exists());
        let _ = fs::remove_dir_all(home);
    }
}
