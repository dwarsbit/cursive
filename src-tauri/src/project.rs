//! A project on disk: a folder of Markdown files. The commands here are
//! the desktop side of the `ProjectStore` in `src/lib/project.ts`. Paths
//! from the webview are relative to the project folder and use `/`.

use serde::Serialize;
use std::collections::BTreeMap;
use std::fs;
use std::path::{Component, Path, PathBuf};

#[derive(Serialize, Debug, PartialEq)]
pub struct Project {
    /// The folder's name.
    pub name: String,
    /// Every folder, also the empty ones.
    pub folders: Vec<String>,
    /// Each page's file, by path.
    pub pages: BTreeMap<String, String>,
}

/// Folders that are never part of a project.
const SKIP_DIRS: [&str; 1] = ["node_modules"];

/// Resolve a path from the webview inside the project, refusing
/// absolute paths, `..` and symlinks that lead out of the folder.
fn resolve(project_dir: &str, rel_path: &str) -> Result<PathBuf, String> {
    if rel_path.is_empty() {
        return Err("empty path".into());
    }
    let rel = Path::new(rel_path);
    if rel.is_absolute() || rel.components().any(|c| !matches!(c, Component::Normal(_))) {
        return Err("the path must stay inside the project folder".into());
    }
    let base = fs::canonicalize(project_dir)
        .map_err(|e| format!("the project folder can't be opened: {e}"))?;
    let target = base.join(rel);
    // Resolve the deepest part that exists (the target, or the folder a
    // new file will land in) and require it inside the project.
    let mut existing = target.as_path();
    while fs::symlink_metadata(existing).is_err() {
        existing = existing.parent().ok_or("path has no existing parent")?;
    }
    let real = fs::canonicalize(existing).map_err(|e| format!("path not accessible: {e}"))?;
    if !real.starts_with(&base) {
        return Err("the path leads outside the project folder".into());
    }
    Ok(target)
}

/// Replace a file's content atomically: write a sibling temp file, then
/// rename it over the target, so a crash mid-write never leaves a
/// truncated file behind.
fn write_atomic(path: &Path, content: &[u8]) -> std::io::Result<()> {
    let name = path
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_default();
    let tmp = path.with_file_name(format!(".{name}.tmp-{}", std::process::id()));
    fs::write(&tmp, content)?;
    fs::rename(&tmp, path).inspect_err(|_| {
        let _ = fs::remove_file(&tmp);
    })
}

fn is_page(name: &str) -> bool {
    name.len() > 3 && name[name.len() - 3..].eq_ignore_ascii_case(".md")
}

fn walk(dir: &Path, prefix: &str, project: &mut Project) -> Result<(), String> {
    let read = fs::read_dir(dir).map_err(|e| format!("{}: {e}", dir.display()))?;
    for entry in read.filter_map(Result::ok) {
        let name = entry.file_name().to_string_lossy().to_string();
        if name.starts_with('.') || SKIP_DIRS.contains(&name.as_str()) {
            continue;
        }
        let path = if prefix.is_empty() {
            name.clone()
        } else {
            format!("{prefix}/{name}")
        };
        // Symlinks are left alone: they could lead out of the folder.
        let Ok(kind) = entry.file_type() else {
            continue;
        };
        if kind.is_dir() {
            project.folders.push(path.clone());
            walk(&entry.path(), &path, project)?;
        } else if kind.is_file() && is_page(&name) {
            // A file that isn't text (not UTF-8) is not a page.
            if let Ok(source) = fs::read_to_string(entry.path()) {
                project.pages.insert(path, source);
            }
        }
    }
    Ok(())
}

pub fn load(project_dir: &str) -> Result<Project, String> {
    let base = fs::canonicalize(project_dir)
        .map_err(|e| format!("the project folder can't be opened: {e}"))?;
    if !base.is_dir() {
        return Err("the project is not a folder".into());
    }
    let mut project = Project {
        name: base
            .file_name()
            .map(|n| n.to_string_lossy().to_string())
            .unwrap_or_else(|| "Project".into()),
        folders: Vec::new(),
        pages: BTreeMap::new(),
    };
    walk(&base, "", &mut project)?;
    project.folders.sort();
    Ok(project)
}

pub fn write_page(project_dir: &str, path: &str, source: &str) -> Result<(), String> {
    if !is_page(path) {
        return Err("a page's file ends in .md".into());
    }
    let target = resolve(project_dir, path)?;
    if let Some(parent) = target.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("can't create the folder: {e}"))?;
    }
    write_atomic(&target, source.as_bytes()).map_err(|e| format!("can't write {path}: {e}"))
}

pub fn create_folder(project_dir: &str, path: &str) -> Result<(), String> {
    let target = resolve(project_dir, path)?;
    fs::create_dir_all(&target).map_err(|e| format!("can't create {path}: {e}"))
}

pub fn rename(project_dir: &str, from: &str, to: &str) -> Result<(), String> {
    let source = resolve(project_dir, from)?;
    let target = resolve(project_dir, to)?;
    if fs::symlink_metadata(&source).is_err() {
        return Err(format!("{from} doesn't exist"));
    }
    // On a file system that ignores case, a rename that only changes the
    // case finds "itself" at the target; that is not a clash.
    let same = match (fs::canonicalize(&source), fs::canonicalize(&target)) {
        (Ok(a), Ok(b)) => a == b,
        _ => false,
    };
    if fs::symlink_metadata(&target).is_ok() && !same {
        return Err(format!("{to} already exists"));
    }
    if let Some(parent) = target.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("can't create the folder: {e}"))?;
    }
    fs::rename(&source, &target).map_err(|e| format!("can't rename {from}: {e}"))
}

/// Where a deleted page or folder goes.
pub enum Removal {
    /// The system's trash, so a delete can be taken back there.
    Trash,
    /// Gone for good; for tests, which have no trash.
    #[cfg(test)]
    Delete,
}

pub fn remove(project_dir: &str, path: &str, removal: Removal) -> Result<(), String> {
    let target = resolve(project_dir, path)?;
    if fs::symlink_metadata(&target).is_err() {
        return Ok(());
    }
    match removal {
        Removal::Trash => {
            trash::delete(&target).map_err(|e| format!("can't move {path} to the trash: {e}"))
        }
        #[cfg(test)]
        Removal::Delete => if target.is_dir() {
            fs::remove_dir_all(&target)
        } else {
            fs::remove_file(&target)
        }
        .map_err(|e| e.to_string()),
    }
}

#[tauri::command]
pub fn project_load(dir: String) -> Result<Project, String> {
    load(&dir)
}

#[tauri::command]
pub fn project_write_page(dir: String, path: String, source: String) -> Result<(), String> {
    write_page(&dir, &path, &source)
}

#[tauri::command]
pub fn project_create_folder(dir: String, path: String) -> Result<(), String> {
    create_folder(&dir, &path)
}

#[tauri::command]
pub fn project_rename(dir: String, from: String, to: String) -> Result<(), String> {
    rename(&dir, &from, &to)
}

#[tauri::command]
pub fn project_remove(dir: String, path: String) -> Result<(), String> {
    remove(&dir, &path, Removal::Trash)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicU32, Ordering};

    static NEXT: AtomicU32 = AtomicU32::new(0);

    /// A fresh, empty folder that is removed again when dropped.
    struct TempProject(PathBuf);

    impl TempProject {
        fn new() -> Self {
            let dir = std::env::temp_dir().join(format!(
                "cursive-test-{}-{}",
                std::process::id(),
                NEXT.fetch_add(1, Ordering::Relaxed)
            ));
            fs::create_dir_all(&dir).unwrap();
            TempProject(dir)
        }
        fn dir(&self) -> &str {
            self.0.to_str().unwrap()
        }
    }

    impl Drop for TempProject {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.0);
        }
    }

    #[test]
    fn loads_pages_and_folders_and_skips_the_rest() {
        let project = TempProject::new();
        write_page(
            project.dir(),
            "Thesis/Pilot study plan.md",
            "---\ntitle: Pilot\n---\n",
        )
        .unwrap();
        write_page(project.dir(), "Reading list.MD", "- [ ] Smith").unwrap();
        create_folder(project.dir(), "Empty").unwrap();
        fs::write(project.0.join("image.png"), [0u8, 159, 146, 150]).unwrap();
        fs::write(project.0.join("binary.md"), [0xffu8, 0xfe, 0xfd]).unwrap();
        fs::create_dir_all(project.0.join(".git")).unwrap();
        fs::write(project.0.join(".git/notes.md"), "hidden").unwrap();

        let loaded = load(project.dir()).unwrap();
        assert_eq!(loaded.folders, vec!["Empty", "Thesis"]);
        assert_eq!(
            loaded.pages.keys().collect::<Vec<_>>(),
            vec!["Reading list.MD", "Thesis/Pilot study plan.md"]
        );
        assert_eq!(loaded.pages["Reading list.MD"], "- [ ] Smith");
        assert_eq!(
            loaded.name,
            project.0.file_name().unwrap().to_string_lossy()
        );
    }

    #[test]
    fn writes_a_page_over_itself_and_leaves_no_temp_file() {
        let project = TempProject::new();
        write_page(project.dir(), "a.md", "one").unwrap();
        write_page(project.dir(), "a.md", "two").unwrap();
        assert_eq!(fs::read_to_string(project.0.join("a.md")).unwrap(), "two");
        let names: Vec<_> = fs::read_dir(&project.0)
            .unwrap()
            .map(|e| e.unwrap().file_name().to_string_lossy().to_string())
            .collect();
        assert_eq!(names, vec!["a.md"]);
    }

    #[test]
    fn refuses_paths_that_leave_the_project() {
        let project = TempProject::new();
        assert!(write_page(project.dir(), "../outside.md", "x").is_err());
        assert!(write_page(project.dir(), "a/../../outside.md", "x").is_err());
        assert!(write_page(project.dir(), "/tmp/outside.md", "x").is_err());
        assert!(create_folder(project.dir(), "..").is_err());
        assert!(remove(project.dir(), "../", Removal::Delete).is_err());
        assert!(write_page(project.dir(), "notes.txt", "x").is_err());
    }

    #[cfg(unix)]
    #[test]
    fn refuses_a_symlink_that_leads_out_of_the_project() {
        let project = TempProject::new();
        let outside = TempProject::new();
        std::os::unix::fs::symlink(&outside.0, project.0.join("link")).unwrap();
        assert!(write_page(project.dir(), "link/page.md", "x").is_err());
        assert!(load(project.dir()).unwrap().folders.is_empty());
    }

    #[test]
    fn renames_a_page_and_a_folder_with_its_pages() {
        let project = TempProject::new();
        write_page(project.dir(), "Thesis/a.md", "a").unwrap();
        write_page(project.dir(), "b.md", "b").unwrap();

        rename(project.dir(), "b.md", "Thesis/c.md").unwrap();
        rename(project.dir(), "Thesis", "Dissertation").unwrap();
        let loaded = load(project.dir()).unwrap();
        assert_eq!(loaded.folders, vec!["Dissertation"]);
        assert_eq!(
            loaded.pages.keys().collect::<Vec<_>>(),
            vec!["Dissertation/a.md", "Dissertation/c.md"]
        );
    }

    #[test]
    fn does_not_rename_over_another_page() {
        let project = TempProject::new();
        write_page(project.dir(), "a.md", "a").unwrap();
        write_page(project.dir(), "b.md", "b").unwrap();
        assert!(rename(project.dir(), "a.md", "b.md").is_err());
        assert!(rename(project.dir(), "missing.md", "c.md").is_err());
        assert_eq!(fs::read_to_string(project.0.join("b.md")).unwrap(), "b");
    }

    #[test]
    fn removes_a_page_and_a_folder() {
        let project = TempProject::new();
        write_page(project.dir(), "Thesis/a.md", "a").unwrap();
        write_page(project.dir(), "b.md", "b").unwrap();
        remove(project.dir(), "b.md", Removal::Delete).unwrap();
        remove(project.dir(), "Thesis", Removal::Delete).unwrap();
        remove(project.dir(), "already gone.md", Removal::Delete).unwrap();
        let loaded = load(project.dir()).unwrap();
        assert!(loaded.folders.is_empty() && loaded.pages.is_empty());
    }
}
