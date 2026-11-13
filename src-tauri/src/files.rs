//! Moving the bytes of a project's other files, such as images,
//! between the folder and the project in the account
//! (`FileTransfer` in `src/lib/link-sync.ts`). The server keeps each
//! file by the SHA-256 of its bytes, so the same image is sent once.

use crate::account::{error_message, server, token_with, OsStore};
use crate::project::{hash_file, resolve, write_atomic};
use sha2::{Digest, Sha256};
use std::time::Duration;

/// A file can take a while: the server takes files up to 50 MB.
const TRANSFER_TIMEOUT: Duration = Duration::from_secs(10 * 60);

fn is_hash(hash: &str) -> bool {
    hash.len() == 64 && hash.bytes().all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b))
}

fn is_project_id(id: &str) -> bool {
    !id.is_empty()
        && id.len() <= 64
        && id
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b == b'-' || b == b'_')
}

/// The address of a file's bytes in the account, and the token to ask with.
fn asset_url(project_id: &str, hash: &str) -> Result<(String, String), String> {
    if !is_project_id(project_id) || !is_hash(hash) {
        return Err("not a file of a project".into());
    }
    let server = server()?;
    let token =
        token_with(&server, &OsStore).ok_or("Sign in to your Polemic account first.")?;
    Ok((format!("{server}/api/projects/{project_id}/assets/{hash}"), token))
}

fn client() -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .timeout(TRANSFER_TIMEOUT)
        .user_agent(concat!("Cursive/", env!("CARGO_PKG_VERSION")))
        .build()
        .map_err(|e| e.to_string())
}

const OFFLINE: &str = "The server can't be reached. Check your connection.";

/// Sends a file of the folder to the project in the account. A file
/// that changed since it was hashed is not sent: the next sync sends it.
#[tauri::command]
pub async fn link_upload_file(
    dir: String,
    path: String,
    project_id: String,
    hash: String,
    content_type: String,
) -> Result<(), String> {
    let (url, token) = asset_url(&project_id, &hash)?;
    let target = resolve(&dir, &path)?;
    let bytes = std::fs::read(&target).map_err(|e| format!("can't read {path}: {e}"))?;
    let digest: String = Sha256::digest(&bytes)
        .iter()
        .map(|b| format!("{b:02x}"))
        .collect();
    if digest != hash {
        return Err(format!("{path} changed while it was synced"));
    }
    let response = client()?
        .put(url)
        .bearer_auth(token)
        .header("content-type", content_type)
        .body(bytes)
        .send()
        .await
        .map_err(|_| OFFLINE.to_string())?;
    if !response.status().is_success() {
        return Err(error_message(response).await);
    }
    Ok(())
}

/// Writes a file from the project in the account into the folder.
#[tauri::command]
pub async fn link_download_file(
    dir: String,
    path: String,
    project_id: String,
    hash: String,
) -> Result<(), String> {
    let (url, token) = asset_url(&project_id, &hash)?;
    let target = resolve(&dir, &path)?;
    // The folder has these bytes already.
    if target.is_file() && hash_file(&target).ok().as_deref() == Some(hash.as_str()) {
        return Ok(());
    }
    let response = client()?
        .get(url)
        .bearer_auth(token)
        .send()
        .await
        .map_err(|_| OFFLINE.to_string())?;
    if !response.status().is_success() {
        return Err(error_message(response).await);
    }
    let bytes = response.bytes().await.map_err(|_| OFFLINE.to_string())?;
    let digest: String = Sha256::digest(&bytes)
        .iter()
        .map(|b| format!("{b:02x}"))
        .collect();
    if digest != hash {
        return Err(format!("{path} arrived damaged; the next sync tries again"));
    }
    if let Some(parent) = target.parent() {
        std::fs::create_dir_all(parent).map_err(|e| format!("can't create the folder: {e}"))?;
    }
    write_atomic(&target, &bytes).map_err(|e| format!("can't write {path}: {e}"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn asks_only_for_a_project_file_by_its_hash() {
        assert!(is_hash(&"a".repeat(64)));
        assert!(!is_hash(&"A".repeat(64)));
        assert!(!is_hash("abc"));
        assert!(is_project_id("p_3Fz-9"));
        assert!(!is_project_id("../admin"));
        assert!(!is_project_id(""));
    }
}
