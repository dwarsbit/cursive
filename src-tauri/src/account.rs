//! The Polemic account: Cursive signs in to the Polemic server
//! (app.polemicapp.com) with the same account as the Polemic editor.
//!
//! Sign-in follows RFC 8252: the app listens on a random loopback port,
//! opens the server's /desktop/authorize page in the browser with a
//! PKCE challenge (RFC 7636, S256), and the server sends the browser
//! back to the loopback address with a one-time code. The app trades
//! the code and its verifier for a bearer token, which lives in the
//! system's credential store and never reaches the window: the window
//! asks for the server through `server_request`, which adds the token.
//! Signing out revokes the token on the server.
//!
//! This is the Polemic editor's sign-in (dwarsbit/polemic,
//! src-tauri/src/account.rs); the server can't tell the two apart
//! except by `client=cursive` on the authorize page, which names
//! Cursive there.

use std::io::{Read, Write};
use std::net::{TcpListener, TcpStream};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use base64::engine::general_purpose::{STANDARD, URL_SAFE_NO_PAD};
use base64::Engine;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

pub const DEFAULT_SERVER: &str = "https://app.polemicapp.com";

/// Long enough to create an account and confirm the email address on the way.
const SIGN_IN_TIMEOUT: Duration = Duration::from_secs(15 * 60);
const HTTP_TIMEOUT: Duration = Duration::from_secs(30);
const CALLBACK_PATH: &str = "/callback";

/// The signed-in user (`GET /api/me`).
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct AccountUser {
    pub id: String,
    pub name: String,
    pub email: String,
}

#[derive(Deserialize)]
struct TokenResponse {
    token: String,
    user: AccountUser,
}

#[derive(Deserialize)]
struct ErrorResponse {
    message: String,
}

/// What the credential store holds: the token and the server it is for.
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
struct Credential {
    server: String,
    token: String,
}

/// Where the credential is kept. Tests use one in memory.
pub trait Store {
    fn get(&self) -> Result<Option<String>, String>;
    fn set(&self, value: &str) -> Result<(), String>;
    fn delete(&self) -> Result<(), String>;
}

/// The system's credential store, under the service "cursive".
pub struct OsStore;

impl OsStore {
    fn entry(&self) -> Result<keyring::Entry, String> {
        keyring::Entry::new("cursive", "account").map_err(|e| e.to_string())
    }
}

impl Store for OsStore {
    fn get(&self) -> Result<Option<String>, String> {
        match self.entry()?.get_password() {
            Ok(value) => Ok(Some(value)),
            Err(keyring::Error::NoEntry) => Ok(None),
            Err(e) => Err(e.to_string()),
        }
    }

    fn set(&self, value: &str) -> Result<(), String> {
        self.entry()?.set_password(value).map_err(|e| e.to_string())
    }

    fn delete(&self) -> Result<(), String> {
        match self.entry()?.delete_credential() {
            Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
            Err(e) => Err(e.to_string()),
        }
    }
}

/// The running sign-in's cancel flag; a new sign-in cancels the old one.
static PENDING: Mutex<Option<Arc<AtomicBool>>> = Mutex::new(None);

/// A server URL: without trailing slashes; https, or plain http for
/// this computer (a server under development).
pub fn normalize_server(input: &str) -> Result<String, String> {
    let trimmed = input.trim().trim_end_matches('/');
    if trimmed.is_empty() {
        return Ok(DEFAULT_SERVER.into());
    }
    let url =
        url::Url::parse(trimmed).map_err(|_| "The server URL is not a valid URL".to_string())?;
    let local = matches!(url.host_str(), Some("localhost" | "127.0.0.1" | "[::1]"));
    let scheme_ok = url.scheme() == "https" || (url.scheme() == "http" && local);
    if !scheme_ok
        || url.host_str().is_none()
        || url.query().is_some()
        || url.fragment().is_some()
        || !url.username().is_empty()
        || url.path() != "/"
    {
        return Err("The server URL should look like https://polemic.example.org".into());
    }
    Ok(trimmed.to_string())
}

/// The server Cursive talks to: `CURSIVE_SERVER` when set, for a
/// self-hosted server or one under development.
pub fn server() -> Result<String, String> {
    normalize_server(&std::env::var("CURSIVE_SERVER").unwrap_or_default())
}

pub(crate) fn client() -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .timeout(HTTP_TIMEOUT)
        .user_agent(concat!("Cursive/", env!("CARGO_PKG_VERSION")))
        .build()
        .map_err(|e| e.to_string())
}

fn random_token(bytes: usize) -> Result<String, String> {
    let mut buf = vec![0u8; bytes];
    getrandom::fill(&mut buf).map_err(|e| format!("no randomness available: {e}"))?;
    Ok(URL_SAFE_NO_PAD.encode(buf))
}

/// RFC 7636 S256 challenge for a verifier.
pub fn code_challenge(verifier: &str) -> String {
    URL_SAFE_NO_PAD.encode(Sha256::digest(verifier.as_bytes()))
}

/// The browser page that starts the sign-in. `create` opens it on the
/// sign-up form (OpenID Connect's prompt=create).
pub fn authorize_url(
    server: &str,
    challenge: &str,
    redirect_uri: &str,
    state: &str,
    create: bool,
) -> String {
    let mut query = url::form_urlencoded::Serializer::new(String::new());
    query
        .append_pair("code_challenge", challenge)
        .append_pair("code_challenge_method", "S256")
        .append_pair("redirect_uri", redirect_uri)
        .append_pair("state", state)
        .append_pair("client", "cursive");
    if create {
        query.append_pair("prompt", "create");
    }
    format!("{server}/desktop/authorize?{}", query.finish())
}

/// The computer's name, shown on the account page next to the session.
fn device_name() -> Option<String> {
    #[cfg(unix)]
    let name = {
        let mut buf = [0u8; 256];
        // SAFETY: the buffer is valid for its length; gethostname writes at most that much.
        let rc = unsafe { libc::gethostname(buf.as_mut_ptr().cast(), buf.len()) };
        if rc != 0 {
            return None;
        }
        let end = buf.iter().position(|&b| b == 0).unwrap_or(buf.len());
        String::from_utf8_lossy(&buf[..end]).trim().to_string()
    };
    #[cfg(windows)]
    let name = std::env::var("COMPUTERNAME").unwrap_or_default();
    if name.is_empty() {
        return None;
    }
    let short: String = name.chars().take(80).collect();
    Some(format!("{short}, Cursive"))
}

/// What the browser brought back to the loopback address.
#[derive(Debug, PartialEq)]
enum Callback {
    Code(String),
    Denied,
    /// Not the callback (a favicon request) or not ours (wrong state).
    Ignore,
}

/// Reads one request line ("GET /callback?code=…&state=… HTTP/1.1").
fn parse_callback(request_line: &str, state: &str) -> Callback {
    let mut parts = request_line.split(' ');
    let (Some("GET"), Some(target)) = (parts.next(), parts.next()) else {
        return Callback::Ignore;
    };
    let (path, query) = target.split_once('?').unwrap_or((target, ""));
    if path != CALLBACK_PATH {
        return Callback::Ignore;
    }
    let mut code = None;
    let mut got_state = None;
    let mut error = None;
    for (key, value) in url::form_urlencoded::parse(query.as_bytes()) {
        match &*key {
            "code" => code = Some(value.into_owned()),
            "state" => got_state = Some(value.into_owned()),
            "error" => error = Some(value.into_owned()),
            _ => {}
        }
    }
    if got_state.as_deref() != Some(state) {
        return Callback::Ignore;
    }
    match (code, error) {
        (_, Some(_)) => Callback::Denied,
        (Some(code), None) if !code.is_empty() => Callback::Code(code),
        _ => Callback::Ignore,
    }
}

fn page(title: &str, text: &str) -> String {
    format!(
        "<!doctype html><html lang=\"en\"><head><meta charset=\"utf-8\"><title>{title}</title>\
         <meta name=\"viewport\" content=\"width=device-width\">\
         <style>body{{font:16px/1.5 system-ui,sans-serif;display:grid;place-items:center;min-height:90vh;margin:0;\
         color:#222;background:#fafafa}}@media(prefers-color-scheme:dark){{body{{color:#eee;background:#18181b}}}}\
         main{{max-width:28rem;padding:1rem;text-align:center}}h1{{font-size:1.25rem}}</style></head>\
         <body><main><h1>{title}</h1><p>{text}</p></main></body></html>"
    )
}

fn respond(stream: &mut TcpStream, status: &str, body: &str) {
    let response = format!(
        "HTTP/1.1 {status}\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: {}\r\n\
         Cache-Control: no-store\r\nConnection: close\r\n\r\n{body}",
        body.len()
    );
    let _ = stream.write_all(response.as_bytes());
    let _ = stream.flush();
}

/// The first line of an HTTP request, read with a size and time limit.
fn read_request_line(stream: &mut TcpStream) -> Option<String> {
    stream.set_read_timeout(Some(Duration::from_secs(5))).ok()?;
    let mut buf = Vec::new();
    let mut chunk = [0u8; 1024];
    while !buf.windows(4).any(|w| w == b"\r\n\r\n") && buf.len() < 16 * 1024 {
        match stream.read(&mut chunk) {
            Ok(0) => break,
            Ok(n) => buf.extend_from_slice(&chunk[..n]),
            Err(_) => return None,
        }
    }
    let text = String::from_utf8_lossy(&buf);
    text.lines().next().map(str::to_string)
}

/// Serves the loopback address until the browser brings the code back,
/// the user cancels, or time runs out.
fn wait_for_code(
    listener: &TcpListener,
    state: &str,
    cancel: &AtomicBool,
    deadline: Instant,
) -> Result<String, String> {
    listener.set_nonblocking(true).map_err(|e| e.to_string())?;
    loop {
        if cancel.load(Ordering::Relaxed) {
            return Err("Sign-in cancelled".into());
        }
        if Instant::now() > deadline {
            return Err("Sign-in timed out. Try again.".into());
        }
        let mut stream = match listener.accept() {
            Ok((stream, _)) => stream,
            Err(e) if e.kind() == std::io::ErrorKind::WouldBlock => {
                std::thread::sleep(Duration::from_millis(100));
                continue;
            }
            Err(e) => return Err(e.to_string()),
        };
        let _ = stream.set_nonblocking(false);
        let Some(line) = read_request_line(&mut stream) else {
            continue;
        };
        match parse_callback(&line, state) {
            Callback::Code(code) => {
                respond(
                    &mut stream,
                    "200 OK",
                    &page(
                        "You're signed in",
                        "Return to Cursive. You can close this tab.",
                    ),
                );
                return Ok(code);
            }
            Callback::Denied => {
                respond(
                    &mut stream,
                    "200 OK",
                    &page(
                        "Sign-in cancelled",
                        "Cursive was not signed in. You can close this tab.",
                    ),
                );
                return Err("Sign-in cancelled in the browser".into());
            }
            Callback::Ignore => respond(&mut stream, "404 Not Found", &page("Not found", "")),
        }
    }
}

pub(crate) async fn error_message(response: reqwest::Response) -> String {
    let status = response.status();
    match response.json::<ErrorResponse>().await {
        Ok(body) => body.message,
        Err(_) => format!("The server answered {status}"),
    }
}

/// The whole sign-in against `server`: `open` shows the authorize page
/// in the browser. Returns the signed-in user.
pub async fn sign_in_with(
    server: &str,
    store: &impl Store,
    create: bool,
    cancel: Arc<AtomicBool>,
    open: impl FnOnce(&str) -> Result<(), String>,
) -> Result<AccountUser, String> {
    let verifier = random_token(32)?;
    let state = random_token(16)?;
    let listener = TcpListener::bind(("127.0.0.1", 0))
        .map_err(|e| format!("could not listen for the browser: {e}"))?;
    let port = listener.local_addr().map_err(|e| e.to_string())?.port();
    let redirect_uri = format!("http://127.0.0.1:{port}{CALLBACK_PATH}");

    open(&authorize_url(
        server,
        &code_challenge(&verifier),
        &redirect_uri,
        &state,
        create,
    ))?;

    let deadline = Instant::now() + SIGN_IN_TIMEOUT;
    let wait_state = state.clone();
    let code = tauri::async_runtime::spawn_blocking(move || {
        wait_for_code(&listener, &wait_state, &cancel, deadline)
    })
    .await
    .map_err(|e| e.to_string())??;

    let mut body =
        serde_json::json!({ "code": code, "codeVerifier": verifier, "redirectUri": redirect_uri });
    if let Some(name) = device_name() {
        body["deviceName"] = name.into();
    }
    let response = client()?
        .post(format!("{server}/api/desktop/token"))
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("Could not reach {server}: {e}"))?;
    if !response.status().is_success() {
        return Err(error_message(response).await);
    }
    let token: TokenResponse = response
        .json()
        .await
        .map_err(|e| format!("Unexpected answer from the server: {e}"))?;

    let credential = Credential {
        server: server.to_string(),
        token: token.token,
    };
    let json = serde_json::to_string(&credential).map_err(|e| e.to_string())?;
    if let Err(e) = store.set(&json) {
        // Without a credential store the token has nowhere safe to go.
        let _ = revoke(&credential).await;
        return Err(format!(
            "Could not save the sign-in in the system's credential store: {e}"
        ));
    }
    Ok(token.user)
}

fn load(store: &impl Store) -> Option<Credential> {
    store
        .get()
        .ok()
        .flatten()
        .and_then(|json| serde_json::from_str(&json).ok())
}

/// The stored token for `server`; None when signed out or signed in
/// to another server.
pub(crate) fn token_with(server: &str, store: &impl Store) -> Option<String> {
    load(store)
        .filter(|credential| credential.server == server)
        .map(|credential| credential.token)
}

async fn revoke(credential: &Credential) -> Result<(), String> {
    client()?
        .delete(format!("{}/api/desktop/session", credential.server))
        .bearer_auth(&credential.token)
        .send()
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}

/// Revokes the token (best effort: offline, it just expires) and forgets it.
pub async fn sign_out_with(store: &impl Store) -> Result<(), String> {
    if let Some(credential) = load(store) {
        let _ = revoke(&credential).await;
    }
    store.delete()
}

/// The server's answer to one request, for the window.
#[derive(Serialize, Debug, PartialEq)]
pub struct Answer {
    pub status: u16,
    pub body: String,
}

/// Only the API is reachable through `server_request`, and only with
/// the methods Cursive uses.
pub fn check_request(method: &str, path: &str) -> Result<reqwest::Method, String> {
    if !path.starts_with("/api/") || path.contains("..") || path.contains('\\') {
        return Err("only the server's API can be asked".into());
    }
    match method {
        "GET" => Ok(reqwest::Method::GET),
        "POST" => Ok(reqwest::Method::POST),
        "PUT" => Ok(reqwest::Method::PUT),
        "PATCH" => Ok(reqwest::Method::PATCH),
        "DELETE" => Ok(reqwest::Method::DELETE),
        _ => Err("unsupported method".into()),
    }
}

/// One request to `server`'s API with the stored token. A 401 means
/// the token is no longer good, and forgets it.
pub async fn request_with(
    server: &str,
    store: &impl Store,
    method: &str,
    path: &str,
    json: Option<String>,
    bytes: Option<String>,
) -> Result<Answer, String> {
    let method = check_request(method, path)?;
    let Some(token) = token_with(server, store) else {
        return Ok(Answer {
            status: 401,
            body: String::new(),
        });
    };
    let mut request = client()?
        .request(method, format!("{server}{path}"))
        .bearer_auth(&token);
    if let Some(json) = json {
        request = request
            .header("content-type", "application/json")
            .body(json);
    } else if let Some(bytes) = bytes {
        let decoded = STANDARD
            .decode(bytes)
            .map_err(|_| "the request body is not base64".to_string())?;
        request = request
            .header("content-type", "application/octet-stream")
            .body(decoded);
    }
    let response = request.send().await.map_err(|e| {
        if e.is_timeout() {
            "The server took too long to answer.".to_string()
        } else {
            "The server can't be reached. Check your connection.".to_string()
        }
    })?;
    let status = response.status().as_u16();
    if status == 401 && path != "/api/desktop/session" {
        let _ = store.delete();
    }
    let body = response.text().await.map_err(|e| e.to_string())?;
    Ok(Answer { status, body })
}

/// Whether a token is stored for the server, without asking the server.
#[tauri::command]
pub fn account_signed_in() -> Result<bool, String> {
    Ok(token_with(&server()?, &OsStore).is_some())
}

/// The server's address, for links to the account page.
#[tauri::command]
pub fn account_server() -> Result<String, String> {
    server()
}

#[tauri::command]
pub async fn account_sign_in(app: tauri::AppHandle, create: bool) -> Result<AccountUser, String> {
    use tauri_plugin_opener::OpenerExt;
    let cancel = Arc::new(AtomicBool::new(false));
    if let Some(previous) = PENDING.lock().unwrap().replace(cancel.clone()) {
        previous.store(true, Ordering::Relaxed);
    }
    let result = sign_in_with(&server()?, &OsStore, create, cancel.clone(), |url| {
        app.opener()
            .open_url(url, None::<&str>)
            .map_err(|e| format!("Could not open the browser: {e}"))
    })
    .await;
    let mut pending = PENDING.lock().unwrap();
    if pending.as_ref().is_some_and(|p| Arc::ptr_eq(p, &cancel)) {
        *pending = None;
    }
    result
}

#[tauri::command]
pub fn account_cancel_sign_in() {
    if let Some(pending) = PENDING.lock().unwrap().take() {
        pending.store(true, Ordering::Relaxed);
    }
}

#[tauri::command]
pub async fn account_sign_out() -> Result<(), String> {
    sign_out_with(&OsStore).await
}

/// Opens a page of the server (the account page) or a published site
/// in the browser.
#[tauri::command]
pub fn open_in_browser(app: tauri::AppHandle, url: String) -> Result<(), String> {
    use tauri_plugin_opener::OpenerExt;
    let parsed = url::Url::parse(&url).map_err(|_| "not a URL".to_string())?;
    if !matches!(parsed.scheme(), "https" | "http") {
        return Err("only web addresses open in the browser".into());
    }
    app.opener()
        .open_url(url, None::<&str>)
        .map_err(|e| format!("Could not open the browser: {e}"))
}

#[tauri::command]
pub async fn server_request(
    method: String,
    path: String,
    json: Option<String>,
    bytes: Option<String>,
) -> Result<Answer, String> {
    request_with(&server()?, &OsStore, &method, &path, json, bytes).await
}

/// A file name without folders or characters a file system refuses.
pub fn download_name(name: &str) -> String {
    let base = name.rsplit(['/', '\\']).next().unwrap_or("");
    let clean: String = base
        .chars()
        .filter(|c| !c.is_control() && !matches!(c, ':' | '*' | '?' | '"' | '<' | '>' | '|'))
        .collect();
    let clean = clean.trim().trim_start_matches('.').to_string();
    if clean.is_empty() {
        "file".into()
    } else {
        clean
    }
}

/// Saves a file from the server's API where the user chooses in the
/// system's save dialog. False when they closed the dialog.
#[tauri::command]
pub async fn server_download(
    app: tauri::AppHandle,
    path: String,
    name: String,
) -> Result<bool, String> {
    use tauri_plugin_dialog::DialogExt;
    check_request("GET", &path)?;
    let server = server()?;
    let Some(token) = token_with(&server, &OsStore) else {
        return Err("Sign in to your Polemic account first.".into());
    };
    let suggested = download_name(&name);
    let picked = tauri::async_runtime::spawn_blocking(move || {
        app.dialog()
            .file()
            .set_file_name(&suggested)
            .blocking_save_file()
    })
    .await
    .map_err(|e| e.to_string())?;
    let Some(picked) = picked else {
        return Ok(false);
    };
    let to = picked.into_path().map_err(|e| e.to_string())?;
    let response = client()?
        .get(format!("{server}{path}"))
        .bearer_auth(&token)
        .send()
        .await
        .map_err(|_| "The server can't be reached. Check your connection.".to_string())?;
    if !response.status().is_success() {
        return Err(error_message(response).await);
    }
    let bytes = response.bytes().await.map_err(|e| e.to_string())?;
    std::fs::write(&to, &bytes).map_err(|e| format!("The file could not be saved: {e}"))?;
    Ok(true)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::cell::RefCell;

    #[test]
    fn names_a_download_without_folders() {
        assert_eq!(download_name("../../My items.pdf"), "My items.pdf");
        assert_eq!(download_name("C:\\work\\a?.txt"), "a.txt");
        assert_eq!(download_name(".."), "file");
    }

    #[derive(Default)]
    struct MemoryStore(RefCell<Option<String>>);

    impl Store for MemoryStore {
        fn get(&self) -> Result<Option<String>, String> {
            Ok(self.0.borrow().clone())
        }
        fn set(&self, value: &str) -> Result<(), String> {
            *self.0.borrow_mut() = Some(value.to_string());
            Ok(())
        }
        fn delete(&self) -> Result<(), String> {
            *self.0.borrow_mut() = None;
            Ok(())
        }
    }

    #[test]
    fn makes_the_s256_challenge_of_rfc_7636() {
        // The example of RFC 7636, appendix B.
        assert_eq!(
            code_challenge("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk"),
            "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM"
        );
    }

    #[test]
    fn builds_the_authorize_page_address() {
        let url = authorize_url(
            "https://app.polemicapp.com",
            "abc",
            "http://127.0.0.1:5000/callback",
            "state123",
            true,
        );
        assert_eq!(
            url,
            "https://app.polemicapp.com/desktop/authorize?code_challenge=abc&code_challenge_method=S256\
             &redirect_uri=http%3A%2F%2F127.0.0.1%3A5000%2Fcallback&state=state123&client=cursive&prompt=create"
        );
    }

    #[test]
    fn reads_the_callback_only_with_its_own_state() {
        let line = |target: &str| format!("GET {target} HTTP/1.1");
        assert_eq!(
            parse_callback(&line("/callback?code=c1&state=s1"), "s1"),
            Callback::Code("c1".into())
        );
        assert_eq!(
            parse_callback(&line("/callback?code=c1&state=other"), "s1"),
            Callback::Ignore
        );
        assert_eq!(
            parse_callback(&line("/callback?error=access_denied&state=s1"), "s1"),
            Callback::Denied
        );
        assert_eq!(
            parse_callback(&line("/favicon.ico"), "s1"),
            Callback::Ignore
        );
        assert_eq!(
            parse_callback("POST /callback?code=c1&state=s1 HTTP/1.1", "s1"),
            Callback::Ignore
        );
    }

    #[test]
    fn takes_https_servers_and_this_computer() {
        assert_eq!(normalize_server("").unwrap(), DEFAULT_SERVER);
        assert_eq!(
            normalize_server(" https://polemic.example.org/ ").unwrap(),
            "https://polemic.example.org"
        );
        assert_eq!(
            normalize_server("http://localhost:4000").unwrap(),
            "http://localhost:4000"
        );
        assert!(normalize_server("http://polemic.example.org").is_err());
        assert!(normalize_server("https://user@polemic.example.org").is_err());
        assert!(normalize_server("https://polemic.example.org/path").is_err());
        assert!(normalize_server("ftp://polemic.example.org").is_err());
    }

    #[test]
    fn asks_only_the_api() {
        assert!(check_request("GET", "/api/me").is_ok());
        assert!(check_request("POST", "/api/projects/abc/document/update").is_ok());
        assert!(check_request("GET", "/account").is_err());
        assert!(check_request("GET", "/api/../account").is_err());
        assert!(check_request("PUT", "/api/projects/abc/learners/u1/grade").is_ok());
        assert!(check_request("TRACE", "/api/me").is_err());
        assert!(check_request("GET", "https://evil.example/api/me").is_err());
    }

    #[test]
    fn keeps_a_token_for_its_own_server_only() {
        let store = MemoryStore::default();
        assert_eq!(token_with("https://a.example", &store), None);
        store
            .set(r#"{"server":"https://a.example","token":"t1"}"#)
            .unwrap();
        assert_eq!(token_with("https://a.example", &store), Some("t1".into()));
        assert_eq!(token_with("https://b.example", &store), None);
    }

    #[test]
    fn answers_401_without_a_token_and_without_asking_the_server() {
        let store = MemoryStore::default();
        let answer = tauri::async_runtime::block_on(request_with(
            "https://a.example",
            &store,
            "GET",
            "/api/me",
            None,
            None,
        ))
        .unwrap();
        assert_eq!(answer.status, 401);
    }
}
