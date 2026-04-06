use super::github::GitHubClient;
use super::output::PmOutput;
use super::registry::RegistryClient;
use super::tarball::{extract_github_tarball, extract_tarball};
use super::vertzrc::ScriptPolicy;
use std::path::{Path, PathBuf};
use std::sync::Arc;

/// Whether `fetch_npm_template` executed a bin script or extracted a template.
enum NpmFetchResult {
    /// Package had a bin entry and was executed — project was scaffolded by the script.
    BinExecuted,
    /// Package was a plain template — files were extracted to the destination.
    TemplateExtracted,
}

/// Errors specific to `vtz create` operations
#[derive(Debug)]
pub enum CreateError {
    /// Template string could not be parsed
    InvalidTemplate(String),
    /// Package not found on NPM registry
    PackageNotFound(String),
    /// Destination directory already exists and is not empty
    DestinationExists(PathBuf),
    /// GitHub API error
    GitHub(super::github::GitHubError),
    /// I/O or other error
    Other(String),
}

impl std::fmt::Display for CreateError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            CreateError::InvalidTemplate(t) => write!(f, "invalid template: \"{}\"", t),
            CreateError::PackageNotFound(name) => {
                write!(f, "package \"{}\" not found on npm registry", name)
            }
            CreateError::DestinationExists(p) => {
                write!(
                    f,
                    "destination \"{}\" already exists and is not empty",
                    p.display()
                )
            }
            CreateError::GitHub(e) => write!(f, "{}", e),
            CreateError::Other(msg) => write!(f, "{}", msg),
        }
    }
}

impl std::error::Error for CreateError {}

impl From<super::github::GitHubError> for CreateError {
    fn from(e: super::github::GitHubError) -> Self {
        CreateError::GitHub(e)
    }
}

/// Where to fetch the template from.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum TemplateSource {
    /// NPM package (e.g. `create-vertz`). Default for short names.
    Npm { package_name: String },
    /// GitHub repository (e.g. `owner/repo`). Used for owner/repo and full URLs.
    GitHub { owner: String, repo: String },
}

/// Parse a template string into a source.
///
/// Resolution order (matches `bun create` / `npm create`):
/// - Full GitHub URL (`https://github.com/owner/repo`) → GitHub
/// - `owner/repo` → GitHub
/// - Short name (`vertz`) → NPM package `create-vertz`
pub fn parse_template(template: &str) -> Result<TemplateSource, CreateError> {
    let template = template.trim();

    if template.is_empty() {
        return Err(CreateError::InvalidTemplate(template.to_string()));
    }

    // Full URL: https://github.com/owner/repo
    if template.starts_with("https://github.com/") || template.starts_with("http://github.com/") {
        return parse_github_url(template);
    }

    // owner/repo format (contains exactly one slash, no protocol)
    if let Some((owner, repo)) = template.split_once('/') {
        if !owner.is_empty() && !repo.is_empty() && !repo.contains('/') {
            return Ok(TemplateSource::GitHub {
                owner: owner.to_string(),
                repo: repo.to_string(),
            });
        }
        return Err(CreateError::InvalidTemplate(template.to_string()));
    }

    // Short name: maps to create-<name> NPM package
    Ok(TemplateSource::Npm {
        package_name: format!("create-{}", template),
    })
}

fn parse_github_url(url: &str) -> Result<TemplateSource, CreateError> {
    let path = url
        .strip_prefix("https://github.com/")
        .or_else(|| url.strip_prefix("http://github.com/"))
        .unwrap_or("");

    let path = path.strip_suffix(".git").unwrap_or(path);
    let path = path.strip_suffix('/').unwrap_or(path);

    match path.split_once('/') {
        Some((owner, repo)) if !owner.is_empty() && !repo.is_empty() && !repo.contains('/') => {
            Ok(TemplateSource::GitHub {
                owner: owner.to_string(),
                repo: repo.to_string(),
            })
        }
        _ => Err(CreateError::InvalidTemplate(url.to_string())),
    }
}

/// Derive a default directory name from the template source.
fn default_dir_name(source: &TemplateSource) -> String {
    match source {
        TemplateSource::Npm { package_name } => package_name
            .strip_prefix("create-")
            .unwrap_or(package_name)
            .to_string(),
        TemplateSource::GitHub { repo, .. } => {
            repo.strip_prefix("create-").unwrap_or(repo).to_string()
        }
    }
}

/// Determine the destination directory.
///
/// If `dest` is provided, use it. Otherwise derive from the template source.
pub fn resolve_destination(dest: Option<&str>, source: &TemplateSource) -> PathBuf {
    if let Some(d) = dest {
        return PathBuf::from(d);
    }
    PathBuf::from(default_dir_name(source))
}

/// Check that the destination is usable (doesn't exist or is empty).
pub fn validate_destination(dest: &Path) -> Result<(), CreateError> {
    if dest.exists() {
        if dest.is_dir() {
            let is_empty = std::fs::read_dir(dest)
                .map(|mut entries| entries.next().is_none())
                .unwrap_or(false);
            if is_empty {
                return Ok(());
            }
        }
        return Err(CreateError::DestinationExists(dest.to_path_buf()));
    }
    Ok(())
}

/// Update the "name" field in package.json to match the project name.
pub fn update_package_name(
    dest: &Path,
    name: &str,
) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    let pkg_path = dest.join("package.json");
    if !pkg_path.exists() {
        return Ok(());
    }

    let content = std::fs::read_to_string(&pkg_path)?;
    let mut pkg: serde_json::Value = serde_json::from_str(&content)?;

    if let Some(obj) = pkg.as_object_mut() {
        obj.insert(
            "name".to_string(),
            serde_json::Value::String(name.to_string()),
        );
    }

    let output = serde_json::to_string_pretty(&pkg)?;
    std::fs::write(&pkg_path, format!("{}\n", output))?;
    Ok(())
}

/// Run `git init` and create an initial commit in the given directory.
fn git_init(dest: &Path) -> Result<(), CreateError> {
    let run = |args: &[&str]| -> Result<(), CreateError> {
        let status = std::process::Command::new("git")
            .args(args)
            .current_dir(dest)
            .stdout(std::process::Stdio::null())
            .stderr(std::process::Stdio::null())
            .status()
            .map_err(|e| CreateError::Other(format!("failed to run git: {}", e)))?;
        if !status.success() {
            return Err(CreateError::Other(format!(
                "git {} failed with exit code {}",
                args.join(" "),
                status
            )));
        }
        Ok(())
    };

    run(&["init"])?;
    run(&["add", "-A"])?;
    run(&["commit", "-m", "Initial commit from vtz create"])?;
    Ok(())
}

/// Find a JS runtime on PATH (`bun` preferred, then `node`).
fn find_js_runtime() -> Result<String, CreateError> {
    for cmd in ["bun", "node"] {
        if std::process::Command::new(cmd)
            .arg("--version")
            .stdout(std::process::Stdio::null())
            .stderr(std::process::Stdio::null())
            .status()
            .is_ok()
        {
            return Ok(cmd.to_string());
        }
    }
    Err(CreateError::Other(
        "no JavaScript runtime found — install bun or node to run create-* packages".to_string(),
    ))
}

/// Move all files/dirs from `src` into `dst` (which must already exist).
fn move_dir_contents(src: &Path, dst: &Path) -> Result<(), CreateError> {
    for entry in std::fs::read_dir(src)
        .map_err(|e| CreateError::Other(format!("failed to read temp dir: {}", e)))?
    {
        let entry =
            entry.map_err(|e| CreateError::Other(format!("failed to read entry: {}", e)))?;
        let src_path = entry.path();
        let dest_path = dst.join(entry.file_name());
        std::fs::rename(&src_path, &dest_path).or_else(|_| {
            // rename can fail across mount points — fall back to copy
            if src_path.is_dir() {
                copy_dir_recursive(&src_path, &dest_path)
            } else {
                std::fs::copy(src_path, &dest_path)
                    .map(|_| ())
                    .map_err(|e| CreateError::Other(format!("failed to copy file: {}", e)))
            }
        })?;
    }
    Ok(())
}

fn copy_dir_recursive(src: &Path, dst: &Path) -> Result<(), CreateError> {
    std::fs::create_dir_all(dst)
        .map_err(|e| CreateError::Other(format!("failed to create dir: {}", e)))?;
    for entry in std::fs::read_dir(src)
        .map_err(|e| CreateError::Other(format!("failed to read dir: {}", e)))?
    {
        let entry =
            entry.map_err(|e| CreateError::Other(format!("failed to read entry: {}", e)))?;
        let src_path = entry.path();
        let dest_path = dst.join(entry.file_name());
        if src_path.is_dir() {
            copy_dir_recursive(&src_path, &dest_path)?;
        } else {
            std::fs::copy(src_path, &dest_path)
                .map_err(|e| CreateError::Other(format!("failed to copy file: {}", e)))?;
        }
    }
    Ok(())
}

/// Execute a bin script from an extracted npm package.
///
/// Installs the package's dependencies in-place, then runs the bin entry
/// with the project name (and optional `--template`) as arguments.
async fn execute_create_bin(
    pkg_dir: &Path,
    bin_path: &str,
    dest: &Path,
    inner_template: Option<&str>,
    output: &Arc<dyn PmOutput>,
) -> Result<(), CreateError> {
    let runtime = find_js_runtime()?;

    // Install dependencies so the bin script can import them
    output.info("Installing scaffolding tool dependencies...");
    if let Err(e) = super::install(
        pkg_dir,
        false,
        ScriptPolicy::TrustBased,
        false,
        output.clone(),
    )
    .await
    {
        return Err(CreateError::Other(format!(
            "failed to install scaffolding tool dependencies: {}",
            e
        )));
    }

    let project_name = dest
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_else(|| "my-app".to_string());

    let parent_dir = dest.parent().unwrap_or(dest);

    // Build args: <bin_script> <project_name> [--template <variant>]
    let bin_script = pkg_dir.join(bin_path.trim_start_matches("./"));
    let mut args = vec![
        bin_script.to_string_lossy().to_string(),
        project_name.clone(),
    ];
    if let Some(tmpl) = inner_template {
        args.push("--template".to_string());
        args.push(tmpl.to_string());
    }

    output.info(&format!("Running {} scaffolding tool...", project_name));

    let status = std::process::Command::new(&runtime)
        .args(&args)
        .current_dir(parent_dir)
        .stdout(std::process::Stdio::inherit())
        .stderr(std::process::Stdio::inherit())
        .status()
        .map_err(|e| CreateError::Other(format!("failed to run {}: {}", runtime, e)))?;

    if !status.success() {
        return Err(CreateError::Other(format!(
            "scaffolding tool exited with code {}",
            status.code().unwrap_or(1)
        )));
    }

    Ok(())
}

/// Download an NPM package and either execute its bin script or extract as a template.
async fn fetch_npm_template(
    package_name: &str,
    dest: &Path,
    inner_template: Option<&str>,
    output: &Arc<dyn PmOutput>,
) -> Result<NpmFetchResult, CreateError> {
    output.info(&format!("Resolving {}...", package_name));
    let cache_dir = super::registry::default_cache_dir();
    let registry = RegistryClient::new(&cache_dir);

    let metadata = registry
        .fetch_metadata(package_name)
        .await
        .map_err(|e| CreateError::Other(format!("failed to fetch package metadata: {}", e)))?;

    let latest_version = metadata
        .dist_tags
        .get("latest")
        .ok_or_else(|| CreateError::PackageNotFound(package_name.to_string()))?;

    let version_meta = metadata
        .versions
        .get(latest_version)
        .ok_or_else(|| CreateError::PackageNotFound(package_name.to_string()))?;

    let tarball_url = &version_meta.dist.tarball;
    let integrity = &version_meta.dist.integrity;

    output.info(&format!(
        "Downloading {} v{}...",
        package_name, latest_version
    ));

    let client = reqwest::Client::builder()
        .user_agent("vtz")
        .build()
        .map_err(|e| CreateError::Other(format!("failed to create HTTP client: {}", e)))?;

    let response = client
        .get(tarball_url)
        .send()
        .await
        .map_err(|e| CreateError::Other(format!("failed to download template: {}", e)))?;

    if !response.status().is_success() {
        return Err(CreateError::Other(format!(
            "failed to download {}: HTTP {}",
            package_name,
            response.status()
        )));
    }

    let bytes = response
        .bytes()
        .await
        .map_err(|e| CreateError::Other(format!("failed to read tarball: {}", e)))?;

    // Verify integrity if available
    if !integrity.is_empty() {
        super::tarball::verify_integrity_public(&bytes, integrity)
            .map_err(|e| CreateError::Other(format!("integrity check failed: {}", e)))?;
    }

    // Extract to temp dir first so we can inspect package.json for bin entries
    let temp_dir = tempfile::tempdir()
        .map_err(|e| CreateError::Other(format!("failed to create temp dir: {}", e)))?;

    let temp_path = temp_dir.path().to_path_buf();
    let bytes_vec = bytes.to_vec();
    tokio::task::spawn_blocking(move || extract_tarball(&bytes_vec, &temp_path))
        .await
        .map_err(|e| CreateError::Other(format!("extraction task failed: {}", e)))?
        .map_err(|e| CreateError::Other(format!("failed to extract template: {}", e)))?;

    // Check if the package has a bin entry — if so, it's a scaffolding tool
    let pkg_json_path = temp_dir.path().join("package.json");
    if let Ok(pkg_content) = std::fs::read_to_string(&pkg_json_path) {
        if let Ok(pkg) = serde_json::from_str::<serde_json::Value>(&pkg_content) {
            if let Some(bin_path) = extract_bin_path(&pkg) {
                output.info("Detected scaffolding tool (has bin entry)");
                execute_create_bin(temp_dir.path(), &bin_path, dest, inner_template, output)
                    .await?;
                return Ok(NpmFetchResult::BinExecuted);
            }
        }
    }

    // No bin entry — copy extracted files to destination as a template
    output.info("Extracting template...");
    std::fs::create_dir_all(dest)
        .map_err(|e| CreateError::Other(format!("failed to create destination: {}", e)))?;

    move_dir_contents(temp_dir.path(), dest)?;

    Ok(NpmFetchResult::TemplateExtracted)
}

/// Extract the first bin path from a package.json value.
fn extract_bin_path(pkg: &serde_json::Value) -> Option<String> {
    match pkg.get("bin") {
        Some(serde_json::Value::String(s)) => Some(s.clone()),
        Some(serde_json::Value::Object(map)) => map
            .values()
            .next()
            .and_then(|v| v.as_str())
            .map(String::from),
        _ => None,
    }
}

/// Download and extract a GitHub repo tarball to the destination.
async fn fetch_github_template(
    owner: &str,
    repo: &str,
    dest: &Path,
    output: &Arc<dyn PmOutput>,
) -> Result<(), CreateError> {
    output.info("Resolving template...");
    let github = GitHubClient::new();
    let sha = github.resolve_ref(owner, repo, None).await?;

    let tarball_url = GitHubClient::tarball_url(owner, repo, &sha);

    output.info("Downloading template...");
    let client = reqwest::Client::builder()
        .user_agent("vtz")
        .build()
        .map_err(|e| CreateError::Other(format!("failed to create HTTP client: {}", e)))?;

    let response = client
        .get(&tarball_url)
        .send()
        .await
        .map_err(|e| CreateError::Other(format!("failed to download template: {}", e)))?;

    if !response.status().is_success() {
        return Err(CreateError::Other(format!(
            "failed to download template: HTTP {}",
            response.status()
        )));
    }

    let bytes = response
        .bytes()
        .await
        .map_err(|e| CreateError::Other(format!("failed to read tarball: {}", e)))?;

    output.info("Extracting template...");
    std::fs::create_dir_all(dest)
        .map_err(|e| CreateError::Other(format!("failed to create destination: {}", e)))?;

    let dest_clone = dest.to_path_buf();
    let bytes_vec = bytes.to_vec();
    tokio::task::spawn_blocking(move || extract_github_tarball(&bytes_vec, &dest_clone))
        .await
        .map_err(|e| CreateError::Other(format!("extraction task failed: {}", e)))?
        .map_err(|e| CreateError::Other(format!("failed to extract template: {}", e)))?;

    Ok(())
}

/// Create a new project from a template.
///
/// Template resolution (like `bun create` / `npm create`):
/// - Short name (`vertz`) → NPM package `create-vertz`
/// - `owner/repo` → GitHub repository
/// - `https://github.com/owner/repo` → GitHub repository
///
/// Post-creation steps:
/// 1. Download & extract template (or execute bin script for create-* packages)
/// 2. Update package.json name (skipped if bin script handled it)
/// 3. Run `vtz install`
/// 4. `git init` + initial commit
pub async fn create(
    template: &str,
    dest: Option<&str>,
    inner_template: Option<&str>,
    output: Arc<dyn PmOutput>,
) -> Result<PathBuf, CreateError> {
    // 1. Parse template
    let source = parse_template(template)?;

    // 2. Resolve & validate destination
    let dest_dir = resolve_destination(dest, &source);
    let dest_dir = if dest_dir.is_relative() {
        std::env::current_dir()
            .map_err(|e| CreateError::Other(format!("failed to get current dir: {}", e)))?
            .join(&dest_dir)
    } else {
        dest_dir
    };
    validate_destination(&dest_dir)?;

    let project_name = dest_dir
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_else(|| "my-app".to_string());

    // 3. Download & extract template (or execute bin script)
    let bin_executed = match &source {
        TemplateSource::Npm { package_name } => {
            output.info(&format!("Using npm package {}", package_name));
            matches!(
                fetch_npm_template(package_name, &dest_dir, inner_template, &output).await?,
                NpmFetchResult::BinExecuted
            )
        }
        TemplateSource::GitHub { owner, repo } => {
            output.info(&format!("Using GitHub template {}/{}", owner, repo));
            fetch_github_template(owner, repo, &dest_dir, &output).await?;
            false
        }
    };

    if bin_executed {
        // The bin script already scaffolded the project (created dirs, wrote files,
        // set the correct package name). We still run install + git init.
    } else {
        // 4. Update package.json name (only for plain templates)
        update_package_name(&dest_dir, &project_name)
            .map_err(|e| CreateError::Other(format!("failed to update package.json: {}", e)))?;
    }

    // 5. Install dependencies
    output.info("Installing dependencies...");
    if let Err(e) = super::install(
        &dest_dir,
        false,
        ScriptPolicy::TrustBased,
        false,
        output.clone(),
    )
    .await
    {
        output.warning(&format!(
            "install failed (you can run `vtz install` manually): {}",
            e
        ));
    }

    // 6. git init + initial commit
    output.info("Initializing git repository...");
    if let Err(e) = git_init(&dest_dir) {
        output.warning(&format!("git init failed: {}", e));
    }

    output.info(&format!(
        "Created {} at {}",
        project_name,
        dest_dir.display()
    ));
    Ok(dest_dir)
}

#[cfg(test)]
mod tests {
    use super::*;

    // --- parse_template tests ---

    #[test]
    fn test_parse_short_name_resolves_to_npm() {
        let result = parse_template("vertz").unwrap();
        assert_eq!(
            result,
            TemplateSource::Npm {
                package_name: "create-vertz".to_string(),
            }
        );
    }

    #[test]
    fn test_parse_short_name_react() {
        let result = parse_template("react").unwrap();
        assert_eq!(
            result,
            TemplateSource::Npm {
                package_name: "create-react".to_string(),
            }
        );
    }

    #[test]
    fn test_parse_owner_repo_resolves_to_github() {
        let result = parse_template("vertz-dev/template-react").unwrap();
        assert_eq!(
            result,
            TemplateSource::GitHub {
                owner: "vertz-dev".to_string(),
                repo: "template-react".to_string(),
            }
        );
    }

    #[test]
    fn test_parse_full_url_https() {
        let result = parse_template("https://github.com/owner/my-template").unwrap();
        assert_eq!(
            result,
            TemplateSource::GitHub {
                owner: "owner".to_string(),
                repo: "my-template".to_string(),
            }
        );
    }

    #[test]
    fn test_parse_full_url_with_git_suffix() {
        let result = parse_template("https://github.com/owner/repo.git").unwrap();
        assert_eq!(
            result,
            TemplateSource::GitHub {
                owner: "owner".to_string(),
                repo: "repo".to_string(),
            }
        );
    }

    #[test]
    fn test_parse_full_url_with_trailing_slash() {
        let result = parse_template("https://github.com/owner/repo/").unwrap();
        assert_eq!(
            result,
            TemplateSource::GitHub {
                owner: "owner".to_string(),
                repo: "repo".to_string(),
            }
        );
    }

    #[test]
    fn test_parse_empty_string_errors() {
        assert!(parse_template("").is_err());
    }

    #[test]
    fn test_parse_whitespace_only_errors() {
        assert!(parse_template("   ").is_err());
    }

    #[test]
    fn test_parse_trims_whitespace() {
        let result = parse_template("  react  ").unwrap();
        assert_eq!(
            result,
            TemplateSource::Npm {
                package_name: "create-react".to_string(),
            }
        );
    }

    #[test]
    fn test_parse_url_missing_repo_errors() {
        assert!(parse_template("https://github.com/owner").is_err());
    }

    #[test]
    fn test_parse_url_missing_owner_errors() {
        assert!(parse_template("https://github.com/").is_err());
    }

    // --- resolve_destination tests ---

    #[test]
    fn test_resolve_dest_explicit() {
        let src = TemplateSource::Npm {
            package_name: "create-react".to_string(),
        };
        let dest = resolve_destination(Some("my-app"), &src);
        assert_eq!(dest, PathBuf::from("my-app"));
    }

    #[test]
    fn test_resolve_dest_from_npm_strips_create_prefix() {
        let src = TemplateSource::Npm {
            package_name: "create-vertz".to_string(),
        };
        let dest = resolve_destination(None, &src);
        assert_eq!(dest, PathBuf::from("vertz"));
    }

    #[test]
    fn test_resolve_dest_from_github() {
        let src = TemplateSource::GitHub {
            owner: "someone".to_string(),
            repo: "my-template".to_string(),
        };
        let dest = resolve_destination(None, &src);
        assert_eq!(dest, PathBuf::from("my-template"));
    }

    #[test]
    fn test_resolve_dest_from_github_strips_create_prefix() {
        let src = TemplateSource::GitHub {
            owner: "someone".to_string(),
            repo: "create-foo".to_string(),
        };
        let dest = resolve_destination(None, &src);
        assert_eq!(dest, PathBuf::from("foo"));
    }

    // --- validate_destination tests ---

    #[test]
    fn test_validate_dest_nonexistent_ok() {
        let dir = tempfile::tempdir().unwrap();
        let dest = dir.path().join("new-project");
        assert!(validate_destination(&dest).is_ok());
    }

    #[test]
    fn test_validate_dest_empty_dir_ok() {
        let dir = tempfile::tempdir().unwrap();
        let dest = dir.path().join("empty");
        std::fs::create_dir_all(&dest).unwrap();
        assert!(validate_destination(&dest).is_ok());
    }

    #[test]
    fn test_validate_dest_nonempty_dir_errors() {
        let dir = tempfile::tempdir().unwrap();
        let dest = dir.path().join("nonempty");
        std::fs::create_dir_all(&dest).unwrap();
        std::fs::write(dest.join("file.txt"), "content").unwrap();
        assert!(validate_destination(&dest).is_err());
    }

    #[test]
    fn test_validate_dest_existing_file_errors() {
        let dir = tempfile::tempdir().unwrap();
        let dest = dir.path().join("a-file");
        std::fs::write(&dest, "content").unwrap();
        assert!(validate_destination(&dest).is_err());
    }

    // --- update_package_name tests ---

    #[test]
    fn test_update_package_name_basic() {
        let dir = tempfile::tempdir().unwrap();
        let pkg = dir.path().join("package.json");
        std::fs::write(&pkg, r#"{"name": "template-name", "version": "0.1.0"}"#).unwrap();

        update_package_name(dir.path(), "my-app").unwrap();

        let content = std::fs::read_to_string(&pkg).unwrap();
        let parsed: serde_json::Value = serde_json::from_str(&content).unwrap();
        assert_eq!(parsed["name"], "my-app");
        assert_eq!(parsed["version"], "0.1.0");
    }

    #[test]
    fn test_update_package_name_no_package_json_is_ok() {
        let dir = tempfile::tempdir().unwrap();
        assert!(update_package_name(dir.path(), "my-app").is_ok());
    }

    #[test]
    fn test_update_package_name_preserves_fields() {
        let dir = tempfile::tempdir().unwrap();
        let pkg = dir.path().join("package.json");
        std::fs::write(
            &pkg,
            r#"{"name": "old", "version": "1.0.0", "dependencies": {"foo": "^1.0.0"}}"#,
        )
        .unwrap();

        update_package_name(dir.path(), "new-name").unwrap();

        let content = std::fs::read_to_string(&pkg).unwrap();
        let parsed: serde_json::Value = serde_json::from_str(&content).unwrap();
        assert_eq!(parsed["name"], "new-name");
        assert_eq!(parsed["version"], "1.0.0");
        assert_eq!(parsed["dependencies"]["foo"], "^1.0.0");
    }

    // --- default_dir_name tests ---

    #[test]
    fn test_default_dir_name_npm_strips_prefix() {
        let src = TemplateSource::Npm {
            package_name: "create-vertz".to_string(),
        };
        assert_eq!(default_dir_name(&src), "vertz");
    }

    #[test]
    fn test_default_dir_name_npm_no_prefix() {
        let src = TemplateSource::Npm {
            package_name: "my-scaffold".to_string(),
        };
        assert_eq!(default_dir_name(&src), "my-scaffold");
    }

    #[test]
    fn test_default_dir_name_github() {
        let src = TemplateSource::GitHub {
            owner: "x".to_string(),
            repo: "create-foo".to_string(),
        };
        assert_eq!(default_dir_name(&src), "foo");
    }

    // --- extract_bin_path tests ---

    #[test]
    fn test_extract_bin_path_string() {
        let pkg: serde_json::Value = serde_json::from_str(r#"{"bin": "./bin/cli.js"}"#).unwrap();
        assert_eq!(extract_bin_path(&pkg), Some("./bin/cli.js".to_string()));
    }

    #[test]
    fn test_extract_bin_path_object() {
        let pkg: serde_json::Value =
            serde_json::from_str(r#"{"bin": {"create-vertz": "./bin/create-vertz.ts"}}"#).unwrap();
        assert_eq!(
            extract_bin_path(&pkg),
            Some("./bin/create-vertz.ts".to_string())
        );
    }

    #[test]
    fn test_extract_bin_path_no_bin() {
        let pkg: serde_json::Value = serde_json::from_str(r#"{"name": "foo"}"#).unwrap();
        assert_eq!(extract_bin_path(&pkg), None);
    }

    #[test]
    fn test_extract_bin_path_null_bin() {
        let pkg: serde_json::Value = serde_json::from_str(r#"{"bin": null}"#).unwrap();
        assert_eq!(extract_bin_path(&pkg), None);
    }

    // --- find_js_runtime tests ---

    #[test]
    fn test_find_js_runtime_finds_something() {
        // CI and dev machines should have at least node or bun
        let result = find_js_runtime();
        assert!(result.is_ok(), "expected bun or node on PATH");
        let runtime = result.unwrap();
        assert!(runtime == "bun" || runtime == "node");
    }

    // --- move_dir_contents tests ---

    #[test]
    fn test_move_dir_contents_basic() {
        let src_dir = tempfile::tempdir().unwrap();
        let dst_dir = tempfile::tempdir().unwrap();

        std::fs::write(src_dir.path().join("file.txt"), "hello").unwrap();
        std::fs::create_dir(src_dir.path().join("sub")).unwrap();
        std::fs::write(src_dir.path().join("sub/nested.txt"), "world").unwrap();

        move_dir_contents(src_dir.path(), dst_dir.path()).unwrap();

        assert!(dst_dir.path().join("file.txt").exists());
        assert_eq!(
            std::fs::read_to_string(dst_dir.path().join("file.txt")).unwrap(),
            "hello"
        );
        assert!(dst_dir.path().join("sub/nested.txt").exists());
        assert_eq!(
            std::fs::read_to_string(dst_dir.path().join("sub/nested.txt")).unwrap(),
            "world"
        );
    }

    #[test]
    fn test_move_dir_contents_empty_src() {
        let src_dir = tempfile::tempdir().unwrap();
        let dst_dir = tempfile::tempdir().unwrap();
        assert!(move_dir_contents(src_dir.path(), dst_dir.path()).is_ok());
    }

    // --- copy_dir_recursive tests ---

    #[test]
    fn test_copy_dir_recursive_basic() {
        let src_dir = tempfile::tempdir().unwrap();
        let dst_dir = tempfile::tempdir().unwrap();
        let dst = dst_dir.path().join("output");

        std::fs::write(src_dir.path().join("a.txt"), "aaa").unwrap();
        std::fs::create_dir(src_dir.path().join("inner")).unwrap();
        std::fs::write(src_dir.path().join("inner/b.txt"), "bbb").unwrap();

        copy_dir_recursive(src_dir.path(), &dst).unwrap();

        assert_eq!(std::fs::read_to_string(dst.join("a.txt")).unwrap(), "aaa");
        assert_eq!(
            std::fs::read_to_string(dst.join("inner/b.txt")).unwrap(),
            "bbb"
        );
    }
}
