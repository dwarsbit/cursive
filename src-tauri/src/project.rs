//! A project on disk: a folder of Markdown files. The commands here are
//! the desktop side of the `ProjectStore` in `src/lib/project.ts`. Paths
//! from the webview are relative to the project folder and use `/`.

use serde::Serialize;
use sha2::{Digest, Sha256};
use std::collections::{BTreeMap, HashMap};
use std::fs;
use std::io::Read;
use std::path::{Component, Path, PathBuf};
use std::sync::{Mutex, OnceLock};
use std::time::SystemTime;

#[derive(Serialize, Debug, PartialEq)]
pub struct Project {
    /// The folder's name.
    pub name: String,
    /// Every folder, also the empty ones.
    pub folders: Vec<String>,
    /// Each page's file, by path.
    pub pages: BTreeMap<String, String>,
    /// The other files, such as images and attachments.
    pub files: Vec<String>,
}

/// A file that isn't a page, as a sync names it: its bytes by their hash.
#[derive(Serialize, Debug, PartialEq, Clone)]
pub struct FileInfo {
    /// The SHA-256 of the bytes, in lowercase hex.
    pub hash: String,
    pub size: u64,
    /// The media type, from the file's name.
    #[serde(rename = "type")]
    pub kind: String,
}

/// Folders that are never part of a project.
const SKIP_DIRS: [&str; 1] = ["node_modules"];
/// Files the system leaves in folders, which are no part of a project.
const SKIP_FILES: [&str; 3] = ["Thumbs.db", "desktop.ini", "Icon\r"];

/// Resolve a path from the webview inside the project, refusing
/// absolute paths, `..` and symlinks that lead out of the folder.
pub(crate) fn resolve(project_dir: &str, rel_path: &str) -> Result<PathBuf, String> {
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
pub(crate) fn write_atomic(path: &Path, content: &[u8]) -> std::io::Result<()> {
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
        } else if kind.is_file() && !SKIP_FILES.contains(&name.as_str()) {
            project.files.push(path);
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
        files: Vec::new(),
    };
    walk(&base, "", &mut project)?;
    project.folders.sort();
    project.files.sort();
    Ok(project)
}

/// The media type of a file, from its name.
pub fn media_type(path: &str) -> &'static str {
    let extension = path
        .rsplit_once('.')
        .map(|(_, ext)| ext.to_ascii_lowercase())
        .unwrap_or_default();
    match extension.as_str() {
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "gif" => "image/gif",
        "webp" => "image/webp",
        "avif" => "image/avif",
        "svg" => "image/svg+xml",
        "bmp" => "image/bmp",
        "ico" => "image/x-icon",
        "heic" => "image/heic",
        "pdf" => "application/pdf",
        "txt" => "text/plain",
        "csv" => "text/csv",
        "tsv" => "text/tab-separated-values",
        "json" => "application/json",
        "bib" => "application/x-bibtex",
        "tex" => "application/x-tex",
        "zip" => "application/zip",
        "doc" => "application/msword",
        "docx" => "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "xls" => "application/vnd.ms-excel",
        "xlsx" => "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "ppt" => "application/vnd.ms-powerpoint",
        "pptx" => "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        "odt" => "application/vnd.oasis.opendocument.text",
        "mp3" => "audio/mpeg",
        "wav" => "audio/wav",
        "mp4" => "video/mp4",
        "webm" => "video/webm",
        "mov" => "video/quicktime",
        _ => "application/octet-stream",
    }
}

/// The SHA-256 of a file, in lowercase hex.
pub fn hash_file(path: &Path) -> std::io::Result<String> {
    let mut file = fs::File::open(path)?;
    let mut hasher = Sha256::new();
    let mut buffer = vec![0u8; 64 * 1024];
    loop {
        let read = file.read(&mut buffer)?;
        if read == 0 {
            break;
        }
        hasher.update(&buffer[..read]);
    }
    Ok(hasher.finalize().iter().map(|b| format!("{b:02x}")).collect())
}

/// Hashes already made, by the file's place, size and time of change:
/// a sync asks for every file every little while.
type HashCache = HashMap<PathBuf, (u64, SystemTime, String)>;
fn hash_cache() -> &'static Mutex<HashCache> {
    static CACHE: OnceLock<Mutex<HashCache>> = OnceLock::new();
    CACHE.get_or_init(|| Mutex::new(HashMap::new()))
}

/// The project's files that aren't pages, with the hash of their bytes.
pub fn files(project_dir: &str) -> Result<BTreeMap<String, FileInfo>, String> {
    let project = load(project_dir)?;
    let base = fs::canonicalize(project_dir).map_err(|e| e.to_string())?;
    let mut found = BTreeMap::new();
    for path in project.files {
        let full = base.join(&path);
        let Ok(meta) = fs::metadata(&full) else {
            continue;
        };
        let size = meta.len();
        let changed = meta.modified().unwrap_or(SystemTime::UNIX_EPOCH);
        let known = hash_cache()
            .lock()
            .ok()
            .and_then(|cache| cache.get(&full).cloned())
            .filter(|(s, m, _)| *s == size && *m == changed)
            .map(|(_, _, hash)| hash);
        let hash = match known {
            Some(hash) => hash,
            None => {
                let Ok(hash) = hash_file(&full) else {
                    continue;
                };
                if let Ok(mut cache) = hash_cache().lock() {
                    cache.insert(full.clone(), (size, changed, hash.clone()));
                }
                hash
            }
        };
        let kind = media_type(&path).to_string();
        found.insert(path, FileInfo { hash, size, kind });
    }
    Ok(found)
}

pub fn read_file(project_dir: &str, path: &str) -> Result<Vec<u8>, String> {
    let target = resolve(project_dir, path)?;
    fs::read(&target).map_err(|e| format!("can't read {path}: {e}"))
}

pub fn write_file(project_dir: &str, path: &str, bytes: &[u8]) -> Result<(), String> {
    if is_page(path) {
        return Err("a page is written as text".into());
    }
    let target = resolve(project_dir, path)?;
    if let Some(parent) = target.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("can't create the folder: {e}"))?;
    }
    write_atomic(&target, bytes).map_err(|e| format!("can't write {path}: {e}"))
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
pub fn project_write_page(
    app: tauri::AppHandle,
    dir: String,
    path: String,
    source: String,
) -> Result<(), String> {
    if is_page(&path) {
        crate::history::keep_for(&app, &dir, &path, &source);
    }
    write_page(&dir, &path, &source)
}

#[tauri::command]
pub fn project_files(dir: String) -> Result<BTreeMap<String, FileInfo>, String> {
    files(&dir)
}

#[tauri::command]
pub fn project_read_file(dir: String, path: String) -> Result<tauri::ipc::Response, String> {
    read_file(&dir, &path).map(tauri::ipc::Response::new)
}

/// Writes a file the window sends as bytes; the folder and the path
/// come in the request's headers, URL-encoded.
#[tauri::command]
pub fn project_write_file(request: tauri::ipc::Request<'_>) -> Result<(), String> {
    let tauri::ipc::InvokeBody::Raw(bytes) = request.body() else {
        return Err("the file's bytes are missing".into());
    };
    let header = |name: &str| -> Result<String, String> {
        let raw = request
            .headers()
            .get(name)
            .and_then(|value| value.to_str().ok())
            .ok_or_else(|| format!("the request has no {name}"))?;
        percent_encoding::percent_decode_str(raw)
            .decode_utf8()
            .map(|value| value.to_string())
            .map_err(|_| format!("the {name} is not text"))
    };
    write_file(&header("dir")?, &header("path")?, bytes)
}

/// Opens a file of the project in the app the system opens it with.
#[tauri::command]
pub fn project_open_file(app: tauri::AppHandle, dir: String, path: String) -> Result<(), String> {
    use tauri_plugin_opener::OpenerExt;
    let target = resolve(&dir, &path)?;
    if !target.is_file() {
        return Err(format!("{path} is not in the project"));
    }
    app.opener()
        .open_path(target.to_string_lossy(), None::<&str>)
        .map_err(|e| format!("can't open {path}: {e}"))
}

#[tauri::command]
pub fn project_create_folder(dir: String, path: String) -> Result<(), String> {
    create_folder(&dir, &path)
}

#[tauri::command]
pub fn project_rename(
    app: tauri::AppHandle,
    dir: String,
    from: String,
    to: String,
) -> Result<(), String> {
    rename(&dir, &from, &to)?;
    crate::history::rename_for(&app, &dir, &from, &to);
    Ok(())
}

#[tauri::command]
pub fn project_remove(app: tauri::AppHandle, dir: String, path: String) -> Result<(), String> {
    remove(&dir, &path, Removal::Trash)?;
    crate::history::remove_for(&app, &dir, &path);
    Ok(())
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
        assert_eq!(loaded.files, vec!["image.png"]);
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
    fn writes_reads_and_hashes_other_files() {
        let project = TempProject::new();
        write_file(project.dir(), "attachments/chart.png", b"png bytes").unwrap();
        assert_eq!(
            read_file(project.dir(), "attachments/chart.png").unwrap(),
            b"png bytes"
        );
        let found = files(project.dir()).unwrap();
        let chart = &found["attachments/chart.png"];
        assert_eq!(chart.size, 9);
        assert_eq!(chart.kind, "image/png");
        // The hash is the SHA-256 of the bytes.
        let digest = Sha256::digest(b"png bytes");
        let hex: String = digest.iter().map(|b| format!("{b:02x}")).collect();
        assert_eq!(chart.hash, hex);
        // A changed file gets a new hash.
        std::thread::sleep(std::time::Duration::from_millis(20));
        write_file(project.dir(), "attachments/chart.png", b"other bytes").unwrap();
        assert_ne!(files(project.dir()).unwrap()["attachments/chart.png"].hash, hex);
        assert!(write_file(project.dir(), "page.md", b"x").is_err());
        assert!(read_file(project.dir(), "../outside.png").is_err());
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
