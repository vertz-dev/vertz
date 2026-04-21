//! Screenshot subsystem for the Vertz dev server.
//!
//! Phase 1 scope (per `plans/2865-phase-1-headless-screenshot.md`):
//! headless screenshot MCP tool that captures any route the dev server
//! serves, saves PNGs as artifacts, and returns them as MCP image
//! content blocks plus a local URL.
//!
//! Submodules:
//! - `artifacts` — filename generation, disk persistence
//! - `chromium` — production BrowserSpawner wrapping chromiumoxide
//! - `fetcher` — Chrome binary resolution (probe + Chrome for Testing download)
//! - `pool` — lazy/TTL browser pool + traits
//!
//! This file hosts the MCP tool entrypoint [`capture_tool`] plus the
//! lazy singleton [`Pool`](pool::Pool) instance the dev server talks to.

pub mod artifacts;
pub mod chromium;
pub mod fetcher;
pub mod pool;

use crate::server::screenshot::artifacts::{
    build_filename, slugify_url_path, write_artifact, ViewportLabel,
};
use crate::server::screenshot::pool::{
    BrowserSpawner, CaptureRequest, CropSpec, LaunchConfig, Pool, PoolError, PoolStatus,
    WaitCondition, DEFAULT_TTL,
};
use base64::Engine as _;
use serde_json::json;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::time::Instant;
use tokio::sync::OnceCell;

/// Dev-server-scoped browser pool. Lazy-init on first `capture_tool` call.
/// Kept as a module-static `OnceCell` rather than wired through
/// `DevServerState` because (a) the pool is a server singleton, (b) it
/// would touch every `DevServerState { ... }` construction site in the
/// codebase just to thread through an always-empty default.
static POOL: OnceCell<Arc<Pool>> = OnceCell::const_new();

/// JSON schema for the `vertz_browser_screenshot` MCP tool's input.
/// mcp.rs calls this so the tool definition lives next to the handler.
pub fn tool_input_schema() -> serde_json::Value {
    json!({
        "type": "object",
        "properties": {
            "url": {
                "type": "string",
                "description": "Route to capture. Path (\"/\", \"/tasks\") or a same-origin URL on the dev server's host. External hosts are rejected."
            },
            "viewport": {
                "type": "object",
                "description": "Viewport size. Default 1280x720.",
                "properties": {
                    "width": { "type": "number" },
                    "height": { "type": "number" }
                },
                "required": ["width", "height"]
            },
            "fullPage": {
                "type": "boolean",
                "description": "Capture the full scrollable page. Default false."
            },
            "crop": {
                "description": "Crop to one element. String = CSS selector, or { text | name | label: string }."
            },
            "waitFor": {
                "type": "string",
                "enum": ["domcontentloaded", "networkidle", "load"],
                "description": "When to take the screenshot. Default 'networkidle'."
            }
        },
        "required": ["url"]
    })
}

/// LLM-facing tool description. Kept in one place so the MCP tool list
/// and any docs stay in sync.
pub const TOOL_DESCRIPTION: &str = "Capture a pixel-perfect PNG screenshot of a route served by this dev server. \
Returns the image inline (the agent sees it) plus a local file path and URL (for follow-up replies, diffs, or sharing with a human). \
Scope: same-origin only (paths or same-host URLs; external hosts return URL_INVALID). Public routes only in v1 — \
if the route redirects to /login, /signin, or /signup this tool returns AUTH_REQUIRED rather than silently screenshotting \
the login screen. Does NOT share session or cookies with the vertz_browser_* connected-tab tools. \
Each call uses an isolated Chromium page.";

/// Main entrypoint called from `mcp::execute_tool` for `vertz_browser_screenshot`.
///
/// Responsibilities:
/// 1. Parse + validate `args` into a [`CaptureRequest`] (rejects external URLs).
/// 2. Lazy-init the singleton pool.
/// 3. Run the capture, translating [`PoolError`] into MCP error content.
/// 4. Detect AUTH_REQUIRED from the final URL path (v1 — path-based only).
/// 5. Persist the PNG to `.vertz/artifacts/screenshots/` and emit the MCP
///    response (image content block + stringified metadata).
pub async fn capture_tool(
    args: &serde_json::Value,
    server_port: u16,
    root_dir: &Path,
) -> Result<serde_json::Value, String> {
    let parsed = parse_args(args)?;
    let started = Instant::now();

    let pool = pool_instance().await;
    let outcome = pool.capture(parsed.request.clone()).await;

    match outcome {
        Ok((bytes, meta)) => {
            // v1 AUTH_REQUIRED detection — path-based only. Status-based
            // (401/403) and DOM-based (password-input) land when the
            // pool exposes HTTP status from navigation.
            if let Some(signals) = detect_auth_required(&meta.final_url) {
                return Ok(auth_required_response(
                    &parsed.request.url,
                    &meta.final_url,
                    signals,
                ));
            }

            let filename = build_filename(
                std::time::SystemTime::now(),
                &slugify_url_path(&parsed.request.url),
                if parsed.request.full_page {
                    ViewportLabel::Full
                } else {
                    ViewportLabel::Sized {
                        width: parsed.request.viewport.0,
                        height: parsed.request.viewport.1,
                    }
                },
            );
            let artifacts_dir = root_dir.join(".vertz/artifacts/screenshots");
            let path = write_artifact(&artifacts_dir, &filename, &bytes)
                .map_err(|e| format!("artifact write failed: {e}"))?;

            // The actual on-disk filename may differ from `filename` when
            // two concurrent calls collide — `write_artifact` appends a
            // counter. Use the returned path for the URL.
            let final_filename = path
                .file_name()
                .and_then(|n| n.to_str())
                .ok_or_else(|| "artifact path has no filename".to_string())?;
            let artifact_url = format!(
                "http://localhost:{server_port}/__vertz_artifacts/screenshots/{final_filename}"
            );

            let base64 = base64::engine::general_purpose::STANDARD.encode(&bytes);
            let meta_json = json!({
                "path": path.to_string_lossy(),
                "url": artifact_url,
                "dimensions": { "width": meta.dimensions.0, "height": meta.dimensions.1 },
                "pageUrl": meta.final_url,
                "capturedInMs": started.elapsed().as_millis() as u64,
            });

            Ok(json!({
                "content": [
                    { "type": "image", "data": base64, "mimeType": "image/png" },
                    { "type": "text", "text": meta_json.to_string() }
                ]
            }))
        }
        Err(err) => Ok(pool_error_response(&err)),
    }
}

/// Current pool status — wired into `/__vertz_diagnostics`.
/// Returns `None` when no capture has been attempted yet.
pub async fn pool_status() -> Option<PoolStatus> {
    POOL.get()?.status().await.into()
}

/// Shutdown the singleton pool. Called from the dev server's graceful
/// shutdown future. Idempotent.
pub async fn shutdown_pool() {
    if let Some(pool) = POOL.get() {
        pool.shutdown().await;
    }
}

/// Serve `GET /__vertz_artifacts/screenshots/:filename`.
///
/// Strict filename allowlist — rejects path traversal, dotfiles, and any
/// character outside `[A-Za-z0-9._-]`, returning 404 rather than leaking
/// existence info.
pub fn resolve_artifact(root_dir: &Path, filename: &str) -> Option<PathBuf> {
    if !is_safe_artifact_filename(filename) {
        return None;
    }
    let path = root_dir.join(".vertz/artifacts/screenshots").join(filename);
    if path.is_file() {
        Some(path)
    } else {
        None
    }
}

fn is_safe_artifact_filename(s: &str) -> bool {
    !s.is_empty()
        && !s.starts_with('.')
        && !s.contains("..")
        && s.len() <= 255
        && s.ends_with(".png")
        && s.chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '.' || c == '_' || c == '-')
}

// ----- internals -----

#[derive(Debug)]
struct ParsedArgs {
    request: CaptureRequest,
}

fn parse_args(args: &serde_json::Value) -> Result<ParsedArgs, String> {
    let url_raw = args
        .get("url")
        .and_then(|v| v.as_str())
        .ok_or_else(|| "missing required parameter 'url'".to_string())?;
    let normalized_url = normalize_url(url_raw)?;

    let viewport = match args.get("viewport") {
        Some(v) => {
            let w = v
                .get("width")
                .and_then(|x| x.as_u64())
                .ok_or_else(|| "viewport.width must be a positive number".to_string())?
                as u32;
            let h = v
                .get("height")
                .and_then(|x| x.as_u64())
                .ok_or_else(|| "viewport.height must be a positive number".to_string())?
                as u32;
            if w == 0 || h == 0 || w > 4096 || h > 4096 {
                return Err("viewport must be between 1x1 and 4096x4096".into());
            }
            (w, h)
        }
        None => (1280, 720),
    };

    let full_page = args
        .get("fullPage")
        .and_then(|v| v.as_bool())
        .unwrap_or(false);

    let crop = match args.get("crop") {
        Some(v) if v.is_null() => None,
        Some(v) => Some(parse_crop(v)?),
        None => None,
    };

    let wait_for = match args.get("waitFor").and_then(|v| v.as_str()) {
        Some("domcontentloaded") => WaitCondition::DomContentLoaded,
        Some("networkidle") | None => WaitCondition::NetworkIdle,
        Some("load") => WaitCondition::Load,
        Some(other) => {
            return Err(format!(
                "waitFor must be one of domcontentloaded / networkidle / load (got {other:?})"
            ))
        }
    };

    Ok(ParsedArgs {
        request: CaptureRequest {
            url: normalized_url,
            viewport,
            full_page,
            crop,
            wait_for,
        },
    })
}

fn parse_crop(v: &serde_json::Value) -> Result<CropSpec, String> {
    if let Some(s) = v.as_str() {
        if s.is_empty() {
            return Err("crop string must not be empty".into());
        }
        return Ok(CropSpec::Css(s.to_string()));
    }
    let obj = v
        .as_object()
        .ok_or_else(|| "crop must be a CSS string or { text|name|label } object".to_string())?;
    let count = ["text", "name", "label"]
        .iter()
        .filter(|k| obj.contains_key(**k))
        .count();
    if count != 1 {
        return Err("crop object must have exactly one of text / name / label".into());
    }
    if let Some(s) = obj.get("text").and_then(|v| v.as_str()) {
        return Ok(CropSpec::Text(s.to_string()));
    }
    if let Some(s) = obj.get("name").and_then(|v| v.as_str()) {
        return Ok(CropSpec::Name(s.to_string()));
    }
    if let Some(s) = obj.get("label").and_then(|v| v.as_str()) {
        return Ok(CropSpec::Label(s.to_string()));
    }
    Err("crop object keys must have string values".into())
}

/// Coerce an input URL into a same-origin URL on this dev server.
/// Accepts a path starting with `/` OR a URL whose host is `localhost`
/// / `127.0.0.1`. Rejects any external host with a URL_INVALID message.
fn normalize_url(raw: &str) -> Result<String, String> {
    if raw.starts_with('/') {
        return Ok(raw.to_string());
    }
    match url::Url::parse(raw) {
        Ok(parsed) => {
            let host = parsed.host_str().unwrap_or("");
            if !matches!(host, "localhost" | "127.0.0.1" | "::1") {
                return Err(format!(
                    "URL_INVALID: external host {host:?} is not allowed (use a path or same-origin URL)"
                ));
            }
            Ok(raw.to_string())
        }
        Err(_) => Err(format!(
            "URL_INVALID: malformed URL {raw:?} (expected a path or same-origin URL)"
        )),
    }
}

/// Match the final URL against the auth-gate paths documented in the
/// design doc. Exact (trailing-slash and query-string tolerant) match
/// on `/login`, `/signin`, `/signup`.
fn detect_auth_required(final_url: &str) -> Option<Vec<&'static str>> {
    let path = match url::Url::parse(final_url) {
        Ok(u) => u.path().to_string(),
        Err(_) => {
            // Already a path
            let without_query = final_url.split('?').next().unwrap_or(final_url);
            without_query.to_string()
        }
    };
    let trimmed = path.trim_end_matches('/');
    if matches!(trimmed, "/login" | "/signin" | "/signup") {
        Some(vec!["redirect"])
    } else {
        None
    }
}

fn auth_required_response(
    original_url: &str,
    final_url: &str,
    detected_by: Vec<&'static str>,
) -> serde_json::Value {
    json!({
        "content": [{
            "type": "text",
            "text": json!({
                "code": "AUTH_REQUIRED",
                "message": format!("route redirected to auth page: {final_url}"),
                "url": original_url,
                "detectedBy": detected_by,
                "finalUrl": final_url,
            }).to_string()
        }],
        "isError": true
    })
}

fn pool_error_response(err: &PoolError) -> serde_json::Value {
    let (code, message) = match err {
        PoolError::Launch { message, .. } => ("CHROME_LAUNCH_FAILED", message.clone()),
        PoolError::NavigationFailed { message, url } => {
            ("NAVIGATION_FAILED", format!("{message} (url: {url})"))
        }
        PoolError::SelectorInvalid { message } => ("SELECTOR_INVALID", message.clone()),
        PoolError::SelectorNotFound { message } => ("SELECTOR_NOT_FOUND", message.clone()),
        PoolError::CaptureFailed { message } => ("CAPTURE_FAILED", message.clone()),
        PoolError::ShuttingDown => ("CAPTURE_FAILED", "pool is shutting down".to_string()),
    };
    json!({
        "content": [{
            "type": "text",
            "text": json!({ "code": code, "message": message }).to_string()
        }],
        "isError": true
    })
}

/// Build the production spawner. Layered: `ChromeResolvingSpawner` wraps
/// `ChromiumoxideSpawner`, calling `fetcher::ensure_chrome` the first
/// time to populate `config.chrome_path`, then delegating to the real
/// spawner. Cached via Arc so a single binary resolution is shared
/// across concurrent launches.
struct ChromeResolvingSpawner {
    inner: chromium::ChromiumoxideSpawner,
    resolved_path: tokio::sync::Mutex<Option<PathBuf>>,
}

impl ChromeResolvingSpawner {
    fn new() -> Self {
        Self {
            inner: chromium::ChromiumoxideSpawner::new(),
            resolved_path: tokio::sync::Mutex::new(None),
        }
    }

    async fn resolve(&self) -> Option<PathBuf> {
        {
            let guard = self.resolved_path.lock().await;
            if let Some(p) = guard.as_ref() {
                return Some(p.clone());
            }
        }
        let env = std::env::var("VERTZ_CHROME_PATH").ok();
        if let Some(p) = fetcher::resolve_local_chrome(env.as_deref(), fetcher::SYSTEM_CHROME_PATHS)
        {
            let mut guard = self.resolved_path.lock().await;
            *guard = Some(p.clone());
            return Some(p);
        }
        // No local Chrome — defer download to Task 8 with pinned SHAs.
        // For Phase 1, `vtz dev` will surface a clear launch error
        // pointing users at `$VERTZ_CHROME_PATH` or a system install.
        None
    }
}

#[async_trait::async_trait]
impl BrowserSpawner for ChromeResolvingSpawner {
    async fn launch(
        &self,
        mut config: LaunchConfig,
    ) -> Result<Arc<dyn pool::BrowserHandle>, PoolError> {
        if config.chrome_path.is_none() {
            config.chrome_path = self.resolve().await;
        }
        if config.chrome_path.is_none() {
            return Err(PoolError::Launch {
                message: "no Chrome binary found on this machine".to_string(),
                hint: Some(
                    "install Google Chrome / Chromium, or set $VERTZ_CHROME_PATH".to_string(),
                ),
            });
        }
        self.inner.launch(config).await
    }
}

async fn pool_instance() -> Arc<Pool> {
    POOL.get_or_init(|| async {
        let spawner: Arc<dyn BrowserSpawner> = Arc::new(ChromeResolvingSpawner::new());
        Arc::new(Pool::new(
            spawner,
            LaunchConfig {
                viewport: (1280, 720),
                chrome_path: None,
            },
            DEFAULT_TTL,
        ))
    })
    .await
    .clone()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_args_accepts_minimal_url() {
        let parsed = parse_args(&json!({"url": "/"})).unwrap();
        assert_eq!(parsed.request.url, "/");
        assert_eq!(parsed.request.viewport, (1280, 720));
        assert!(!parsed.request.full_page);
        assert!(parsed.request.crop.is_none());
        assert_eq!(parsed.request.wait_for, WaitCondition::NetworkIdle);
    }

    #[test]
    fn parse_args_honors_viewport_override() {
        let parsed = parse_args(&json!({
            "url": "/",
            "viewport": { "width": 375, "height": 667 }
        }))
        .unwrap();
        assert_eq!(parsed.request.viewport, (375, 667));
    }

    #[test]
    fn parse_args_rejects_zero_viewport() {
        let err = parse_args(&json!({
            "url": "/", "viewport": { "width": 0, "height": 100 }
        }))
        .unwrap_err();
        assert!(err.contains("1x1"));
    }

    #[test]
    fn parse_args_rejects_oversized_viewport() {
        let err = parse_args(&json!({
            "url": "/", "viewport": { "width": 9999, "height": 100 }
        }))
        .unwrap_err();
        assert!(err.contains("4096"));
    }

    #[test]
    fn parse_args_accepts_full_page() {
        let parsed = parse_args(&json!({"url": "/", "fullPage": true})).unwrap();
        assert!(parsed.request.full_page);
    }

    #[test]
    fn parse_args_accepts_css_crop_string() {
        let parsed = parse_args(&json!({"url": "/", "crop": ".foo"})).unwrap();
        assert_eq!(parsed.request.crop, Some(CropSpec::Css(".foo".into())));
    }

    #[test]
    fn parse_args_accepts_text_crop() {
        let parsed = parse_args(&json!({"url": "/", "crop": {"text": "Save"}})).unwrap();
        assert_eq!(parsed.request.crop, Some(CropSpec::Text("Save".into())));
    }

    #[test]
    fn parse_args_rejects_empty_crop_string() {
        let err = parse_args(&json!({"url": "/", "crop": ""})).unwrap_err();
        assert!(err.contains("empty"));
    }

    #[test]
    fn parse_args_rejects_crop_with_multiple_keys() {
        let err = parse_args(&json!({
            "url": "/", "crop": {"text": "Save", "name": "save"}
        }))
        .unwrap_err();
        assert!(err.contains("exactly one"));
    }

    #[test]
    fn parse_args_maps_wait_for() {
        assert_eq!(
            parse_args(&json!({"url": "/", "waitFor": "load"}))
                .unwrap()
                .request
                .wait_for,
            WaitCondition::Load
        );
        assert_eq!(
            parse_args(&json!({"url": "/", "waitFor": "domcontentloaded"}))
                .unwrap()
                .request
                .wait_for,
            WaitCondition::DomContentLoaded
        );
    }

    #[test]
    fn parse_args_rejects_unknown_wait_for() {
        let err = parse_args(&json!({"url": "/", "waitFor": "gibberish"})).unwrap_err();
        assert!(err.contains("waitFor"));
    }

    #[test]
    fn normalize_url_accepts_paths() {
        assert_eq!(normalize_url("/").unwrap(), "/");
        assert_eq!(normalize_url("/tasks").unwrap(), "/tasks");
    }

    #[test]
    fn normalize_url_accepts_localhost() {
        let u = normalize_url("http://localhost:3000/x").unwrap();
        assert!(u.contains("localhost"));
    }

    #[test]
    fn normalize_url_rejects_external_host() {
        let err = normalize_url("https://example.com/").unwrap_err();
        assert!(err.contains("URL_INVALID"));
        assert!(err.contains("example.com"));
    }

    #[test]
    fn normalize_url_rejects_malformed() {
        let err = normalize_url("not-a-url").unwrap_err();
        assert!(err.contains("URL_INVALID"));
    }

    #[test]
    fn detect_auth_required_matches_login() {
        assert!(detect_auth_required("http://localhost/login").is_some());
        assert!(detect_auth_required("http://localhost/signin").is_some());
        assert!(detect_auth_required("http://localhost/signup").is_some());
        assert!(detect_auth_required("http://localhost/login/").is_some());
        assert!(detect_auth_required("http://localhost/login?next=/").is_some());
    }

    #[test]
    fn detect_auth_required_ignores_unrelated_paths() {
        assert!(detect_auth_required("http://localhost/").is_none());
        assert!(detect_auth_required("http://localhost/tasks").is_none());
        assert!(detect_auth_required("http://localhost/auth/callback").is_none());
        assert!(detect_auth_required("http://localhost/dashboard/auth-overview").is_none());
    }

    #[test]
    fn is_safe_artifact_filename_accepts_png() {
        assert!(is_safe_artifact_filename(
            "2026-04-19T14-23-05Z-tasks-1280x720.png"
        ));
        assert!(is_safe_artifact_filename("a.png"));
    }

    #[test]
    fn is_safe_artifact_filename_rejects_traversal() {
        assert!(!is_safe_artifact_filename("../etc/passwd.png"));
        assert!(!is_safe_artifact_filename("foo/bar.png"));
        assert!(!is_safe_artifact_filename("foo..bar.png"));
    }

    #[test]
    fn is_safe_artifact_filename_rejects_dotfiles() {
        assert!(!is_safe_artifact_filename(".hidden.png"));
    }

    #[test]
    fn is_safe_artifact_filename_rejects_non_png() {
        assert!(!is_safe_artifact_filename("foo.jpg"));
        assert!(!is_safe_artifact_filename("foo"));
    }

    #[test]
    fn is_safe_artifact_filename_rejects_special_chars() {
        assert!(!is_safe_artifact_filename("foo bar.png"));
        assert!(!is_safe_artifact_filename("foo$.png"));
        assert!(!is_safe_artifact_filename("foo\x00bar.png"));
    }

    #[test]
    fn resolve_artifact_returns_none_for_unsafe_name() {
        let dir = tempfile::tempdir().unwrap();
        assert!(resolve_artifact(dir.path(), "../etc/passwd.png").is_none());
    }

    #[test]
    fn resolve_artifact_returns_none_for_missing_file() {
        let dir = tempfile::tempdir().unwrap();
        assert!(resolve_artifact(dir.path(), "nope.png").is_none());
    }

    #[test]
    fn resolve_artifact_returns_path_for_existing_file() {
        let dir = tempfile::tempdir().unwrap();
        let artifacts = dir.path().join(".vertz/artifacts/screenshots");
        std::fs::create_dir_all(&artifacts).unwrap();
        let f = artifacts.join("x.png");
        std::fs::write(&f, b"png").unwrap();
        let resolved = resolve_artifact(dir.path(), "x.png").unwrap();
        assert_eq!(resolved, f);
    }

    #[test]
    fn pool_error_response_maps_to_code() {
        let err = PoolError::SelectorNotFound {
            message: ".foo not found".into(),
        };
        let resp = pool_error_response(&err);
        assert_eq!(resp["isError"], true);
        let body = resp["content"][0]["text"].as_str().unwrap();
        assert!(body.contains("SELECTOR_NOT_FOUND"));
    }

    #[test]
    fn auth_required_response_carries_signals() {
        let resp = auth_required_response("/", "http://localhost/login", vec!["redirect"]);
        assert_eq!(resp["isError"], true);
        let body = resp["content"][0]["text"].as_str().unwrap();
        assert!(body.contains("AUTH_REQUIRED"));
        assert!(body.contains("redirect"));
    }

    #[test]
    fn tool_input_schema_shape() {
        let schema = tool_input_schema();
        assert_eq!(schema["type"], "object");
        assert!(schema["properties"]["url"].is_object());
        assert!(schema["required"]
            .as_array()
            .unwrap()
            .contains(&json!("url")));
    }
}
