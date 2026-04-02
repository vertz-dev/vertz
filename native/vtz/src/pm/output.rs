use indicatif::{ProgressBar, ProgressStyle};
use serde_json::json;
use std::sync::Mutex;

/// Output handler for PM operations — either human-readable or NDJSON
pub trait PmOutput: Send + Sync {
    fn resolve_started(&self);
    fn resolve_progress(&self, resolved: usize);
    fn resolve_complete(&self, count: usize);
    fn download_started(&self, total: usize);
    fn download_tick(&self);
    fn download_complete(&self, count: usize);
    fn link_started(&self);
    fn link_complete(&self, packages: usize, files: usize, cached: usize);
    fn bin_stubs_created(&self, count: usize);
    fn package_added(&self, name: &str, version: &str, range: &str);
    fn package_removed(&self, name: &str);
    fn package_updated(&self, name: &str, from: &str, to: &str, range: &str);
    fn workspace_linked(&self, count: usize);
    fn script_started(&self, name: &str, script: &str);
    fn script_complete(&self, name: &str, duration_ms: u64);
    fn script_error(&self, name: &str, error: &str);
    fn github_resolve_started(&self, specifier: &str);
    fn github_resolve_complete(&self, name: &str, sha_abbrev: &str);
    fn info(&self, message: &str);
    fn warning(&self, message: &str);
    fn done(&self, elapsed_ms: u64);
    fn error(&self, code: &str, message: &str);

    // ─── publish events ───
    fn publish_packing(&self, name: &str, version: &str);
    fn publish_packed(&self, name: &str, version: &str, files: usize, packed: u64, unpacked: u64);
    fn publish_uploading(&self, name: &str, version: &str, tag: &str);
    fn publish_complete(&self, name: &str, version: &str, tag: &str);
    fn publish_dry_run(&self, name: &str, version: &str, tag: &str, access: &str);
    fn publish_file_list(&self, path: &str, size: u64);
}

/// Human-readable output with optional progress bars (when stderr is a TTY)
pub struct TextOutput {
    is_tty: bool,
    resolve_spinner: Mutex<Option<ProgressBar>>,
    download_bar: Mutex<Option<ProgressBar>>,
}

impl TextOutput {
    pub fn new(is_tty: bool) -> Self {
        Self {
            is_tty,
            resolve_spinner: Mutex::new(None),
            download_bar: Mutex::new(None),
        }
    }
}

impl PmOutput for TextOutput {
    fn resolve_started(&self) {
        if self.is_tty {
            let sp = ProgressBar::new_spinner();
            sp.set_style(
                ProgressStyle::default_spinner()
                    .template("{spinner} {msg}")
                    .unwrap(),
            );
            sp.set_message("Resolving dependencies...");
            sp.enable_steady_tick(std::time::Duration::from_millis(80));
            *self.resolve_spinner.lock().unwrap() = Some(sp);
        } else {
            eprintln!("Resolving dependencies...");
        }
    }

    fn resolve_progress(&self, resolved: usize) {
        if let Some(sp) = self.resolve_spinner.lock().unwrap().as_ref() {
            sp.set_message(format!("Resolving dependencies... ({} resolved)", resolved));
        }
    }

    fn resolve_complete(&self, count: usize) {
        if let Some(sp) = self.resolve_spinner.lock().unwrap().take() {
            sp.finish_and_clear();
        }
        eprintln!("Resolved {} packages", count);
    }

    fn download_started(&self, total: usize) {
        if self.is_tty {
            let pb = ProgressBar::new(total as u64);
            pb.set_style(
                ProgressStyle::default_bar()
                    .template("Downloading packages {bar:24} {pos}/{len}")
                    .unwrap()
                    .progress_chars("█▓░"),
            );
            *self.download_bar.lock().unwrap() = Some(pb);
        } else {
            eprintln!("Downloading packages...");
        }
    }

    fn download_tick(&self) {
        if let Some(ref pb) = *self.download_bar.lock().unwrap() {
            pb.inc(1);
        }
    }

    fn download_complete(&self, count: usize) {
        if let Some(pb) = self.download_bar.lock().unwrap().take() {
            pb.finish_and_clear();
        }
        eprintln!("Downloaded {} packages", count);
    }

    fn link_started(&self) {
        eprintln!("Linking packages...");
    }

    fn link_complete(&self, packages: usize, files: usize, cached: usize) {
        if cached > 0 {
            eprintln!(
                "Linked {} packages ({} files, {} cached)",
                packages, files, cached
            );
        } else {
            eprintln!("Linked {} packages ({} files)", packages, files);
        }
    }

    fn bin_stubs_created(&self, count: usize) {
        if count > 0 {
            eprintln!("Created {} bin stubs", count);
        }
    }

    fn package_added(&self, name: &str, _version: &str, range: &str) {
        eprintln!("+ {}@{}", name, range);
    }

    fn package_removed(&self, name: &str) {
        eprintln!("- {}", name);
    }

    fn package_updated(&self, name: &str, from: &str, to: &str, range: &str) {
        eprintln!("~ {}@{} → {}@{} ({})", name, from, name, to, range);
    }

    fn workspace_linked(&self, count: usize) {
        eprintln!("Linked {} workspace packages", count);
    }

    fn script_started(&self, name: &str, script: &str) {
        eprintln!("Running postinstall for {}: {}", name, script);
    }

    fn script_complete(&self, name: &str, duration_ms: u64) {
        eprintln!(
            "Postinstall for {} completed in {:.1}s",
            name,
            duration_ms as f64 / 1000.0
        );
    }

    fn script_error(&self, name: &str, error: &str) {
        eprintln!("Postinstall for {} failed: {}", name, error);
    }

    fn github_resolve_started(&self, specifier: &str) {
        eprintln!("resolving {}...", specifier);
    }

    fn github_resolve_complete(&self, name: &str, sha_abbrev: &str) {
        eprintln!("+ {} (→ {})", name, sha_abbrev);
    }

    fn info(&self, message: &str) {
        eprintln!("{}", message);
    }

    fn warning(&self, message: &str) {
        eprintln!("warning: {}", message);
    }

    fn done(&self, elapsed_ms: u64) {
        eprintln!("Done in {:.1}s", elapsed_ms as f64 / 1000.0);
    }

    fn error(&self, _code: &str, message: &str) {
        eprintln!("{}", message);
    }

    fn publish_packing(&self, name: &str, version: &str) {
        eprintln!(" Packing {}@{}...", name, version);
    }

    fn publish_packed(
        &self,
        _name: &str,
        _version: &str,
        files: usize,
        packed: u64,
        unpacked: u64,
    ) {
        eprintln!(" Files:  {}", files);
        eprintln!(
            " Size:   {} (packed) / {} (unpacked)",
            format_bytes(packed),
            format_bytes(unpacked)
        );
    }

    fn publish_uploading(&self, name: &str, version: &str, tag: &str) {
        eprintln!(" Publishing {}@{} with tag \"{}\"...", name, version, tag);
    }

    fn publish_complete(&self, name: &str, version: &str, tag: &str) {
        if tag == "latest" {
            eprintln!(" + {}@{}", name, version);
        } else {
            eprintln!(" + {}@{} (tag: {})", name, version, tag);
        }
    }

    fn publish_dry_run(&self, name: &str, version: &str, _tag: &str, _access: &str) {
        eprintln!(
            " Would publish {}@{} (dry run — nothing uploaded)",
            name, version
        );
    }

    fn publish_file_list(&self, path: &str, size: u64) {
        eprintln!("   {:40} {}", path, format_bytes(size));
    }
}

fn format_bytes(bytes: u64) -> String {
    if bytes >= 1_000_000 {
        format!("{:.1} MB", bytes as f64 / 1_000_000.0)
    } else if bytes >= 1_000 {
        format!("{:.1} kB", bytes as f64 / 1_000.0)
    } else {
        format!("{} B", bytes)
    }
}

/// NDJSON output for machine consumption (--json flag)
#[derive(Default)]
pub struct JsonOutput;

impl JsonOutput {
    pub fn new() -> Self {
        Self
    }
}

impl PmOutput for JsonOutput {
    fn resolve_started(&self) {}
    fn resolve_progress(&self, _resolved: usize) {}

    fn resolve_complete(&self, count: usize) {
        println!("{}", json!({"event": "resolve", "packages": count}));
    }

    fn download_started(&self, _total: usize) {}

    fn download_tick(&self) {}

    fn download_complete(&self, count: usize) {
        println!(
            "{}",
            json!({"event": "download_progress", "completed": count, "total": count})
        );
    }

    fn link_started(&self) {}

    fn link_complete(&self, packages: usize, files: usize, cached: usize) {
        println!(
            "{}",
            json!({"event": "link", "packages": packages, "files": files, "cached": cached})
        );
    }

    fn bin_stubs_created(&self, _count: usize) {}

    fn package_added(&self, name: &str, version: &str, range: &str) {
        println!(
            "{}",
            json!({"event": "added", "name": name, "version": version, "range": range})
        );
    }

    fn package_removed(&self, name: &str) {
        println!("{}", json!({"event": "removed", "name": name}));
    }

    fn package_updated(&self, name: &str, from: &str, to: &str, range: &str) {
        println!(
            "{}",
            json!({"event": "updated", "name": name, "from": from, "to": to, "range": range})
        );
    }

    fn workspace_linked(&self, count: usize) {
        println!("{}", json!({"event": "workspace_linked", "count": count}));
    }

    fn script_started(&self, name: &str, script: &str) {
        println!(
            "{}",
            json!({"event": "script_started", "package": name, "script": script})
        );
    }

    fn script_complete(&self, name: &str, duration_ms: u64) {
        println!(
            "{}",
            json!({"event": "script_complete", "package": name, "duration_ms": duration_ms})
        );
    }

    fn script_error(&self, name: &str, error: &str) {
        println!(
            "{}",
            json!({"event": "script_error", "package": name, "error": error})
        );
    }

    fn github_resolve_started(&self, specifier: &str) {
        println!(
            "{}",
            json!({"event": "github_resolve_started", "specifier": specifier})
        );
    }

    fn github_resolve_complete(&self, name: &str, sha_abbrev: &str) {
        println!(
            "{}",
            json!({"event": "github_resolve_complete", "name": name, "sha": sha_abbrev})
        );
    }

    fn info(&self, message: &str) {
        println!("{}", json!({"event": "info", "message": message}));
    }

    fn warning(&self, message: &str) {
        println!("{}", json!({"event": "warning", "message": message}));
    }

    fn done(&self, elapsed_ms: u64) {
        println!("{}", json!({"event": "done", "elapsed_ms": elapsed_ms}));
    }

    fn error(&self, code: &str, message: &str) {
        println!(
            "{}",
            json!({"event": "error", "code": code, "message": message})
        );
    }

    fn publish_packing(&self, name: &str, version: &str) {
        println!(
            "{}",
            json!({"event": "publish_packing", "name": name, "version": version})
        );
    }

    fn publish_packed(&self, name: &str, version: &str, files: usize, packed: u64, unpacked: u64) {
        println!(
            "{}",
            json!({"event": "publish_packed", "name": name, "version": version, "files": files, "packed_size": packed, "unpacked_size": unpacked})
        );
    }

    fn publish_uploading(&self, name: &str, version: &str, tag: &str) {
        println!(
            "{}",
            json!({"event": "publish_uploading", "name": name, "version": version, "tag": tag})
        );
    }

    fn publish_complete(&self, name: &str, version: &str, tag: &str) {
        println!(
            "{}",
            json!({"event": "publish_complete", "name": name, "version": version, "tag": tag})
        );
    }

    fn publish_dry_run(&self, name: &str, version: &str, tag: &str, access: &str) {
        println!(
            "{}",
            json!({"event": "publish_dry_run", "name": name, "version": version, "tag": tag, "access": access})
        );
    }

    fn publish_file_list(&self, path: &str, size: u64) {
        println!(
            "{}",
            json!({"event": "publish_file", "path": path, "size": size})
        );
    }
}

/// Infer an error code from an error message string
pub fn error_code_from_message(msg: &str) -> &'static str {
    if msg.contains("not found on registry") || msg.contains("not found in npm registry") {
        "PACKAGE_NOT_FOUND"
    } else if msg.contains("no version of") || msg.contains("No version of") {
        "VERSION_NOT_FOUND"
    } else if msg.contains("lockfile is out of date") {
        "LOCKFILE_STALE"
    } else if msg.contains("not a direct dependency") {
        "NOT_DIRECT_DEPENDENCY"
    } else if msg.contains("integrity") || msg.contains("Integrity") {
        "INTEGRITY_FAILED"
    } else if msg.contains("rate limit") {
        "GITHUB_RATE_LIMITED"
    } else if msg.contains("repository") && msg.contains("not found") {
        "GITHUB_REPO_NOT_FOUND"
    } else if msg.contains("ref") && msg.contains("not found") {
        "GITHUB_REF_NOT_FOUND"
    } else if msg.contains("access denied") {
        "GITHUB_ACCESS_DENIED"
    } else if msg.contains("invalid GitHub specifier") {
        "INVALID_GITHUB_SPECIFIER"
    } else {
        "NETWORK_ERROR"
    }
}

/// Lightweight output adapter for auto-install during dev.
///
/// Only logs `package_added` and `error` to stderr with `[PM]` prefix.
/// All other methods are no-ops. Does NOT use TTY progress bars.
pub struct DevPmOutput;

impl PmOutput for DevPmOutput {
    fn resolve_started(&self) {}
    fn resolve_progress(&self, _resolved: usize) {}
    fn resolve_complete(&self, _count: usize) {}
    fn download_started(&self, _total: usize) {}
    fn download_tick(&self) {}
    fn download_complete(&self, _count: usize) {}
    fn link_started(&self) {}
    fn link_complete(&self, _packages: usize, _files: usize, _cached: usize) {}
    fn bin_stubs_created(&self, _count: usize) {}
    fn package_added(&self, name: &str, version: &str, range: &str) {
        eprintln!(
            "[PM] + {}@{} ({} added to package.json)",
            name, version, range
        );
    }
    fn package_removed(&self, _name: &str) {}
    fn package_updated(&self, _name: &str, _from: &str, _to: &str, _range: &str) {}
    fn workspace_linked(&self, _count: usize) {}
    fn script_started(&self, _name: &str, _script: &str) {}
    fn script_complete(&self, _name: &str, _duration_ms: u64) {}
    fn script_error(&self, _name: &str, _error: &str) {}
    fn info(&self, _message: &str) {}
    fn warning(&self, _message: &str) {}
    fn done(&self, _elapsed_ms: u64) {}
    fn error(&self, _code: &str, message: &str) {
        eprintln!("[PM] Error: {}", message);
    }
    fn publish_packing(&self, _name: &str, _version: &str) {}
    fn publish_packed(
        &self,
        _name: &str,
        _version: &str,
        _files: usize,
        _packed: u64,
        _unpacked: u64,
    ) {
    }
    fn publish_uploading(&self, _name: &str, _version: &str, _tag: &str) {}
    fn publish_complete(&self, _name: &str, _version: &str, _tag: &str) {}
    fn publish_dry_run(&self, _name: &str, _version: &str, _tag: &str, _access: &str) {}
    fn publish_file_list(&self, _path: &str, _size: u64) {}
    fn github_resolve_started(&self, _specifier: &str) {}
    fn github_resolve_complete(&self, _name: &str, _sha_abbrev: &str) {}
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::Arc;

    #[test]
    fn test_text_output_creation() {
        let output = TextOutput::new(false);
        assert!(!output.is_tty);
    }

    #[test]
    fn test_json_output_creation() {
        let _output = JsonOutput::new();
    }

    #[test]
    fn test_text_output_as_trait_object() {
        let output: Arc<dyn PmOutput> = Arc::new(TextOutput::new(false));
        output.resolve_started();
        output.resolve_complete(10);
    }

    #[test]
    fn test_json_output_as_trait_object() {
        let output: Arc<dyn PmOutput> = Arc::new(JsonOutput::new());
        output.resolve_complete(10);
        output.link_complete(5, 100, 0);
        output.done(1200);
    }

    #[test]
    fn test_error_code_package_not_found() {
        assert_eq!(
            error_code_from_message("package 'foo' not found on registry"),
            "PACKAGE_NOT_FOUND"
        );
        assert_eq!(
            error_code_from_message("package \"foo\" not found in npm registry"),
            "PACKAGE_NOT_FOUND"
        );
    }

    #[test]
    fn test_error_code_version_not_found() {
        assert_eq!(
            error_code_from_message("no version of \"zod\" matches \"^99.0.0\""),
            "VERSION_NOT_FOUND"
        );
    }

    #[test]
    fn test_error_code_lockfile_stale() {
        assert_eq!(
            error_code_from_message("error: lockfile is out of date"),
            "LOCKFILE_STALE"
        );
    }

    #[test]
    fn test_error_code_not_direct_dependency() {
        assert_eq!(
            error_code_from_message("package is not a direct dependency: \"lodash\""),
            "NOT_DIRECT_DEPENDENCY"
        );
    }

    #[test]
    fn test_error_code_integrity_failed() {
        assert_eq!(
            error_code_from_message("Integrity check failed for zod"),
            "INTEGRITY_FAILED"
        );
    }

    #[test]
    fn test_error_code_fallback() {
        assert_eq!(
            error_code_from_message("connection refused"),
            "NETWORK_ERROR"
        );
    }

    #[test]
    fn test_error_code_github_rate_limited() {
        assert_eq!(
            error_code_from_message("GitHub API rate limit exceeded"),
            "GITHUB_RATE_LIMITED"
        );
    }

    #[test]
    fn test_error_code_github_repo_not_found() {
        assert_eq!(
            error_code_from_message("repository \"github:user/lib\" not found"),
            "GITHUB_REPO_NOT_FOUND"
        );
    }

    #[test]
    fn test_error_code_github_ref_not_found() {
        assert_eq!(
            error_code_from_message("ref \"nonexistent\" not found in github:user/lib"),
            "GITHUB_REF_NOT_FOUND"
        );
    }

    #[test]
    fn test_error_code_github_access_denied() {
        assert_eq!(
            error_code_from_message("access denied to github:user/private"),
            "GITHUB_ACCESS_DENIED"
        );
    }

    #[test]
    fn test_error_code_invalid_github_specifier() {
        assert_eq!(
            error_code_from_message("invalid GitHub specifier \"github:bad\""),
            "INVALID_GITHUB_SPECIFIER"
        );
    }

    #[test]
    fn test_text_output_bin_stubs_zero_suppressed() {
        // bin_stubs_created(0) should not print anything
        // (We can't easily test eprintln output, but we verify it doesn't panic)
        let output = TextOutput::new(false);
        output.bin_stubs_created(0);
        output.bin_stubs_created(5);
    }

    #[test]
    fn test_text_output_progress_lifecycle() {
        let output = TextOutput::new(false);
        output.download_started(10);
        output.download_tick();
        output.download_complete(10);
        // Non-TTY: no progress bar, just eprintln
    }

    #[test]
    fn test_text_output_package_updated() {
        let output = TextOutput::new(false);
        // Should not panic
        output.package_updated("zod", "3.24.0", "3.24.4", "^3.24.0");
    }

    #[test]
    fn test_json_output_package_updated() {
        let output: Arc<dyn PmOutput> = Arc::new(JsonOutput::new());
        // Should not panic; emits NDJSON to stdout
        output.package_updated("zod", "3.24.0", "3.24.4", "^3.24.0");
    }

    #[test]
    fn test_text_output_script_lifecycle() {
        let output = TextOutput::new(false);
        output.script_started("esbuild", "node install.js");
        output.script_complete("esbuild", 1200);
        output.script_error("prisma", "script exited with code 1");
    }

    #[test]
    fn test_json_output_script_lifecycle() {
        let output: Arc<dyn PmOutput> = Arc::new(JsonOutput::new());
        output.script_started("esbuild", "node install.js");
        output.script_complete("esbuild", 1200);
        output.script_error("prisma", "script exited with code 1");
    }

    #[test]
    fn test_dev_output_package_added() {
        let output = DevPmOutput;
        // Should not panic — just prints to stderr
        output.package_added("zod", "3.24.0", "^3.24.0");
    }

    #[test]
    fn test_dev_output_error() {
        let output = DevPmOutput;
        output.error("NOT_FOUND", "package not found");
    }
}
