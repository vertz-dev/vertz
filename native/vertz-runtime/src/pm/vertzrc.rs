use fs2::FileExt;
use serde::{Deserialize, Serialize};
use std::path::Path;

/// Parsed .vertzrc configuration file
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct VertzConfig {
    #[serde(rename = "trustScripts", default)]
    pub trust_scripts: Vec<String>,
}

/// Check if a package name matches any pattern in the trust list.
///
/// Two pattern types:
/// - **Exact name:** `esbuild` matches `esbuild` only
/// - **Scope prefix:** `@vertz/*` matches any `@vertz/<name>` package
pub fn match_trust_pattern(package_name: &str, patterns: &[String]) -> bool {
    for pattern in patterns {
        if pattern.ends_with("/*") && pattern.starts_with('@') {
            // Scope prefix pattern: @scope/*
            let scope = &pattern[..pattern.len() - 2]; // strip "/*"
            if let Some(pkg_scope) = package_name.find('/') {
                if &package_name[..pkg_scope] == scope {
                    return true;
                }
            }
        } else if pattern == package_name {
            // Exact match
            return true;
        }
    }
    false
}

/// Load .vertzrc from the given directory. Returns default config if file doesn't exist.
pub fn load_vertzrc(root_dir: &Path) -> Result<VertzConfig, Box<dyn std::error::Error>> {
    let path = root_dir.join(".vertzrc");
    if !path.exists() {
        return Ok(VertzConfig::default());
    }
    let content = std::fs::read_to_string(&path)?;
    let config: VertzConfig = serde_json::from_str(&content)?;
    Ok(config)
}

/// Save .vertzrc to the given directory with advisory file locking.
///
/// Uses `fs2` advisory locking on the target file to prevent concurrent writes
/// from corrupting the config. Writes atomically via temp file + rename.
pub fn save_vertzrc(
    root_dir: &Path,
    config: &VertzConfig,
) -> Result<(), Box<dyn std::error::Error>> {
    let path = root_dir.join(".vertzrc");
    let content = serde_json::to_string_pretty(config)?;

    // Acquire exclusive advisory lock (creates file if needed)
    let lock_file = std::fs::OpenOptions::new()
        .create(true)
        .write(true)
        .truncate(false)
        .open(&path)?;
    lock_file.lock_exclusive()?;

    // Write atomically: write to temp file then rename
    let tmp_path = root_dir.join(".vertzrc.tmp");
    std::fs::write(&tmp_path, format!("{}\n", content))?;
    std::fs::rename(&tmp_path, &path)?;

    // Lock is released when lock_file is dropped
    Ok(())
}

/// Script execution policy for install/add commands
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ScriptPolicy {
    /// Default — filter by .vertzrc trust list
    TrustBased,
    /// --ignore-scripts — skip all scripts
    IgnoreAll,
    /// --run-scripts — force all scripts to run
    RunAll,
}

#[cfg(test)]
mod tests {
    use super::*;

    // --- match_trust_pattern tests ---

    #[test]
    fn test_exact_match() {
        let patterns = vec!["esbuild".to_string()];
        assert!(match_trust_pattern("esbuild", &patterns));
    }

    #[test]
    fn test_exact_no_match() {
        let patterns = vec!["esbuild".to_string()];
        assert!(!match_trust_pattern("sharp", &patterns));
    }

    #[test]
    fn test_scope_wildcard_match() {
        let patterns = vec!["@vertz/*".to_string()];
        assert!(match_trust_pattern("@vertz/ui", &patterns));
        assert!(match_trust_pattern("@vertz/core", &patterns));
    }

    #[test]
    fn test_scope_wildcard_no_match_different_scope() {
        let patterns = vec!["@vertz/*".to_string()];
        assert!(!match_trust_pattern("@other/pkg", &patterns));
    }

    #[test]
    fn test_scope_wildcard_no_match_unscoped() {
        let patterns = vec!["@vertz/*".to_string()];
        assert!(!match_trust_pattern("esbuild", &patterns));
    }

    #[test]
    fn test_exact_scoped_package() {
        let patterns = vec!["@prisma/client".to_string()];
        assert!(match_trust_pattern("@prisma/client", &patterns));
        assert!(!match_trust_pattern("@prisma/engines", &patterns));
    }

    #[test]
    fn test_multiple_patterns() {
        let patterns = vec![
            "esbuild".to_string(),
            "@vertz/*".to_string(),
            "prisma".to_string(),
        ];
        assert!(match_trust_pattern("esbuild", &patterns));
        assert!(match_trust_pattern("@vertz/ui", &patterns));
        assert!(match_trust_pattern("prisma", &patterns));
        assert!(!match_trust_pattern("sharp", &patterns));
    }

    #[test]
    fn test_empty_patterns() {
        let patterns: Vec<String> = vec![];
        assert!(!match_trust_pattern("esbuild", &patterns));
    }

    #[test]
    fn test_partial_name_no_match() {
        // "prisma" should NOT match "prisma-client"
        let patterns = vec!["prisma".to_string()];
        assert!(!match_trust_pattern("prisma-client", &patterns));
    }

    #[test]
    fn test_glob_not_supported() {
        // "prisma*" should NOT match "prisma-client" (no generic glob)
        let patterns = vec!["prisma*".to_string()];
        assert!(!match_trust_pattern("prisma", &patterns));
        assert!(!match_trust_pattern("prisma-client", &patterns));
    }

    // --- load/save vertzrc tests ---

    #[test]
    fn test_load_vertzrc_no_file() {
        let dir = tempfile::tempdir().unwrap();
        let config = load_vertzrc(dir.path()).unwrap();
        assert!(config.trust_scripts.is_empty());
    }

    #[test]
    fn test_load_vertzrc_with_trust_scripts() {
        let dir = tempfile::tempdir().unwrap();
        std::fs::write(
            dir.path().join(".vertzrc"),
            r#"{"trustScripts": ["esbuild", "@vertz/*"]}"#,
        )
        .unwrap();
        let config = load_vertzrc(dir.path()).unwrap();
        assert_eq!(config.trust_scripts, vec!["esbuild", "@vertz/*"]);
    }

    #[test]
    fn test_load_vertzrc_empty_json() {
        let dir = tempfile::tempdir().unwrap();
        std::fs::write(dir.path().join(".vertzrc"), "{}").unwrap();
        let config = load_vertzrc(dir.path()).unwrap();
        assert!(config.trust_scripts.is_empty());
    }

    #[test]
    fn test_save_vertzrc() {
        let dir = tempfile::tempdir().unwrap();
        let config = VertzConfig {
            trust_scripts: vec!["esbuild".to_string(), "prisma".to_string()],
        };
        save_vertzrc(dir.path(), &config).unwrap();

        let loaded = load_vertzrc(dir.path()).unwrap();
        assert_eq!(loaded.trust_scripts, vec!["esbuild", "prisma"]);
    }

    #[test]
    fn test_save_vertzrc_overwrites() {
        let dir = tempfile::tempdir().unwrap();
        let config1 = VertzConfig {
            trust_scripts: vec!["esbuild".to_string()],
        };
        save_vertzrc(dir.path(), &config1).unwrap();

        let config2 = VertzConfig {
            trust_scripts: vec!["sharp".to_string()],
        };
        save_vertzrc(dir.path(), &config2).unwrap();

        let loaded = load_vertzrc(dir.path()).unwrap();
        assert_eq!(loaded.trust_scripts, vec!["sharp"]);
    }

    #[test]
    fn test_load_vertzrc_unknown_fields_ignored() {
        let dir = tempfile::tempdir().unwrap();
        std::fs::write(
            dir.path().join(".vertzrc"),
            r#"{"trustScripts": ["esbuild"], "futureFeature": true, "anotherField": 42}"#,
        )
        .unwrap();
        let config = load_vertzrc(dir.path()).unwrap();
        assert_eq!(config.trust_scripts, vec!["esbuild"]);
    }

    #[test]
    fn test_load_vertzrc_invalid_json() {
        let dir = tempfile::tempdir().unwrap();
        std::fs::write(dir.path().join(".vertzrc"), "not json").unwrap();
        assert!(load_vertzrc(dir.path()).is_err());
    }
}
