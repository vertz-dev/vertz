use crate::server::audit_log::{AuditEvent, AuditLog};
use axum::body::Body;
use axum::http::{Request, Response, StatusCode};
use owo_colors::OwoColorize;
use std::future::Future;
use std::pin::Pin;
use std::task::{Context, Poll};
use std::time::Instant;
use tower::{Layer, Service};

/// Tower layer that logs each HTTP request with colored status codes and timing.
///
/// Console output suppresses "noise" paths (internal endpoints, assets, source modules)
/// to keep the developer's terminal focused on meaningful requests (pages, API routes).
/// All requests — including suppressed ones — are recorded in the audit log so that
/// LLMs can access the full stream via MCP (`vertz_get_audit_log`).
#[derive(Clone)]
pub struct RequestLoggingLayer {
    audit_log: AuditLog,
}

impl RequestLoggingLayer {
    /// Create a new logging layer that records all requests to the given audit log.
    pub fn new(audit_log: AuditLog) -> Self {
        Self { audit_log }
    }
}

impl<S> Layer<S> for RequestLoggingLayer {
    type Service = RequestLoggingMiddleware<S>;

    fn layer(&self, inner: S) -> Self::Service {
        RequestLoggingMiddleware {
            inner,
            audit_log: self.audit_log.clone(),
        }
    }
}

/// Tower middleware service that wraps the inner service with request logging.
#[derive(Clone)]
pub struct RequestLoggingMiddleware<S> {
    inner: S,
    audit_log: AuditLog,
}

impl<S> Service<Request<Body>> for RequestLoggingMiddleware<S>
where
    S: Service<Request<Body>, Response = Response<Body>> + Clone + Send + 'static,
    S::Future: Send + 'static,
{
    type Response = Response<Body>;
    type Error = S::Error;
    type Future = Pin<Box<dyn Future<Output = Result<Self::Response, Self::Error>> + Send>>;

    fn poll_ready(&mut self, cx: &mut Context<'_>) -> Poll<Result<(), Self::Error>> {
        self.inner.poll_ready(cx)
    }

    fn call(&mut self, req: Request<Body>) -> Self::Future {
        let method = req.method().clone();
        let path = req.uri().path().to_string();
        let start = Instant::now();
        let mut inner = self.inner.clone();
        let audit_log = self.audit_log.clone();

        Box::pin(async move {
            let response = inner.call(req).await?;
            let elapsed = start.elapsed();
            let status = response.status();
            let duration_ms = elapsed.as_secs_f64() * 1000.0;

            // Always record to audit log (accessible via MCP vertz_get_audit_log)
            audit_log.record(AuditEvent::api_request(
                method.as_ref(),
                &path,
                status.as_u16(),
                duration_ms,
            ));

            // Only print to console for non-noise paths
            if !is_noise_path(&path) {
                let time_str = format_elapsed(elapsed);
                let status_str = format_status(status);
                let now = chrono_free_time();
                eprintln!(
                    "{} {} {} {} ({})",
                    now.dimmed(),
                    status_str,
                    method.to_string().bold(),
                    path,
                    time_str.dimmed()
                );
            }

            Ok(response)
        })
    }
}

/// Format a duration for display (e.g., "1.23ms", "456μs").
fn format_elapsed(elapsed: std::time::Duration) -> String {
    let micros = elapsed.as_micros();
    if micros < 1000 {
        format!("{}μs", micros)
    } else {
        let millis = elapsed.as_secs_f64() * 1000.0;
        format!("{:.2}ms", millis)
    }
}

/// Format a status code with color: green for 2xx, yellow for 3xx, red for 4xx/5xx.
fn format_status(status: StatusCode) -> String {
    let code = status.as_u16();
    let text = format!("{}", code);

    if code < 300 {
        text.green().to_string()
    } else if code < 400 {
        text.yellow().to_string()
    } else {
        text.red().to_string()
    }
}

/// Returns `true` if the path is "noise" — internal dev-server endpoints, source modules,
/// or static assets that clutter the console without providing actionable information.
/// These requests are still recorded in the audit log for LLM/MCP access.
///
/// Note: HTTP requests never include fragments (`#section`), so we only strip query params.
pub(crate) fn is_noise_path(path: &str) -> bool {
    // Internal dev-server endpoints and dependency/artifact paths
    if path.starts_with("/__vertz")
        || path.starts_with("/@deps/")
        || path.starts_with("/@fs/")
        || path.starts_with("/@css/")
        || path.starts_with("/.vertz/")
        || path.starts_with("/node_modules/")
    {
        return true;
    }

    // API routes are never noise, even if they happen to have file-like extensions
    // (e.g., /api/bundle.js, /api/export.csv)
    if path.starts_with("/api/") || path == "/api" {
        return false;
    }

    // Strip query params before checking the extension
    let clean = path.split('?').next().unwrap_or(path);

    if let Some(dot_pos) = clean.rfind('.') {
        let ext = &clean[dot_pos + 1..];
        return matches!(
            ext,
            // Source modules
            "js" | "mjs" | "ts" | "tsx" | "jsx"
            // Stylesheets and source maps
            | "css" | "map"
            // Images
            | "svg" | "png" | "jpg" | "jpeg" | "gif" | "webp" | "ico"
            // Fonts
            | "woff" | "woff2" | "ttf" | "eot"
        );
    }

    false
}

/// Simple HH:MM:SS timestamp without pulling in the chrono crate.
fn chrono_free_time() -> String {
    use std::time::SystemTime;
    let now = SystemTime::now()
        .duration_since(SystemTime::UNIX_EPOCH)
        .unwrap_or_default();
    let secs = now.as_secs();
    let hours = (secs / 3600) % 24;
    let minutes = (secs / 60) % 60;
    let seconds = secs % 60;
    format!("{:02}:{:02}:{:02}", hours, minutes, seconds)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::Duration;

    #[test]
    fn test_format_elapsed_micros() {
        let d = Duration::from_micros(500);
        assert_eq!(format_elapsed(d), "500μs");
    }

    #[test]
    fn test_format_elapsed_millis() {
        let d = Duration::from_millis(15);
        assert_eq!(format_elapsed(d), "15.00ms");
    }

    #[test]
    fn test_format_status_2xx_is_green() {
        let s = format_status(StatusCode::OK);
        // The formatted string contains ANSI escape codes for green
        assert!(s.contains("200"));
    }

    #[test]
    fn test_format_status_3xx_is_yellow() {
        let s = format_status(StatusCode::MOVED_PERMANENTLY);
        assert!(s.contains("301"));
    }

    #[test]
    fn test_format_status_4xx_is_red() {
        let s = format_status(StatusCode::NOT_FOUND);
        assert!(s.contains("404"));
    }

    #[test]
    fn test_format_status_5xx_is_red() {
        let s = format_status(StatusCode::INTERNAL_SERVER_ERROR);
        assert!(s.contains("500"));
    }

    #[test]
    fn test_chrono_free_time_format() {
        let time = chrono_free_time();
        // Should be in HH:MM:SS format
        assert_eq!(time.len(), 8);
        assert_eq!(&time[2..3], ":");
        assert_eq!(&time[5..6], ":");
    }

    // ── is_noise_path tests ──

    #[test]
    fn test_internal_vertz_paths_are_noise() {
        assert!(is_noise_path("/__vertz_hmr"));
        assert!(is_noise_path("/__vertz_errors"));
        assert!(is_noise_path("/__vertz_diagnostics"));
        assert!(is_noise_path("/__vertz_mcp/sse"));
        assert!(is_noise_path("/__vertz_ai/errors"));
        assert!(is_noise_path("/__vertz_image/foo.png"));
    }

    #[test]
    fn test_deps_paths_are_noise() {
        assert!(is_noise_path("/@deps/react/index.js"));
        assert!(is_noise_path("/@deps/@vertz/ui/dist/index.js"));
    }

    #[test]
    fn test_source_module_paths_are_noise() {
        assert!(is_noise_path("/src/App.tsx"));
        assert!(is_noise_path("/src/components/Button.ts"));
        assert!(is_noise_path("/src/main.js"));
        assert!(is_noise_path("/src/utils.mjs"));
        assert!(is_noise_path("/src/page.jsx"));
    }

    #[test]
    fn test_css_paths_are_noise() {
        assert!(is_noise_path("/@css/theme.css"));
        assert!(is_noise_path("/src/styles/app.css"));
    }

    #[test]
    fn test_source_map_paths_are_noise() {
        assert!(is_noise_path("/src/App.tsx.map"));
    }

    #[test]
    fn test_asset_paths_are_noise() {
        // Images
        assert!(is_noise_path("/logo.svg"));
        assert!(is_noise_path("/images/hero.png"));
        assert!(is_noise_path("/photo.jpg"));
        assert!(is_noise_path("/photo.jpeg"));
        assert!(is_noise_path("/anim.gif"));
        assert!(is_noise_path("/icon.webp"));
        assert!(is_noise_path("/favicon.ico"));

        // Fonts
        assert!(is_noise_path("/fonts/inter.woff"));
        assert!(is_noise_path("/fonts/inter.woff2"));
        assert!(is_noise_path("/fonts/inter.ttf"));
        assert!(is_noise_path("/fonts/legacy.eot"));
    }

    #[test]
    fn test_vertz_dev_artifact_paths_are_noise() {
        assert!(is_noise_path("/.vertz/css/abc123.css"));
        assert!(is_noise_path("/.vertz/dev/ssr-reload-entry.ts"));
    }

    #[test]
    fn test_page_routes_are_not_noise() {
        assert!(!is_noise_path("/"));
        assert!(!is_noise_path("/tasks"));
        assert!(!is_noise_path("/tasks/123"));
        assert!(!is_noise_path("/settings"));
    }

    #[test]
    fn test_api_routes_are_not_noise() {
        assert!(!is_noise_path("/api/tasks"));
        assert!(!is_noise_path("/api/users/123"));
        assert!(!is_noise_path("/api"));
    }

    #[test]
    fn test_node_modules_paths_are_noise() {
        assert!(is_noise_path("/node_modules/react/index.js"));
        assert!(is_noise_path("/node_modules/@vertz/ui/dist/index.js"));
    }

    #[test]
    fn test_api_routes_with_file_extensions_are_not_noise() {
        assert!(!is_noise_path("/api/bundle.js"));
        assert!(!is_noise_path("/api/export.csv"));
        assert!(!is_noise_path("/api/data.json"));
    }

    #[test]
    fn test_bare_vertz_prefix_is_noise() {
        assert!(is_noise_path("/__vertz"));
    }

    #[test]
    fn test_trailing_slash_page_routes_are_not_noise() {
        assert!(!is_noise_path("/api/tasks/"));
        assert!(!is_noise_path("/tasks/"));
    }

    #[test]
    fn test_query_params_on_module_paths_still_noise() {
        assert!(is_noise_path("/src/App.tsx?t=1234567890"));
        assert!(is_noise_path("/@deps/react/index.js?v=abc"));
    }
}
