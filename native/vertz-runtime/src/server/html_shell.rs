use std::path::Path;

/// The Fast Refresh runtime JS (embedded at compile time).
const FAST_REFRESH_RUNTIME_JS: &str = include_str!("../assets/fast-refresh-runtime.js");

/// The Fast Refresh helpers module that registers @vertz/ui context functions.
const FAST_REFRESH_HELPERS_JS: &str = include_str!("../assets/fast-refresh-helpers.js");

/// The HMR client JS (embedded at compile time).
const HMR_CLIENT_JS: &str = include_str!("../assets/hmr-client.js");

/// The error overlay JS (embedded at compile time).
const ERROR_OVERLAY_JS: &str = include_str!("../assets/error-overlay.js");

/// Generate the HTML shell document for client-side rendering.
///
/// This is the document returned for page routes (SPA routing).
/// It includes:
/// - `<script type="module" src="/src/app.tsx">` to load the entry file
/// - `<link rel="modulepreload">` hints for the entry file
/// - `<div id="app">` mount point
/// - Standard HTML5 boilerplate (DOCTYPE, charset, viewport)
/// - HMR client script and Fast Refresh runtime (in dev mode)
pub fn generate_html_shell(
    entry_path: &Path,
    root_dir: &Path,
    preload_hints: &[String],
    inline_css: Option<&str>,
    title: &str,
) -> String {
    generate_html_shell_with_hmr(entry_path, root_dir, preload_hints, inline_css, title, true)
}

/// Generate the HTML shell with optional HMR support.
///
/// When `enable_hmr` is true, includes the Fast Refresh runtime and HMR client
/// scripts inline in the HTML shell. These scripts run before the app module loads.
pub fn generate_html_shell_with_hmr(
    entry_path: &Path,
    root_dir: &Path,
    preload_hints: &[String],
    inline_css: Option<&str>,
    title: &str,
    enable_hmr: bool,
) -> String {
    let entry_url = path_to_url(entry_path, root_dir);

    let mut html = String::with_capacity(2048);
    html.push_str("<!DOCTYPE html>\n");
    html.push_str("<html lang=\"en\">\n");
    html.push_str("<head>\n");
    html.push_str("  <meta charset=\"UTF-8\" />\n");
    html.push_str(
        "  <meta name=\"viewport\" content=\"width=device-width, initial-scale=1.0\" />\n",
    );
    html.push_str(&format!("  <title>{}</title>\n", escape_html(title)));

    // Module preload for the entry file
    html.push_str(&format!(
        "  <link rel=\"modulepreload\" href=\"{}\" />\n",
        entry_url
    ));

    // Additional preload hints for known imports
    for hint in preload_hints {
        html.push_str(&format!(
            "  <link rel=\"modulepreload\" href=\"{}\" />\n",
            hint
        ));
    }

    // Inline CSS (base theme)
    if let Some(css) = inline_css {
        html.push_str(&format!("  <style>{}</style>\n", css));
    }

    html.push_str("</head>\n");
    html.push_str("<body>\n");
    html.push_str("  <div id=\"app\"></div>\n");

    // HMR scripts: Fast Refresh runtime + HMR client + error overlay (before app module)
    if enable_hmr {
        html.push_str("  <script>\n");
        html.push_str(FAST_REFRESH_RUNTIME_JS);
        html.push_str("\n  </script>\n");
        html.push_str("  <script>\n");
        html.push_str(HMR_CLIENT_JS);
        html.push_str("\n  </script>\n");
        html.push_str("  <script>\n");
        html.push_str(ERROR_OVERLAY_JS);
        html.push_str("\n  </script>\n");
        // Module script that registers @vertz/ui context helpers with the FR runtime.
        // Must execute before the entry module so that component wrappers capture
        // real context scopes (needed for Fast Refresh re-mounting).
        html.push_str("  <script type=\"module\">\n");
        html.push_str(FAST_REFRESH_HELPERS_JS);
        html.push_str("\n  </script>\n");
    }

    html.push_str(&format!(
        "  <script type=\"module\" src=\"{}\"></script>\n",
        entry_url
    ));
    html.push_str("</body>\n");
    html.push_str("</html>\n");

    html
}

/// Convert an absolute file path to a URL path relative to root_dir.
fn path_to_url(path: &Path, root_dir: &Path) -> String {
    if let Ok(rel) = path.strip_prefix(root_dir) {
        format!("/{}", rel.to_string_lossy().replace('\\', "/"))
    } else {
        // Fallback: use the path as-is
        format!("/{}", path.to_string_lossy().replace('\\', "/"))
    }
}

/// Basic HTML escaping for text content.
fn escape_html(s: &str) -> String {
    s.replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
}

/// Check if a request path should be served the HTML shell (SPA routing).
///
/// Returns true for page routes — anything that:
/// - Is not a known asset route (/@deps/, /@css/, /src/)
/// - Is not a file with a known extension (.js, .ts, .tsx, .css, .map, .json, .png, etc.)
/// - Is not a static asset route
pub fn is_page_route(path: &str) -> bool {
    // Known asset prefixes
    if path.starts_with("/@deps/")
        || path.starts_with("/@css/")
        || path.starts_with("/src/")
        || path.starts_with("/node_modules/")
    {
        return false;
    }

    // Internal dev server endpoints
    if path.starts_with("/__vertz_") {
        return false;
    }

    // Known file extensions
    let known_extensions = [
        ".js", ".ts", ".tsx", ".jsx", ".css", ".map", ".json", ".png", ".jpg", ".jpeg", ".gif",
        ".svg", ".ico", ".woff", ".woff2", ".ttf", ".eot", ".html", ".txt",
    ];

    for ext in &known_extensions {
        if path.ends_with(ext) {
            return false;
        }
    }

    true
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    #[test]
    fn test_generate_html_shell_basic() {
        let html = generate_html_shell(
            &PathBuf::from("/project/src/app.tsx"),
            &PathBuf::from("/project"),
            &[],
            None,
            "Vertz App",
        );

        assert!(html.contains("<!DOCTYPE html>"));
        assert!(html.contains("<html lang=\"en\">"));
        assert!(html.contains("<meta charset=\"UTF-8\""));
        assert!(html.contains("width=device-width"));
        assert!(html.contains("<title>Vertz App</title>"));
        assert!(html.contains("<div id=\"app\"></div>"));
        assert!(html.contains("<script type=\"module\" src=\"/src/app.tsx\"></script>"));
        assert!(html.contains("<link rel=\"modulepreload\" href=\"/src/app.tsx\""));
    }

    #[test]
    fn test_generate_html_shell_includes_hmr_scripts() {
        let html = generate_html_shell(
            &PathBuf::from("/project/src/app.tsx"),
            &PathBuf::from("/project"),
            &[],
            None,
            "Vertz App",
        );

        // HMR client and Fast Refresh runtime should be included
        assert!(
            html.contains("__vertz_hmr"),
            "HTML should include HMR client script"
        );
        assert!(
            html.contains("vertz:fast-refresh"),
            "HTML should include Fast Refresh runtime"
        );
    }

    #[test]
    fn test_generate_html_shell_hmr_scripts_before_app_module() {
        let html = generate_html_shell(
            &PathBuf::from("/project/src/app.tsx"),
            &PathBuf::from("/project"),
            &[],
            None,
            "Vertz App",
        );

        let hmr_pos = html.find("__vertz_hmr").unwrap();
        let app_pos = html
            .find("<script type=\"module\" src=\"/src/app.tsx\">")
            .unwrap();
        assert!(
            hmr_pos < app_pos,
            "HMR scripts must appear before the app module"
        );
    }

    #[test]
    fn test_generate_html_shell_without_hmr() {
        let html = generate_html_shell_with_hmr(
            &PathBuf::from("/project/src/app.tsx"),
            &PathBuf::from("/project"),
            &[],
            None,
            "Vertz App",
            false,
        );

        assert!(html.contains("<script type=\"module\" src=\"/src/app.tsx\"></script>"));
        assert!(
            !html.contains("__vertz_hmr"),
            "HMR script should not be present"
        );
        assert!(
            !html.contains("vertz:fast-refresh"),
            "Fast Refresh script should not be present"
        );
    }

    #[test]
    fn test_generate_html_shell_with_preload_hints() {
        let hints = vec![
            "/@deps/@vertz/ui".to_string(),
            "/src/components/Button.tsx".to_string(),
        ];
        let html = generate_html_shell(
            &PathBuf::from("/project/src/app.tsx"),
            &PathBuf::from("/project"),
            &hints,
            None,
            "Vertz App",
        );

        assert!(html.contains("<link rel=\"modulepreload\" href=\"/@deps/@vertz/ui\""));
        assert!(html.contains("<link rel=\"modulepreload\" href=\"/src/components/Button.tsx\""));
    }

    #[test]
    fn test_generate_html_shell_with_inline_css() {
        let html = generate_html_shell(
            &PathBuf::from("/project/src/app.tsx"),
            &PathBuf::from("/project"),
            &[],
            Some("body { margin: 0; }"),
            "Vertz App",
        );

        assert!(html.contains("<style>body { margin: 0; }</style>"));
    }

    #[test]
    fn test_generate_html_shell_escapes_title() {
        let html = generate_html_shell(
            &PathBuf::from("/project/src/app.tsx"),
            &PathBuf::from("/project"),
            &[],
            None,
            "App <script>alert('xss')</script>",
        );

        assert!(html.contains("&lt;script&gt;"));
        assert!(!html.contains("<script>alert"));
    }

    #[test]
    fn test_is_page_route_root() {
        assert!(is_page_route("/"));
    }

    #[test]
    fn test_is_page_route_spa_paths() {
        assert!(is_page_route("/tasks"));
        assert!(is_page_route("/tasks/123"));
        assert!(is_page_route("/settings/profile"));
    }

    #[test]
    fn test_is_page_route_rejects_asset_routes() {
        assert!(!is_page_route("/@deps/@vertz/ui"));
        assert!(!is_page_route("/@css/button.css"));
        assert!(!is_page_route("/src/app.tsx"));
        assert!(!is_page_route("/node_modules/zod/index.js"));
    }

    #[test]
    fn test_is_page_route_rejects_file_extensions() {
        assert!(!is_page_route("/favicon.ico"));
        assert!(!is_page_route("/logo.png"));
        assert!(!is_page_route("/styles.css"));
        assert!(!is_page_route("/manifest.json"));
        assert!(!is_page_route("/app.js"));
    }

    #[test]
    fn test_path_to_url() {
        assert_eq!(
            path_to_url(
                &PathBuf::from("/project/src/app.tsx"),
                &PathBuf::from("/project")
            ),
            "/src/app.tsx"
        );
    }

    #[test]
    fn test_escape_html() {
        assert_eq!(escape_html("hello"), "hello");
        assert_eq!(escape_html("<script>"), "&lt;script&gt;");
        assert_eq!(escape_html("a&b"), "a&amp;b");
        assert_eq!(escape_html("a\"b"), "a&quot;b");
    }

    #[test]
    fn test_is_page_route_rejects_hmr_endpoint() {
        assert!(!is_page_route("/__vertz_hmr"));
    }
}
