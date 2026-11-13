//! Zotero for citing, as in Polemic (dwarsbit/polemic,
//! src-tauri/src/zotero.rs). Zotero's local API (127.0.0.1:23119)
//! drops connections that carry an Origin header, so the webview can
//! never fetch it directly: requests go through here instead, as plain
//! HTTP on the loopback interface. The API keys of Zotero cloud
//! libraries live in the system's credential store.

use std::io::{Read, Write};
use std::net::TcpStream;
use std::time::Duration;

const NO_ANSWER: &str = "Zotero stopped answering. Check that Zotero is open and try again.";

const HOST: &str = "127.0.0.1:23119";

/// Split an HTTP response into its status code and body.
fn parse_response(raw: &[u8]) -> Result<(u16, String), String> {
    let text = String::from_utf8_lossy(raw);
    let (head, body) = match text.find("\r\n\r\n") {
        Some(index) => (&text[..index], text[index + 4..].to_string()),
        None => return Err("Zotero gave an answer Cursive can't read. Try again.".into()),
    };
    let status = head
        .split_whitespace()
        .nth(1)
        .and_then(|code| code.parse::<u16>().ok())
        .ok_or("Zotero gave an answer Cursive can't read. Try again.")?;
    Ok((status, body))
}

/// GET one path of the local Zotero API; returns the JSON body.
/// No Origin header is sent, so Zotero answers instead of dropping
/// the connection as it does for webview fetches.
pub fn local_get(path: &str, query: &str) -> Result<String, String> {
    // Both go into the raw request line: allow only URL-safe characters,
    // so neither can smuggle extra headers or requests.
    let path_ok = path
        .chars()
        .all(|c| c.is_ascii_alphanumeric() || matches!(c, '/' | '_' | '-'));
    let query_ok = query
        .chars()
        .all(|c| c.is_ascii_graphic() && !matches!(c, '#'));
    if !path_ok || !query_ok {
        return Err("invalid Zotero request".into());
    }
    let mut stream = TcpStream::connect(HOST)
        .map_err(|_| "Could not reach Zotero. Check that Zotero is open on this computer.".to_string())?;
    stream
        .set_read_timeout(Some(Duration::from_secs(5)))
        .map_err(|_| NO_ANSWER.to_string())?;
    let request = format!(
        "GET /api/{path}?{query} HTTP/1.1\r\nHost: localhost:23119\r\nAccept: application/json\r\nConnection: close\r\n\r\n"
    );
    stream
        .write_all(request.as_bytes())
        .map_err(|_| NO_ANSWER.to_string())?;
    let mut raw = Vec::new();
    stream.read_to_end(&mut raw).map_err(|_| NO_ANSWER.to_string())?;
    let (status, body) = parse_response(&raw)?;
    if !(200..300).contains(&status) {
        return Err(format!("Zotero answered {status}. Check that Zotero is up to date."));
    }
    Ok(body)
}

/// One GET against the local Zotero API, for the webview.
#[tauri::command]
pub fn zotero_local_fetch(path: String, query: String) -> Result<String, String> {
    local_get(&path, &query)
}

/// A key's entry in the credential store: one per source.
fn key_entry(id: &str) -> Result<keyring::Entry, String> {
    if id.is_empty() || !id.chars().all(|c| c.is_ascii_alphanumeric() || c == '-') {
        return Err("invalid source".into());
    }
    keyring::Entry::new("cursive", &format!("zotero:{id}")).map_err(|e| e.to_string())
}

/// The API key of a Zotero cloud source, if one is kept.
#[tauri::command]
pub fn zotero_key_get(id: String) -> Result<Option<String>, String> {
    match key_entry(&id)?.get_password() {
        Ok(value) => Ok(Some(value)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command]
pub fn zotero_key_set(id: String, key: String) -> Result<(), String> {
    key_entry(&id)?
        .set_password(key.trim())
        .map_err(|_| "The key couldn't be kept in your system's credential store.".to_string())
}

#[tauri::command]
pub fn zotero_key_delete(id: String) -> Result<(), String> {
    match key_entry(&id)?.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(e.to_string()),
    }
}

/// The most a BibTeX file may hold: far more than any library exports.
const BIB_LIMIT: u64 = 32 * 1024 * 1024;

/// Whether a path names a BibTeX file, by its extension.
fn is_bib(path: &std::path::Path) -> bool {
    path.extension()
        .and_then(|ext| ext.to_str())
        .is_some_and(|ext| ext.eq_ignore_ascii_case("bib"))
}

/// The text of a BibTeX file the reader picked in Settings. It is read
/// again on each search, so a file a reference manager keeps exporting
/// stays current. Only `.bib` files are read.
#[tauri::command]
pub fn bibtex_read(path: String) -> Result<String, String> {
    let path = std::path::PathBuf::from(path);
    if !path.is_absolute() || !is_bib(&path) {
        return Err("Only a .bib file can be read.".into());
    }
    let meta = std::fs::metadata(&path)
        .map_err(|_| format!("{} is gone. Pick the file again in Settings.", path.display()))?;
    if !meta.is_file() || meta.len() > BIB_LIMIT {
        return Err("This file is too large to read.".into());
    }
    let bytes = std::fs::read(&path).map_err(|e| e.to_string())?;
    Ok(String::from_utf8_lossy(&bytes).into_owned())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reads_only_bib_files() {
        let dir = std::env::temp_dir().join(format!("cursive-bib-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let bib = dir.join("library.bib");
        std::fs::write(&bib, "@book{a, title = {A}}").unwrap();
        let other = dir.join("notes.txt");
        std::fs::write(&other, "secret").unwrap();
        assert_eq!(bibtex_read(bib.display().to_string()).unwrap(), "@book{a, title = {A}}");
        assert!(bibtex_read(other.display().to_string()).is_err());
        assert!(bibtex_read("library.bib".into()).is_err());
        std::fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn parses_status_and_body() {
        let raw = b"HTTP/1.0 200 OK\r\nContent-Type: application/json\r\n\r\n[{\"key\":\"A\"}]";
        let (status, body) = parse_response(raw).unwrap();
        assert_eq!(status, 200);
        assert_eq!(body, "[{\"key\":\"A\"}]");
    }

    #[test]
    fn rejects_error_status() {
        let raw = b"HTTP/1.0 404 Not Found\r\n\r\n[]";
        let (status, _) = parse_response(raw).unwrap();
        assert_eq!(status, 404);
    }

    #[test]
    fn rejects_request_smuggling() {
        assert!(local_get("users/0/items HTTP/1.1\r\nX: y", "").is_err());
        assert!(local_get("users/0/items", "q=a\r\nX: y").is_err());
        assert!(local_get("users/0/items", "q=a b").is_err());
    }

    #[test]
    fn names_keys_by_source_only() {
        assert!(key_entry("").is_err());
        assert!(key_entry("a/b").is_err());
        assert!(key_entry("account").is_ok());
    }

    #[test]
    fn rejects_incomplete_response() {
        assert!(parse_response(b"HTTP/1.0 200 OK\r\n").is_err());
    }

    /// Hits the real local Zotero server; run explicitly with
    /// `cargo test zotero -- --ignored`.
    #[test]
    #[ignore = "needs a running Zotero with the API enabled"]
    fn live_probe_answers_items() {
        let body = local_get("users/0/items", "limit=1").unwrap();
        assert!(body.starts_with('['));
    }
}
