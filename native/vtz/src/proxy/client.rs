use crate::proxy::daemon;
use crate::proxy::naming;
use crate::proxy::routes::{self, RouteEntry};
use std::path::{Path, PathBuf};

/// Detect the current git branch name by reading `.git/HEAD`.
pub fn detect_git_branch(root_dir: &Path) -> Option<String> {
    // Try .git/HEAD first (normal repo)
    let git_head = root_dir.join(".git/HEAD");
    if git_head.is_file() {
        return parse_git_head(&git_head);
    }

    // Worktree: .git is a file containing "gitdir: /path/to/main/.git/worktrees/<name>"
    let git_file = root_dir.join(".git");
    if git_file.is_file() {
        if let Ok(contents) = std::fs::read_to_string(&git_file) {
            if let Some(gitdir) = contents.strip_prefix("gitdir: ") {
                let gitdir = gitdir.trim();
                let head_path = PathBuf::from(gitdir).join("HEAD");
                return parse_git_head(&head_path);
            }
        }
    }

    None
}

fn parse_git_head(head_path: &Path) -> Option<String> {
    let contents = std::fs::read_to_string(head_path).ok()?;
    let trimmed = contents.trim();
    if let Some(ref_name) = trimmed.strip_prefix("ref: refs/heads/") {
        Some(ref_name.to_string())
    } else {
        // Detached HEAD — use short SHA
        Some(trimmed[..8.min(trimmed.len())].to_string())
    }
}

/// Detect the project name from package.json `name` field, or fall back to directory name.
pub fn detect_project_name(root_dir: &Path) -> String {
    let pkg_json = root_dir.join("package.json");
    if let Ok(contents) = std::fs::read_to_string(&pkg_json) {
        if let Ok(parsed) = serde_json::from_str::<serde_json::Value>(&contents) {
            if let Some(name) = parsed.get("name").and_then(|n| n.as_str()) {
                let clean = name.trim_start_matches('@').replace('/', "-");
                if !clean.is_empty() {
                    return clean;
                }
            }
        }
    }

    root_dir
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("app")
        .to_string()
}

/// Check if the proxy daemon is running.
pub fn is_proxy_running() -> bool {
    let proxy_dir = routes::proxy_dir();
    daemon::read_pid_file(&proxy_dir)
        .map(routes::is_pid_alive)
        .unwrap_or(false)
}

fn build_route_entry(
    root_dir: &Path,
    port: u16,
    name_override: Option<&str>,
) -> Option<RouteEntry> {
    // Detect branch and project once, reuse for both subdomain and entry
    let branch = detect_git_branch(root_dir).unwrap_or_else(|| "main".to_string());
    let project = detect_project_name(root_dir);

    let subdomain = if let Some(name) = name_override {
        naming::sanitize_label(name)
    } else {
        naming::to_subdomain(&branch, &project)
    };

    if subdomain.is_empty() {
        return None;
    }

    Some(RouteEntry {
        subdomain,
        port,
        branch,
        project,
        pid: std::process::id(),
        root_dir: root_dir.to_path_buf(),
    })
}

/// Register a dev server with the proxy.
///
/// Returns the subdomain if registration was successful, or `None` if proxy isn't running.
pub fn register_dev_server(
    root_dir: &Path,
    port: u16,
    name_override: Option<&str>,
) -> Option<String> {
    if !is_proxy_running() {
        return None;
    }

    let entry = build_route_entry(root_dir, port, name_override)?;
    routes::register(&entry).ok()?;
    Some(entry.subdomain)
}

/// Deregister a dev server from the proxy.
pub fn deregister_dev_server(subdomain: &str) {
    routes::deregister(subdomain).ok();
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn detect_project_name_from_package_json() {
        let dir = tempfile::tempdir().unwrap();
        std::fs::write(
            dir.path().join("package.json"),
            r#"{"name": "my-awesome-app"}"#,
        )
        .unwrap();
        assert_eq!(detect_project_name(dir.path()), "my-awesome-app");
    }

    #[test]
    fn detect_project_name_scoped_package() {
        let dir = tempfile::tempdir().unwrap();
        std::fs::write(dir.path().join("package.json"), r#"{"name": "@vertz/ui"}"#).unwrap();
        assert_eq!(detect_project_name(dir.path()), "vertz-ui");
    }

    #[test]
    fn detect_project_name_falls_back_to_dirname() {
        let dir = tempfile::tempdir().unwrap();
        let name = detect_project_name(dir.path());
        // tempdir creates random names, just check it's not empty
        assert!(!name.is_empty());
    }

    #[test]
    fn detect_project_name_no_name_field_uses_dirname() {
        let dir = tempfile::tempdir().unwrap();
        std::fs::write(dir.path().join("package.json"), r#"{"version": "1.0.0"}"#).unwrap();
        let name = detect_project_name(dir.path());
        assert!(!name.is_empty());
    }

    #[test]
    fn detect_git_branch_from_normal_repo() {
        let dir = tempfile::tempdir().unwrap();
        let git_dir = dir.path().join(".git");
        std::fs::create_dir_all(&git_dir).unwrap();
        std::fs::write(git_dir.join("HEAD"), "ref: refs/heads/feat/auth\n").unwrap();
        assert_eq!(detect_git_branch(dir.path()), Some("feat/auth".to_string()));
    }

    #[test]
    fn detect_git_branch_detached_head() {
        let dir = tempfile::tempdir().unwrap();
        let git_dir = dir.path().join(".git");
        std::fs::create_dir_all(&git_dir).unwrap();
        std::fs::write(
            git_dir.join("HEAD"),
            "abc123def456789abcdef0123456789abcdef012\n",
        )
        .unwrap();
        assert_eq!(detect_git_branch(dir.path()), Some("abc123de".to_string()));
    }

    #[test]
    fn detect_git_branch_worktree() {
        let dir = tempfile::tempdir().unwrap();
        // Simulate a worktree: .git is a file pointing to the main repo's worktrees dir
        let main_git = dir.path().join("main-repo/.git/worktrees/feat-auth");
        std::fs::create_dir_all(&main_git).unwrap();
        std::fs::write(main_git.join("HEAD"), "ref: refs/heads/feat/auth\n").unwrap();

        let worktree = dir.path().join("worktree");
        std::fs::create_dir_all(&worktree).unwrap();
        std::fs::write(
            worktree.join(".git"),
            format!("gitdir: {}", main_git.display()),
        )
        .unwrap();

        assert_eq!(detect_git_branch(&worktree), Some("feat/auth".to_string()));
    }

    #[test]
    fn detect_git_branch_returns_none_for_no_git() {
        let dir = tempfile::tempdir().unwrap();
        assert_eq!(detect_git_branch(dir.path()), None);
    }

    #[test]
    fn build_route_entry_uses_sanitized_name_override() {
        let dir = tempfile::tempdir().unwrap();
        std::fs::write(
            dir.path().join("package.json"),
            r#"{"name": "my-awesome-app"}"#,
        )
        .unwrap();

        let entry = build_route_entry(dir.path(), 3000, Some("Dashboard !!!")).unwrap();

        assert_eq!(entry.subdomain, "dashboard");
        assert_eq!(entry.project, "my-awesome-app");
        assert_eq!(entry.branch, "main");
        assert_eq!(entry.port, 3000);
        assert_eq!(entry.root_dir, dir.path());
    }

    #[test]
    fn build_route_entry_returns_none_when_name_sanitizes_to_empty() {
        let dir = tempfile::tempdir().unwrap();
        assert!(build_route_entry(dir.path(), 3000, Some("!!!")).is_none());
    }
}
