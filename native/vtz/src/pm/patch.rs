use similar::TextDiff;
use std::collections::HashSet;
use std::path::Path;
use walkdir::WalkDir;

const BACKUP_DIR: &str = ".vertz-patches";

/// Result of preparing a package for patching
#[derive(Debug)]
pub struct PatchPrepareResult {
    pub name: String,
    pub version: String,
}

/// Result of saving a patch
#[derive(Debug)]
pub struct PatchSaveResult {
    pub name: String,
    pub version: String,
    pub patch_path: String,
    pub files_changed: usize,
    /// True if no changes were detected (warning, not error)
    pub no_changes: bool,
}

/// Result of applying a patch
#[derive(Debug)]
pub struct PatchApplyResult {
    pub name: String,
    pub version: String,
    pub patch_path: String,
}

/// Result of discarding a patch
#[derive(Debug)]
pub struct PatchDiscardResult {
    pub name: String,
    pub version: String,
    pub reapplied_patch: bool,
    /// Path of the re-applied patch (if any)
    pub patch_path: Option<String>,
}

/// Result of listing patches
#[derive(Debug)]
pub struct PatchListResult {
    /// Active patches (in-progress): (package_name, version)
    pub active: Vec<(String, String)>,
    /// Saved patches from package.json: (key like "express@4.21.2", path)
    pub saved: Vec<(String, String)>,
}

/// Read the set of patched package names from package.json's vertz.patchedDependencies
pub fn read_patched_package_names(root_dir: &Path) -> HashSet<String> {
    let pkg_path = root_dir.join("package.json");
    let content = match std::fs::read_to_string(&pkg_path) {
        Ok(c) => c,
        Err(_) => return HashSet::new(),
    };
    let value: serde_json::Value = match serde_json::from_str(&content) {
        Ok(v) => v,
        Err(_) => return HashSet::new(),
    };

    let mut names = HashSet::new();
    if let Some(patched) = value
        .get("vertz")
        .and_then(|v| v.get("patchedDependencies"))
        .and_then(|v| v.as_object())
    {
        for key in patched.keys() {
            // Key format is "name@version" — extract the name
            if let Some(name) = parse_patch_key_name(key) {
                names.insert(name.to_string());
            }
        }
    }
    names
}

/// Parse the package name from a patchedDependencies key (public variant for CLI use)
pub fn parse_patch_key_name_pub(key: &str) -> Option<&str> {
    parse_patch_key_name(key)
}

/// Parse the package name from a patchedDependencies key like "express@4.21.2"
/// or "@types/node@22.0.0"
fn parse_patch_key_name(key: &str) -> Option<&str> {
    // Handle scoped packages: "@scope/name@version"
    if let Some(rest) = key.strip_prefix('@') {
        // Find the second '@' (after @scope/name)
        if let Some(pos) = rest.find('@') {
            return Some(&key[..pos + 1]);
        }
    } else if let Some(pos) = key.find('@') {
        return Some(&key[..pos]);
    }
    None
}

/// Escape a scoped package name for use in filenames: @scope/name → @scope+name
fn escape_package_name(name: &str) -> String {
    name.replace('/', "+")
}

/// Get the version of an installed package from its package.json
fn get_installed_version(
    root_dir: &Path,
    name: &str,
) -> Result<String, Box<dyn std::error::Error>> {
    let pkg_json_path = root_dir
        .join("node_modules")
        .join(name)
        .join("package.json");
    let content = std::fs::read_to_string(&pkg_json_path).map_err(|_| {
        format!(
            "error: \"{}\" is not installed. Run \"vertz install\" first.",
            name
        )
    })?;
    let value: serde_json::Value = serde_json::from_str(&content)
        .map_err(|_| format!("error: invalid package.json for \"{}\"", name))?;
    value
        .get("version")
        .and_then(|v| v.as_str())
        .map(|v| v.to_string())
        .ok_or_else(|| format!("error: no version field in package.json for \"{}\"", name).into())
}

/// Get the version of a package from its directory's package.json
fn get_version_from_dir(dir: &Path) -> Result<String, Box<dyn std::error::Error>> {
    let pkg_json_path = dir.join("package.json");
    let content = std::fs::read_to_string(&pkg_json_path)?;
    let value: serde_json::Value = serde_json::from_str(&content)?;
    value
        .get("version")
        .and_then(|v| v.as_str())
        .map(|v| v.to_string())
        .ok_or_else(|| "no version field".into())
}

/// Check if a package is a direct dependency (listed in package.json)
fn is_direct_dependency(root_dir: &Path, package: &str) -> bool {
    let pkg_path = root_dir.join("package.json");
    let content = match std::fs::read_to_string(&pkg_path) {
        Ok(c) => c,
        Err(_) => return false,
    };
    let value: serde_json::Value = match serde_json::from_str(&content) {
        Ok(v) => v,
        Err(_) => return false,
    };

    for dep_key in &[
        "dependencies",
        "devDependencies",
        "peerDependencies",
        "optionalDependencies",
    ] {
        if let Some(deps) = value.get(dep_key).and_then(|v| v.as_object()) {
            if deps.contains_key(package) {
                return true;
            }
        }
    }
    false
}

/// Prepare a package for patching
pub fn patch_prepare(
    root_dir: &Path,
    package: &str,
) -> Result<PatchPrepareResult, Box<dyn std::error::Error>> {
    let node_modules = root_dir.join("node_modules");
    let pkg_dir = node_modules.join(package);
    let backup_dir = node_modules.join(BACKUP_DIR).join(package);

    // Check if package exists
    if !pkg_dir.exists() {
        return Err(format!(
            "error: \"{}\" is not installed. Run \"vertz install\" first.",
            package
        )
        .into());
    }

    // Check if it's a direct dependency
    if !is_direct_dependency(root_dir, package) {
        return Err(format!(
            "error: \"{}\" is a transitive dependency. Only direct dependencies can be patched. To patch it, add it as a direct dependency: vertz add {}",
            package, package
        )
        .into());
    }

    // Check if already being patched
    if backup_dir.exists() {
        return Err(format!(
            "error: \"{}\" is already being patched. Run \"vertz patch save {}\" or \"vertz patch discard {}\" first.",
            package, package, package
        )
        .into());
    }

    // Get version
    let version = get_installed_version(root_dir, package)?;

    // Create backup directory
    std::fs::create_dir_all(backup_dir.parent().unwrap())?;

    // Copy current state to backup
    copy_dir_recursive(&pkg_dir, &backup_dir)?;

    // Break hardlinks in the original (so edits don't corrupt the store)
    break_hardlinks_recursive(&pkg_dir)?;

    Ok(PatchPrepareResult {
        name: package.to_string(),
        version,
    })
}

/// Save a patch for a package that is being patched
pub fn patch_save(
    root_dir: &Path,
    package: &str,
) -> Result<PatchSaveResult, Box<dyn std::error::Error>> {
    let node_modules = root_dir.join("node_modules");
    let pkg_dir = node_modules.join(package);
    let backup_dir = node_modules.join(BACKUP_DIR).join(package);

    // Check if patch was started
    if !backup_dir.exists() {
        return Err(format!(
            "error: \"{}\" is not being patched. Run \"vertz patch {}\" first.",
            package, package
        )
        .into());
    }

    // Get version
    let version = get_installed_version(root_dir, package)?;

    // Generate diff
    let diff = generate_diff(&backup_dir, &pkg_dir)?;

    if diff.is_empty() {
        // Clean up backup
        std::fs::remove_dir_all(&backup_dir)?;
        return Ok(PatchSaveResult {
            name: package.to_string(),
            version,
            patch_path: String::new(),
            files_changed: 0,
            no_changes: true,
        });
    }

    // Count files changed
    let files_changed = diff.matches("\ndiff --git ").count()
        + if diff.starts_with("diff --git ") {
            1
        } else {
            0
        };

    // Write patch file
    let escaped_name = escape_package_name(package);
    let patch_filename = format!("{}@{}.patch", escaped_name, version);
    let patches_dir = root_dir.join("patches");
    std::fs::create_dir_all(&patches_dir)?;
    let patch_path = patches_dir.join(&patch_filename);
    std::fs::write(&patch_path, &diff)?;

    // Update package.json
    let relative_patch_path = format!("patches/{}", patch_filename);
    let patch_key = format!("{}@{}", package, version);
    update_package_json_patches(root_dir, &patch_key, &relative_patch_path)?;

    // Clean up backup
    std::fs::remove_dir_all(&backup_dir)?;

    Ok(PatchSaveResult {
        name: package.to_string(),
        version,
        patch_path: relative_patch_path,
        files_changed,
        no_changes: false,
    })
}

/// Discard in-progress patch changes and restore from backup
pub fn patch_discard(
    root_dir: &Path,
    package: &str,
) -> Result<PatchDiscardResult, Box<dyn std::error::Error>> {
    let node_modules = root_dir.join("node_modules");
    let pkg_dir = node_modules.join(package);
    let backup_dir = node_modules.join(BACKUP_DIR).join(package);

    // Check if backup exists
    if !backup_dir.exists() {
        return Err(format!(
            "error: \"{}\" is not being patched. Nothing to discard.",
            package
        )
        .into());
    }

    // Get version before restoring
    let version = get_installed_version(root_dir, package)?;

    // Remove current package dir and restore from backup
    if pkg_dir.exists() {
        std::fs::remove_dir_all(&pkg_dir)?;
    }
    copy_dir_recursive(&backup_dir, &pkg_dir)?;

    // Remove backup
    std::fs::remove_dir_all(&backup_dir)?;

    // Check if there's a saved patch to re-apply.
    // The backup may already contain the saved patch (if patch_prepare was called
    // after a previous patch_save). In that case, re-applying would fail — which is
    // fine, the backup already has the correct state.
    let mut reapplied_patch = false;
    let mut reapplied_path: Option<String> = None;
    let pkg_path = root_dir.join("package.json");
    if let Ok(content) = std::fs::read_to_string(&pkg_path) {
        if let Ok(value) = serde_json::from_str::<serde_json::Value>(&content) {
            let patch_key = format!("{}@{}", package, version);
            if let Some(patch_path_str) = value
                .get("vertz")
                .and_then(|v| v.get("patchedDependencies"))
                .and_then(|v| v.get(&patch_key))
                .and_then(|v| v.as_str())
            {
                let full_patch_path = root_dir.join(patch_path_str);
                if let Ok(patch_content) = std::fs::read_to_string(&full_patch_path) {
                    // Try to apply — if it fails, the backup already has the patch applied
                    if apply_patch_to_package(root_dir, package, &patch_content).is_ok() {
                        reapplied_patch = true;
                        reapplied_path = Some(patch_path_str.to_string());
                    }
                }
            }
        }
    }

    Ok(PatchDiscardResult {
        name: package.to_string(),
        version,
        reapplied_patch,
        patch_path: reapplied_path,
    })
}

/// List active and saved patches
pub fn patch_list(root_dir: &Path) -> PatchListResult {
    let node_modules = root_dir.join("node_modules");
    let backup_base = node_modules.join(BACKUP_DIR);

    // Find active patches (backup directories)
    let mut active = Vec::new();
    if backup_base.exists() {
        if let Ok(entries) = std::fs::read_dir(&backup_base) {
            for entry in entries.flatten() {
                let name = entry.file_name().to_string_lossy().to_string();
                if entry.file_type().map(|t| t.is_dir()).unwrap_or(false) {
                    if name.starts_with('@') {
                        // Scoped package — subdirectories are the actual packages
                        let scope_dir = backup_base.join(&name);
                        if let Ok(sub_entries) = std::fs::read_dir(&scope_dir) {
                            for sub_entry in sub_entries.flatten() {
                                let sub_name = sub_entry.file_name().to_string_lossy().to_string();
                                if sub_entry.file_type().map(|t| t.is_dir()).unwrap_or(false) {
                                    let full_name = format!("{}/{}", name, sub_name);
                                    let version = get_installed_version(root_dir, &full_name)
                                        .or_else(|_| {
                                            get_version_from_dir(&scope_dir.join(&sub_name))
                                        })
                                        .unwrap_or_default();
                                    active.push((full_name, version));
                                }
                            }
                        }
                    } else {
                        // Regular package — try node_modules first, fall back to backup
                        let version = get_installed_version(root_dir, &name)
                            .or_else(|_| get_version_from_dir(&backup_base.join(&name)))
                            .unwrap_or_default();
                        active.push((name, version));
                    }
                }
            }
        }
    }

    // Find saved patches from package.json
    let mut saved = Vec::new();
    let pkg_path = root_dir.join("package.json");
    if let Ok(content) = std::fs::read_to_string(&pkg_path) {
        if let Ok(value) = serde_json::from_str::<serde_json::Value>(&content) {
            if let Some(patched) = value
                .get("vertz")
                .and_then(|v| v.get("patchedDependencies"))
                .and_then(|v| v.as_object())
            {
                for (key, path_value) in patched {
                    if let Some(path) = path_value.as_str() {
                        saved.push((key.clone(), path.to_string()));
                    }
                }
            }
        }
    }

    active.sort_by(|a, b| a.0.cmp(&b.0));
    saved.sort_by(|a, b| a.0.cmp(&b.0));

    PatchListResult { active, saved }
}

/// Apply all saved patches from package.json
pub fn apply_patches(root_dir: &Path) -> Result<Vec<PatchApplyResult>, Box<dyn std::error::Error>> {
    let pkg_path = root_dir.join("package.json");
    let content = match std::fs::read_to_string(&pkg_path) {
        Ok(c) => c,
        Err(_) => return Ok(Vec::new()),
    };
    let value: serde_json::Value = match serde_json::from_str(&content) {
        Ok(v) => v,
        Err(_) => return Ok(Vec::new()),
    };

    let patched = match value
        .get("vertz")
        .and_then(|v| v.get("patchedDependencies"))
        .and_then(|v| v.as_object())
    {
        Some(p) => p,
        None => return Ok(Vec::new()),
    };

    let mut results = Vec::new();

    for (key, path_value) in patched {
        let patch_path = path_value
            .as_str()
            .ok_or_else(|| format!("error: invalid patch path for \"{}\"", key))?;

        let name = parse_patch_key_name(key)
            .ok_or_else(|| format!("error: invalid patch key \"{}\"", key))?;
        let expected_version = &key[name.len() + 1..]; // skip "name@"

        // Check installed version matches
        let installed_version = get_installed_version(root_dir, name)?;
        if installed_version != expected_version {
            return Err(format!(
                "error: failed to apply patch {}\n  The patch was created for {}@{} but {}@{} is installed.\n\n  To recreate the patch for the new version:\n    1. vertz patch {}\n    2. Review and re-apply your changes to node_modules/{}/\n    3. vertz patch save {}\n\n  Old patch preserved at: {}",
                patch_path, name, expected_version, name, installed_version,
                name, name, name, patch_path,
            )
            .into());
        }

        // Read and apply the patch
        let full_patch_path = root_dir.join(patch_path);
        let patch_content = std::fs::read_to_string(&full_patch_path)
            .map_err(|_| format!("error: patch file not found: {}", patch_path))?;

        apply_patch_to_package(root_dir, name, &patch_content)?;

        results.push(PatchApplyResult {
            name: name.to_string(),
            version: installed_version,
            patch_path: patch_path.to_string(),
        });
    }

    Ok(results)
}

/// Type of change in a patch section
enum PatchChange {
    Modified(String), // unified diff patch content
    Added(String),    // new file content
    Deleted,
}

/// Apply a multi-file unified diff to a package in node_modules
fn apply_patch_to_package(
    root_dir: &Path,
    package_name: &str,
    patch_content: &str,
) -> Result<(), Box<dyn std::error::Error>> {
    let pkg_dir = root_dir.join("node_modules").join(package_name);

    // Split multi-file patch into individual file patches
    let file_patches = split_multi_file_patch(patch_content);

    for (file_path, change) in &file_patches {
        let target_path = pkg_dir.join(file_path);

        match change {
            PatchChange::Deleted => {
                if target_path.exists() {
                    std::fs::remove_file(&target_path)?;
                }
            }
            PatchChange::Added(content) => {
                if let Some(parent) = target_path.parent() {
                    std::fs::create_dir_all(parent)?;
                }
                std::fs::write(&target_path, content)?;
            }
            PatchChange::Modified(patch_section) => {
                let current = std::fs::read_to_string(&target_path)
                    .map_err(|_| format!("error: patch target file not found: {}", file_path))?;

                let patched = apply_unified_patch(&current, patch_section)
                    .map_err(|e| format!("error: failed to apply patch to {}: {}", file_path, e))?;

                break_hardlink(&target_path)?;
                std::fs::write(&target_path, patched)?;
            }
        }
    }

    Ok(())
}

/// Split a multi-file unified diff into per-file sections
fn split_multi_file_patch(patch_content: &str) -> Vec<(String, PatchChange)> {
    let mut results = Vec::new();
    let mut sections: Vec<&str> = Vec::new();
    let mut current_start = 0;

    // Find all "diff --git" boundaries
    for (i, _) in patch_content.match_indices("diff --git ") {
        if i > current_start {
            sections.push(&patch_content[current_start..i]);
        }
        current_start = i;
    }
    if current_start < patch_content.len() {
        sections.push(&patch_content[current_start..]);
    }

    for section in sections {
        if !section.starts_with("diff --git ") {
            continue;
        }

        let mut file_path = String::new();
        let mut is_delete = false;
        let mut is_add = false;

        for line in section.lines() {
            if let Some(path) = line.strip_prefix("+++ b/") {
                file_path = path.to_string();
            } else if line.starts_with("+++ /dev/null") {
                is_delete = true;
            } else if line.starts_with("--- /dev/null") {
                is_add = true;
            } else if let Some(path) = line.strip_prefix("--- a/") {
                if file_path.is_empty() {
                    file_path = path.to_string();
                }
            }
        }

        if file_path.is_empty() {
            continue;
        }

        if is_delete {
            results.push((file_path, PatchChange::Deleted));
        } else if is_add {
            // Extract added content from the + lines
            let mut content = String::new();
            let mut in_hunk = false;
            for line in section.lines() {
                if line.starts_with("@@") {
                    in_hunk = true;
                    continue;
                }
                if in_hunk {
                    if let Some(stripped) = line.strip_prefix('+') {
                        content.push_str(stripped);
                        content.push('\n');
                    }
                }
            }
            results.push((file_path, PatchChange::Added(content)));
        } else {
            // Modified file — strip "diff --git" line, keep unified diff content
            let diffy_section: String = section
                .lines()
                .filter(|line| !line.starts_with("diff --git "))
                .collect::<Vec<_>>()
                .join("\n");
            results.push((file_path, PatchChange::Modified(diffy_section)));
        }
    }

    results
}

/// Apply a unified diff patch to content (exact context match, no fuzz)
fn apply_unified_patch(content: &str, patch: &str) -> Result<String, String> {
    let content_lines: Vec<&str> = content.lines().collect();
    let mut result_lines: Vec<&str> = Vec::new();
    let mut content_idx: usize = 0;

    // Parse hunks from the patch
    let hunks = parse_hunks(patch);

    for hunk in &hunks {
        // Copy lines before this hunk
        while content_idx < hunk.old_start.saturating_sub(1) {
            if content_idx < content_lines.len() {
                result_lines.push(content_lines[content_idx]);
            }
            content_idx += 1;
        }

        // Apply hunk lines
        for line in &hunk.lines {
            match line {
                HunkLine::Context(text) => {
                    if content_idx < content_lines.len() {
                        if content_lines[content_idx] != *text {
                            return Err(format!(
                                "context mismatch at line {}: expected {:?}, got {:?}",
                                content_idx + 1,
                                text,
                                content_lines[content_idx]
                            ));
                        }
                        result_lines.push(content_lines[content_idx]);
                    }
                    content_idx += 1;
                }
                HunkLine::Remove(text) => {
                    if content_idx < content_lines.len() && content_lines[content_idx] != *text {
                        return Err(format!(
                            "remove mismatch at line {}: expected {:?}, got {:?}",
                            content_idx + 1,
                            text,
                            content_lines[content_idx]
                        ));
                    }
                    content_idx += 1; // skip removed line
                }
                HunkLine::Add(text) => {
                    result_lines.push(text);
                }
            }
        }
    }

    // Copy remaining lines after last hunk
    while content_idx < content_lines.len() {
        result_lines.push(content_lines[content_idx]);
        content_idx += 1;
    }

    let mut result = result_lines.join("\n");
    // Preserve trailing newline if original had one
    if content.ends_with('\n') {
        result.push('\n');
    }
    Ok(result)
}

#[derive(Debug)]
struct Hunk {
    old_start: usize,
    lines: Vec<HunkLine>,
}

#[derive(Debug)]
enum HunkLine {
    Context(String),
    Add(String),
    Remove(String),
}

/// Parse hunks from a unified diff section (without the "diff --git" header)
fn parse_hunks(patch: &str) -> Vec<Hunk> {
    let mut hunks = Vec::new();
    let mut current_hunk: Option<Hunk> = None;

    for line in patch.lines() {
        if line.starts_with("@@") {
            // Parse hunk header: @@ -old_start,old_count +new_start,new_count @@
            if let Some(hunk) = current_hunk.take() {
                hunks.push(hunk);
            }
            let old_start = parse_hunk_header_old_start(line);
            current_hunk = Some(Hunk {
                old_start,
                lines: Vec::new(),
            });
        } else if let Some(ref mut hunk) = current_hunk {
            if let Some(stripped) = line.strip_prefix('+') {
                hunk.lines.push(HunkLine::Add(stripped.to_string()));
            } else if let Some(stripped) = line.strip_prefix('-') {
                hunk.lines.push(HunkLine::Remove(stripped.to_string()));
            } else if let Some(stripped) = line.strip_prefix(' ') {
                hunk.lines.push(HunkLine::Context(stripped.to_string()));
            } else if !line.starts_with("---") && !line.starts_with("+++") && !line.is_empty() {
                // Context line without leading space (some diff tools)
                hunk.lines.push(HunkLine::Context(line.to_string()));
            }
        }
    }

    if let Some(hunk) = current_hunk {
        hunks.push(hunk);
    }

    hunks
}

/// Parse the old start line from a hunk header like "@@ -1,4 +1,4 @@"
fn parse_hunk_header_old_start(header: &str) -> usize {
    // Format: @@ -start,count +start,count @@
    if let Some(rest) = header.strip_prefix("@@ -") {
        if let Some(comma_pos) = rest.find(',') {
            if let Ok(start) = rest[..comma_pos].parse::<usize>() {
                return start;
            }
        }
        // Handle @@ -start +start @@
        if let Some(space_pos) = rest.find(' ') {
            if let Ok(start) = rest[..space_pos].parse::<usize>() {
                return start;
            }
        }
    }
    1 // default
}

/// Update package.json's vertz.patchedDependencies using raw serde_json::Value
fn update_package_json_patches(
    root_dir: &Path,
    patch_key: &str,
    patch_path: &str,
) -> Result<(), Box<dyn std::error::Error>> {
    let pkg_path = root_dir.join("package.json");
    let content = std::fs::read_to_string(&pkg_path)?;
    let mut value: serde_json::Value = serde_json::from_str(&content)?;

    // Navigate to or create vertz.patchedDependencies
    if value.get("vertz").is_none() {
        value["vertz"] = serde_json::json!({});
    }
    if value["vertz"].get("patchedDependencies").is_none() {
        value["vertz"]["patchedDependencies"] = serde_json::json!({});
    }
    value["vertz"]["patchedDependencies"][patch_key] =
        serde_json::Value::String(patch_path.to_string());

    let output = serde_json::to_string_pretty(&value)?;
    std::fs::write(&pkg_path, format!("{}\n", output))?;
    Ok(())
}

/// Generate a unified diff between two directories
fn generate_diff(old_dir: &Path, new_dir: &Path) -> Result<String, Box<dyn std::error::Error>> {
    let mut diff_output = String::new();

    // Collect all files from both directories
    let old_files = collect_files(old_dir)?;
    let new_files = collect_files(new_dir)?;

    let all_paths: HashSet<&String> = old_files.keys().chain(new_files.keys()).collect();
    let mut sorted_paths: Vec<&String> = all_paths.into_iter().collect();
    sorted_paths.sort();

    for path in sorted_paths {
        let old_content = old_files.get(path);
        let new_content = new_files.get(path);

        match (old_content, new_content) {
            (Some(old), Some(new)) => {
                if old != new {
                    // Modified file
                    if is_binary(old) || is_binary(new) {
                        diff_output.push_str(&format!(
                            "diff --git a/{} b/{}\n# Binary file modified\n",
                            path, path
                        ));
                        continue;
                    }
                    let text_diff = TextDiff::from_lines(old.as_str(), new.as_str());
                    let unified = text_diff
                        .unified_diff()
                        .context_radius(3)
                        .header(&format!("a/{}", path), &format!("b/{}", path))
                        .to_string();
                    if !unified.is_empty() {
                        diff_output.push_str(&format!("diff --git a/{} b/{}\n", path, path));
                        diff_output.push_str(&unified);
                    }
                }
            }
            (Some(old), None) => {
                // Deleted file
                if is_binary(old) {
                    diff_output.push_str(&format!(
                        "diff --git a/{} b/{}\n# Binary file deleted\n",
                        path, path
                    ));
                    continue;
                }
                diff_output.push_str(&format!(
                    "diff --git a/{} b/{}\n--- a/{}\n+++ /dev/null\n",
                    path, path, path
                ));
                let lines: Vec<&str> = old.lines().collect();
                if !lines.is_empty() {
                    diff_output.push_str(&format!("@@ -1,{} +0,0 @@\n", lines.len()));
                    for line in lines {
                        diff_output.push_str(&format!("-{}\n", line));
                    }
                }
            }
            (None, Some(new)) => {
                // Added file
                if is_binary(new) {
                    diff_output.push_str(&format!(
                        "diff --git a/{} b/{}\n# Binary file added\n",
                        path, path
                    ));
                    continue;
                }
                diff_output.push_str(&format!(
                    "diff --git a/{} b/{}\n--- /dev/null\n+++ b/{}\n",
                    path, path, path
                ));
                // Add all lines as additions
                let lines: Vec<&str> = new.lines().collect();
                if !lines.is_empty() {
                    diff_output.push_str(&format!("@@ -0,0 +1,{} @@\n", lines.len()));
                    for line in lines {
                        diff_output.push_str(&format!("+{}\n", line));
                    }
                }
            }
            (None, None) => unreachable!(),
        }
    }

    Ok(diff_output)
}

/// Collect all files in a directory as relative_path -> content
fn collect_files(
    dir: &Path,
) -> Result<std::collections::BTreeMap<String, String>, Box<dyn std::error::Error>> {
    let mut files = std::collections::BTreeMap::new();

    for entry in WalkDir::new(dir).into_iter().filter_map(|e| e.ok()) {
        if !entry.file_type().is_file() {
            continue;
        }
        let path = entry.path();
        let relative = path
            .strip_prefix(dir)
            .map_err(|_| "failed to compute relative path")?
            .to_string_lossy()
            .to_string();

        // Skip node_modules within the package
        if relative.starts_with("node_modules") {
            continue;
        }

        // Read file content (skip binary files gracefully)
        match std::fs::read_to_string(path) {
            Ok(content) => {
                files.insert(relative, content);
            }
            Err(_) => {
                // Binary file — store a marker
                files.insert(relative, "\0BINARY\0".to_string());
            }
        }
    }

    Ok(files)
}

/// Check if content appears to be binary (contains null bytes)
fn is_binary(content: &str) -> bool {
    content.contains('\0')
}

/// Recursively copy a directory
fn copy_dir_recursive(source: &Path, target: &Path) -> Result<(), Box<dyn std::error::Error>> {
    std::fs::create_dir_all(target)?;
    for entry in std::fs::read_dir(source)? {
        let entry = entry?;
        let file_type = entry.file_type()?;
        let source_path = entry.path();
        let target_path = target.join(entry.file_name());

        if file_type.is_dir() {
            copy_dir_recursive(&source_path, &target_path)?;
        } else if file_type.is_file() {
            std::fs::copy(&source_path, &target_path)?;
        }
    }
    Ok(())
}

/// Break hardlinks for all files in a directory (preserving permissions)
fn break_hardlinks_recursive(dir: &Path) -> Result<(), Box<dyn std::error::Error>> {
    for entry in WalkDir::new(dir).into_iter().filter_map(|e| e.ok()) {
        if !entry.file_type().is_file() {
            continue;
        }
        break_hardlink(entry.path())?;
    }
    Ok(())
}

/// Break a single hardlink by reading content and rewriting the file (preserving permissions)
fn break_hardlink(path: &Path) -> Result<(), Box<dyn std::error::Error>> {
    let metadata = std::fs::metadata(path)?;

    // Only break if hardlinked (nlink > 1)
    #[cfg(unix)]
    {
        use std::os::unix::fs::MetadataExt;
        if metadata.nlink() <= 1 {
            return Ok(());
        }
    }

    let content = std::fs::read(path)?;
    let permissions = metadata.permissions();
    std::fs::remove_file(path)?;
    std::fs::write(path, content)?;
    std::fs::set_permissions(path, permissions)?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    fn setup_test_project(tmp: &TempDir) -> std::path::PathBuf {
        let root = tmp.path().to_path_buf();
        let nm = root.join("node_modules");

        // Create a fake installed package
        let express_dir = nm.join("express");
        std::fs::create_dir_all(&express_dir).unwrap();
        std::fs::write(
            express_dir.join("package.json"),
            r#"{"name":"express","version":"4.21.2"}"#,
        )
        .unwrap();
        std::fs::write(
            express_dir.join("index.js"),
            "module.exports = require('./lib/express');",
        )
        .unwrap();
        let lib_dir = express_dir.join("lib");
        std::fs::create_dir_all(&lib_dir).unwrap();
        std::fs::write(lib_dir.join("express.js"), "// express main\n").unwrap();
        std::fs::write(
            lib_dir.join("router.js"),
            "// router code\nvar layer = new Layer(path, {\n  sensitive: false\n});\n",
        )
        .unwrap();

        // Create package.json for the project
        std::fs::write(
            root.join("package.json"),
            r#"{"dependencies":{"express":"^4.21.0"}}"#,
        )
        .unwrap();

        root
    }

    // --- vertz patch ---

    #[test]
    fn test_patch_prepare_creates_backup_and_breaks_hardlinks() {
        let tmp = TempDir::new().unwrap();
        let root = setup_test_project(&tmp);

        let result = patch_prepare(&root, "express").unwrap();
        assert_eq!(result.name, "express");
        assert_eq!(result.version, "4.21.2");

        // Backup should exist
        let backup = root.join("node_modules").join(BACKUP_DIR).join("express");
        assert!(backup.exists());
        assert!(backup.join("package.json").exists());
        assert!(backup.join("lib/router.js").exists());
    }

    #[test]
    fn test_patch_prepare_package_not_found() {
        let tmp = TempDir::new().unwrap();
        let root = setup_test_project(&tmp);

        let result = patch_prepare(&root, "nonexistent");
        assert!(result.is_err());
        let err = result.unwrap_err().to_string();
        assert!(err.contains("not installed"), "Error was: {}", err);
    }

    #[test]
    fn test_patch_prepare_already_being_patched() {
        let tmp = TempDir::new().unwrap();
        let root = setup_test_project(&tmp);

        // First call succeeds
        patch_prepare(&root, "express").unwrap();

        // Second call fails
        let result = patch_prepare(&root, "express");
        assert!(result.is_err());
        let err = result.unwrap_err().to_string();
        assert!(err.contains("already being patched"), "Error was: {}", err);
    }

    // --- vertz patch save ---

    #[test]
    fn test_patch_save_creates_patch_file() {
        let tmp = TempDir::new().unwrap();
        let root = setup_test_project(&tmp);

        // Prepare
        patch_prepare(&root, "express").unwrap();

        // Modify a file
        let router_path = root.join("node_modules/express/lib/router.js");
        std::fs::write(
            &router_path,
            "// router code\nvar layer = new Layer(path || '/', {\n  sensitive: false\n});\n",
        )
        .unwrap();

        // Save
        let result = patch_save(&root, "express").unwrap();
        assert_eq!(result.name, "express");
        assert_eq!(result.version, "4.21.2");
        assert_eq!(result.patch_path, "patches/express@4.21.2.patch");
        assert_eq!(result.files_changed, 1);

        // Patch file should exist
        let patch_file = root.join("patches/express@4.21.2.patch");
        assert!(patch_file.exists());
        let content = std::fs::read_to_string(&patch_file).unwrap();
        assert!(content.contains("diff --git"), "Patch content: {}", content);

        // Backup should be cleaned up
        let backup = root.join("node_modules").join(BACKUP_DIR).join("express");
        assert!(!backup.exists());
    }

    #[test]
    fn test_patch_save_updates_package_json() {
        let tmp = TempDir::new().unwrap();
        let root = setup_test_project(&tmp);

        patch_prepare(&root, "express").unwrap();

        // Modify
        let router_path = root.join("node_modules/express/lib/router.js");
        std::fs::write(
            &router_path,
            "// router code patched\nvar layer = new Layer(path || '/', {});\n",
        )
        .unwrap();

        patch_save(&root, "express").unwrap();

        // Verify package.json
        let pkg_content = std::fs::read_to_string(root.join("package.json")).unwrap();
        let pkg: serde_json::Value = serde_json::from_str(&pkg_content).unwrap();
        let patch_path = pkg["vertz"]["patchedDependencies"]["express@4.21.2"]
            .as_str()
            .unwrap();
        assert_eq!(patch_path, "patches/express@4.21.2.patch");
    }

    #[test]
    fn test_patch_save_no_changes() {
        let tmp = TempDir::new().unwrap();
        let root = setup_test_project(&tmp);

        patch_prepare(&root, "express").unwrap();

        // Don't modify anything
        let result = patch_save(&root, "express").unwrap();
        assert!(result.no_changes);
        assert_eq!(result.files_changed, 0);
        assert!(result.patch_path.is_empty());
    }

    #[test]
    fn test_patch_save_not_being_patched() {
        let tmp = TempDir::new().unwrap();
        let root = setup_test_project(&tmp);

        let result = patch_save(&root, "express");
        assert!(result.is_err());
        let err = result.unwrap_err().to_string();
        assert!(err.contains("not being patched"), "Error was: {}", err);
    }

    #[test]
    fn test_patch_save_scoped_package() {
        let tmp = TempDir::new().unwrap();
        let root = tmp.path().to_path_buf();
        let nm = root.join("node_modules");

        // Create scoped package
        let pkg_dir = nm.join("@types/node");
        std::fs::create_dir_all(&pkg_dir).unwrap();
        std::fs::write(
            pkg_dir.join("package.json"),
            r#"{"name":"@types/node","version":"22.0.0"}"#,
        )
        .unwrap();
        std::fs::write(pkg_dir.join("index.d.ts"), "// original types\n").unwrap();

        std::fs::write(
            root.join("package.json"),
            r#"{"devDependencies":{"@types/node":"^22.0.0"}}"#,
        )
        .unwrap();

        patch_prepare(&root, "@types/node").unwrap();

        // Modify
        std::fs::write(nm.join("@types/node/index.d.ts"), "// patched types\n").unwrap();

        let result = patch_save(&root, "@types/node").unwrap();
        assert_eq!(result.patch_path, "patches/@types+node@22.0.0.patch");

        // Verify the patch file exists with escaped name
        let patch_file = root.join("patches/@types+node@22.0.0.patch");
        assert!(patch_file.exists());
    }

    #[test]
    fn test_patch_save_creates_patches_dir() {
        let tmp = TempDir::new().unwrap();
        let root = setup_test_project(&tmp);

        // Verify patches/ doesn't exist yet
        assert!(!root.join("patches").exists());

        patch_prepare(&root, "express").unwrap();

        let router_path = root.join("node_modules/express/lib/router.js");
        std::fs::write(&router_path, "// patched\n").unwrap();

        patch_save(&root, "express").unwrap();

        // patches/ should now exist
        assert!(root.join("patches").exists());
    }

    // --- apply_patches ---

    #[test]
    fn test_apply_patches_applies_saved_patch() {
        let tmp = TempDir::new().unwrap();
        let root = setup_test_project(&tmp);

        // Create a patch through the normal workflow
        patch_prepare(&root, "express").unwrap();
        let router_path = root.join("node_modules/express/lib/router.js");
        std::fs::write(
            &router_path,
            "// router code\nvar layer = new Layer(path || '/', {\n  sensitive: false\n});\n",
        )
        .unwrap();
        patch_save(&root, "express").unwrap();

        // Restore the original content (simulating a fresh install)
        std::fs::write(
            &router_path,
            "// router code\nvar layer = new Layer(path, {\n  sensitive: false\n});\n",
        )
        .unwrap();

        // Apply patches
        let results = apply_patches(&root).unwrap();
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].name, "express");

        // Verify the patch was applied
        let content = std::fs::read_to_string(&router_path).unwrap();
        assert!(
            content.contains("path || '/'"),
            "Content after apply: {}",
            content
        );
    }

    #[test]
    fn test_apply_patches_version_mismatch() {
        let tmp = TempDir::new().unwrap();
        let root = setup_test_project(&tmp);

        // Create a patch
        patch_prepare(&root, "express").unwrap();
        let router_path = root.join("node_modules/express/lib/router.js");
        std::fs::write(&router_path, "// patched\n").unwrap();
        patch_save(&root, "express").unwrap();

        // Change the installed version
        std::fs::write(
            root.join("node_modules/express/package.json"),
            r#"{"name":"express","version":"4.22.0"}"#,
        )
        .unwrap();

        let result = apply_patches(&root);
        assert!(result.is_err());
        let err = result.unwrap_err().to_string();
        assert!(err.contains("4.21.2"), "Error was: {}", err);
        assert!(err.contains("4.22.0"), "Error was: {}", err);
    }

    #[test]
    fn test_apply_patches_no_patches() {
        let tmp = TempDir::new().unwrap();
        let root = setup_test_project(&tmp);

        let results = apply_patches(&root).unwrap();
        assert!(results.is_empty());
    }

    // --- package.json read-modify-write ---

    #[test]
    fn test_package_json_preserves_existing_fields() {
        let tmp = TempDir::new().unwrap();
        let root = setup_test_project(&tmp);

        // Write package.json with extra fields
        std::fs::write(
            root.join("package.json"),
            r#"{
  "name": "my-project",
  "version": "1.0.0",
  "dependencies": {
    "express": "^4.21.0"
  },
  "scripts": {
    "start": "node index.js"
  }
}"#,
        )
        .unwrap();

        update_package_json_patches(&root, "express@4.21.2", "patches/express@4.21.2.patch")
            .unwrap();

        let content = std::fs::read_to_string(root.join("package.json")).unwrap();
        let value: serde_json::Value = serde_json::from_str(&content).unwrap();

        // Existing fields preserved
        assert_eq!(value["name"], "my-project");
        assert_eq!(value["version"], "1.0.0");
        assert_eq!(value["dependencies"]["express"], "^4.21.0");
        assert_eq!(value["scripts"]["start"], "node index.js");

        // New field added
        assert_eq!(
            value["vertz"]["patchedDependencies"]["express@4.21.2"],
            "patches/express@4.21.2.patch"
        );
    }

    // --- parse_patch_key_name ---

    #[test]
    fn test_parse_patch_key_name_regular() {
        assert_eq!(parse_patch_key_name("express@4.21.2"), Some("express"));
    }

    #[test]
    fn test_parse_patch_key_name_scoped() {
        assert_eq!(
            parse_patch_key_name("@types/node@22.0.0"),
            Some("@types/node")
        );
    }

    // --- read_patched_package_names ---

    #[test]
    fn test_read_patched_package_names() {
        let tmp = TempDir::new().unwrap();
        let root = tmp.path();
        std::fs::write(
            root.join("package.json"),
            r#"{"vertz":{"patchedDependencies":{"express@4.21.2":"patches/express@4.21.2.patch","@types/node@22.0.0":"patches/@types+node@22.0.0.patch"}}}"#,
        )
        .unwrap();

        let names = read_patched_package_names(root);
        assert!(names.contains("express"));
        assert!(names.contains("@types/node"));
        assert_eq!(names.len(), 2);
    }

    #[test]
    fn test_read_patched_package_names_no_patches() {
        let tmp = TempDir::new().unwrap();
        let root = tmp.path();
        std::fs::write(root.join("package.json"), r#"{"dependencies":{}}"#).unwrap();

        let names = read_patched_package_names(root);
        assert!(names.is_empty());
    }

    // --- vertz patch discard ---

    #[test]
    fn test_patch_discard_restores_from_backup() {
        let tmp = TempDir::new().unwrap();
        let root = setup_test_project(&tmp);

        // Prepare
        patch_prepare(&root, "express").unwrap();

        // Modify files
        let router_path = root.join("node_modules/express/lib/router.js");
        std::fs::write(&router_path, "// modified by user\n").unwrap();

        // Discard
        let result = patch_discard(&root, "express").unwrap();
        assert_eq!(result.name, "express");
        assert_eq!(result.version, "4.21.2");
        assert!(!result.reapplied_patch);

        // Original content restored
        let content = std::fs::read_to_string(&router_path).unwrap();
        assert!(
            content.contains("var layer = new Layer(path, {"),
            "Content should be original: {}",
            content
        );

        // Backup removed
        let backup = root.join("node_modules").join(BACKUP_DIR).join("express");
        assert!(!backup.exists());
    }

    #[test]
    fn test_patch_discard_not_being_patched() {
        let tmp = TempDir::new().unwrap();
        let root = setup_test_project(&tmp);

        let result = patch_discard(&root, "express");
        assert!(result.is_err());
        let err = result.unwrap_err().to_string();
        assert!(err.contains("not being patched"), "Error was: {}", err);
    }

    #[test]
    fn test_patch_discard_reapplies_saved_patch() {
        let tmp = TempDir::new().unwrap();
        let root = setup_test_project(&tmp);

        // First, create and save a patch
        patch_prepare(&root, "express").unwrap();
        let router_path = root.join("node_modules/express/lib/router.js");
        std::fs::write(
            &router_path,
            "// router code\nvar layer = new Layer(path || '/', {\n  sensitive: false\n});\n",
        )
        .unwrap();
        patch_save(&root, "express").unwrap();

        // Now start a new patch session and make different changes
        patch_prepare(&root, "express").unwrap();
        std::fs::write(&router_path, "// totally different code\n").unwrap();

        // Discard should restore from backup (which already has saved patch applied)
        patch_discard(&root, "express").unwrap();

        // Content should have the saved patch (path || '/')
        // The backup was taken after patch_save, so it already has the saved patch
        let content = std::fs::read_to_string(&router_path).unwrap();
        assert!(
            content.contains("path || '/'"),
            "Should have saved patch state: {}",
            content
        );
    }

    #[test]
    fn test_patch_discard_reapplies_when_backup_is_unpatched() {
        let tmp = TempDir::new().unwrap();
        let root = setup_test_project(&tmp);

        // Create a saved patch in package.json WITHOUT going through patch_prepare/save
        // (simulating a repo with patches/ checked in but fresh install didn't apply them)
        let patches_dir = root.join("patches");
        std::fs::create_dir_all(&patches_dir).unwrap();

        // Create a patch file manually
        let patch_content = "diff --git a/lib/router.js b/lib/router.js\n--- a/lib/router.js\n+++ b/lib/router.js\n@@ -1,4 +1,4 @@\n // router code\n-var layer = new Layer(path, {\n+var layer = new Layer(path || '/', {\n   sensitive: false\n });\n";
        std::fs::write(patches_dir.join("express@4.21.2.patch"), patch_content).unwrap();

        // Update package.json with patch reference
        update_package_json_patches(&root, "express@4.21.2", "patches/express@4.21.2.patch")
            .unwrap();

        // Now prepare (backup is UNPATCHED original)
        patch_prepare(&root, "express").unwrap();

        // Make bad changes
        let router_path = root.join("node_modules/express/lib/router.js");
        std::fs::write(&router_path, "// bad changes\n").unwrap();

        // Discard should restore from backup (unpatched) and re-apply saved patch
        let result = patch_discard(&root, "express").unwrap();
        assert!(result.reapplied_patch);

        // Content should have the saved patch applied
        let content = std::fs::read_to_string(&router_path).unwrap();
        assert!(
            content.contains("path || '/'"),
            "Saved patch should be re-applied: {}",
            content
        );
    }

    // --- vertz patch list ---

    #[test]
    fn test_patch_list_shows_active_and_saved() {
        let tmp = TempDir::new().unwrap();
        let root = setup_test_project(&tmp);

        // Save a patch
        patch_prepare(&root, "express").unwrap();
        let router_path = root.join("node_modules/express/lib/router.js");
        std::fs::write(&router_path, "// patched code\n").unwrap();
        patch_save(&root, "express").unwrap();

        // Start patching again (creates a new backup = active)
        patch_prepare(&root, "express").unwrap();

        let result = patch_list(&root);
        assert_eq!(result.active.len(), 1);
        assert_eq!(result.active[0].0, "express");
        assert_eq!(result.saved.len(), 1);
        assert_eq!(result.saved[0].0, "express@4.21.2");
    }

    #[test]
    fn test_patch_list_scoped_active_package() {
        let tmp = TempDir::new().unwrap();
        let root = tmp.path().to_path_buf();
        let nm = root.join("node_modules");

        // Create scoped package
        let pkg_dir = nm.join("@types/node");
        std::fs::create_dir_all(&pkg_dir).unwrap();
        std::fs::write(
            pkg_dir.join("package.json"),
            r#"{"name":"@types/node","version":"22.0.0"}"#,
        )
        .unwrap();
        std::fs::write(pkg_dir.join("index.d.ts"), "// types\n").unwrap();

        std::fs::write(
            root.join("package.json"),
            r#"{"devDependencies":{"@types/node":"^22.0.0"}}"#,
        )
        .unwrap();

        // Prepare (creates backup under .vertz-patches/@types/node/)
        patch_prepare(&root, "@types/node").unwrap();

        let result = patch_list(&root);
        assert_eq!(result.active.len(), 1);
        assert_eq!(result.active[0].0, "@types/node");
        assert_eq!(result.active[0].1, "22.0.0");
    }

    #[test]
    fn test_patch_list_no_patches() {
        let tmp = TempDir::new().unwrap();
        let root = setup_test_project(&tmp);

        let result = patch_list(&root);
        assert!(result.active.is_empty());
        assert!(result.saved.is_empty());
    }

    // --- nested dependency check ---

    #[test]
    fn test_patch_prepare_rejects_transitive_dependency() {
        let tmp = TempDir::new().unwrap();
        let root = tmp.path().to_path_buf();
        let nm = root.join("node_modules");

        // Create a package that is NOT in package.json dependencies
        let pkg_dir = nm.join("transitive-dep");
        std::fs::create_dir_all(&pkg_dir).unwrap();
        std::fs::write(
            pkg_dir.join("package.json"),
            r#"{"name":"transitive-dep","version":"1.0.0"}"#,
        )
        .unwrap();
        std::fs::write(pkg_dir.join("index.js"), "// code\n").unwrap();

        // package.json only has express, not transitive-dep
        std::fs::write(
            root.join("package.json"),
            r#"{"dependencies":{"express":"^4.21.0"}}"#,
        )
        .unwrap();

        let result = patch_prepare(&root, "transitive-dep");
        assert!(result.is_err());
        let err = result.unwrap_err().to_string();
        assert!(err.contains("transitive dependency"), "Error was: {}", err);
        assert!(
            err.contains("vertz add transitive-dep"),
            "Error should suggest adding as direct dep: {}",
            err
        );
    }

    // --- apply_patches edge cases ---

    #[test]
    fn test_apply_patches_target_file_not_found() {
        let tmp = TempDir::new().unwrap();
        let root = setup_test_project(&tmp);

        // Create a patch that references a non-existent file
        let patches_dir = root.join("patches");
        std::fs::create_dir_all(&patches_dir).unwrap();
        std::fs::write(
            patches_dir.join("express@4.21.2.patch"),
            "diff --git a/nonexistent.js b/nonexistent.js\n--- a/nonexistent.js\n+++ b/nonexistent.js\n@@ -1,1 +1,1 @@\n-old\n+new\n",
        )
        .unwrap();

        update_package_json_patches(&root, "express@4.21.2", "patches/express@4.21.2.patch")
            .unwrap();

        let result = apply_patches(&root);
        assert!(result.is_err());
        let err = result.unwrap_err().to_string();
        assert!(
            err.contains("not found"),
            "Error should mention file not found: {}",
            err
        );
    }

    // --- patch engine edge cases ---

    #[test]
    fn test_apply_unified_patch_multi_hunk() {
        let content = "line1\nline2\nline3\nline4\nline5\nline6\nline7\nline8\n";
        let patch = "--- a/file\n+++ b/file\n@@ -1,3 +1,3 @@\n line1\n-line2\n+line2_modified\n line3\n@@ -6,3 +6,3 @@\n line6\n-line7\n+line7_modified\n line8\n";

        let result = apply_unified_patch(content, patch).unwrap();
        assert!(result.contains("line2_modified"));
        assert!(result.contains("line7_modified"));
        assert!(!result.contains("\nline2\n"));
        assert!(!result.contains("\nline7\n"));
    }

    #[test]
    fn test_apply_unified_patch_context_mismatch() {
        let content = "line1\nline2\nline3\n";
        let patch =
            "--- a/file\n+++ b/file\n@@ -1,3 +1,3 @@\n line1\n-wrong_line\n+replacement\n line3\n";

        let result = apply_unified_patch(content, patch);
        assert!(result.is_err());
        let err = result.unwrap_err();
        assert!(err.contains("mismatch"), "Error was: {}", err);
    }

    #[test]
    fn test_apply_patch_with_file_addition() {
        let tmp = TempDir::new().unwrap();
        let root = setup_test_project(&tmp);

        // Create a patch that adds a new file
        patch_prepare(&root, "express").unwrap();
        let new_file = root.join("node_modules/express/lib/new-feature.js");
        std::fs::write(&new_file, "// new feature\nexport function feature() {}\n").unwrap();
        let result = patch_save(&root, "express").unwrap();
        assert!(!result.no_changes);

        // Remove the new file (simulating fresh install)
        std::fs::remove_file(&new_file).unwrap();
        assert!(!new_file.exists());

        // Apply patches should recreate the file
        apply_patches(&root).unwrap();
        assert!(new_file.exists());
        let content = std::fs::read_to_string(&new_file).unwrap();
        assert!(content.contains("new feature"));
    }

    #[test]
    fn test_apply_patch_with_file_deletion() {
        let tmp = TempDir::new().unwrap();
        let root = setup_test_project(&tmp);

        // Create a patch that deletes a file
        patch_prepare(&root, "express").unwrap();
        let express_main = root.join("node_modules/express/lib/express.js");
        std::fs::remove_file(&express_main).unwrap();
        let result = patch_save(&root, "express").unwrap();
        assert!(!result.no_changes);

        // Restore the file (simulating fresh install)
        std::fs::write(&express_main, "// express main\n").unwrap();
        assert!(express_main.exists());

        // Apply patches should delete the file
        apply_patches(&root).unwrap();
        assert!(!express_main.exists());
    }

    #[test]
    fn test_apply_unified_patch_empty_file() {
        let content = "";
        let patch = "--- a/file\n+++ b/file\n@@ -0,0 +1,1 @@\n+new line\n";

        let result = apply_unified_patch(content, patch).unwrap();
        assert!(result.contains("new line"));
    }

    #[test]
    fn test_patch_list_active_falls_back_to_backup_version() {
        let tmp = TempDir::new().unwrap();
        let root = tmp.path().to_path_buf();
        let nm = root.join("node_modules");

        // Create backup but no installed package in node_modules
        let backup_dir = nm.join(BACKUP_DIR).join("my-pkg");
        std::fs::create_dir_all(&backup_dir).unwrap();
        std::fs::write(
            backup_dir.join("package.json"),
            r#"{"name":"my-pkg","version":"2.0.0"}"#,
        )
        .unwrap();

        // No package.json at root (no saved patches)
        std::fs::write(root.join("package.json"), r#"{}"#).unwrap();

        let result = patch_list(&root);
        assert_eq!(result.active.len(), 1);
        assert_eq!(result.active[0].0, "my-pkg");
        assert_eq!(result.active[0].1, "2.0.0");
    }

    // --- file permissions ---

    #[cfg(unix)]
    #[test]
    fn test_break_hardlink_preserves_permissions() {
        use std::os::unix::fs::PermissionsExt;

        let tmp = TempDir::new().unwrap();
        let file_path = tmp.path().join("test.sh");
        std::fs::write(&file_path, "#!/bin/sh\necho hello").unwrap();

        // Make executable
        let perms = std::fs::Permissions::from_mode(0o755);
        std::fs::set_permissions(&file_path, perms).unwrap();

        // Create a hardlink
        let link_path = tmp.path().join("test_link.sh");
        std::fs::hard_link(&file_path, &link_path).unwrap();

        // Break the hardlink on the original
        break_hardlink(&file_path).unwrap();

        // Check permissions preserved
        let metadata = std::fs::metadata(&file_path).unwrap();
        assert_eq!(metadata.permissions().mode() & 0o777, 0o755);

        // Check content preserved
        let content = std::fs::read_to_string(&file_path).unwrap();
        assert_eq!(content, "#!/bin/sh\necho hello");
    }
}
