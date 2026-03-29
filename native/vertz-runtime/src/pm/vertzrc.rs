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

/// Set trust-scripts to the given values (replaces entire list).
/// Returns names that were in the old list but not the new one.
pub fn config_set_trust_scripts(
    root_dir: &Path,
    values: &[String],
) -> Result<Vec<String>, Box<dyn std::error::Error>> {
    let old = load_vertzrc(root_dir)?;
    let new_set: std::collections::HashSet<&str> = values.iter().map(|s| s.as_str()).collect();
    let removed: Vec<String> = old
        .trust_scripts
        .iter()
        .filter(|s| !new_set.contains(s.as_str()))
        .cloned()
        .collect();

    let config = VertzConfig {
        trust_scripts: values.to_vec(),
    };
    save_vertzrc(root_dir, &config)?;
    Ok(removed)
}

/// Add values to trust-scripts (deduplicates).
pub fn config_add_trust_scripts(
    root_dir: &Path,
    values: &[String],
) -> Result<(), Box<dyn std::error::Error>> {
    let mut config = load_vertzrc(root_dir)?;
    for v in values {
        if !config.trust_scripts.contains(v) {
            config.trust_scripts.push(v.clone());
        }
    }
    save_vertzrc(root_dir, &config)?;
    Ok(())
}

/// Remove values from trust-scripts.
/// Returns names that were actually removed.
pub fn config_remove_trust_scripts(
    root_dir: &Path,
    values: &[String],
) -> Result<Vec<String>, Box<dyn std::error::Error>> {
    let mut config = load_vertzrc(root_dir)?;
    let remove_set: std::collections::HashSet<&str> = values.iter().map(|s| s.as_str()).collect();
    let removed: Vec<String> = config
        .trust_scripts
        .iter()
        .filter(|s| remove_set.contains(s.as_str()))
        .cloned()
        .collect();
    config
        .trust_scripts
        .retain(|s| !remove_set.contains(s.as_str()));
    save_vertzrc(root_dir, &config)?;
    Ok(removed)
}

/// Get current trust-scripts list.
pub fn config_get_trust_scripts(
    root_dir: &Path,
) -> Result<Vec<String>, Box<dyn std::error::Error>> {
    let config = load_vertzrc(root_dir)?;
    Ok(config.trust_scripts)
}

/// Initialize trust-scripts by scanning node_modules for packages with
/// postinstall scripts in their package.json.
pub fn config_init_trust_scripts(
    root_dir: &Path,
) -> Result<Vec<String>, Box<dyn std::error::Error>> {
    let nm_dir = root_dir.join("node_modules");
    if !nm_dir.exists() {
        return Err("No node_modules found. Run `vertz install` first.".into());
    }

    let mut names: Vec<String> = Vec::new();

    // Scan top-level packages
    for entry in std::fs::read_dir(&nm_dir)? {
        let entry = entry?;
        let name = entry.file_name().to_string_lossy().to_string();
        if name.starts_with('.') {
            continue;
        }
        if name.starts_with('@') {
            // Scoped package — scan subdirectory
            let scope_dir = entry.path();
            if scope_dir.is_dir() {
                for sub in std::fs::read_dir(&scope_dir)? {
                    let sub = sub?;
                    let sub_name = format!("{}/{}", name, sub.file_name().to_string_lossy());
                    if has_postinstall_in_node_modules(&nm_dir, &sub_name) {
                        names.push(sub_name);
                    }
                }
            }
        } else if has_postinstall_in_node_modules(&nm_dir, &name) {
            names.push(name);
        }
    }

    names.sort();
    names.dedup();

    if !names.is_empty() {
        config_add_trust_scripts(root_dir, &names)?;
    }

    Ok(names)
}

/// Check if a package in node_modules has a postinstall script.
fn has_postinstall_in_node_modules(nm_dir: &Path, pkg_name: &str) -> bool {
    let pkg_json_path = nm_dir.join(pkg_name).join("package.json");
    if let Ok(content) = std::fs::read_to_string(&pkg_json_path) {
        if let Ok(parsed) = serde_json::from_str::<serde_json::Value>(&content) {
            return parsed
                .get("scripts")
                .and_then(|s| s.get("postinstall"))
                .is_some();
        }
    }
    false
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

    // --- config operation tests ---

    #[test]
    fn test_config_set_trust_scripts_creates_file() {
        let dir = tempfile::tempdir().unwrap();
        let removed = config_set_trust_scripts(
            dir.path(),
            &["esbuild".to_string(), "prisma".to_string()],
        )
        .unwrap();
        assert!(removed.is_empty());
        let config = load_vertzrc(dir.path()).unwrap();
        assert_eq!(config.trust_scripts, vec!["esbuild", "prisma"]);
    }

    #[test]
    fn test_config_set_trust_scripts_reports_removed() {
        let dir = tempfile::tempdir().unwrap();
        config_set_trust_scripts(
            dir.path(),
            &["esbuild".to_string(), "prisma".to_string()],
        )
        .unwrap();
        let removed =
            config_set_trust_scripts(dir.path(), &["esbuild".to_string()]).unwrap();
        assert_eq!(removed, vec!["prisma"]);
        let config = load_vertzrc(dir.path()).unwrap();
        assert_eq!(config.trust_scripts, vec!["esbuild"]);
    }

    #[test]
    fn test_config_add_trust_scripts_appends() {
        let dir = tempfile::tempdir().unwrap();
        config_set_trust_scripts(dir.path(), &["esbuild".to_string()]).unwrap();
        config_add_trust_scripts(dir.path(), &["sharp".to_string()]).unwrap();
        let config = load_vertzrc(dir.path()).unwrap();
        assert_eq!(config.trust_scripts, vec!["esbuild", "sharp"]);
    }

    #[test]
    fn test_config_add_trust_scripts_deduplicates() {
        let dir = tempfile::tempdir().unwrap();
        config_set_trust_scripts(dir.path(), &["esbuild".to_string()]).unwrap();
        config_add_trust_scripts(dir.path(), &["esbuild".to_string()]).unwrap();
        let config = load_vertzrc(dir.path()).unwrap();
        assert_eq!(config.trust_scripts, vec!["esbuild"]);
    }

    #[test]
    fn test_config_add_trust_scripts_creates_file_if_missing() {
        let dir = tempfile::tempdir().unwrap();
        config_add_trust_scripts(dir.path(), &["sharp".to_string()]).unwrap();
        let config = load_vertzrc(dir.path()).unwrap();
        assert_eq!(config.trust_scripts, vec!["sharp"]);
    }

    #[test]
    fn test_config_remove_trust_scripts() {
        let dir = tempfile::tempdir().unwrap();
        config_set_trust_scripts(
            dir.path(),
            &["esbuild".to_string(), "prisma".to_string()],
        )
        .unwrap();
        let removed =
            config_remove_trust_scripts(dir.path(), &["esbuild".to_string()]).unwrap();
        assert_eq!(removed, vec!["esbuild"]);
        let config = load_vertzrc(dir.path()).unwrap();
        assert_eq!(config.trust_scripts, vec!["prisma"]);
    }

    #[test]
    fn test_config_remove_trust_scripts_nonexistent() {
        let dir = tempfile::tempdir().unwrap();
        config_set_trust_scripts(dir.path(), &["esbuild".to_string()]).unwrap();
        let removed =
            config_remove_trust_scripts(dir.path(), &["nonexistent".to_string()]).unwrap();
        assert!(removed.is_empty());
    }

    #[test]
    fn test_config_get_trust_scripts_empty() {
        let dir = tempfile::tempdir().unwrap();
        let scripts = config_get_trust_scripts(dir.path()).unwrap();
        assert!(scripts.is_empty());
    }

    #[test]
    fn test_config_get_trust_scripts_with_values() {
        let dir = tempfile::tempdir().unwrap();
        config_set_trust_scripts(
            dir.path(),
            &["esbuild".to_string(), "@vertz/*".to_string()],
        )
        .unwrap();
        let scripts = config_get_trust_scripts(dir.path()).unwrap();
        assert_eq!(scripts, vec!["esbuild", "@vertz/*"]);
    }

    #[test]
    fn test_config_init_trust_scripts_no_node_modules() {
        let dir = tempfile::tempdir().unwrap();
        let result = config_init_trust_scripts(dir.path());
        assert!(result.is_err());
        assert!(result.unwrap_err().to_string().contains("No node_modules"));
    }

    #[test]
    fn test_config_init_trust_scripts_empty_node_modules() {
        let dir = tempfile::tempdir().unwrap();
        std::fs::create_dir(dir.path().join("node_modules")).unwrap();
        let names = config_init_trust_scripts(dir.path()).unwrap();
        assert!(names.is_empty());
    }

    #[test]
    fn test_config_init_trust_scripts_finds_postinstall() {
        let dir = tempfile::tempdir().unwrap();
        let nm = dir.path().join("node_modules");
        let pkg_dir = nm.join("esbuild");
        std::fs::create_dir_all(&pkg_dir).unwrap();
        std::fs::write(
            pkg_dir.join("package.json"),
            r#"{"name": "esbuild", "scripts": {"postinstall": "node install.js"}}"#,
        )
        .unwrap();

        // Package without postinstall
        let zod_dir = nm.join("zod");
        std::fs::create_dir_all(&zod_dir).unwrap();
        std::fs::write(
            zod_dir.join("package.json"),
            r#"{"name": "zod", "version": "3.24.4"}"#,
        )
        .unwrap();

        let names = config_init_trust_scripts(dir.path()).unwrap();
        assert_eq!(names, vec!["esbuild"]);
    }

    #[test]
    fn test_config_init_trust_scripts_finds_scoped() {
        let dir = tempfile::tempdir().unwrap();
        let nm = dir.path().join("node_modules");
        let pkg_dir = nm.join("@prisma").join("client");
        std::fs::create_dir_all(&pkg_dir).unwrap();
        std::fs::write(
            pkg_dir.join("package.json"),
            r#"{"name": "@prisma/client", "scripts": {"postinstall": "prisma generate"}}"#,
        )
        .unwrap();

        let names = config_init_trust_scripts(dir.path()).unwrap();
        assert_eq!(names, vec!["@prisma/client"]);
    }

    #[test]
    fn test_has_postinstall_in_node_modules_true() {
        let dir = tempfile::tempdir().unwrap();
        let nm = dir.path().join("node_modules");
        let pkg_dir = nm.join("esbuild");
        std::fs::create_dir_all(&pkg_dir).unwrap();
        std::fs::write(
            pkg_dir.join("package.json"),
            r#"{"scripts": {"postinstall": "node install.js"}}"#,
        )
        .unwrap();
        assert!(has_postinstall_in_node_modules(&nm, "esbuild"));
    }

    #[test]
    fn test_has_postinstall_in_node_modules_false() {
        let dir = tempfile::tempdir().unwrap();
        let nm = dir.path().join("node_modules");
        let pkg_dir = nm.join("zod");
        std::fs::create_dir_all(&pkg_dir).unwrap();
        std::fs::write(pkg_dir.join("package.json"), r#"{"name": "zod"}"#).unwrap();
        assert!(!has_postinstall_in_node_modules(&nm, "zod"));
    }

    #[test]
    fn test_has_postinstall_in_node_modules_missing() {
        let dir = tempfile::tempdir().unwrap();
        let nm = dir.path().join("node_modules");
        std::fs::create_dir_all(&nm).unwrap();
        assert!(!has_postinstall_in_node_modules(&nm, "nonexistent"));
    }
}
