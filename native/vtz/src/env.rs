use std::collections::HashMap;
use std::path::Path;

/// Parse a `.env` file into key-value pairs.
///
/// Supports:
/// - `KEY=VALUE` (basic format)
/// - `KEY="VALUE"` and `KEY='VALUE'` (quoted values)
/// - `# comments` and empty lines (ignored)
/// - `export KEY=VALUE` (export prefix stripped)
/// - Inline comments after unquoted values
pub fn parse_env_file(content: &str) -> HashMap<String, String> {
    let mut env = HashMap::new();

    for line in content.lines() {
        let line = line.trim();

        // Skip empty lines and comments
        if line.is_empty() || line.starts_with('#') {
            continue;
        }

        // Strip optional `export ` prefix
        let line = line.strip_prefix("export ").unwrap_or(line);

        // Find the `=` separator
        let Some(eq_pos) = line.find('=') else {
            continue;
        };

        let key = line[..eq_pos].trim().to_string();
        if key.is_empty() {
            continue;
        }

        let raw_value = line[eq_pos + 1..].trim();

        let value = if raw_value.len() >= 2
            && ((raw_value.starts_with('"') && raw_value.ends_with('"'))
                || (raw_value.starts_with('\'') && raw_value.ends_with('\'')))
        {
            // Quoted value — strip quotes (requires at least 2 chars for open+close)
            raw_value[1..raw_value.len() - 1].to_string()
        } else {
            // Unquoted — strip inline comments
            raw_value
                .split(" #")
                .next()
                .unwrap_or(raw_value)
                .trim()
                .to_string()
        };

        env.insert(key, value);
    }

    env
}

/// Load environment variables from `.env` files in precedence order.
///
/// Loading order (later files override earlier):
/// 1. `.env`
/// 2. `.env.local`
/// 3. `.env.{mode}` (e.g., `.env.development`)
/// 4. `.env.{mode}.local`
pub fn load_env_files(root_dir: &Path, mode: &str) -> HashMap<String, String> {
    let mut env = HashMap::new();

    let files = [
        ".env".to_string(),
        ".env.local".to_string(),
        format!(".env.{}", mode),
        format!(".env.{}.local", mode),
    ];

    for filename in &files {
        let path = root_dir.join(filename);
        if let Ok(content) = std::fs::read_to_string(&path) {
            let file_env = parse_env_file(&content);
            env.extend(file_env);
        }
    }

    env
}

/// Filter env vars to only those with public prefixes, and add built-in variables.
///
/// Built-in variables added:
/// - `MODE` — the current mode (e.g., "development")
/// - `DEV` — "true" if mode is "development", "false" otherwise
/// - `PROD` — "true" if mode is "production", "false" otherwise
/// - `BASE_URL` — always "/" for now
pub fn build_public_env(
    all_env: &HashMap<String, String>,
    prefixes: &[&str],
    mode: &str,
) -> HashMap<String, String> {
    let mut public = HashMap::new();

    // Filter user env vars by prefix FIRST
    for (key, value) in all_env {
        if prefixes
            .iter()
            .any(|prefix| !prefix.is_empty() && key.starts_with(prefix))
        {
            public.insert(key.clone(), value.clone());
        }
    }

    // Add built-in variables AFTER so they always take precedence
    public.insert("MODE".to_string(), mode.to_string());
    public.insert(
        "DEV".to_string(),
        if mode == "development" {
            "true"
        } else {
            "false"
        }
        .to_string(),
    );
    public.insert(
        "PROD".to_string(),
        if mode == "production" {
            "true"
        } else {
            "false"
        }
        .to_string(),
    );
    public.insert("BASE_URL".to_string(), "/".to_string());

    public
}

#[cfg(test)]
mod tests {
    use super::*;

    // ── parse_env_file ─────────────────────────────────────

    #[test]
    fn test_parse_basic_key_value() {
        let content = "API_URL=https://api.example.com";
        let env = parse_env_file(content);
        assert_eq!(env.get("API_URL").unwrap(), "https://api.example.com");
    }

    #[test]
    fn test_parse_double_quoted_value() {
        let content = r#"API_URL="https://api.example.com""#;
        let env = parse_env_file(content);
        assert_eq!(env.get("API_URL").unwrap(), "https://api.example.com");
    }

    #[test]
    fn test_parse_single_quoted_value() {
        let content = "API_URL='https://api.example.com'";
        let env = parse_env_file(content);
        assert_eq!(env.get("API_URL").unwrap(), "https://api.example.com");
    }

    #[test]
    fn test_parse_comment_lines_ignored() {
        let content = "# This is a comment\nAPI_URL=http://localhost";
        let env = parse_env_file(content);
        assert_eq!(env.len(), 1);
        assert_eq!(env.get("API_URL").unwrap(), "http://localhost");
    }

    #[test]
    fn test_parse_empty_lines_ignored() {
        let content = "A=1\n\nB=2\n\n";
        let env = parse_env_file(content);
        assert_eq!(env.len(), 2);
        assert_eq!(env.get("A").unwrap(), "1");
        assert_eq!(env.get("B").unwrap(), "2");
    }

    #[test]
    fn test_parse_export_prefix_stripped() {
        let content = "export API_KEY=secret123";
        let env = parse_env_file(content);
        assert_eq!(env.get("API_KEY").unwrap(), "secret123");
    }

    #[test]
    fn test_parse_inline_comment_stripped() {
        let content = "PORT=3000 # server port";
        let env = parse_env_file(content);
        assert_eq!(env.get("PORT").unwrap(), "3000");
    }

    #[test]
    fn test_parse_inline_comment_not_stripped_in_quotes() {
        let content = r#"MSG="hello # world""#;
        let env = parse_env_file(content);
        assert_eq!(env.get("MSG").unwrap(), "hello # world");
    }

    #[test]
    fn test_parse_empty_value() {
        let content = "EMPTY=";
        let env = parse_env_file(content);
        assert_eq!(env.get("EMPTY").unwrap(), "");
    }

    #[test]
    fn test_parse_value_with_spaces_around_equals() {
        let content = "KEY = value";
        let env = parse_env_file(content);
        assert_eq!(env.get("KEY").unwrap(), "value");
    }

    #[test]
    fn test_parse_multiple_entries() {
        let content = "A=1\nB=2\nC=3";
        let env = parse_env_file(content);
        assert_eq!(env.len(), 3);
    }

    #[test]
    fn test_parse_line_without_equals_ignored() {
        let content = "NOEQUALS\nA=1";
        let env = parse_env_file(content);
        assert_eq!(env.len(), 1);
        assert_eq!(env.get("A").unwrap(), "1");
    }

    #[test]
    fn test_parse_value_with_equals_sign() {
        let content = "URL=postgres://user:pass@host/db?opt=val";
        let env = parse_env_file(content);
        assert_eq!(
            env.get("URL").unwrap(),
            "postgres://user:pass@host/db?opt=val"
        );
    }

    // ── load_env_files ─────────────────────────────────────

    #[test]
    fn test_load_env_base_file() {
        let tmp = tempfile::tempdir().unwrap();
        std::fs::write(tmp.path().join(".env"), "BASE_VAR=hello").unwrap();

        let env = load_env_files(tmp.path(), "development");
        assert_eq!(env.get("BASE_VAR").unwrap(), "hello");
    }

    #[test]
    fn test_load_env_local_overrides_base() {
        let tmp = tempfile::tempdir().unwrap();
        std::fs::write(tmp.path().join(".env"), "VAR=base").unwrap();
        std::fs::write(tmp.path().join(".env.local"), "VAR=local").unwrap();

        let env = load_env_files(tmp.path(), "development");
        assert_eq!(env.get("VAR").unwrap(), "local");
    }

    #[test]
    fn test_load_env_mode_specific() {
        let tmp = tempfile::tempdir().unwrap();
        std::fs::write(tmp.path().join(".env"), "VAR=base").unwrap();
        std::fs::write(tmp.path().join(".env.development"), "VAR=dev").unwrap();

        let env = load_env_files(tmp.path(), "development");
        assert_eq!(env.get("VAR").unwrap(), "dev");
    }

    #[test]
    fn test_load_env_mode_local_has_highest_priority() {
        let tmp = tempfile::tempdir().unwrap();
        std::fs::write(tmp.path().join(".env"), "VAR=base").unwrap();
        std::fs::write(tmp.path().join(".env.local"), "VAR=local").unwrap();
        std::fs::write(tmp.path().join(".env.development"), "VAR=dev").unwrap();
        std::fs::write(tmp.path().join(".env.development.local"), "VAR=devlocal").unwrap();

        let env = load_env_files(tmp.path(), "development");
        assert_eq!(env.get("VAR").unwrap(), "devlocal");
    }

    #[test]
    fn test_load_env_missing_files_not_error() {
        let tmp = tempfile::tempdir().unwrap();
        // No .env files at all
        let env = load_env_files(tmp.path(), "development");
        assert!(env.is_empty());
    }

    #[test]
    fn test_load_env_merges_across_files() {
        let tmp = tempfile::tempdir().unwrap();
        std::fs::write(tmp.path().join(".env"), "A=1").unwrap();
        std::fs::write(tmp.path().join(".env.development"), "B=2").unwrap();

        let env = load_env_files(tmp.path(), "development");
        assert_eq!(env.get("A").unwrap(), "1");
        assert_eq!(env.get("B").unwrap(), "2");
    }

    // ── build_public_env ───────────────────────────────────

    #[test]
    fn test_build_public_env_adds_builtins_dev_mode() {
        let all_env = HashMap::new();
        let public = build_public_env(&all_env, &["VITE_"], "development");

        assert_eq!(public.get("MODE").unwrap(), "development");
        assert_eq!(public.get("DEV").unwrap(), "true");
        assert_eq!(public.get("PROD").unwrap(), "false");
        assert_eq!(public.get("BASE_URL").unwrap(), "/");
    }

    #[test]
    fn test_build_public_env_adds_builtins_prod_mode() {
        let all_env = HashMap::new();
        let public = build_public_env(&all_env, &["VITE_"], "production");

        assert_eq!(public.get("MODE").unwrap(), "production");
        assert_eq!(public.get("DEV").unwrap(), "false");
        assert_eq!(public.get("PROD").unwrap(), "true");
    }

    #[test]
    fn test_build_public_env_filters_by_prefix() {
        let mut all_env = HashMap::new();
        all_env.insert("VITE_API_URL".to_string(), "http://api".to_string());
        all_env.insert("SECRET_KEY".to_string(), "supersecret".to_string());
        all_env.insert("VITE_APP_NAME".to_string(), "MyApp".to_string());

        let public = build_public_env(&all_env, &["VITE_"], "development");

        assert!(public.contains_key("VITE_API_URL"));
        assert!(public.contains_key("VITE_APP_NAME"));
        assert!(!public.contains_key("SECRET_KEY"));
    }

    #[test]
    fn test_build_public_env_multiple_prefixes() {
        let mut all_env = HashMap::new();
        all_env.insert("VITE_A".to_string(), "1".to_string());
        all_env.insert("VERTZ_B".to_string(), "2".to_string());
        all_env.insert("SECRET".to_string(), "nope".to_string());

        let public = build_public_env(&all_env, &["VITE_", "VERTZ_"], "development");

        assert!(public.contains_key("VITE_A"));
        assert!(public.contains_key("VERTZ_B"));
        assert!(!public.contains_key("SECRET"));
    }

    #[test]
    fn test_build_public_env_user_vars_dont_override_builtins() {
        let mut all_env = HashMap::new();
        // User can't set MODE via .env if it doesn't match a prefix
        all_env.insert("MODE".to_string(), "custom".to_string());

        let public = build_public_env(&all_env, &["VITE_"], "development");

        // MODE comes from built-in, not from all_env (MODE doesn't have VITE_ prefix)
        assert_eq!(public.get("MODE").unwrap(), "development");
    }

    #[test]
    fn test_build_public_env_builtins_win_even_with_matching_prefix() {
        let mut all_env = HashMap::new();
        // Even if a user var matches a prefix AND a builtin name,
        // builtins still take precedence
        all_env.insert("VITE_MODE".to_string(), "custom".to_string());
        // This one shouldn't matter since "MODE" doesn't start with "VITE_"
        // but builtins always win regardless
        all_env.insert("MODE".to_string(), "custom".to_string());

        let public = build_public_env(&all_env, &["VITE_"], "development");
        assert_eq!(public.get("MODE").unwrap(), "development");
        // But VITE_MODE (different key) is still exposed
        assert_eq!(public.get("VITE_MODE").unwrap(), "custom");
    }

    #[test]
    fn test_build_public_env_empty_prefix_ignored() {
        let mut all_env = HashMap::new();
        all_env.insert("SECRET_KEY".to_string(), "supersecret".to_string());
        all_env.insert("VITE_A".to_string(), "1".to_string());

        // Empty prefix should be ignored — don't expose all vars
        let public = build_public_env(&all_env, &["", "VITE_"], "development");

        assert!(public.contains_key("VITE_A"));
        assert!(
            !public.contains_key("SECRET_KEY"),
            "Empty prefix must not expose all vars"
        );
    }

    #[test]
    fn test_parse_single_char_quoted_value_no_panic() {
        // A lone quote character should not panic
        let content = "KEY=\"";
        let env = parse_env_file(content);
        // Treated as unquoted value since len < 2 for proper quotes
        assert_eq!(env.get("KEY").unwrap(), "\"");
    }

    #[test]
    fn test_parse_empty_quoted_value() {
        let content = "KEY=\"\"";
        let env = parse_env_file(content);
        assert_eq!(env.get("KEY").unwrap(), "");
    }
}
