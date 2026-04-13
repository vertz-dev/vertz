use deno_core::op2;
use deno_core::OpDecl;
use serde::{Deserialize, Serialize};
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

    let mut args = vec!["--bundle=false".to_string()];

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

/// Get the op declarations for esbuild ops.
pub fn op_decls() -> Vec<OpDecl> {
    vec![op_esbuild_transform_sync()]
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
