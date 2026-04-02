use std::path::{Path, PathBuf};

use crate::compiler::import_rewriter::is_asset_extension;

/// Resolved path alias mappings from tsconfig.json `compilerOptions.paths`.
#[derive(Debug, Clone, Default)]
pub struct TsconfigPaths {
    /// Base URL for non-relative module lookups (absolute, resolved from tsconfig location).
    pub base_url: Option<PathBuf>,
    /// Path alias mappings: (pattern, list of replacement patterns).
    /// Patterns may contain a single `*` wildcard.
    pub paths: Vec<(String, Vec<String>)>,
}

impl TsconfigPaths {
    /// Returns true if there are no path aliases configured.
    pub fn is_empty(&self) -> bool {
        self.paths.is_empty()
    }

    /// Resolve a specifier against the configured path aliases.
    ///
    /// Returns the resolved file path if the specifier matches an alias and
    /// a matching file exists on disk. Tries each mapping in order (first match wins).
    /// Returns `None` if no alias matches or no file exists for any mapping.
    pub fn resolve_alias(&self, specifier: &str, root_dir: &Path) -> Option<PathBuf> {
        for (pattern, targets) in &self.paths {
            if let Some(captured) = match_alias_pattern(pattern, specifier) {
                for target in targets {
                    let resolved = substitute_wildcard(target, captured);
                    let base = self.base_url.as_deref().unwrap_or(root_dir);
                    let full_path = base.join(&resolved);
                    if let Some(found) = resolve_with_extensions(&full_path) {
                        return Some(found);
                    }
                }
            }
        }
        None
    }
}

/// Match a specifier against an alias pattern.
///
/// For wildcard patterns (e.g., `@/*`), returns the captured portion after the prefix.
/// For exact patterns, returns an empty string on match.
/// Returns `None` if the specifier doesn't match.
fn match_alias_pattern<'a>(pattern: &str, specifier: &'a str) -> Option<&'a str> {
    if let Some(prefix) = pattern.strip_suffix('*') {
        // Wildcard pattern: @/* matches @/anything
        specifier.strip_prefix(prefix)
    } else {
        // Exact match
        if specifier == pattern {
            Some("")
        } else {
            None
        }
    }
}

/// Substitute the wildcard capture into a target pattern.
///
/// For `./src/*` with capture `components/Button`, returns `./src/components/Button`.
/// For targets without `*`, returns the target as-is.
fn substitute_wildcard(target: &str, capture: &str) -> String {
    if let Some(prefix) = target.strip_suffix('*') {
        format!("{}{}", prefix, capture)
    } else {
        target.to_string()
    }
}

/// Try to resolve a path by adding extensions or finding index files.
fn resolve_with_extensions(path: &Path) -> Option<PathBuf> {
    // If path already has a known extension and exists
    if let Some(ext) = path.extension().and_then(|e| e.to_str()) {
        if (matches!(ext, "ts" | "tsx" | "js" | "jsx" | "mjs" | "css") || is_asset_extension(ext))
            && path.exists()
        {
            return Some(path.to_path_buf());
        }
    }

    // Try common extensions
    let extensions = [".tsx", ".ts", ".jsx", ".js", ".mjs"];
    for ext in &extensions {
        let with_ext = PathBuf::from(format!("{}{}", path.display(), ext));
        if with_ext.exists() {
            return Some(with_ext);
        }
    }

    // Try as directory with index files
    if path.is_dir() {
        let index_files = ["index.tsx", "index.ts", "index.jsx", "index.js"];
        for index in &index_files {
            let index_path = path.join(index);
            if index_path.exists() {
                return Some(index_path);
            }
        }
    }

    None
}

/// Parse tsconfig.json at the given path and extract path alias configuration.
///
/// Follows the `extends` chain to inherit paths from base configs.
/// Returns `TsconfigPaths` with resolved base_url and path mappings.
pub fn parse_tsconfig_paths(tsconfig_path: &Path) -> TsconfigPaths {
    let content = match std::fs::read_to_string(tsconfig_path) {
        Ok(c) => c,
        Err(_) => return TsconfigPaths::default(),
    };

    let json: serde_json::Value = match serde_json::from_str(&content) {
        Ok(v) => v,
        Err(_) => return TsconfigPaths::default(),
    };

    let tsconfig_dir = tsconfig_path.parent().unwrap_or(Path::new("."));

    // Follow `extends` chain first to get base config
    let mut result = if let Some(extends) = json.get("extends").and_then(|v| v.as_str()) {
        let base_path = tsconfig_dir.join(extends);
        // If extends doesn't end in .json, try appending it
        let base_path = if base_path.extension().is_none() {
            base_path.with_extension("json")
        } else {
            base_path
        };
        parse_tsconfig_paths(&base_path)
    } else {
        TsconfigPaths::default()
    };

    let compiler_options = match json.get("compilerOptions") {
        Some(co) => co,
        None => return result,
    };

    // Parse baseUrl (resolved relative to tsconfig location)
    if let Some(base_url) = compiler_options.get("baseUrl").and_then(|v| v.as_str()) {
        result.base_url = Some(tsconfig_dir.join(base_url));
    }

    // Parse paths — these override any inherited paths
    if let Some(paths_obj) = compiler_options.get("paths").and_then(|v| v.as_object()) {
        let mut paths = Vec::new();
        for (pattern, targets) in paths_obj {
            if let Some(arr) = targets.as_array() {
                let target_strings: Vec<String> = arr
                    .iter()
                    .filter_map(|v| v.as_str().map(String::from))
                    .collect();
                if !target_strings.is_empty() {
                    paths.push((pattern.clone(), target_strings));
                }
            }
        }
        result.paths = paths;
    }

    result
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_simple_paths() {
        let tmp = tempfile::tempdir().unwrap();
        let tsconfig = tmp.path().join("tsconfig.json");
        std::fs::write(
            &tsconfig,
            r#"{
                "compilerOptions": {
                    "paths": {
                        "@/*": ["./src/*"]
                    }
                }
            }"#,
        )
        .unwrap();

        let result = parse_tsconfig_paths(&tsconfig);

        assert_eq!(result.paths.len(), 1);
        assert_eq!(result.paths[0].0, "@/*");
        assert_eq!(result.paths[0].1, vec!["./src/*"]);
    }

    #[test]
    fn test_parse_base_url() {
        let tmp = tempfile::tempdir().unwrap();
        let tsconfig = tmp.path().join("tsconfig.json");
        std::fs::write(
            &tsconfig,
            r#"{
                "compilerOptions": {
                    "baseUrl": ".",
                    "paths": {
                        "@/*": ["./src/*"]
                    }
                }
            }"#,
        )
        .unwrap();

        let result = parse_tsconfig_paths(&tsconfig);

        assert_eq!(result.base_url, Some(tmp.path().join(".")));
    }

    #[test]
    fn test_parse_multiple_aliases() {
        let tmp = tempfile::tempdir().unwrap();
        let tsconfig = tmp.path().join("tsconfig.json");
        std::fs::write(
            &tsconfig,
            r#"{
                "compilerOptions": {
                    "paths": {
                        "@/*": ["./src/*"],
                        "@components/*": ["./src/components/*"]
                    }
                }
            }"#,
        )
        .unwrap();

        let result = parse_tsconfig_paths(&tsconfig);

        assert_eq!(result.paths.len(), 2);
    }

    #[test]
    fn test_parse_multiple_mappings_per_alias() {
        let tmp = tempfile::tempdir().unwrap();
        let tsconfig = tmp.path().join("tsconfig.json");
        std::fs::write(
            &tsconfig,
            r#"{
                "compilerOptions": {
                    "paths": {
                        "@/*": ["./src/*", "./generated/*"]
                    }
                }
            }"#,
        )
        .unwrap();

        let result = parse_tsconfig_paths(&tsconfig);

        assert_eq!(result.paths[0].1, vec!["./src/*", "./generated/*"]);
    }

    #[test]
    fn test_parse_extends_inherits_base_url() {
        let tmp = tempfile::tempdir().unwrap();

        // Base config
        let base = tmp.path().join("tsconfig.base.json");
        std::fs::write(
            &base,
            r#"{
                "compilerOptions": {
                    "baseUrl": "."
                }
            }"#,
        )
        .unwrap();

        // App config extends base and adds paths
        let app = tmp.path().join("tsconfig.json");
        std::fs::write(
            &app,
            r#"{
                "extends": "./tsconfig.base.json",
                "compilerOptions": {
                    "paths": {
                        "@/*": ["./src/*"]
                    }
                }
            }"#,
        )
        .unwrap();

        let result = parse_tsconfig_paths(&app);

        // baseUrl inherited from base config
        assert_eq!(result.base_url, Some(tmp.path().join(".")));
        // paths from app config
        assert_eq!(result.paths.len(), 1);
    }

    #[test]
    fn test_parse_extends_child_paths_override_parent() {
        let tmp = tempfile::tempdir().unwrap();

        let base = tmp.path().join("tsconfig.base.json");
        std::fs::write(
            &base,
            r#"{
                "compilerOptions": {
                    "paths": {
                        "@/*": ["./lib/*"]
                    }
                }
            }"#,
        )
        .unwrap();

        let app = tmp.path().join("tsconfig.json");
        std::fs::write(
            &app,
            r#"{
                "extends": "./tsconfig.base.json",
                "compilerOptions": {
                    "paths": {
                        "@/*": ["./src/*"]
                    }
                }
            }"#,
        )
        .unwrap();

        let result = parse_tsconfig_paths(&app);

        // Child paths override parent
        assert_eq!(result.paths[0].1, vec!["./src/*"]);
    }

    #[test]
    fn test_parse_missing_file_returns_empty() {
        let result = parse_tsconfig_paths(Path::new("/nonexistent/tsconfig.json"));

        assert!(result.is_empty());
        assert!(result.base_url.is_none());
    }

    #[test]
    fn test_parse_invalid_json_returns_empty() {
        let tmp = tempfile::tempdir().unwrap();
        let tsconfig = tmp.path().join("tsconfig.json");
        std::fs::write(&tsconfig, "not valid json").unwrap();

        let result = parse_tsconfig_paths(&tsconfig);

        assert!(result.is_empty());
    }

    #[test]
    fn test_parse_no_compiler_options_returns_empty() {
        let tmp = tempfile::tempdir().unwrap();
        let tsconfig = tmp.path().join("tsconfig.json");
        std::fs::write(&tsconfig, r#"{"include": ["src"]}"#).unwrap();

        let result = parse_tsconfig_paths(&tsconfig);

        assert!(result.is_empty());
    }

    // ── resolve_alias tests ──

    #[test]
    fn test_resolve_alias_wildcard_match() {
        let tmp = tempfile::tempdir().unwrap();
        let root = tmp.path();
        std::fs::create_dir_all(root.join("src/components")).unwrap();
        std::fs::write(root.join("src/components/Button.tsx"), "").unwrap();

        let paths = TsconfigPaths {
            base_url: None,
            paths: vec![("@/*".to_string(), vec!["./src/*".to_string()])],
        };

        let result = paths.resolve_alias("@/components/Button", root);
        assert_eq!(result, Some(root.join("src/components/Button.tsx")));
    }

    #[test]
    fn test_resolve_alias_no_match() {
        let tmp = tempfile::tempdir().unwrap();
        let paths = TsconfigPaths {
            base_url: None,
            paths: vec![("@/*".to_string(), vec!["./src/*".to_string()])],
        };

        let result = paths.resolve_alias("react", tmp.path());
        assert_eq!(result, None);
    }

    #[test]
    fn test_resolve_alias_multiple_mappings_first_match_wins() {
        let tmp = tempfile::tempdir().unwrap();
        let root = tmp.path();
        // Only the second mapping has the file
        std::fs::create_dir_all(root.join("generated/models")).unwrap();
        std::fs::write(root.join("generated/models/User.ts"), "").unwrap();

        let paths = TsconfigPaths {
            base_url: None,
            paths: vec![(
                "@/*".to_string(),
                vec!["./src/*".to_string(), "./generated/*".to_string()],
            )],
        };

        let result = paths.resolve_alias("@/models/User", root);
        assert_eq!(result, Some(root.join("generated/models/User.ts")));
    }

    #[test]
    fn test_resolve_alias_exact_match() {
        let tmp = tempfile::tempdir().unwrap();
        let root = tmp.path();
        std::fs::create_dir_all(root.join("src")).unwrap();
        std::fs::write(root.join("src/config.ts"), "").unwrap();

        let paths = TsconfigPaths {
            base_url: None,
            paths: vec![("@config".to_string(), vec!["./src/config".to_string()])],
        };

        let result = paths.resolve_alias("@config", root);
        assert_eq!(result, Some(root.join("src/config.ts")));
    }

    #[test]
    fn test_resolve_alias_with_base_url() {
        let tmp = tempfile::tempdir().unwrap();
        let root = tmp.path();
        std::fs::create_dir_all(root.join("src/utils")).unwrap();
        std::fs::write(root.join("src/utils/helpers.ts"), "").unwrap();

        let paths = TsconfigPaths {
            base_url: Some(root.join("src")),
            paths: vec![("@utils/*".to_string(), vec!["utils/*".to_string()])],
        };

        let result = paths.resolve_alias("@utils/helpers", root);
        assert_eq!(result, Some(root.join("src/utils/helpers.ts")));
    }

    #[test]
    fn test_resolve_alias_index_file() {
        let tmp = tempfile::tempdir().unwrap();
        let root = tmp.path();
        std::fs::create_dir_all(root.join("src/components/Button")).unwrap();
        std::fs::write(root.join("src/components/Button/index.tsx"), "").unwrap();

        let paths = TsconfigPaths {
            base_url: None,
            paths: vec![("@/*".to_string(), vec!["./src/*".to_string()])],
        };

        let result = paths.resolve_alias("@/components/Button", root);
        assert_eq!(result, Some(root.join("src/components/Button/index.tsx")));
    }

    #[test]
    fn test_resolve_alias_file_not_found_returns_none() {
        let tmp = tempfile::tempdir().unwrap();
        let root = tmp.path();
        std::fs::create_dir_all(root.join("src")).unwrap();

        let paths = TsconfigPaths {
            base_url: None,
            paths: vec![("@/*".to_string(), vec!["./src/*".to_string()])],
        };

        let result = paths.resolve_alias("@/nonexistent/Thing", root);
        assert_eq!(result, None);
    }

    #[test]
    fn test_is_empty() {
        let paths = TsconfigPaths::default();
        assert!(paths.is_empty());

        let paths = TsconfigPaths {
            base_url: None,
            paths: vec![("@/*".to_string(), vec!["./src/*".to_string()])],
        };
        assert!(!paths.is_empty());
    }
}
