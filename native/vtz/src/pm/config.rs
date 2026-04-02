use std::collections::BTreeMap;
use std::path::Path;

/// Registry configuration resolved from .npmrc files
#[derive(Debug, Clone, Default)]
pub struct RegistryConfig {
    /// Default registry URL (falls back to https://registry.npmjs.org)
    pub default_url: String,
    /// Scoped registries: @scope → URL
    pub scoped: BTreeMap<String, String>,
    /// Auth tokens: URL prefix → token
    pub tokens: BTreeMap<String, String>,
    /// Whether to always send auth
    pub always_auth: bool,
}

const DEFAULT_REGISTRY: &str = "https://registry.npmjs.org";

impl RegistryConfig {
    /// Get the registry URL for a given package name
    pub fn registry_url_for_package(&self, name: &str) -> &str {
        if let Some(scope) = extract_scope(name) {
            if let Some(url) = self.scoped.get(scope) {
                return url.as_str();
            }
        }
        if self.default_url.is_empty() {
            DEFAULT_REGISTRY
        } else {
            &self.default_url
        }
    }

    /// Get the auth header value (Bearer token) for a given registry URL, if any
    pub fn auth_header_for_url(&self, url: &str) -> Option<String> {
        // Match by URL prefix — tokens are stored as "//host/path/" → token
        for (prefix, token) in &self.tokens {
            // Normalize: remove protocol from url for matching
            let url_without_proto = strip_protocol(url);
            if url_without_proto.starts_with(prefix.trim_start_matches("//")) {
                return Some(format!("Bearer {}", token));
            }
        }
        None
    }
}

/// Extract scope from a package name (e.g., "@myorg/pkg" → "@myorg")
fn extract_scope(name: &str) -> Option<&str> {
    if name.starts_with('@') {
        name.find('/').map(|pos| &name[..pos])
    } else {
        None
    }
}

/// Strip protocol prefix from URL
fn strip_protocol(url: &str) -> &str {
    if let Some(rest) = url.strip_prefix("https://") {
        rest
    } else if let Some(rest) = url.strip_prefix("http://") {
        rest
    } else {
        url
    }
}

/// Parse a single .npmrc content string into key-value pairs.
/// Supports:
/// - Comment lines starting with # or ;
/// - `${ENV_VAR}` interpolation
/// - Keys: registry, @scope:registry, //<url>/:_authToken, always-auth
pub fn parse_npmrc(content: &str) -> Result<BTreeMap<String, String>, Box<dyn std::error::Error>> {
    parse_npmrc_with_env(content, |name| std::env::var(name))
}

/// Parse .npmrc with a custom environment variable resolver.
/// Used internally and in tests to avoid mutating process-wide env state.
fn parse_npmrc_with_env(
    content: &str,
    env_fn: impl Fn(&str) -> Result<String, std::env::VarError>,
) -> Result<BTreeMap<String, String>, Box<dyn std::error::Error>> {
    let mut entries = BTreeMap::new();

    for line in content.lines() {
        let line = line.trim();
        if line.is_empty() || line.starts_with('#') || line.starts_with(';') {
            continue;
        }

        let Some((key, value)) = line.split_once('=') else {
            continue;
        };

        let key = interpolate_env_vars(key.trim(), &env_fn)?;
        let value = interpolate_env_vars(value.trim(), &env_fn)?;
        entries.insert(key, value);
    }

    Ok(entries)
}

/// Interpolate `${ENV_VAR}` references in a string value
fn interpolate_env_vars(
    value: &str,
    env_fn: &impl Fn(&str) -> Result<String, std::env::VarError>,
) -> Result<String, Box<dyn std::error::Error>> {
    let mut result = String::new();
    let mut rest = value;

    while let Some(start) = rest.find("${") {
        result.push_str(&rest[..start]);
        let after_start = &rest[start + 2..];
        let end = after_start
            .find('}')
            .ok_or_else(|| format!("error: malformed .npmrc — unclosed ${{}} in: {}", value))?;
        let var_name = &after_start[..end];
        let var_value = env_fn(var_name).map_err(|_| {
            format!(
                "error: .npmrc references undefined environment variable ${{{}}}",
                var_name
            )
        })?;
        result.push_str(&var_value);
        rest = &after_start[end + 1..];
    }
    result.push_str(rest);

    Ok(result)
}

/// Build a RegistryConfig from parsed .npmrc key-value pairs
fn config_from_entries(entries: &BTreeMap<String, String>) -> RegistryConfig {
    let mut config = RegistryConfig::default();

    for (key, value) in entries {
        if key == "registry" {
            config.default_url = value.clone();
        } else if key == "always-auth" {
            config.always_auth = value == "true";
        } else if key.ends_with(":registry") && key.starts_with('@') {
            // @scope:registry = url
            let scope = key.strip_suffix(":registry").unwrap();
            config.scoped.insert(scope.to_string(), value.clone());
        } else if key.ends_with(":_authToken") {
            // //<host>/:_authToken = token
            let prefix = key.strip_suffix(":_authToken").unwrap();
            config.tokens.insert(prefix.to_string(), value.clone());
        }
    }

    config
}

/// Load registry config from project .npmrc and ~/.npmrc, merged per-key.
///
/// `home_dir` overrides the `HOME` env var for locating `~/.npmrc`.
/// Pass `None` to use the `HOME` environment variable (production default).
pub fn load_registry_config(
    root_dir: &Path,
    home_dir: Option<&Path>,
) -> Result<RegistryConfig, Box<dyn std::error::Error>> {
    let mut merged_entries: BTreeMap<String, String> = BTreeMap::new();

    // Resolve home directory: explicit parameter or HOME env var
    let resolved_home = match home_dir {
        Some(dir) => Some(dir.to_path_buf()),
        None => std::env::var("HOME").ok().map(std::path::PathBuf::from),
    };

    // Load ~/.npmrc first (lower priority)
    if let Some(home) = resolved_home {
        let home_npmrc = home.join(".npmrc");
        if home_npmrc.exists() {
            if let Ok(content) = std::fs::read_to_string(&home_npmrc) {
                let entries = parse_npmrc(&content)?;
                merged_entries.extend(entries);
            }
        }
    }

    // Load project .npmrc (higher priority — overwrites per-key)
    let project_npmrc = root_dir.join(".npmrc");
    if project_npmrc.exists() {
        let content = std::fs::read_to_string(&project_npmrc)?;
        let entries = parse_npmrc(&content)?;
        merged_entries.extend(entries);
    }

    Ok(config_from_entries(&merged_entries))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_npmrc_empty() {
        let entries = parse_npmrc("").unwrap();
        assert!(entries.is_empty());
    }

    #[test]
    fn test_parse_npmrc_comments() {
        let content = "# This is a comment\n; Another comment\nregistry=https://custom.reg.com\n";
        let entries = parse_npmrc(content).unwrap();
        assert_eq!(entries.len(), 1);
        assert_eq!(entries["registry"], "https://custom.reg.com");
    }

    #[test]
    fn test_parse_npmrc_basic() {
        let content = "registry=https://npm.internal.company.com\nalways-auth=true\n";
        let entries = parse_npmrc(content).unwrap();
        assert_eq!(entries["registry"], "https://npm.internal.company.com");
        assert_eq!(entries["always-auth"], "true");
    }

    #[test]
    fn test_parse_npmrc_scoped_registry() {
        let content = "@myorg:registry=https://npm.internal.company.com\n";
        let entries = parse_npmrc(content).unwrap();
        assert_eq!(
            entries["@myorg:registry"],
            "https://npm.internal.company.com"
        );
    }

    #[test]
    fn test_parse_npmrc_auth_token() {
        let content = "//npm.internal.company.com/:_authToken=my-secret-token\n";
        let entries = parse_npmrc(content).unwrap();
        assert_eq!(
            entries["//npm.internal.company.com/:_authToken"],
            "my-secret-token"
        );
    }

    #[test]
    fn test_parse_npmrc_env_var_interpolation() {
        let env_fn = |name: &str| -> Result<String, std::env::VarError> {
            match name {
                "TEST_NPM_TOKEN_3G" => Ok("secret-from-env".to_string()),
                _ => Err(std::env::VarError::NotPresent),
            }
        };
        let content = "//npm.internal.company.com/:_authToken=${TEST_NPM_TOKEN_3G}\n";
        let entries = parse_npmrc_with_env(content, env_fn).unwrap();
        assert_eq!(
            entries["//npm.internal.company.com/:_authToken"],
            "secret-from-env"
        );
    }

    #[test]
    fn test_parse_npmrc_undefined_env_var() {
        let env_fn =
            |_: &str| -> Result<String, std::env::VarError> { Err(std::env::VarError::NotPresent) };
        let content = "//host/:_authToken=${UNDEFINED_TOKEN_3G_TEST}\n";
        let result = parse_npmrc_with_env(content, env_fn);
        assert!(result.is_err());
        let err = result.unwrap_err().to_string();
        assert!(err.contains("UNDEFINED_TOKEN_3G_TEST"));
        assert!(err.contains("undefined environment variable"));
    }

    #[test]
    fn test_config_from_entries_default_registry() {
        let mut entries = BTreeMap::new();
        entries.insert("registry".to_string(), "https://custom.reg.com".to_string());
        let config = config_from_entries(&entries);
        assert_eq!(config.default_url, "https://custom.reg.com");
    }

    #[test]
    fn test_config_from_entries_scoped() {
        let mut entries = BTreeMap::new();
        entries.insert(
            "@myorg:registry".to_string(),
            "https://private.reg.com".to_string(),
        );
        let config = config_from_entries(&entries);
        assert_eq!(config.scoped["@myorg"], "https://private.reg.com");
    }

    #[test]
    fn test_config_from_entries_auth_token() {
        let mut entries = BTreeMap::new();
        entries.insert(
            "//private.reg.com/:_authToken".to_string(),
            "my-token".to_string(),
        );
        let config = config_from_entries(&entries);
        assert_eq!(config.tokens["//private.reg.com/"], "my-token");
    }

    #[test]
    fn test_config_from_entries_always_auth() {
        let mut entries = BTreeMap::new();
        entries.insert("always-auth".to_string(), "true".to_string());
        let config = config_from_entries(&entries);
        assert!(config.always_auth);
    }

    #[test]
    fn test_registry_url_for_package_default() {
        let config = RegistryConfig::default();
        assert_eq!(
            config.registry_url_for_package("zod"),
            "https://registry.npmjs.org"
        );
    }

    #[test]
    fn test_registry_url_for_package_custom_default() {
        let config = RegistryConfig {
            default_url: "https://custom.reg.com".to_string(),
            ..Default::default()
        };
        assert_eq!(
            config.registry_url_for_package("zod"),
            "https://custom.reg.com"
        );
    }

    #[test]
    fn test_registry_url_for_package_scoped() {
        let mut scoped = BTreeMap::new();
        scoped.insert("@myorg".to_string(), "https://private.reg.com".to_string());
        let config = RegistryConfig {
            scoped,
            ..Default::default()
        };
        assert_eq!(
            config.registry_url_for_package("@myorg/pkg"),
            "https://private.reg.com"
        );
        assert_eq!(
            config.registry_url_for_package("zod"),
            "https://registry.npmjs.org"
        );
    }

    #[test]
    fn test_auth_header_for_url_match() {
        let mut tokens = BTreeMap::new();
        tokens.insert("//private.reg.com/".to_string(), "my-token".to_string());
        let config = RegistryConfig {
            tokens,
            ..Default::default()
        };
        let header = config.auth_header_for_url("https://private.reg.com/package/zod");
        assert_eq!(header, Some("Bearer my-token".to_string()));
    }

    #[test]
    fn test_auth_header_for_url_no_match() {
        let config = RegistryConfig::default();
        assert!(config
            .auth_header_for_url("https://registry.npmjs.org/zod")
            .is_none());
    }

    #[test]
    fn test_auth_header_for_url_prefix_matching() {
        let mut tokens = BTreeMap::new();
        tokens.insert("//npm.pkg.github.com/".to_string(), "ghp_token".to_string());
        let config = RegistryConfig {
            tokens,
            ..Default::default()
        };
        let header = config.auth_header_for_url("https://npm.pkg.github.com/@myorg/pkg");
        assert_eq!(header, Some("Bearer ghp_token".to_string()));
    }

    #[test]
    fn test_extract_scope() {
        assert_eq!(extract_scope("@myorg/pkg"), Some("@myorg"));
        assert_eq!(extract_scope("zod"), None);
        assert_eq!(extract_scope("@vertz/ui"), Some("@vertz"));
    }

    #[test]
    fn test_load_registry_config_no_npmrc() {
        let dir = tempfile::tempdir().unwrap();
        let fake_home = dir.path().join("fake-home");
        let config = load_registry_config(dir.path(), Some(&fake_home)).unwrap();
        assert_eq!(config.default_url, "");
        assert!(config.scoped.is_empty());
        assert!(config.tokens.is_empty());
    }

    #[test]
    fn test_load_registry_config_project_npmrc() {
        let dir = tempfile::tempdir().unwrap();
        let fake_home = dir.path().join("fake-home");
        std::fs::write(
            dir.path().join(".npmrc"),
            "registry=https://custom.reg.com\n",
        )
        .unwrap();
        let config = load_registry_config(dir.path(), Some(&fake_home)).unwrap();
        assert_eq!(config.default_url, "https://custom.reg.com");
    }

    #[test]
    fn test_parse_npmrc_whitespace_handling() {
        let content = "  registry = https://custom.reg.com  \n";
        let entries = parse_npmrc(content).unwrap();
        assert_eq!(entries["registry"], "https://custom.reg.com");
    }

    #[test]
    fn test_parse_npmrc_multiple_env_vars() {
        let env_fn = |name: &str| -> Result<String, std::env::VarError> {
            match name {
                "TEST_HOST_3G" => Ok("custom.reg.com".to_string()),
                "TEST_TOKEN_3G" => Ok("secret".to_string()),
                _ => Err(std::env::VarError::NotPresent),
            }
        };
        let content = "//${TEST_HOST_3G}/:_authToken=${TEST_TOKEN_3G}\n";
        let entries = parse_npmrc_with_env(content, env_fn).unwrap();
        assert_eq!(entries["//custom.reg.com/:_authToken"], "secret");
    }

    #[test]
    fn test_load_registry_config_project_overrides_home() {
        let dir = tempfile::tempdir().unwrap();
        let fake_home = dir.path().join("fake-home");
        std::fs::create_dir_all(&fake_home).unwrap();
        std::fs::write(fake_home.join(".npmrc"), "registry=https://home.reg.com\n").unwrap();
        std::fs::write(
            dir.path().join(".npmrc"),
            "registry=https://project.reg.com\n",
        )
        .unwrap();
        let config = load_registry_config(dir.path(), Some(&fake_home)).unwrap();
        assert_eq!(config.default_url, "https://project.reg.com");
    }
}
