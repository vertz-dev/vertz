/// Component-level rendering utilities for the MCP `vertz_render_component` tool.
///
/// Provides:
/// - Minimal HTML document assembly (theme + component CSS only, no HMR/SSR data)
/// - Path validation (reject paths outside project root)
use std::path::{Path, PathBuf};

/// Options for assembling a component-level HTML document.
pub struct ComponentHtmlOptions<'a> {
    /// Theme CSS from the project (loaded at server startup).
    pub theme_css: Option<&'a str>,
    /// CSS collected during the component render.
    pub component_css: &'a str,
    /// Pre-rendered HTML content from the component.
    pub rendered_html: &'a str,
}

/// Assemble a minimal HTML document for a component render.
///
/// Unlike [`super::html_document::assemble_ssr_document`], this produces a
/// minimal shell with no HMR scripts, SSR data, entry scripts, or preload hints.
/// Only theme CSS, component CSS, and the rendered HTML are included.
pub fn assemble_component_document(options: &ComponentHtmlOptions<'_>) -> String {
    let mut html = String::with_capacity(2048);

    html.push_str("<!DOCTYPE html>\n");
    html.push_str("<html lang=\"en\">\n");
    html.push_str("<head>\n");
    html.push_str("  <meta charset=\"UTF-8\" />\n");
    html.push_str(
        "  <meta name=\"viewport\" content=\"width=device-width, initial-scale=1.0\" />\n",
    );

    if let Some(theme) = options.theme_css {
        if !theme.is_empty() {
            html.push_str("  <style data-vertz-theme>");
            html.push_str(&sanitize_css_for_style_tag(theme));
            html.push_str("</style>\n");
        }
    }

    if !options.component_css.is_empty() {
        html.push_str("  <style data-vertz-component>");
        html.push_str(&sanitize_css_for_style_tag(options.component_css));
        html.push_str("</style>\n");
    }

    html.push_str("</head>\n");
    html.push_str("<body>\n");
    html.push_str("  <div id=\"app\">");
    html.push_str(options.rendered_html);
    html.push_str("</div>\n");
    html.push_str("</body>\n");
    html.push_str("</html>");

    html
}

/// Escape `</style>` sequences in CSS content to prevent premature tag closure.
///
/// Replaces `</style` (case-insensitive) with `<\/style` which is valid CSS
/// (backslash is ignored in CSS string contexts) and prevents the HTML parser
/// from closing the `<style>` tag early.
fn sanitize_css_for_style_tag(css: &str) -> String {
    // Case-insensitive search for </style (the > and whitespace variants are all
    // dangerous). The HTML parser looks for `</` followed by the tag name.
    let lower = css.to_lowercase();
    if !lower.contains("</style") {
        return css.to_string();
    }

    let mut result = String::with_capacity(css.len() + 16);
    let bytes = css.as_bytes();
    let mut i = 0;
    while i < bytes.len() {
        if i + 7 <= bytes.len() && lower[i..].starts_with("</style") {
            result.push_str("<\\/style");
            i += 7; // skip the 7 input chars "</style"
        } else {
            result.push(bytes[i] as char);
            i += 1;
        }
    }
    result
}

/// Validate that a component file path is within the project root.
///
/// Resolves relative paths against `root_dir`, canonicalizes, and rejects
/// any path that escapes the project directory (e.g., `../../etc/passwd`).
pub fn validate_component_path(file: &str, root_dir: &Path) -> Result<PathBuf, String> {
    let abs_path = if Path::new(file).is_absolute() {
        PathBuf::from(file)
    } else {
        root_dir.join(file)
    };

    let canonical = abs_path
        .canonicalize()
        .map_err(|_| format!("Component file not found: {}", file))?;

    // Canonicalize root_dir too for accurate comparison (handles symlinks).
    // Fail explicitly if root_dir doesn't exist — silent fallback could let
    // path traversals slip through when the un-canonicalized root is a prefix
    // of the canonical file path by coincidence.
    let canonical_root = root_dir
        .canonicalize()
        .map_err(|_| format!("Project root directory not found: {}", root_dir.display()))?;

    if !canonical.starts_with(&canonical_root) {
        return Err(format!(
            "File path must be within the project directory. Received: {}",
            file
        ));
    }

    Ok(canonical)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    // ── assemble_component_document tests ─────────────────────────────

    #[test]
    fn basic_structure() {
        let html = assemble_component_document(&ComponentHtmlOptions {
            theme_css: None,
            component_css: "",
            rendered_html: "",
        });

        assert!(html.contains("<!DOCTYPE html>"));
        assert!(html.contains("<html lang=\"en\">"));
        assert!(html.contains("<head>"));
        assert!(html.contains("</head>"));
        assert!(html.contains("<body>"));
        assert!(html.contains("</body>"));
        assert!(html.contains("<div id=\"app\">"));
        assert!(html.contains("</html>"));
    }

    #[test]
    fn theme_css_injected() {
        let html = assemble_component_document(&ComponentHtmlOptions {
            theme_css: Some(":root { --bg: white; }"),
            component_css: "",
            rendered_html: "",
        });

        assert!(html.contains("<style data-vertz-theme>:root { --bg: white; }</style>"));
    }

    #[test]
    fn no_theme_style_when_none() {
        let html = assemble_component_document(&ComponentHtmlOptions {
            theme_css: None,
            component_css: "",
            rendered_html: "",
        });

        assert!(!html.contains("data-vertz-theme"));
    }

    #[test]
    fn no_theme_style_when_empty() {
        let html = assemble_component_document(&ComponentHtmlOptions {
            theme_css: Some(""),
            component_css: "",
            rendered_html: "",
        });

        assert!(!html.contains("data-vertz-theme"));
    }

    #[test]
    fn component_css_injected() {
        let html = assemble_component_document(&ComponentHtmlOptions {
            theme_css: None,
            component_css: ".card { padding: 8px; }",
            rendered_html: "",
        });

        assert!(html.contains("<style data-vertz-component>.card { padding: 8px; }</style>"));
    }

    #[test]
    fn no_component_style_when_empty() {
        let html = assemble_component_document(&ComponentHtmlOptions {
            theme_css: None,
            component_css: "",
            rendered_html: "",
        });

        assert!(!html.contains("data-vertz-component"));
    }

    #[test]
    fn rendered_html_in_app_div() {
        let html = assemble_component_document(&ComponentHtmlOptions {
            theme_css: None,
            component_css: "",
            rendered_html: "<div class=\"card\">Hello</div>",
        });

        assert!(html.contains("<div id=\"app\"><div class=\"card\">Hello</div></div>"));
    }

    #[test]
    fn empty_rendered_html() {
        let html = assemble_component_document(&ComponentHtmlOptions {
            theme_css: None,
            component_css: "",
            rendered_html: "",
        });

        assert!(html.contains("<div id=\"app\"></div>"));
    }

    #[test]
    fn complete_assembly() {
        let html = assemble_component_document(&ComponentHtmlOptions {
            theme_css: Some(":root { --bg: #fff; }"),
            component_css: ".btn { color: blue; }",
            rendered_html: "<button class=\"btn\">Click</button>",
        });

        assert!(html.contains("data-vertz-theme"));
        assert!(html.contains("data-vertz-component"));
        assert!(html.contains("<button class=\"btn\">Click</button>"));
        // Theme CSS comes before component CSS
        let theme_pos = html.find("data-vertz-theme").unwrap();
        let component_pos = html.find("data-vertz-component").unwrap();
        assert!(theme_pos < component_pos);
    }

    #[test]
    fn no_hmr_scripts() {
        let html = assemble_component_document(&ComponentHtmlOptions {
            theme_css: Some("body {}"),
            component_css: ".x {}",
            rendered_html: "<p>test</p>",
        });

        assert!(!html.contains("__vertz_hmr"));
        assert!(!html.contains("fast-refresh"));
        assert!(!html.contains("error-overlay"));
        assert!(!html.contains("type=\"module\""));
    }

    #[test]
    fn no_ssr_data() {
        let html = assemble_component_document(&ComponentHtmlOptions {
            theme_css: None,
            component_css: "",
            rendered_html: "<p>test</p>",
        });

        assert!(!html.contains("__VERTZ_SSR_DATA__"));
    }

    // ── validate_component_path tests ─────────────────────────────────

    #[test]
    fn relative_path_resolved() {
        let tmp = tempfile::tempdir().unwrap();
        let file = tmp.path().join("src/Button.tsx");
        fs::create_dir_all(file.parent().unwrap()).unwrap();
        fs::write(&file, "export default function Button() {}").unwrap();

        let result = validate_component_path("src/Button.tsx", tmp.path());
        assert!(result.is_ok());
        assert_eq!(result.unwrap(), file.canonicalize().unwrap());
    }

    #[test]
    fn absolute_path_within_root() {
        let tmp = tempfile::tempdir().unwrap();
        let file = tmp.path().join("comp.tsx");
        fs::write(&file, "").unwrap();

        let abs_str = file.to_string_lossy().to_string();
        let result = validate_component_path(&abs_str, tmp.path());
        assert!(result.is_ok());
    }

    #[test]
    fn path_traversal_rejected() {
        let tmp = tempfile::tempdir().unwrap();
        // Create a file outside the root to make canonicalize succeed
        let outside = tmp.path().join("../outside.txt");
        fs::write(&outside, "").unwrap();

        let result = validate_component_path("../outside.txt", tmp.path());
        assert!(result.is_err());
        let err = result.unwrap_err();
        assert!(err.contains("must be within the project directory"));
    }

    #[test]
    fn nonexistent_file_error() {
        let tmp = tempfile::tempdir().unwrap();

        let result = validate_component_path("does-not-exist.tsx", tmp.path());
        assert!(result.is_err());
        let err = result.unwrap_err();
        assert!(err.contains("not found"));
    }

    #[test]
    fn file_in_subdirectory() {
        let tmp = tempfile::tempdir().unwrap();
        let file = tmp.path().join("src/components/deep/Card.tsx");
        fs::create_dir_all(file.parent().unwrap()).unwrap();
        fs::write(&file, "").unwrap();

        let result = validate_component_path("src/components/deep/Card.tsx", tmp.path());
        assert!(result.is_ok());
    }

    #[test]
    fn nonexistent_root_dir_returns_error() {
        // Use two separate temp dirs: one with the file, one as a bogus root.
        // Pass an absolute path to the file so canonicalize succeeds on the file,
        // but fails on the bogus root.
        let file_dir = tempfile::tempdir().unwrap();
        let file = file_dir.path().join("comp.tsx");
        fs::write(&file, "").unwrap();

        let bogus_root = file_dir.path().join("does-not-exist");
        let abs_file = file.to_string_lossy().to_string();
        let result = validate_component_path(&abs_file, &bogus_root);
        assert!(result.is_err());
        let err = result.unwrap_err();
        assert!(err.contains("Project root directory not found"));
    }

    // ── sanitize_css_for_style_tag tests ─────────────────────────────

    #[test]
    fn sanitize_css_no_style_tag() {
        assert_eq!(
            sanitize_css_for_style_tag(".card { color: red; }"),
            ".card { color: red; }"
        );
    }

    #[test]
    fn sanitize_css_escapes_closing_style() {
        let css = ".x { content: '</style>'; }";
        let sanitized = sanitize_css_for_style_tag(css);
        assert!(!sanitized.contains("</style>"));
        assert!(sanitized.contains("<\\/style"));
    }

    #[test]
    fn sanitize_css_case_insensitive() {
        let css = ".x { content: '</STYLE>'; }";
        let sanitized = sanitize_css_for_style_tag(css);
        assert!(!sanitized.contains("</STYLE>"));
    }

    #[test]
    fn sanitize_css_multiple_occurrences() {
        let css = "a</style>b</style>c";
        let sanitized = sanitize_css_for_style_tag(css);
        // No raw </style> should remain
        assert!(!sanitized.to_lowercase().contains("</style>"));
    }

    #[test]
    fn css_sanitization_used_in_assembly() {
        let html = assemble_component_document(&ComponentHtmlOptions {
            theme_css: None,
            component_css: ".x { content: '</style><script>alert(1)</script>'; }",
            rendered_html: "",
        });
        // The raw </style> must not appear — it would close the tag early
        assert!(!html.contains("</style><script>"));
    }
}
