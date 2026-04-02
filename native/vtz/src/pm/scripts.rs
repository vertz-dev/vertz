use std::collections::BTreeMap;
use std::path::Path;
use std::sync::Arc;
use std::time::Instant;

use crate::pm::output::PmOutput;
use crate::pm::resolver::ResolvedGraph;

/// Default timeout for postinstall scripts (60 seconds)
const SCRIPT_TIMEOUT_SECS: u64 = 60;

/// Result of running a single postinstall script
#[derive(Debug, Clone)]
pub struct ScriptResult {
    pub name: String,
    pub success: bool,
    pub duration_ms: u64,
    pub stdout: String,
    pub stderr: String,
    pub error: Option<String>,
}

/// Collect packages that have postinstall scripts from a resolved graph
pub fn packages_with_postinstall(
    graph: &ResolvedGraph,
    scripts: &BTreeMap<String, BTreeMap<String, String>>,
) -> Vec<(String, String, String)> {
    // Returns Vec of (name, version, postinstall_script)
    let mut result = Vec::new();
    for pkg in graph.packages.values() {
        let key = format!("{}@{}", pkg.name, pkg.version);
        if let Some(pkg_scripts) = scripts.get(&key) {
            if let Some(postinstall) = pkg_scripts.get("postinstall") {
                result.push((pkg.name.clone(), pkg.version.clone(), postinstall.clone()));
            }
        }
    }
    result.sort_by(|a, b| a.0.cmp(&b.0));
    result
}

/// Run all postinstall scripts sequentially
pub async fn run_postinstall_scripts(
    root_dir: &Path,
    packages: &[(String, String, String)],
    output: Arc<dyn PmOutput>,
) -> Vec<ScriptResult> {
    let mut results = Vec::new();

    for (name, version, script) in packages {
        output.script_started(name, script);

        let pkg_dir = root_dir.join("node_modules").join(name);

        if !pkg_dir.exists() {
            results.push(ScriptResult {
                name: name.clone(),
                success: false,
                duration_ms: 0,
                stdout: String::new(),
                stderr: String::new(),
                error: Some(format!(
                    "package directory not found: {}",
                    pkg_dir.display()
                )),
            });
            output.script_error(name, "package directory not found");
            continue;
        }

        let start = Instant::now();

        let result = run_script_with_timeout(&pkg_dir, script, SCRIPT_TIMEOUT_SECS).await;

        let duration_ms = start.elapsed().as_millis() as u64;

        match result {
            Ok((stdout, stderr, exit_code)) => {
                if exit_code == 0 {
                    output.script_complete(name, duration_ms);
                    results.push(ScriptResult {
                        name: name.clone(),
                        success: true,
                        duration_ms,
                        stdout,
                        stderr,
                        error: None,
                    });
                } else {
                    let error_msg = format!(
                        "script exited with code {} ({}@{})",
                        exit_code, name, version
                    );
                    output.script_error(name, &error_msg);
                    results.push(ScriptResult {
                        name: name.clone(),
                        success: false,
                        duration_ms,
                        stdout,
                        stderr,
                        error: Some(error_msg),
                    });
                }
            }
            Err(e) => {
                let error_msg = e.to_string();
                output.script_error(name, &error_msg);
                results.push(ScriptResult {
                    name: name.clone(),
                    success: false,
                    duration_ms,
                    stdout: String::new(),
                    stderr: String::new(),
                    error: Some(error_msg),
                });
            }
        }
    }

    results
}

/// Returns the platform shell command and its flag for running a script string.
/// Unix: `("sh", "-c")`, Windows: `("cmd.exe", "/C")`.
fn platform_shell() -> (&'static str, &'static str) {
    if cfg!(target_os = "windows") {
        ("cmd.exe", "/C")
    } else {
        ("sh", "-c")
    }
}

/// Returns the platform PATH separator: `";"` on Windows, `":"` on Unix.
pub fn path_separator() -> &'static str {
    if cfg!(target_os = "windows") {
        ";"
    } else {
        ":"
    }
}

/// Execute a single shell script in the given directory with a timeout.
/// Kills the child process if the timeout fires.
async fn run_script_with_timeout(
    dir: &Path,
    script: &str,
    timeout_secs: u64,
) -> Result<(String, String, i32), Box<dyn std::error::Error + Send + Sync>> {
    let (shell, flag) = platform_shell();
    let mut child = tokio::process::Command::new(shell)
        .arg(flag)
        .arg(script)
        .current_dir(dir)
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .spawn()?;

    // Take stdout/stderr handles before waiting (wait_with_output takes ownership)
    let child_stdout = child.stdout.take();
    let child_stderr = child.stderr.take();

    let result =
        tokio::time::timeout(std::time::Duration::from_secs(timeout_secs), child.wait()).await;

    match result {
        Ok(Ok(status)) => {
            let stdout = if let Some(mut out) = child_stdout {
                let mut buf = Vec::new();
                tokio::io::AsyncReadExt::read_to_end(&mut out, &mut buf)
                    .await
                    .unwrap_or(0);
                String::from_utf8_lossy(&buf).to_string()
            } else {
                String::new()
            };
            let stderr = if let Some(mut err) = child_stderr {
                let mut buf = Vec::new();
                tokio::io::AsyncReadExt::read_to_end(&mut err, &mut buf)
                    .await
                    .unwrap_or(0);
                String::from_utf8_lossy(&buf).to_string()
            } else {
                String::new()
            };
            let exit_code = status.code().unwrap_or(1);
            Ok((stdout, stderr, exit_code))
        }
        Ok(Err(e)) => Err(format!("failed to execute: {}", e).into()),
        Err(_) => {
            // Timeout — kill the child process
            let _ = child.kill().await;
            Err(format!("timed out after {}s", timeout_secs).into())
        }
    }
}

/// Execute a shell command with inherited stdio (no capture, no timeout).
/// Used for `vertz run` and `vertz exec` where user sees output in real time.
/// Returns the exit code of the child process.
pub async fn exec_inherit_stdio(
    dir: &Path,
    script: &str,
    env_overrides: &[(&str, String)],
) -> Result<i32, Box<dyn std::error::Error>> {
    let (shell, flag) = platform_shell();
    let mut cmd = tokio::process::Command::new(shell);
    cmd.arg(flag)
        .arg(script)
        .current_dir(dir)
        .stdout(std::process::Stdio::inherit())
        .stderr(std::process::Stdio::inherit())
        .stdin(std::process::Stdio::inherit());

    for (key, value) in env_overrides {
        cmd.env(key, value);
    }

    let status = cmd.spawn()?.wait().await?;
    Ok(status.code().unwrap_or(1))
}

/// Run a named lifecycle script from package.json in the given directory.
/// Returns Ok(()) if the script ran successfully, Err if it failed.
/// If the script doesn't exist, returns Ok(()) (no-op).
pub async fn run_lifecycle_script(
    dir: &Path,
    scripts: &BTreeMap<String, String>,
    script_name: &str,
    output: Arc<dyn PmOutput>,
) -> Result<(), Box<dyn std::error::Error>> {
    let Some(script) = scripts.get(script_name) else {
        return Ok(());
    };

    output.script_started(script_name, script);
    let start = Instant::now();

    let result = run_script_with_timeout(dir, script, SCRIPT_TIMEOUT_SECS).await;
    let duration_ms = start.elapsed().as_millis() as u64;

    match result {
        Ok((_stdout, _stderr, exit_code)) => {
            if exit_code == 0 {
                output.script_complete(script_name, duration_ms);
                Ok(())
            } else {
                let msg = format!("{} script exited with code {}", script_name, exit_code);
                output.script_error(script_name, &msg);
                Err(msg.into())
            }
        }
        Err(e) => {
            let msg = e.to_string();
            output.script_error(script_name, &msg);
            Err(msg.into())
        }
    }
}

/// Check if a package has a postinstall script
pub fn has_postinstall(scripts: &Option<BTreeMap<String, String>>) -> bool {
    scripts
        .as_ref()
        .map(|s| s.contains_key("postinstall"))
        .unwrap_or(false)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::pm::resolver::ResolvedGraph;
    use crate::pm::types::ResolvedPackage;

    #[test]
    fn test_has_postinstall_none() {
        assert!(!has_postinstall(&None));
    }

    #[test]
    fn test_has_postinstall_empty() {
        assert!(!has_postinstall(&Some(BTreeMap::new())));
    }

    #[test]
    fn test_has_postinstall_with_script() {
        let mut scripts = BTreeMap::new();
        scripts.insert("postinstall".to_string(), "echo done".to_string());
        assert!(has_postinstall(&Some(scripts)));
    }

    #[test]
    fn test_has_postinstall_without_postinstall() {
        let mut scripts = BTreeMap::new();
        scripts.insert("prepare".to_string(), "npm run build".to_string());
        assert!(!has_postinstall(&Some(scripts)));
    }

    #[test]
    fn test_packages_with_postinstall_empty_graph() {
        let graph = ResolvedGraph::default();
        let scripts = BTreeMap::new();
        let result = packages_with_postinstall(&graph, &scripts);
        assert!(result.is_empty());
    }

    #[test]
    fn test_packages_with_postinstall_no_scripts() {
        let mut graph = ResolvedGraph::default();
        graph.packages.insert(
            "zod@3.24.4".to_string(),
            ResolvedPackage {
                name: "zod".to_string(),
                version: "3.24.4".to_string(),
                tarball_url: String::new(),
                integrity: String::new(),
                dependencies: BTreeMap::new(),
                bin: BTreeMap::new(),
                nest_path: vec![],
            },
        );
        let scripts = BTreeMap::new();
        let result = packages_with_postinstall(&graph, &scripts);
        assert!(result.is_empty());
    }

    #[test]
    fn test_packages_with_postinstall_has_script() {
        let mut graph = ResolvedGraph::default();
        graph.packages.insert(
            "esbuild@0.20.0".to_string(),
            ResolvedPackage {
                name: "esbuild".to_string(),
                version: "0.20.0".to_string(),
                tarball_url: String::new(),
                integrity: String::new(),
                dependencies: BTreeMap::new(),
                bin: BTreeMap::new(),
                nest_path: vec![],
            },
        );

        let mut scripts = BTreeMap::new();
        let mut pkg_scripts = BTreeMap::new();
        pkg_scripts.insert("postinstall".to_string(), "node install.js".to_string());
        scripts.insert("esbuild@0.20.0".to_string(), pkg_scripts);

        let result = packages_with_postinstall(&graph, &scripts);
        assert_eq!(result.len(), 1);
        assert_eq!(result[0].0, "esbuild");
        assert_eq!(result[0].1, "0.20.0");
        assert_eq!(result[0].2, "node install.js");
    }

    #[test]
    fn test_packages_with_postinstall_sorted() {
        let mut graph = ResolvedGraph::default();
        graph.packages.insert(
            "prisma@5.0.0".to_string(),
            ResolvedPackage {
                name: "prisma".to_string(),
                version: "5.0.0".to_string(),
                tarball_url: String::new(),
                integrity: String::new(),
                dependencies: BTreeMap::new(),
                bin: BTreeMap::new(),
                nest_path: vec![],
            },
        );
        graph.packages.insert(
            "esbuild@0.20.0".to_string(),
            ResolvedPackage {
                name: "esbuild".to_string(),
                version: "0.20.0".to_string(),
                tarball_url: String::new(),
                integrity: String::new(),
                dependencies: BTreeMap::new(),
                bin: BTreeMap::new(),
                nest_path: vec![],
            },
        );

        let mut scripts = BTreeMap::new();

        let mut prisma_scripts = BTreeMap::new();
        prisma_scripts.insert("postinstall".to_string(), "prisma generate".to_string());
        scripts.insert("prisma@5.0.0".to_string(), prisma_scripts);

        let mut esbuild_scripts = BTreeMap::new();
        esbuild_scripts.insert("postinstall".to_string(), "node install.js".to_string());
        scripts.insert("esbuild@0.20.0".to_string(), esbuild_scripts);

        let result = packages_with_postinstall(&graph, &scripts);
        assert_eq!(result.len(), 2);
        // Sorted by name
        assert_eq!(result[0].0, "esbuild");
        assert_eq!(result[1].0, "prisma");
    }

    #[tokio::test]
    async fn test_exec_inherit_stdio_success() {
        let dir = tempfile::tempdir().unwrap();
        let code = exec_inherit_stdio(dir.path(), "true", &[]).await.unwrap();
        assert_eq!(code, 0);
    }

    #[tokio::test]
    async fn test_exec_inherit_stdio_failure() {
        let dir = tempfile::tempdir().unwrap();
        let code = exec_inherit_stdio(dir.path(), "false", &[]).await.unwrap();
        assert_ne!(code, 0);
    }

    #[tokio::test]
    async fn test_exec_inherit_stdio_with_env() {
        let dir = tempfile::tempdir().unwrap();
        let code = exec_inherit_stdio(
            dir.path(),
            "echo $MY_VAR | grep -q hello",
            &[("MY_VAR", "hello".to_string())],
        )
        .await
        .unwrap();
        assert_eq!(code, 0);
    }

    #[tokio::test]
    async fn test_run_postinstall_success() {
        let dir = tempfile::tempdir().unwrap();
        let pkg_dir = dir.path().join("node_modules").join("test-pkg");
        std::fs::create_dir_all(&pkg_dir).unwrap();

        let packages = vec![(
            "test-pkg".to_string(),
            "1.0.0".to_string(),
            "echo hello".to_string(),
        )];

        let output: Arc<dyn PmOutput> = Arc::new(crate::pm::output::TextOutput::new(false));
        let results = run_postinstall_scripts(dir.path(), &packages, output).await;

        assert_eq!(results.len(), 1);
        assert!(results[0].success);
        assert!(results[0].stdout.contains("hello"));
        assert!(results[0].error.is_none());
    }

    #[tokio::test]
    async fn test_run_postinstall_failure() {
        let dir = tempfile::tempdir().unwrap();
        let pkg_dir = dir.path().join("node_modules").join("fail-pkg");
        std::fs::create_dir_all(&pkg_dir).unwrap();

        let packages = vec![(
            "fail-pkg".to_string(),
            "1.0.0".to_string(),
            "exit 1".to_string(),
        )];

        let output: Arc<dyn PmOutput> = Arc::new(crate::pm::output::TextOutput::new(false));
        let results = run_postinstall_scripts(dir.path(), &packages, output).await;

        assert_eq!(results.len(), 1);
        assert!(!results[0].success);
        assert!(results[0]
            .error
            .as_ref()
            .unwrap()
            .contains("exited with code 1"));
    }

    #[tokio::test]
    async fn test_run_postinstall_missing_dir() {
        let dir = tempfile::tempdir().unwrap();
        // Don't create node_modules/test-pkg — it should be missing

        let packages = vec![(
            "test-pkg".to_string(),
            "1.0.0".to_string(),
            "echo hello".to_string(),
        )];

        let output: Arc<dyn PmOutput> = Arc::new(crate::pm::output::TextOutput::new(false));
        let results = run_postinstall_scripts(dir.path(), &packages, output).await;

        assert_eq!(results.len(), 1);
        assert!(!results[0].success);
        assert!(results[0]
            .error
            .as_ref()
            .unwrap()
            .contains("directory not found"));
    }

    #[test]
    fn test_platform_shell_returns_valid_pair() {
        let (shell, flag) = platform_shell();
        assert!(!shell.is_empty());
        assert!(!flag.is_empty());
        // On Unix (where tests run), should be sh -c
        #[cfg(not(target_os = "windows"))]
        {
            assert_eq!(shell, "sh");
            assert_eq!(flag, "-c");
        }
        #[cfg(target_os = "windows")]
        {
            assert_eq!(shell, "cmd.exe");
            assert_eq!(flag, "/C");
        }
    }

    #[test]
    fn test_path_separator() {
        let sep = path_separator();
        #[cfg(not(target_os = "windows"))]
        assert_eq!(sep, ":");
        #[cfg(target_os = "windows")]
        assert_eq!(sep, ";");
    }
}
