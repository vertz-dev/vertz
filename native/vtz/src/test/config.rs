use std::path::{Path, PathBuf};

use deno_core::error::AnyError;

use crate::runtime::js_runtime::{VertzJsRuntime, VertzRuntimeOptions};

/// Test configuration loaded from vertz.config.ts.
#[derive(Debug, Clone, Default)]
pub struct TestConfig {
    /// File patterns to include (glob).
    pub include: Vec<String>,
    /// File patterns to exclude (glob).
    pub exclude: Vec<String>,
    /// Per-test timeout in ms.
    pub timeout_ms: Option<u64>,
    /// Max parallel test files.
    pub concurrency: Option<usize>,
    /// Reporter format name.
    pub reporter: Option<String>,
    /// Enable coverage.
    pub coverage: Option<bool>,
    /// Coverage threshold percentage.
    pub coverage_threshold: Option<f64>,
    /// Preload script paths (relative to project root).
    pub preload: Vec<String>,
}

/// Config file names to search for, in priority order.
const CONFIG_FILE_NAMES: [&str; 2] = ["vertz.config.ts", "vertz.config.js"];

/// Find the config file in the project root.
pub fn find_config_file(root_dir: &Path) -> Option<PathBuf> {
    for name in &CONFIG_FILE_NAMES {
        let path = root_dir.join(name);
        if path.is_file() {
            return Some(path);
        }
    }
    None
}

/// Load test configuration from vertz.config.ts/js.
///
/// The config file is expected to export a default object with a `test` key:
/// ```ts
/// export default {
///   test: {
///     include: ['src/**/*.test.ts'],
///     exclude: ['**/*.local.ts'],
///     timeout: 10000,
///     concurrency: 4,
///     reporter: 'json',
///     coverage: true,
///     coverageThreshold: 90,
///     preload: ['./test-setup.ts'],
///   }
/// };
/// ```
pub fn load_test_config(root_dir: &Path) -> Result<TestConfig, AnyError> {
    let config_path = match find_config_file(root_dir) {
        Some(path) => path,
        None => return Ok(TestConfig::default()),
    };

    // Read and compile the config file
    let source = std::fs::read_to_string(&config_path)?;
    let ext = config_path
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("");

    let compiled = if ext == "ts" || ext == "tsx" {
        let plugin: std::sync::Arc<dyn crate::plugin::FrameworkPlugin> =
            std::sync::Arc::new(crate::plugin::vertz::VertzPlugin);
        let src_dir = root_dir.join("src");
        let ctx = crate::plugin::CompileContext {
            file_path: &config_path,
            root_dir,
            src_dir: &src_dir,
            target: "ssr",
        };
        let output = plugin.compile(&source, &ctx);
        output.code
    } else {
        source
    };

    // Transform `export default X` into `globalThis.__vertz_config = X`
    // The compiler outputs `export default X;` for TS default exports.
    let script = transform_default_export(&compiled);

    let mut runtime = VertzJsRuntime::new(VertzRuntimeOptions {
        root_dir: Some(root_dir.to_string_lossy().to_string()),
        capture_output: true,
        ..Default::default()
    })?;

    // Execute the config file as a script (not a module)
    runtime.execute_script_void("[vertz:config]", &script)?;

    // Extract the test config
    let config_json = runtime.execute_script(
        "[config-extract]",
        r#"
        (() => {
            const config = globalThis.__vertz_config || {};
            const test = config.test || {};
            return {
                include: test.include || [],
                exclude: test.exclude || [],
                timeout: test.timeout != null ? test.timeout : null,
                concurrency: test.concurrency != null ? test.concurrency : null,
                reporter: test.reporter || null,
                coverage: test.coverage != null ? test.coverage : null,
                coverageThreshold: test.coverageThreshold != null ? test.coverageThreshold : null,
                preload: test.preload || [],
            };
        })()
        "#,
    )?;

    parse_test_config_value(&config_json)
}

/// Transform `export default X` into `globalThis.__vertz_config = X`.
/// Handles both `export default { ... }` and `export default identifier;`.
fn transform_default_export(code: &str) -> String {
    // Replace only the first `export default` — avoids corrupting string
    // literals or comments that contain the same substring.
    code.replacen("export default ", "globalThis.__vertz_config = ", 1)
}

/// Parse test config from a serde_json::Value.
fn parse_test_config_value(value: &serde_json::Value) -> Result<TestConfig, AnyError> {
    Ok(TestConfig {
        include: value
            .get("include")
            .and_then(|v| v.as_array())
            .map(|arr| {
                arr.iter()
                    .filter_map(|v| v.as_str().map(String::from))
                    .collect()
            })
            .unwrap_or_default(),
        exclude: value
            .get("exclude")
            .and_then(|v| v.as_array())
            .map(|arr| {
                arr.iter()
                    .filter_map(|v| v.as_str().map(String::from))
                    .collect()
            })
            .unwrap_or_default(),
        timeout_ms: value.get("timeout").and_then(|v| v.as_u64()),
        concurrency: value
            .get("concurrency")
            .and_then(|v| v.as_u64())
            .map(|v| v as usize),
        reporter: value
            .get("reporter")
            .and_then(|v| v.as_str())
            .map(String::from),
        coverage: value.get("coverage").and_then(|v| v.as_bool()),
        coverage_threshold: value.get("coverageThreshold").and_then(|v| v.as_f64()),
        preload: value
            .get("preload")
            .and_then(|v| v.as_array())
            .map(|arr| {
                arr.iter()
                    .filter_map(|v| v.as_str().map(String::from))
                    .collect()
            })
            .unwrap_or_default(),
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    #[test]
    fn test_find_config_file_ts() {
        let tmp = tempfile::tempdir().unwrap();
        let config_path = tmp.path().join("vertz.config.ts");
        fs::write(&config_path, "export default {};").unwrap();

        let found = find_config_file(tmp.path());
        assert_eq!(found, Some(config_path));
    }

    #[test]
    fn test_find_config_file_js() {
        let tmp = tempfile::tempdir().unwrap();
        let config_path = tmp.path().join("vertz.config.js");
        fs::write(&config_path, "export default {};").unwrap();

        let found = find_config_file(tmp.path());
        assert_eq!(found, Some(config_path));
    }

    #[test]
    fn test_find_config_file_ts_takes_priority() {
        let tmp = tempfile::tempdir().unwrap();
        let ts_path = tmp.path().join("vertz.config.ts");
        let js_path = tmp.path().join("vertz.config.js");
        fs::write(&ts_path, "export default {};").unwrap();
        fs::write(&js_path, "export default {};").unwrap();

        let found = find_config_file(tmp.path());
        assert_eq!(found, Some(ts_path));
    }

    #[test]
    fn test_find_config_file_none() {
        let tmp = tempfile::tempdir().unwrap();
        let found = find_config_file(tmp.path());
        assert!(found.is_none());
    }

    #[test]
    fn test_load_config_no_file_returns_default() {
        let tmp = tempfile::tempdir().unwrap();
        let config = load_test_config(tmp.path()).unwrap();
        assert!(config.include.is_empty());
        assert!(config.exclude.is_empty());
        assert!(config.timeout_ms.is_none());
        assert!(config.preload.is_empty());
    }

    #[test]
    fn test_parse_config_value_full() {
        let value = serde_json::json!({
            "include": ["src/**/*.test.ts"],
            "exclude": ["**/*.local.ts"],
            "timeout": 10000,
            "concurrency": 4,
            "reporter": "json",
            "coverage": true,
            "coverageThreshold": 90.0,
            "preload": ["./setup.ts"]
        });

        let config = parse_test_config_value(&value).unwrap();
        assert_eq!(config.include, vec!["src/**/*.test.ts"]);
        assert_eq!(config.exclude, vec!["**/*.local.ts"]);
        assert_eq!(config.timeout_ms, Some(10000));
        assert_eq!(config.concurrency, Some(4));
        assert_eq!(config.reporter, Some("json".to_string()));
        assert_eq!(config.coverage, Some(true));
        assert_eq!(config.coverage_threshold, Some(90.0));
        assert_eq!(config.preload, vec!["./setup.ts"]);
    }

    #[test]
    fn test_parse_config_value_empty() {
        let value = serde_json::json!({
            "include": [],
            "exclude": [],
            "timeout": null,
            "concurrency": null,
            "reporter": null,
            "coverage": null,
            "coverageThreshold": null,
            "preload": []
        });

        let config = parse_test_config_value(&value).unwrap();
        assert!(config.include.is_empty());
        assert!(config.timeout_ms.is_none());
        assert!(config.coverage.is_none());
        assert!(config.preload.is_empty());
    }

    #[test]
    fn test_parse_config_value_partial() {
        let value = serde_json::json!({"include": ["**/*.test.ts"], "timeout": 5000});

        let config = parse_test_config_value(&value).unwrap();
        assert_eq!(config.include, vec!["**/*.test.ts"]);
        assert_eq!(config.timeout_ms, Some(5000));
        assert!(config.exclude.is_empty());
        assert!(config.reporter.is_none());
    }

    #[test]
    fn test_load_config_from_ts_file() {
        let tmp = tempfile::tempdir().unwrap();
        let config_path = tmp.path().join("vertz.config.ts");
        fs::write(
            &config_path,
            r#"
            const config = {
                test: {
                    include: ['src/**/*.test.ts'],
                    timeout: 8000,
                    preload: ['./test-setup.ts'],
                }
            };
            export default config;
            "#,
        )
        .unwrap();

        let config = load_test_config(tmp.path()).unwrap();
        assert_eq!(config.include, vec!["src/**/*.test.ts"]);
        assert_eq!(config.timeout_ms, Some(8000));
        assert_eq!(config.preload, vec!["./test-setup.ts"]);
    }

    #[test]
    fn test_load_config_from_js_file() {
        let tmp = tempfile::tempdir().unwrap();
        let config_path = tmp.path().join("vertz.config.js");
        fs::write(
            &config_path,
            r#"
            export default {
                test: {
                    timeout: 3000,
                    coverage: true,
                    coverageThreshold: 85,
                }
            };
            "#,
        )
        .unwrap();

        let config = load_test_config(tmp.path()).unwrap();
        assert_eq!(config.timeout_ms, Some(3000));
        assert_eq!(config.coverage, Some(true));
        assert_eq!(config.coverage_threshold, Some(85.0));
    }

    #[test]
    fn test_load_config_empty_test_section() {
        let tmp = tempfile::tempdir().unwrap();
        let config_path = tmp.path().join("vertz.config.ts");
        fs::write(&config_path, "export default { dev: { port: 4000 } };").unwrap();

        let config = load_test_config(tmp.path()).unwrap();
        assert!(config.include.is_empty());
        assert!(config.timeout_ms.is_none());
    }

    #[test]
    fn test_transform_default_export() {
        let input = "const x = 1;\nexport default { test: { timeout: 5000 } };";
        let output = transform_default_export(input);
        assert!(output.contains("globalThis.__vertz_config = "));
        assert!(!output.contains("export default"));
    }
}
