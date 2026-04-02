/// Full HTML document assembly for SSR responses.
///
/// Combines:
/// - Standard HTML5 boilerplate (DOCTYPE, charset, viewport)
/// - Inline CSS (theme + component CSS) in `<head>`
/// - Pre-rendered HTML in `<div id="app">`
/// - Module script for client entry
/// - Module preload hints
/// - HMR scripts (in dev mode)
use std::path::Path;

/// The Fast Refresh runtime JS (embedded at compile time).
const FAST_REFRESH_RUNTIME_JS: &str = include_str!("../assets/fast-refresh-runtime.js");

/// The Fast Refresh helpers module that registers @vertz/ui context functions.
const FAST_REFRESH_HELPERS_JS: &str = include_str!("../assets/fast-refresh-helpers.js");

/// The HMR client JS (embedded at compile time).
const HMR_CLIENT_JS: &str = include_str!("../assets/hmr-client.js");

/// The error overlay JS (embedded at compile time).
const ERROR_OVERLAY_JS: &str = include_str!("../assets/error-overlay.js");

/// Options for assembling the SSR HTML document.
pub struct SsrHtmlOptions<'a> {
    /// The title of the page.
    pub title: &'a str,
    /// Pre-rendered HTML content to inject into `<div id="app">`.
    pub ssr_content: &'a str,
    /// Inline CSS to include in `<head>` (already formatted as `<style>` tags).
    pub inline_css: &'a str,
    /// Theme CSS from the project.
    pub theme_css: Option<&'a str>,
    /// Path to the entry file (relative to root).
    pub entry_url: &'a str,
    /// Module preload hints.
    pub preload_hints: &'a [String],
    /// Whether to include HMR scripts (dev mode).
    pub enable_hmr: bool,
    /// JSON-serialized SSR data for hydration (injected as `window.__VERTZ_SSR_DATA__`).
    pub ssr_data: Option<&'a str>,
    /// Additional HTML tags to inject into `<head>` (e.g., font preload links from SSR).
    pub head_tags: Option<&'a str>,
}

/// Assemble a complete SSR HTML document.
///
/// The resulting document has this structure:
/// ```html
/// <!DOCTYPE html>
/// <html lang="en">
/// <head>
///   <meta charset="UTF-8" />
///   <meta name="viewport" content="width=device-width, initial-scale=1.0" />
///   <title>...</title>
///   <link rel="modulepreload" href="..." />
///   <style data-vertz-ssr>...</style>  <!-- Theme CSS -->
///   <style data-vertz-ssr>...</style>  <!-- Component CSS -->
/// </head>
/// <body>
///   <div id="app"><!-- SSR content --></div>
///   <!-- HMR scripts (dev only) -->
///   <script type="module" src="..."></script>
/// </body>
/// </html>
/// ```
pub fn assemble_ssr_document(options: &SsrHtmlOptions<'_>) -> String {
    let mut html = String::with_capacity(4096);

    // DOCTYPE and opening tags
    html.push_str("<!DOCTYPE html>\n");
    html.push_str("<html lang=\"en\">\n");
    html.push_str("<head>\n");
    html.push_str("  <meta charset=\"UTF-8\" />\n");
    html.push_str(
        "  <meta name=\"viewport\" content=\"width=device-width, initial-scale=1.0\" />\n",
    );
    html.push_str(&format!(
        "  <title>{}</title>\n",
        escape_html(options.title)
    ));

    // Module preload for the entry file
    html.push_str(&format!(
        "  <link rel=\"modulepreload\" href=\"{}\" />\n",
        options.entry_url
    ));

    // Additional preload hints
    for hint in options.preload_hints {
        html.push_str(&format!(
            "  <link rel=\"modulepreload\" href=\"{}\" />\n",
            hint
        ));
    }

    // Theme CSS first (base styles)
    if let Some(theme) = options.theme_css {
        html.push_str(&format!("  <style data-vertz-theme>{}</style>\n", theme));
    }

    // Component CSS (from SSR rendering)
    if !options.inline_css.is_empty() {
        html.push_str(options.inline_css);
    }

    // Head tags from SSR (e.g., font preload links)
    if let Some(head_tags) = options.head_tags {
        if !head_tags.is_empty() {
            html.push_str(&format!("  {}\n", head_tags));
        }
    }

    html.push_str("</head>\n");
    html.push_str("<body>\n");

    // SSR content inside the mount point
    html.push_str(&format!(
        "  <div id=\"app\">{}</div>\n",
        options.ssr_content
    ));

    // SSR data hydration script (before HMR/app scripts)
    if let Some(ssr_data) = options.ssr_data {
        if !ssr_data.is_empty() {
            html.push_str(&format!(
                "  <script>window.__VERTZ_SSR_DATA__={}</script>\n",
                ssr_data
            ));
        }
    }

    // HMR scripts (dev mode only, before app module)
    if options.enable_hmr {
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
        html.push_str("  <script type=\"module\">\n");
        html.push_str(FAST_REFRESH_HELPERS_JS);
        html.push_str("\n  </script>\n");
    }

    // App module script
    html.push_str(&format!(
        "  <script type=\"module\" src=\"{}\"></script>\n",
        options.entry_url
    ));

    html.push_str("</body>\n");
    html.push_str("</html>\n");

    html
}

/// Helper to build the entry URL from a file path.
pub fn entry_path_to_url(entry_path: &Path, root_dir: &Path) -> String {
    if let Ok(rel) = entry_path.strip_prefix(root_dir) {
        format!("/{}", rel.to_string_lossy().replace('\\', "/"))
    } else {
        format!("/{}", entry_path.to_string_lossy().replace('\\', "/"))
    }
}

/// Basic HTML escaping for text content.
fn escape_html(s: &str) -> String {
    s.replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    fn default_options() -> SsrHtmlOptions<'static> {
        SsrHtmlOptions {
            title: "Test App",
            ssr_content: "<div>Hello World</div>",
            inline_css: "",
            theme_css: None,
            entry_url: "/src/app.tsx",
            preload_hints: &[],
            enable_hmr: false,
            ssr_data: None,
            head_tags: None,
        }
    }

    #[test]
    fn test_basic_ssr_document() {
        let html = assemble_ssr_document(&default_options());

        assert!(html.contains("<!DOCTYPE html>"));
        assert!(html.contains("<html lang=\"en\">"));
        assert!(html.contains("<meta charset=\"UTF-8\""));
        assert!(html.contains("width=device-width"));
        assert!(html.contains("<title>Test App</title>"));
    }

    #[test]
    fn test_ssr_content_in_app_div() {
        let html = assemble_ssr_document(&default_options());

        assert!(html.contains("<div id=\"app\"><div>Hello World</div></div>"));
    }

    #[test]
    fn test_empty_app_div_when_no_content() {
        let opts = SsrHtmlOptions {
            ssr_content: "",
            ..default_options()
        };
        let html = assemble_ssr_document(&opts);
        assert!(html.contains("<div id=\"app\"></div>"));
    }

    #[test]
    fn test_module_script_tag() {
        let html = assemble_ssr_document(&default_options());
        assert!(html.contains("<script type=\"module\" src=\"/src/app.tsx\"></script>"));
    }

    #[test]
    fn test_module_preload_for_entry() {
        let html = assemble_ssr_document(&default_options());
        assert!(html.contains("<link rel=\"modulepreload\" href=\"/src/app.tsx\""));
    }

    #[test]
    fn test_additional_preload_hints() {
        let hints = vec!["/@deps/@vertz/ui".to_string()];
        let opts = SsrHtmlOptions {
            preload_hints: &hints,
            ..default_options()
        };
        let html = assemble_ssr_document(&opts);
        assert!(html.contains("<link rel=\"modulepreload\" href=\"/@deps/@vertz/ui\""));
    }

    #[test]
    fn test_theme_css_in_head() {
        let opts = SsrHtmlOptions {
            theme_css: Some("body { margin: 0; }"),
            ..default_options()
        };
        let html = assemble_ssr_document(&opts);
        assert!(html.contains("<style data-vertz-theme>body { margin: 0; }</style>"));
    }

    #[test]
    fn test_inline_css_in_head() {
        let opts = SsrHtmlOptions {
            inline_css: "  <style data-vertz-ssr>.btn { color: red; }</style>\n",
            ..default_options()
        };
        let html = assemble_ssr_document(&opts);
        assert!(html.contains("<style data-vertz-ssr>.btn { color: red; }</style>"));
    }

    #[test]
    fn test_css_before_content() {
        let opts = SsrHtmlOptions {
            theme_css: Some("body { margin: 0; }"),
            inline_css: "  <style data-vertz-ssr>.btn { color: red; }</style>\n",
            ..default_options()
        };
        let html = assemble_ssr_document(&opts);

        let css_pos = html.find("data-vertz-theme").unwrap();
        let content_pos = html.find("<div id=\"app\">").unwrap();
        assert!(
            css_pos < content_pos,
            "CSS should be in <head> before content in <body>"
        );
    }

    #[test]
    fn test_hmr_scripts_included_when_enabled() {
        let opts = SsrHtmlOptions {
            enable_hmr: true,
            ..default_options()
        };
        let html = assemble_ssr_document(&opts);
        assert!(html.contains("__vertz_hmr"), "Should include HMR client");
        assert!(
            html.contains("vertz:fast-refresh"),
            "Should include Fast Refresh runtime"
        );
    }

    #[test]
    fn test_hmr_scripts_excluded_when_disabled() {
        let opts = SsrHtmlOptions {
            enable_hmr: false,
            ..default_options()
        };
        let html = assemble_ssr_document(&opts);
        assert!(
            !html.contains("__vertz_hmr"),
            "Should NOT include HMR client"
        );
    }

    #[test]
    fn test_hmr_scripts_before_app_module() {
        let opts = SsrHtmlOptions {
            enable_hmr: true,
            ..default_options()
        };
        let html = assemble_ssr_document(&opts);

        let hmr_pos = html.find("__vertz_hmr").unwrap();
        let module_pos = html.find("<script type=\"module\" src=").unwrap();
        assert!(
            hmr_pos < module_pos,
            "HMR scripts should come before the app module"
        );
    }

    #[test]
    fn test_title_escaping() {
        let opts = SsrHtmlOptions {
            title: "App <script>xss</script>",
            ..default_options()
        };
        let html = assemble_ssr_document(&opts);
        assert!(html.contains("&lt;script&gt;"));
        assert!(!html.contains("<script>xss</script>"));
    }

    #[test]
    fn test_entry_path_to_url() {
        let url = entry_path_to_url(
            &PathBuf::from("/project/src/app.tsx"),
            &PathBuf::from("/project"),
        );
        assert_eq!(url, "/src/app.tsx");
    }

    #[test]
    fn test_entry_path_to_url_nested() {
        let url = entry_path_to_url(
            &PathBuf::from("/project/src/pages/home.tsx"),
            &PathBuf::from("/project"),
        );
        assert_eq!(url, "/src/pages/home.tsx");
    }

    #[test]
    fn test_complete_ssr_document() {
        let hints = vec!["/@deps/@vertz/ui".to_string()];
        let opts = SsrHtmlOptions {
            title: "Task Manager",
            ssr_content: "<h1>Tasks</h1><ul><li>Task 1</li></ul>",
            inline_css: "  <style data-vertz-ssr>.task { color: blue; }</style>\n",
            theme_css: Some("body { margin: 0; font-family: sans-serif; }"),
            entry_url: "/src/app.tsx",
            preload_hints: &hints,
            enable_hmr: true,
            ssr_data: None,
            head_tags: None,
        };
        let html = assemble_ssr_document(&opts);

        // Verify document structure order
        let doctype_pos = html.find("<!DOCTYPE html>").unwrap();
        let head_pos = html.find("<head>").unwrap();
        let theme_pos = html.find("data-vertz-theme").unwrap();
        let component_css_pos = html.find("data-vertz-ssr").unwrap();
        let body_pos = html.find("<body>").unwrap();
        let app_pos = html.find("<div id=\"app\">").unwrap();
        let hmr_pos = html.find("__vertz_hmr").unwrap();
        let module_pos = html.find("<script type=\"module\"").unwrap();

        assert!(doctype_pos < head_pos);
        assert!(head_pos < theme_pos);
        assert!(theme_pos < component_css_pos);
        assert!(component_css_pos < body_pos);
        assert!(body_pos < app_pos);
        assert!(app_pos < hmr_pos);
        assert!(hmr_pos < module_pos);

        // Verify content
        assert!(html.contains("<h1>Tasks</h1>"));
        assert!(html.contains("<li>Task 1</li>"));
    }

    #[test]
    fn test_html_document_includes_ssr_data_script() {
        let opts = SsrHtmlOptions {
            ssr_data: Some(r#"[{"key":"tasks","data":[{"id":1}]}]"#),
            ..default_options()
        };
        let html = assemble_ssr_document(&opts);
        assert!(
            html.contains(
                r#"<script>window.__VERTZ_SSR_DATA__=[{"key":"tasks","data":[{"id":1}]}]</script>"#
            ),
            "Should contain SSR data script. HTML: {}",
            html
        );
    }

    #[test]
    fn test_html_document_omits_ssr_data_when_none() {
        let opts = SsrHtmlOptions {
            ssr_data: None,
            ..default_options()
        };
        let html = assemble_ssr_document(&opts);
        assert!(
            !html.contains("__VERTZ_SSR_DATA__"),
            "Should NOT contain SSR data when None"
        );
    }

    #[test]
    fn test_html_document_includes_head_tags() {
        let opts = SsrHtmlOptions {
            head_tags: Some(r#"<link rel="preload" href="/font.woff2" as="font" crossorigin />"#),
            ..default_options()
        };
        let html = assemble_ssr_document(&opts);
        assert!(
            html.contains(r#"<link rel="preload" href="/font.woff2" as="font" crossorigin />"#),
            "Should contain head tags"
        );
        let head_end = html.find("</head>").unwrap();
        let tag_pos = html.find("font.woff2").unwrap();
        assert!(tag_pos < head_end, "Head tags should be in <head>");
    }

    #[test]
    fn test_html_document_omits_head_tags_when_none() {
        let opts = SsrHtmlOptions {
            head_tags: None,
            ..default_options()
        };
        let html = assemble_ssr_document(&opts);
        assert!(
            !html.contains("font.woff2"),
            "Should NOT contain head tags when None"
        );
    }

    #[test]
    fn test_ssr_data_before_closing_body() {
        let opts = SsrHtmlOptions {
            ssr_data: Some(r#"[{"key":"k","data":"v"}]"#),
            ..default_options()
        };
        let html = assemble_ssr_document(&opts);
        let data_pos = html.find("__VERTZ_SSR_DATA__").unwrap();
        let body_end = html.find("</body>").unwrap();
        let app_pos = html.find("<div id=\"app\">").unwrap();
        assert!(data_pos > app_pos, "SSR data should be after app content");
        assert!(data_pos < body_end, "SSR data should be before </body>");
    }
}
