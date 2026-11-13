//! Snapshots of a project's pages, to see and restore earlier ones. They
//! are kept in the app's data folder, not in the project: one folder per
//! project, and in it one folder per page with a file per snapshot,
//! named by when the page was last written before it changed.

use percent_encoding::{percent_decode_str, utf8_percent_encode, AsciiSet, NON_ALPHANUMERIC};
use serde::Serialize;
use sha2::{Digest, Sha256};
use std::fs;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::Manager;

/// How long a page keeps changing before its next snapshot: 10 minutes.
const EVERY_MS: u64 = 10 * 60 * 1000;
/// The most snapshots a page keeps; the oldest go first.
const MAX_SNAPSHOTS: usize = 100;

/// A page's name in the history folder: its path, with `/` and anything
/// a file name can't hold written as `%xx`.
const NAME: &AsciiSet = &NON_ALPHANUMERIC.remove(b'-').remove(b'_').remove(b'.').remove(b' ');

#[derive(Serialize, Debug, PartialEq, Clone)]
pub struct Snapshot {
    /// When the page was like this, in milliseconds since 1970.
    pub at: u64,
    pub source: String,
}

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

fn mtime_ms(path: &Path) -> Option<u64> {
    let modified = fs::metadata(path).ok()?.modified().ok()?;
    Some(modified.duration_since(UNIX_EPOCH).ok()?.as_millis() as u64)
}

/// The folder that keeps the snapshots of one project.
pub(crate) fn project_history(history_dir: &Path, project_dir: &str) -> Result<PathBuf, String> {
    let real = fs::canonicalize(project_dir)
        .map_err(|e| format!("the project folder can't be opened: {e}"))?;
    let digest = Sha256::digest(real.to_string_lossy().as_bytes());
    let name: String = digest.iter().take(16).map(|b| format!("{b:02x}")).collect();
    Ok(history_dir.join(name))
}

fn page_dir(project_history: &Path, path: &str) -> PathBuf {
    project_history.join(utf8_percent_encode(path, NAME).to_string())
}

/// The snapshots' times, newest first.
fn times(dir: &Path) -> Vec<u64> {
    let mut found: Vec<u64> = fs::read_dir(dir)
        .into_iter()
        .flatten()
        .flatten()
        .filter_map(|entry| {
            let name = entry.file_name().to_string_lossy().into_owned();
            name.strip_suffix(".md")?.parse().ok()
        })
        .collect();
    found.sort_unstable_by(|a, b| b.cmp(a));
    found
}

/// Before a page is written: keeps the page as it is now when it changes
/// and its newest snapshot is old enough, or with `force` whatever its
/// age, as before a restore. `now` is for tests.
pub fn keep(
    project_history: &Path,
    project_dir: &str,
    path: &str,
    next: Option<&str>,
    now: u64,
) -> Result<(), String> {
    let file = crate::project::resolve(project_dir, path)?;
    let Ok(current) = fs::read_to_string(&file) else {
        return Ok(());
    };
    if next == Some(current.as_str()) || current.trim().is_empty() {
        return Ok(());
    }
    let force = next.is_none();
    let dir = page_dir(project_history, path);
    let known = times(&dir);
    if let Some(&newest) = known.first() {
        if !force && now.saturating_sub(newest) < EVERY_MS {
            return Ok(());
        }
        // The same text as the newest snapshot needs no second one.
        if fs::read_to_string(dir.join(format!("{newest}.md"))).ok().as_deref() == Some(&current) {
            return Ok(());
        }
    }
    let at = mtime_ms(&file).unwrap_or(now).min(now);
    let at = match known.first() {
        Some(&newest) if at <= newest => newest + 1,
        _ => at,
    };
    fs::create_dir_all(&dir).map_err(|e| format!("can't keep a snapshot: {e}"))?;
    fs::write(dir.join(format!("{at}.md")), &current)
        .map_err(|e| format!("can't keep a snapshot: {e}"))?;
    for old in times(&dir).into_iter().skip(MAX_SNAPSHOTS) {
        let _ = fs::remove_file(dir.join(format!("{old}.md")));
    }
    Ok(())
}

/// A page's snapshots, newest first.
pub fn list(project_history: &Path, path: &str) -> Vec<Snapshot> {
    let dir = page_dir(project_history, path);
    times(&dir)
        .into_iter()
        .filter_map(|at| {
            let source = fs::read_to_string(dir.join(format!("{at}.md"))).ok()?;
            Some(Snapshot { at, source })
        })
        .collect()
}

/// After a page or a folder moved: its snapshots move with it.
pub fn rename(project_history: &Path, from: &str, to: &str) {
    let Ok(entries) = fs::read_dir(project_history) else {
        return;
    };
    for entry in entries.flatten() {
        let name = entry.file_name().to_string_lossy().into_owned();
        let Ok(path) = percent_decode_str(&name).decode_utf8() else {
            continue;
        };
        let moved = if path == from {
            to.to_string()
        } else if let Some(rest) = path.strip_prefix(&format!("{from}/")) {
            format!("{to}/{rest}")
        } else {
            continue;
        };
        let target = page_dir(project_history, &moved);
        if target.exists() {
            let _ = fs::remove_dir_all(&target);
        }
        let _ = fs::rename(entry.path(), target);
    }
}

/// After a page or a folder was deleted: its snapshots go too.
pub fn remove(project_history: &Path, removed: &str) {
    let Ok(entries) = fs::read_dir(project_history) else {
        return;
    };
    for entry in entries.flatten() {
        let name = entry.file_name().to_string_lossy().into_owned();
        let Ok(path) = percent_decode_str(&name).decode_utf8() else {
            continue;
        };
        if path == removed || path.starts_with(&format!("{removed}/")) {
            let _ = fs::remove_dir_all(entry.path());
        }
    }
}

pub(crate) fn history_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    Ok(app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join("history"))
}

/// Keeps a snapshot before a write; a failure to keep one doesn't stop the write.
pub fn keep_for(app: &tauri::AppHandle, project_dir: &str, path: &str, next: &str) {
    if let Ok(dir) = history_dir(app).and_then(|dir| project_history(&dir, project_dir)) {
        let _ = keep(&dir, project_dir, path, Some(next), now_ms());
    }
}

pub fn rename_for(app: &tauri::AppHandle, project_dir: &str, from: &str, to: &str) {
    if let Ok(dir) = history_dir(app).and_then(|dir| project_history(&dir, project_dir)) {
        rename(&dir, from, to);
    }
}

pub fn remove_for(app: &tauri::AppHandle, project_dir: &str, path: &str) {
    if let Ok(dir) = history_dir(app).and_then(|dir| project_history(&dir, project_dir)) {
        remove(&dir, path);
    }
}

#[tauri::command]
pub fn project_history_list(
    app: tauri::AppHandle,
    dir: String,
    path: String,
) -> Result<Vec<Snapshot>, String> {
    let history = project_history(&history_dir(&app)?, &dir)?;
    Ok(list(&history, &path))
}

/// Keeps the page as it is now, before a restore replaces it.
#[tauri::command]
pub fn project_history_keep(app: tauri::AppHandle, dir: String, path: String) -> Result<(), String> {
    let history = project_history(&history_dir(&app)?, &dir)?;
    keep(&history, &dir, &path, None, now_ms())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicU32, Ordering};

    static NEXT: AtomicU32 = AtomicU32::new(0);

    struct Temp(PathBuf);
    impl Temp {
        fn new() -> Self {
            let dir = std::env::temp_dir().join(format!(
                "cursive-history-{}-{}",
                std::process::id(),
                NEXT.fetch_add(1, Ordering::SeqCst)
            ));
            fs::create_dir_all(&dir).unwrap();
            Temp(dir)
        }
    }
    impl Drop for Temp {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.0);
        }
    }

    #[test]
    fn keeps_a_snapshot_when_a_page_changes_and_not_more_often() {
        let project = Temp::new();
        let history = Temp::new();
        let dir = project.0.to_str().unwrap();
        fs::create_dir_all(project.0.join("Notes")).unwrap();
        fs::write(project.0.join("Notes/a.md"), "# One\n").unwrap();

        // Nothing changes: no snapshot.
        keep(&history.0, dir, "Notes/a.md", Some("# One\n"), 1_000_000_000_000).unwrap();
        assert!(list(&history.0, "Notes/a.md").is_empty());

        keep(&history.0, dir, "Notes/a.md", Some("# Two\n"), 1_000_000_000_000).unwrap();
        fs::write(project.0.join("Notes/a.md"), "# Two\n").unwrap();
        let kept = list(&history.0, "Notes/a.md");
        assert_eq!(kept.len(), 1);
        assert_eq!(kept[0].source, "# One\n");

        // Within 10 minutes of the last one: none.
        keep(&history.0, dir, "Notes/a.md", Some("# Three\n"), 1_000_000_060_000).unwrap();
        assert_eq!(list(&history.0, "Notes/a.md").len(), 1);

        // Later: the next one, newest first.
        keep(&history.0, dir, "Notes/a.md", Some("# Three\n"), 1_000_000_000_000 + EVERY_MS + 1)
            .unwrap();
        let kept = list(&history.0, "Notes/a.md");
        assert_eq!(kept.len(), 2);
        assert_eq!(kept[0].source, "# Two\n");
        assert!(kept[0].at > kept[1].at);

        // Before a restore: kept whatever the age of the newest.
        fs::write(project.0.join("Notes/a.md"), "# Three\n").unwrap();
        keep(&history.0, dir, "Notes/a.md", None, 1_000_000_000_000 + EVERY_MS + 2).unwrap();
        assert_eq!(list(&history.0, "Notes/a.md")[0].source, "# Three\n");
    }

    #[test]
    fn snapshots_move_and_go_with_their_pages() {
        let project = Temp::new();
        let history = Temp::new();
        let dir = project.0.to_str().unwrap();
        fs::create_dir_all(project.0.join("Notes")).unwrap();
        fs::write(project.0.join("Notes/a b.md"), "Old\n").unwrap();
        fs::write(project.0.join("top.md"), "Old top\n").unwrap();
        keep(&history.0, dir, "Notes/a b.md", Some("New\n"), 2_000_000_000_000).unwrap();
        keep(&history.0, dir, "top.md", Some("New top\n"), 2_000_000_000_000).unwrap();

        rename(&history.0, "Notes", "Reading");
        assert!(list(&history.0, "Notes/a b.md").is_empty());
        assert_eq!(list(&history.0, "Reading/a b.md")[0].source, "Old\n");

        rename(&history.0, "top.md", "first.md");
        assert_eq!(list(&history.0, "first.md")[0].source, "Old top\n");

        remove(&history.0, "Reading");
        assert!(list(&history.0, "Reading/a b.md").is_empty());
        assert_eq!(list(&history.0, "first.md").len(), 1);
    }
}
