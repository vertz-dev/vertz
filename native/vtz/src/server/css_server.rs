use crate::compiler::pipeline::CssStore;

/// Extract the CSS key from a `/@css/` URL path.
///
/// `/@css/src_components_Button.tsx.css` → `src_components_Button.tsx.css`
pub fn extract_css_key(path: &str) -> Option<String> {
    path.strip_prefix("/@css/").map(|s| s.to_string())
}

/// Look up CSS content from the shared CSS store.
pub fn get_css_content(key: &str, css_store: &CssStore) -> Option<String> {
    css_store
        .read()
        .ok()
        .and_then(|store| store.get(key).cloned())
}

/// Resolve relative paths in CSS `@import` statements to absolute URL paths.
///
/// Handles both `@import './file.css'` and `@import url('./file.css')` forms.
/// Leaves absolute URLs (http://, https://) unchanged.
fn resolve_css_imports(css_content: &str, file_url: &str) -> String {
    let dir = file_url.rsplit_once('/').map(|(d, _)| d).unwrap_or("");

    let mut result = String::with_capacity(css_content.len());
    for line in css_content.lines() {
        let trimmed = line.trim();
        if trimmed.starts_with("@import") {
            result.push_str(&resolve_import_line(line, dir));
        } else {
            result.push_str(line);
        }
        result.push('\n');
    }
    // Remove trailing newline if original didn't have one
    if !css_content.ends_with('\n') && result.ends_with('\n') {
        result.pop();
    }
    result
}

/// Resolve a single @import line's relative path.
fn resolve_import_line(line: &str, base_dir: &str) -> String {
    // @import url('./path.css'); or @import url("./path.css");
    if let Some(url_start) = line.find("url(") {
        let after_url = &line[url_start + 4..];
        let (quote, rest) = if after_url.starts_with('\'') || after_url.starts_with('"') {
            (Some(after_url.chars().next().unwrap()), &after_url[1..])
        } else {
            (None, after_url)
        };

        let end_char = quote.unwrap_or(')');
        if let Some(end_pos) = rest.find(end_char) {
            let path = &rest[..end_pos];
            if path.starts_with("./") || path.starts_with("../") {
                let resolved = resolve_relative_url(base_dir, path);
                let before = &line[..url_start];
                let after_path = if quote.is_some() {
                    &line[url_start + 4 + 1 + end_pos + 1..] // url('...')
                } else {
                    &line[url_start + 4 + end_pos..] // url(...)
                };
                return if let Some(q) = quote {
                    format!("{}url({q}{}{q}{}", before, resolved, after_path)
                } else {
                    format!("{}url({}{}", before, resolved, after_path)
                };
            }
        }
        return line.to_string();
    }

    // @import './path.css'; or @import "./path.css";
    let after_import = line.trim_start().strip_prefix("@import").unwrap_or("");
    let after_ws = after_import.trim_start();
    if after_ws.starts_with('\'') || after_ws.starts_with('"') {
        let quote = after_ws.chars().next().unwrap();
        let rest = &after_ws[1..];
        if let Some(end_pos) = rest.find(quote) {
            let path = &rest[..end_pos];
            if path.starts_with("./") || path.starts_with("../") {
                let resolved = resolve_relative_url(base_dir, path);
                // Reconstruct: preserve leading whitespace
                let leading_ws = &line[..line.len() - line.trim_start().len()];
                let after_path = &rest[end_pos..]; // includes closing quote + rest
                return format!("{}@import {}{}{}", leading_ws, quote, resolved, after_path);
            }
        }
    }

    line.to_string()
}

/// Resolve a relative URL path against a base directory URL.
fn resolve_relative_url(base_dir: &str, relative: &str) -> String {
    let parts: Vec<&str> = base_dir.split('/').filter(|s| !s.is_empty()).collect();
    let mut stack: Vec<&str> = parts;

    for segment in relative.split('/') {
        match segment {
            "." | "" => {}
            ".." => {
                stack.pop();
            }
            s => stack.push(s),
        }
    }

    format!("/{}", stack.join("/"))
}

/// Convert a CSS file into a JavaScript module that injects a `<style>` tag.
///
/// The generated module:
/// 1. Creates (or updates) a `<style>` element in `<head>` identified by the file URL
/// 2. Exports the raw CSS string as the default export
/// 3. On HMR re-import, replaces the existing style content (no duplicates)
pub fn css_to_js_module(css_content: &str, file_url: &str) -> String {
    // Resolve relative @import paths before escaping
    let css_with_resolved_imports = resolve_css_imports(css_content, file_url);

    // Escape backticks, backslashes, and ${} in CSS for use inside a JS template literal
    let escaped = css_with_resolved_imports
        .replace('\\', "\\\\")
        .replace('`', "\\`")
        .replace("${", "\\${");

    // Sanitize the file URL for use as a JS string and DOM id
    let safe_id = file_url.replace('"', "%22").replace('\\', "/");

    format!(
        r#"const __vtz_css_id = "__vtz_css_{id}";
const __vtz_css = `{css}`;
(function() {{
  var existing = document.getElementById(__vtz_css_id);
  if (existing) {{
    existing.textContent = __vtz_css;
  }} else {{
    var style = document.createElement('style');
    style.id = __vtz_css_id;
    style.setAttribute('data-vtz-css', '');
    style.textContent = __vtz_css;
    document.head.appendChild(style);
  }}
}})();
export default __vtz_css;
"#,
        id = safe_id,
        css = escaped,
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashMap;
    use std::sync::{Arc, RwLock};

    #[test]
    fn test_extract_css_key() {
        assert_eq!(
            extract_css_key("/@css/src_components_Button.tsx.css"),
            Some("src_components_Button.tsx.css".to_string())
        );
    }

    #[test]
    fn test_extract_css_key_missing_prefix() {
        assert_eq!(extract_css_key("/src/app.tsx"), None);
        assert_eq!(extract_css_key("/@deps/zod"), None);
    }

    #[test]
    fn test_get_css_content_found() {
        let store: CssStore = Arc::new(RwLock::new(HashMap::new()));
        store
            .write()
            .unwrap()
            .insert("button.css".to_string(), ".btn { color: red; }".to_string());

        let result = get_css_content("button.css", &store);
        assert_eq!(result, Some(".btn { color: red; }".to_string()));
    }

    #[test]
    fn test_get_css_content_not_found() {
        let store: CssStore = Arc::new(RwLock::new(HashMap::new()));

        let result = get_css_content("nonexistent.css", &store);
        assert_eq!(result, None);
    }

    #[test]
    fn test_css_to_js_module_wraps_css_in_style_injection() {
        let css = "body { margin: 0; }";
        let js = css_to_js_module(css, "/src/App.css");

        assert!(
            js.contains("body { margin: 0; }"),
            "JS should contain the CSS content"
        );
        assert!(
            js.contains("__vtz_css___src_App.css") || js.contains("__vtz_css_/src/App.css"),
            "JS should contain a unique style ID"
        );
        assert!(
            js.contains("document.createElement('style')"),
            "JS should create a style element"
        );
        assert!(
            js.contains("document.head.appendChild"),
            "JS should append to head"
        );
        assert!(
            js.contains("export default"),
            "JS should export the CSS string"
        );
    }

    #[test]
    fn test_css_to_js_module_escapes_backticks() {
        let css = "div::after { content: `hello`; }";
        let js = css_to_js_module(css, "/src/test.css");

        assert!(
            !js.contains("content: `hello`"),
            "Backticks should be escaped"
        );
        assert!(
            js.contains("content: \\`hello\\`"),
            "Backticks should be escaped with backslash"
        );
    }

    #[test]
    fn test_css_to_js_module_escapes_template_expressions() {
        let css = "div { --var: ${something}; }";
        let js = css_to_js_module(css, "/src/test.css");

        assert!(
            js.contains("\\${something}"),
            "Template expressions should be escaped"
        );
    }

    #[test]
    fn test_css_to_js_module_resolves_at_import_paths() {
        let css = r#"@import './reset.css';
@import url('./components/buttons.css');
body { margin: 0; }"#;
        let js = css_to_js_module(css, "/src/App.css");

        // @import paths should be resolved relative to the CSS file's directory
        assert!(
            js.contains("@import '/src/reset.css'") || js.contains("@import url('/src/reset.css')"),
            "Relative @import should be resolved. JS:\n{}",
            js
        );
        assert!(
            js.contains("@import '/src/components/buttons.css'")
                || js.contains("@import url('/src/components/buttons.css')"),
            "Relative @import url() should be resolved. JS:\n{}",
            js
        );
    }

    #[test]
    fn test_css_to_js_module_resolves_parent_dir_imports() {
        let css = "@import '../shared/reset.css';";
        let js = css_to_js_module(css, "/src/components/App.css");

        assert!(
            js.contains("@import '/src/shared/reset.css'"),
            "Parent dir @import should resolve correctly. JS:\n{}",
            js
        );
    }

    #[test]
    fn test_css_to_js_module_preserves_absolute_at_imports() {
        let css = r#"@import 'https://fonts.googleapis.com/css2?family=Inter';
body { font-family: Inter; }"#;
        let js = css_to_js_module(css, "/src/App.css");

        assert!(
            js.contains("https://fonts.googleapis.com"),
            "Absolute @import URLs should be preserved"
        );
    }

    #[test]
    fn test_css_to_js_module_handles_empty_css() {
        let js = css_to_js_module("", "/src/empty.css");
        assert!(
            js.contains("export default __vtz_css"),
            "Empty CSS should still produce a valid JS module"
        );
        assert!(
            js.contains("const __vtz_css = ``"),
            "Empty CSS should produce an empty template literal"
        );
    }

    #[test]
    fn test_css_to_js_module_updates_existing_style_on_reimport() {
        let js = css_to_js_module("body { color: red; }", "/src/style.css");

        // Should check for existing element before creating new one
        assert!(
            js.contains("document.getElementById(__vtz_css_id)"),
            "Should look up existing style"
        );
        assert!(
            js.contains("existing.textContent = __vtz_css"),
            "Should update existing style"
        );
    }
}
