use deno_core::op2;
use deno_core::OpDecl;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::PathBuf;
use std::process::Command;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EsbuildTransformOptions {
    pub source: String,
    pub loader: Option<String>,
    pub jsx: Option<String>,
    pub jsx_import_source: Option<String>,
    pub target: Option<String>,
    pub sourcemap: Option<bool>,
}

#[derive(Debug, Serialize)]
pub struct EsbuildTransformResult {
    pub code: String,
    pub map: String,
    pub warnings: Vec<String>,
}

/// Resolve the esbuild binary path.
///
/// Resolution order:
/// 1. node_modules/.bin/esbuild relative to CWD
/// 2. node_modules/@esbuild/{platform}-{arch}/bin/esbuild relative to CWD
/// 3. System PATH via `which`
pub(crate) fn resolve_esbuild_binary() -> Result<PathBuf, deno_core::error::AnyError> {
    let cwd = std::env::current_dir().unwrap_or_else(|_| PathBuf::from("."));

    // 1. node_modules/.bin/esbuild
    let bin_path = cwd.join("node_modules/.bin/esbuild");
    if bin_path.exists() {
        return Ok(bin_path);
    }

    // 2. Platform-specific binary
    let platform = if cfg!(target_os = "macos") {
        "darwin"
    } else if cfg!(target_os = "linux") {
        "linux"
    } else if cfg!(target_os = "windows") {
        "win32"
    } else {
        "unknown"
    };
    let arch = if cfg!(target_arch = "aarch64") {
        "arm64"
    } else if cfg!(target_arch = "x86_64") {
        "x64"
    } else {
        "unknown"
    };
    let platform_path = cwd.join(format!(
        "node_modules/@esbuild/{platform}-{arch}/bin/esbuild"
    ));
    if platform_path.exists() {
        return Ok(platform_path);
    }

    // 3. System PATH
    if let Ok(path) = which::which("esbuild") {
        return Ok(path);
    }

    Err(deno_core::anyhow::anyhow!(
        "esbuild binary not found. Ensure dependencies are installed (vtz install)."
    ))
}

/// Reject option values containing null bytes or newlines (defense-in-depth).
fn validate_option(name: &str, value: &str) -> Result<(), deno_core::error::AnyError> {
    if value.contains('\0') || value.contains('\n') || value.contains('\r') {
        return Err(deno_core::anyhow::anyhow!(
            "esbuild option '{}' contains invalid characters",
            name
        ));
    }
    Ok(())
}

/// Core transform logic — testable without the op2 macro.
pub(crate) fn esbuild_transform(
    options: &EsbuildTransformOptions,
) -> Result<EsbuildTransformResult, deno_core::error::AnyError> {
    let esbuild = resolve_esbuild_binary()?;

    let mut args = Vec::new();

    if let Some(ref loader) = options.loader {
        validate_option("loader", loader)?;
        args.push(format!("--loader={loader}"));
    }
    if let Some(ref jsx) = options.jsx {
        validate_option("jsx", jsx)?;
        args.push(format!("--jsx={jsx}"));
    }
    if let Some(ref source) = options.jsx_import_source {
        validate_option("jsx_import_source", source)?;
        args.push(format!("--jsx-import-source={source}"));
    }
    if let Some(ref target) = options.target {
        validate_option("target", target)?;
        args.push(format!("--target={target}"));
    }
    if options.sourcemap == Some(true) {
        args.push("--sourcemap=inline".to_string());
    }

    let mut child = Command::new(&esbuild)
        .args(&args)
        .stdin(std::process::Stdio::piped())
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .spawn()
        .map_err(|e| {
            deno_core::anyhow::anyhow!(
                "Failed to execute esbuild at '{}': {}",
                esbuild.display(),
                e
            )
        })?;

    // Write source to stdin
    if let Some(mut stdin) = child.stdin.take() {
        use std::io::Write;
        stdin.write_all(options.source.as_bytes())?;
        // stdin is dropped here, closing the pipe
    }

    let output = child
        .wait_with_output()
        .map_err(|e| deno_core::anyhow::anyhow!("esbuild process failed: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(deno_core::anyhow::anyhow!(
            "esbuild transform failed: {}",
            stderr.trim()
        ));
    }

    let code = String::from_utf8_lossy(&output.stdout).to_string();

    Ok(EsbuildTransformResult {
        code,
        map: String::new(),
        warnings: Vec::new(),
    })
}

/// Transform source code using the esbuild CLI.
///
/// Pipes source via stdin and reads transformed code from stdout.
#[op2]
#[serde]
pub fn op_esbuild_transform_sync(
    #[serde] options: EsbuildTransformOptions,
) -> Result<EsbuildTransformResult, deno_core::error::AnyError> {
    esbuild_transform(&options)
}

// ---------------------------------------------------------------------------
// esbuild.build() — shell out to the esbuild CLI
// ---------------------------------------------------------------------------

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EsbuildBuildOptions {
    pub entry_points: Vec<String>,
    #[serde(default)]
    pub bundle: bool,
    pub format: Option<String>,
    pub outdir: Option<String>,
    pub outfile: Option<String>,
    #[serde(default)]
    pub splitting: bool,
    pub target: Option<String>,
    pub platform: Option<String>,
    pub external: Option<Vec<String>>,
    pub banner: Option<HashMap<String, String>>,
    pub sourcemap: Option<serde_json::Value>,
    #[serde(default)]
    pub metafile: bool,
    #[serde(default)]
    pub minify: bool,
    pub define: Option<HashMap<String, String>>,
    pub log_level: Option<String>,
    pub main_fields: Option<Vec<String>>,
    pub abs_working_dir: Option<String>,
    #[serde(default)]
    pub has_plugins: bool,
}

#[derive(Debug, Serialize)]
pub struct EsbuildBuildResult {
    pub errors: Vec<String>,
    pub warnings: Vec<String>,
    pub metafile: Option<serde_json::Value>,
}

/// Core build logic — testable without the op2 macro.
pub(crate) fn esbuild_build(
    options: &EsbuildBuildOptions,
) -> Result<EsbuildBuildResult, deno_core::error::AnyError> {
    if options.entry_points.is_empty() {
        return Err(deno_core::anyhow::anyhow!(
            "esbuild.build() requires at least one entry point"
        ));
    }

    if options.has_plugins {
        return Err(deno_core::anyhow::anyhow!(
            "esbuild.build() plugins are not supported in the vtz runtime. \
             Plugins require the esbuild JS API service, which is not available. \
             Remove plugins or run under Node/Bun."
        ));
    }

    let esbuild = resolve_esbuild_binary()?;
    let mut args = Vec::new();

    // Entry points as positional args
    for entry in &options.entry_points {
        validate_option("entryPoints", entry)?;
        args.push(entry.clone());
    }

    if options.bundle {
        args.push("--bundle".to_string());
    }

    if let Some(ref format) = options.format {
        validate_option("format", format)?;
        args.push(format!("--format={format}"));
    }

    if let Some(ref outdir) = options.outdir {
        validate_option("outdir", outdir)?;
        args.push(format!("--outdir={outdir}"));
    }

    if let Some(ref outfile) = options.outfile {
        validate_option("outfile", outfile)?;
        args.push(format!("--outfile={outfile}"));
    }

    if options.splitting {
        args.push("--splitting".to_string());
    }

    if let Some(ref target) = options.target {
        validate_option("target", target)?;
        args.push(format!("--target={target}"));
    }

    if let Some(ref platform) = options.platform {
        validate_option("platform", platform)?;
        args.push(format!("--platform={platform}"));
    }

    if let Some(ref externals) = options.external {
        for ext in externals {
            validate_option("external", ext)?;
            args.push(format!("--external:{ext}"));
        }
    }

    if let Some(ref banner) = options.banner {
        for (ext_type, value) in banner {
            validate_option("banner-type", ext_type)?;
            validate_option("banner-value", value)?;
            args.push(format!("--banner:{ext_type}={value}"));
        }
    }

    // sourcemap: true | "inline" | "external" | "linked" | "both"
    if let Some(ref sm) = options.sourcemap {
        match sm {
            serde_json::Value::Bool(true) => args.push("--sourcemap=linked".to_string()),
            serde_json::Value::String(s) => {
                validate_option("sourcemap", s)?;
                args.push(format!("--sourcemap={s}"));
            }
            _ => {} // false or null — no flag
        }
    }

    if options.minify {
        args.push("--minify".to_string());
    }

    if let Some(ref defines) = options.define {
        for (key, value) in defines {
            validate_option("define-key", key)?;
            validate_option("define-value", value)?;
            args.push(format!("--define:{key}={value}"));
        }
    }

    if let Some(ref log_level) = options.log_level {
        validate_option("logLevel", log_level)?;
        args.push(format!("--log-level={log_level}"));
    }

    if let Some(ref main_fields) = options.main_fields {
        let joined = main_fields.join(",");
        validate_option("mainFields", &joined)?;
        args.push(format!("--main-fields={joined}"));
    }

    // Metafile: write to a unique temp file, read back after build.
    // Use an atomic counter + PID to guarantee uniqueness across concurrent calls.
    static COUNTER: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);
    let metafile_path = if options.metafile {
        let n = COUNTER.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
        let path =
            std::env::temp_dir().join(format!("vtz-esbuild-meta-{}-{n}.json", std::process::id()));
        args.push(format!("--metafile={}", path.display()));
        Some(path)
    } else {
        None
    };

    // Determine working directory
    let working_dir = options
        .abs_working_dir
        .as_ref()
        .map(PathBuf::from)
        .unwrap_or_else(|| std::env::current_dir().unwrap_or_else(|_| PathBuf::from(".")));

    let output = Command::new(&esbuild)
        .args(&args)
        .current_dir(&working_dir)
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .output()
        .map_err(|e| {
            deno_core::anyhow::anyhow!(
                "Failed to execute esbuild at '{}': {}",
                esbuild.display(),
                e
            )
        })?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        // Clean up temp metafile on failure
        if let Some(ref path) = metafile_path {
            let _ = std::fs::remove_file(path);
        }
        return Err(deno_core::anyhow::anyhow!(
            "esbuild build failed: {}",
            stderr.trim()
        ));
    }

    // Read metafile if requested — always clean up the temp file
    let metafile = if let Some(ref path) = metafile_path {
        let content = std::fs::read_to_string(path);
        let _ = std::fs::remove_file(path); // Clean up before checking result
        let content = content.map_err(|e| {
            deno_core::anyhow::anyhow!(
                "Failed to read esbuild metafile at '{}': {}",
                path.display(),
                e
            )
        })?;
        let parsed: serde_json::Value = serde_json::from_str(&content)
            .map_err(|e| deno_core::anyhow::anyhow!("Failed to parse esbuild metafile: {}", e))?;
        Some(parsed)
    } else {
        None
    };

    Ok(EsbuildBuildResult {
        errors: Vec::new(),
        warnings: Vec::new(),
        metafile,
    })
}

/// Build/bundle using the esbuild CLI.
///
/// Spawns esbuild with CLI flags derived from the JS API options.
#[op2]
#[serde]
pub fn op_esbuild_build_sync(
    #[serde] options: EsbuildBuildOptions,
) -> Result<EsbuildBuildResult, deno_core::error::AnyError> {
    esbuild_build(&options)
}

/// Get the op declarations for esbuild ops.
pub fn op_decls() -> Vec<OpDecl> {
    vec![op_esbuild_transform_sync(), op_esbuild_build_sync()]
}

#[cfg(test)]
mod tests {
    use super::*;

    fn has_esbuild() -> bool {
        resolve_esbuild_binary().is_ok()
    }

    #[test]
    fn test_resolve_esbuild_binary_returns_path_or_error() {
        let result = resolve_esbuild_binary();
        match result {
            Ok(path) => assert!(path.exists(), "Resolved path should exist"),
            Err(e) => assert!(
                e.to_string().contains("esbuild binary not found"),
                "Error message should be user-friendly: got '{e}'"
            ),
        }
    }

    #[test]
    fn test_esbuild_transform_basic_ts() {
        if !has_esbuild() {
            eprintln!("Skipping: esbuild not found");
            return;
        }

        let result = esbuild_transform(&EsbuildTransformOptions {
            source: "const x: number = 1 + 2;".to_string(),
            loader: Some("ts".to_string()),
            jsx: None,
            jsx_import_source: None,
            target: None,
            sourcemap: None,
        })
        .unwrap();

        assert!(
            result.code.contains("const x = 1 + 2"),
            "Should strip TS type annotation: got '{}'",
            result.code.trim()
        );
    }

    #[test]
    fn test_esbuild_transform_tsx_jsx_automatic() {
        if !has_esbuild() {
            eprintln!("Skipping: esbuild not found");
            return;
        }

        let result = esbuild_transform(&EsbuildTransformOptions {
            source: "const el = <div>hello</div>;".to_string(),
            loader: Some("tsx".to_string()),
            jsx: Some("automatic".to_string()),
            jsx_import_source: Some("@vertz/ui".to_string()),
            target: None,
            sourcemap: None,
        })
        .unwrap();

        assert!(
            result.code.contains("@vertz/ui") || result.code.contains("jsx"),
            "Should contain JSX runtime import: got '{}'",
            result.code.trim()
        );
    }

    #[test]
    fn test_esbuild_transform_syntax_error() {
        if !has_esbuild() {
            eprintln!("Skipping: esbuild not found");
            return;
        }

        let result = esbuild_transform(&EsbuildTransformOptions {
            source: "const x = {{{;".to_string(),
            loader: Some("ts".to_string()),
            jsx: None,
            jsx_import_source: None,
            target: None,
            sourcemap: None,
        });

        assert!(result.is_err(), "Should fail on syntax error");
        let err = result.unwrap_err().to_string();
        assert!(
            err.contains("esbuild transform failed"),
            "Error should indicate transform failure: got '{err}'"
        );
    }

    #[test]
    fn test_esbuild_build_basic_bundle() {
        if !has_esbuild() {
            eprintln!("Skipping: esbuild not found");
            return;
        }

        // Create a temp directory with a simple TS file
        let tmp = std::env::temp_dir().join("vtz-esbuild-build-test");
        let src_dir = tmp.join("src");
        let _ = std::fs::create_dir_all(&src_dir);
        std::fs::write(
            src_dir.join("entry.ts"),
            "export const hello: string = 'world';",
        )
        .unwrap();

        let result = esbuild_build(&EsbuildBuildOptions {
            entry_points: vec!["src/entry.ts".to_string()],
            bundle: true,
            format: Some("esm".to_string()),
            outdir: Some("out".to_string()),
            outfile: None,
            splitting: false,
            target: Some("esnext".to_string()),
            platform: Some("neutral".to_string()),
            external: None,
            banner: None,
            sourcemap: None,
            metafile: true,
            minify: false,
            define: None,
            log_level: None,
            main_fields: None,
            abs_working_dir: Some(tmp.to_string_lossy().to_string()),
            has_plugins: false,
        });

        // Clean up
        let _ = std::fs::remove_dir_all(&tmp);

        let result = result.unwrap();
        assert!(result.errors.is_empty(), "Should have no errors");
        assert!(
            result.metafile.is_some(),
            "Should return metafile when requested"
        );
        let metafile = result.metafile.unwrap();
        assert!(
            metafile.get("outputs").is_some(),
            "Metafile should have outputs: got {metafile}"
        );
    }

    #[test]
    fn test_esbuild_build_with_external() {
        if !has_esbuild() {
            eprintln!("Skipping: esbuild not found");
            return;
        }

        let tmp = std::env::temp_dir().join("vtz-esbuild-build-ext-test");
        let src_dir = tmp.join("src");
        let _ = std::fs::create_dir_all(&src_dir);
        std::fs::write(
            src_dir.join("entry.ts"),
            "import lodash from 'lodash';\nexport const x = lodash;",
        )
        .unwrap();

        let result = esbuild_build(&EsbuildBuildOptions {
            entry_points: vec!["src/entry.ts".to_string()],
            bundle: true,
            format: Some("esm".to_string()),
            outdir: Some("out".to_string()),
            outfile: None,
            splitting: false,
            target: Some("esnext".to_string()),
            platform: Some("neutral".to_string()),
            external: Some(vec!["lodash".to_string()]),
            banner: None,
            sourcemap: None,
            metafile: false,
            minify: false,
            define: None,
            log_level: None,
            main_fields: None,
            abs_working_dir: Some(tmp.to_string_lossy().to_string()),
            has_plugins: false,
        });

        // Verify output contains external import
        let out_file = tmp.join("out/entry.js");
        let content = std::fs::read_to_string(&out_file).unwrap_or_default();

        // Clean up
        let _ = std::fs::remove_dir_all(&tmp);

        result.unwrap();
        assert!(
            content.contains("lodash"),
            "External import should be preserved: got '{content}'"
        );
    }

    #[test]
    fn test_esbuild_build_invalid_entry_fails() {
        if !has_esbuild() {
            eprintln!("Skipping: esbuild not found");
            return;
        }

        let result = esbuild_build(&EsbuildBuildOptions {
            entry_points: vec!["nonexistent-file.ts".to_string()],
            bundle: true,
            format: Some("esm".to_string()),
            outdir: Some("/tmp/vtz-esbuild-fail-test".to_string()),
            outfile: None,
            splitting: false,
            target: None,
            platform: None,
            external: None,
            banner: None,
            sourcemap: None,
            metafile: false,
            minify: false,
            define: None,
            log_level: None,
            main_fields: None,
            abs_working_dir: None,
            has_plugins: false,
        });

        assert!(result.is_err(), "Should fail on nonexistent entry point");
        let err = result.unwrap_err().to_string();
        assert!(
            err.contains("esbuild build failed"),
            "Error should indicate build failure: got '{err}'"
        );
    }

    #[test]
    fn test_esbuild_build_empty_entry_points_fails() {
        let result = esbuild_build(&EsbuildBuildOptions {
            entry_points: vec![],
            bundle: false,
            format: None,
            outdir: None,
            outfile: None,
            splitting: false,
            target: None,
            platform: None,
            external: None,
            banner: None,
            sourcemap: None,
            metafile: false,
            minify: false,
            define: None,
            log_level: None,
            main_fields: None,
            abs_working_dir: None,
            has_plugins: false,
        });

        assert!(result.is_err(), "Should fail with empty entry points");
        let err = result.unwrap_err().to_string();
        assert!(
            err.contains("at least one entry point"),
            "Error should mention entry points: got '{err}'"
        );
    }

    #[test]
    fn test_esbuild_build_plugins_rejected() {
        let result = esbuild_build(&EsbuildBuildOptions {
            entry_points: vec!["entry.ts".to_string()],
            bundle: false,
            format: None,
            outdir: None,
            outfile: None,
            splitting: false,
            target: None,
            platform: None,
            external: None,
            banner: None,
            sourcemap: None,
            metafile: false,
            minify: false,
            define: None,
            log_level: None,
            main_fields: None,
            abs_working_dir: None,
            has_plugins: true,
        });

        assert!(result.is_err(), "Should fail when plugins are present");
        let err = result.unwrap_err().to_string();
        assert!(
            err.contains("plugins are not supported"),
            "Error should mention plugins: got '{err}'"
        );
    }

    #[test]
    fn test_esbuild_transform_result_no_trailing_issues() {
        if !has_esbuild() {
            eprintln!("Skipping: esbuild not found");
            return;
        }

        let result = esbuild_transform(&EsbuildTransformOptions {
            source: "export const add = (a: number, b: number): number => a + b;".to_string(),
            loader: Some("ts".to_string()),
            jsx: None,
            jsx_import_source: None,
            target: None,
            sourcemap: None,
        })
        .unwrap();

        assert!(result.warnings.is_empty());
        assert!(result.map.is_empty());
        assert!(!result.code.is_empty());
    }
}
