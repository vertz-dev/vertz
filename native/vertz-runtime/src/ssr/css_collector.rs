/// CSS collection during SSR rendering.
///
/// During SSR, components inject CSS via `css()` / `variants()` calls.
/// The DOM shim intercepts these injections via `__vertz_inject_css()`.
/// This module retrieves the collected CSS and formats it as inline
/// `<style>` tags for the SSR HTML `<head>`.
use std::collections::HashSet;

/// A collected CSS entry from SSR rendering.
#[derive(Debug, Clone, PartialEq)]
pub struct CssEntry {
    /// The CSS content.
    pub css: String,
    /// Optional deduplication ID.
    pub id: Option<String>,
}

/// Collect CSS that was injected during SSR rendering.
///
/// Reads from the `__vertz_get_collected_css()` global that the DOM shim populates.
pub fn collect_css(
    runtime: &mut crate::runtime::js_runtime::VertzJsRuntime,
) -> Result<Vec<CssEntry>, deno_core::error::AnyError> {
    let result = runtime.execute_script(
        "[vertz:collect-css]",
        r#"
        (function() {
            const entries = __vertz_get_collected_css();
            return entries.map(e => ({ css: e.css, id: e.id }));
        })()
        "#,
    )?;

    let entries: Vec<CssEntry> = if let serde_json::Value::Array(arr) = result {
        arr.into_iter()
            .map(|v| CssEntry {
                css: v["css"].as_str().unwrap_or("").to_string(),
                id: v["id"].as_str().map(|s| s.to_string()),
            })
            .collect()
    } else {
        Vec::new()
    };

    Ok(entries)
}

/// Clear collected CSS after retrieval.
pub fn clear_css(
    runtime: &mut crate::runtime::js_runtime::VertzJsRuntime,
) -> Result<(), deno_core::error::AnyError> {
    runtime.execute_script_void("[vertz:clear-css]", "__vertz_clear_collected_css();")
}

/// Format collected CSS entries as inline `<style>` tags.
///
/// Deduplicates entries by ID and concatenates into a single `<style>` block
/// for efficiency (fewer DOM nodes for the browser to parse).
pub fn format_css_as_style_tags(entries: &[CssEntry]) -> String {
    if entries.is_empty() {
        return String::new();
    }

    let mut seen_ids = HashSet::new();
    let mut css_parts = Vec::new();

    for entry in entries {
        // Skip duplicates by ID
        if let Some(ref id) = entry.id {
            if !seen_ids.insert(id.clone()) {
                continue;
            }
        }

        if !entry.css.is_empty() {
            css_parts.push(entry.css.as_str());
        }
    }

    if css_parts.is_empty() {
        return String::new();
    }

    // Single <style> tag with all CSS concatenated
    format!("  <style data-vertz-ssr>{}</style>\n", css_parts.join("\n"))
}

/// Format CSS entries as individual `<style>` tags (useful for debugging).
pub fn format_css_as_individual_style_tags(entries: &[CssEntry]) -> String {
    if entries.is_empty() {
        return String::new();
    }

    let mut seen_ids = HashSet::new();
    let mut result = String::new();

    for entry in entries {
        if let Some(ref id) = entry.id {
            if !seen_ids.insert(id.clone()) {
                continue;
            }
        }

        if !entry.css.is_empty() {
            if let Some(ref id) = entry.id {
                result.push_str(&format!(
                    "  <style data-vertz-ssr data-css-id=\"{}\">{}</style>\n",
                    id, entry.css
                ));
            } else {
                result.push_str(&format!("  <style data-vertz-ssr>{}</style>\n", entry.css));
            }
        }
    }

    result
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::runtime::js_runtime::{VertzJsRuntime, VertzRuntimeOptions};
    use crate::ssr::dom_shim::load_dom_shim;

    fn create_runtime_with_shim() -> VertzJsRuntime {
        let mut rt = VertzJsRuntime::new(VertzRuntimeOptions {
            capture_output: true,
            ..Default::default()
        })
        .unwrap();
        load_dom_shim(&mut rt).unwrap();
        rt
    }

    #[test]
    fn test_collect_css_empty() {
        let mut rt = create_runtime_with_shim();
        let entries = collect_css(&mut rt).unwrap();
        assert!(entries.is_empty());
    }

    #[test]
    fn test_collect_css_after_injection() {
        let mut rt = create_runtime_with_shim();
        rt.execute_script_void(
            "<test>",
            r#"
            __vertz_inject_css('.btn { color: red; }', 'btn-1');
            __vertz_inject_css('.card { padding: 8px; }', 'card-1');
            "#,
        )
        .unwrap();

        let entries = collect_css(&mut rt).unwrap();
        assert_eq!(entries.len(), 2);
        assert_eq!(entries[0].css, ".btn { color: red; }");
        assert_eq!(entries[0].id, Some("btn-1".to_string()));
        assert_eq!(entries[1].css, ".card { padding: 8px; }");
        assert_eq!(entries[1].id, Some("card-1".to_string()));
    }

    #[test]
    fn test_collect_css_deduplicates_by_id() {
        let mut rt = create_runtime_with_shim();
        rt.execute_script_void(
            "<test>",
            r#"
            __vertz_inject_css('.btn { color: red; }', 'btn-1');
            __vertz_inject_css('.btn { color: red; }', 'btn-1');
            __vertz_inject_css('.btn { color: blue; }', 'btn-1');
            "#,
        )
        .unwrap();

        // Only 1 entry in the collected list (DOM shim deduplicates)
        let entries = collect_css(&mut rt).unwrap();
        assert_eq!(entries.len(), 1);
    }

    #[test]
    fn test_clear_css() {
        let mut rt = create_runtime_with_shim();
        rt.execute_script_void(
            "<test>",
            "__vertz_inject_css('.foo { color: blue; }', 'foo');",
        )
        .unwrap();

        let before = collect_css(&mut rt).unwrap();
        assert_eq!(before.len(), 1);

        clear_css(&mut rt).unwrap();

        let after = collect_css(&mut rt).unwrap();
        assert!(after.is_empty());
    }

    #[test]
    fn test_format_css_as_style_tags_empty() {
        let result = format_css_as_style_tags(&[]);
        assert!(result.is_empty());
    }

    #[test]
    fn test_format_css_as_style_tags_single() {
        let entries = vec![CssEntry {
            css: ".btn { color: red; }".to_string(),
            id: Some("btn-1".to_string()),
        }];
        let result = format_css_as_style_tags(&entries);
        assert_eq!(
            result,
            "  <style data-vertz-ssr>.btn { color: red; }</style>\n"
        );
    }

    #[test]
    fn test_format_css_as_style_tags_multiple() {
        let entries = vec![
            CssEntry {
                css: ".btn { color: red; }".to_string(),
                id: Some("btn-1".to_string()),
            },
            CssEntry {
                css: ".card { padding: 8px; }".to_string(),
                id: Some("card-1".to_string()),
            },
        ];
        let result = format_css_as_style_tags(&entries);
        assert!(result.contains(".btn { color: red; }"));
        assert!(result.contains(".card { padding: 8px; }"));
        assert!(result.contains("data-vertz-ssr"));
    }

    #[test]
    fn test_format_css_deduplicates() {
        let entries = vec![
            CssEntry {
                css: ".btn { color: red; }".to_string(),
                id: Some("btn-1".to_string()),
            },
            CssEntry {
                css: ".btn { color: red; }".to_string(),
                id: Some("btn-1".to_string()),
            },
        ];
        let result = format_css_as_style_tags(&entries);
        // Should only appear once
        assert_eq!(
            result.matches(".btn { color: red; }").count(),
            1,
            "CSS should be deduplicated"
        );
    }

    #[test]
    fn test_format_css_skips_empty() {
        let entries = vec![
            CssEntry {
                css: "".to_string(),
                id: Some("empty".to_string()),
            },
            CssEntry {
                css: ".btn { color: red; }".to_string(),
                id: Some("btn".to_string()),
            },
        ];
        let result = format_css_as_style_tags(&entries);
        assert!(result.contains(".btn { color: red; }"));
        assert_eq!(result.matches("<style").count(), 1);
    }

    #[test]
    fn test_format_individual_style_tags() {
        let entries = vec![
            CssEntry {
                css: ".btn { color: red; }".to_string(),
                id: Some("btn-1".to_string()),
            },
            CssEntry {
                css: ".card { padding: 8px; }".to_string(),
                id: Some("card-1".to_string()),
            },
        ];
        let result = format_css_as_individual_style_tags(&entries);
        assert!(result.contains(r#"data-css-id="btn-1""#));
        assert!(result.contains(r#"data-css-id="card-1""#));
        assert_eq!(result.matches("<style").count(), 2);
    }
}
