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
}
