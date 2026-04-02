use std::path::Path;

/// Known file paths where Vertz apps store their theme CSS.
///
/// These paths are checked in order. The first file found is loaded.
const THEME_CSS_PATHS: &[&str] = &[
    "src/styles/theme.css",
    "src/theme.css",
    "src/styles/globals.css",
    "src/globals.css",
    "public/theme.css",
    "public/globals.css",
];

/// Load theme CSS from the project root directory.
///
/// Searches for theme CSS files in known locations. Returns `None` if no
/// theme CSS is found.
///
/// The theme CSS typically includes:
/// - CSS reset/normalize
/// - CSS custom properties (--color-primary, --color-background, etc.)
/// - Font imports
/// - Base element styles
pub fn load_theme_css(root_dir: &Path) -> Option<String> {
    for rel_path in THEME_CSS_PATHS {
        let full_path = root_dir.join(rel_path);
        if full_path.is_file() {
            match std::fs::read_to_string(&full_path) {
                Ok(content) if !content.trim().is_empty() => {
                    eprintln!("[vertz] Loaded theme CSS from {}", rel_path);
                    return Some(content);
                }
                _ => continue,
            }
        }
    }

    None
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    #[test]
    fn test_load_theme_css_from_src_styles() {
        let tmp = tempfile::tempdir().unwrap();
        let styles_dir = tmp.path().join("src/styles");
        std::fs::create_dir_all(&styles_dir).unwrap();
        std::fs::write(
            styles_dir.join("theme.css"),
            ":root {\n  --color-primary: #3b82f6;\n  --color-background: #ffffff;\n}\n",
        )
        .unwrap();

        let result = load_theme_css(tmp.path());
        assert!(result.is_some());
        let css = result.unwrap();
        assert!(css.contains("--color-primary"));
        assert!(css.contains("--color-background"));
    }

    #[test]
    fn test_load_theme_css_from_src_globals() {
        let tmp = tempfile::tempdir().unwrap();
        let src_dir = tmp.path().join("src");
        std::fs::create_dir_all(&src_dir).unwrap();
        std::fs::write(
            src_dir.join("globals.css"),
            "* { margin: 0; box-sizing: border-box; }\n",
        )
        .unwrap();

        let result = load_theme_css(tmp.path());
        assert!(result.is_some());
        assert!(result.unwrap().contains("margin: 0"));
    }

    #[test]
    fn test_load_theme_css_priority_order() {
        let tmp = tempfile::tempdir().unwrap();
        let styles_dir = tmp.path().join("src/styles");
        let src_dir = tmp.path().join("src");
        std::fs::create_dir_all(&styles_dir).unwrap();
        std::fs::create_dir_all(&src_dir).unwrap();

        // Both files exist — src/styles/theme.css should win (first in priority)
        std::fs::write(styles_dir.join("theme.css"), "/* from theme.css */\n").unwrap();
        std::fs::write(src_dir.join("globals.css"), "/* from globals.css */\n").unwrap();

        let result = load_theme_css(tmp.path());
        assert!(result.is_some());
        assert!(result.unwrap().contains("from theme.css"));
    }

    #[test]
    fn test_load_theme_css_returns_none_when_missing() {
        let tmp = tempfile::tempdir().unwrap();
        let result = load_theme_css(tmp.path());
        assert!(result.is_none());
    }

    #[test]
    fn test_load_theme_css_skips_empty_files() {
        let tmp = tempfile::tempdir().unwrap();
        let styles_dir = tmp.path().join("src/styles");
        std::fs::create_dir_all(&styles_dir).unwrap();

        // Empty file should be skipped
        std::fs::write(styles_dir.join("theme.css"), "   \n  \n").unwrap();

        let result = load_theme_css(tmp.path());
        assert!(result.is_none());
    }

    #[test]
    fn test_load_theme_css_nonexistent_dir() {
        let result = load_theme_css(&PathBuf::from("/nonexistent/path"));
        assert!(result.is_none());
    }
}
