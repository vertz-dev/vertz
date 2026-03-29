use indicatif::{ProgressBar, ProgressStyle};
use serde_json::json;
use std::sync::Mutex;

/// Output handler for PM operations — either human-readable or NDJSON
pub trait PmOutput: Send + Sync {
    fn resolve_started(&self);
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
    fn script_started(&self, name: &str, script: &str);
    fn script_complete(&self, name: &str, duration_ms: u64);
    fn script_error(&self, name: &str, error: &str);
    fn done(&self, elapsed_ms: u64);
    fn error(&self, code: &str, message: &str);
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

    fn done(&self, elapsed_ms: u64) {
        eprintln!("Done in {:.1}s", elapsed_ms as f64 / 1000.0);
    }

    fn error(&self, _code: &str, message: &str) {
        eprintln!("{}", message);
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

    fn done(&self, elapsed_ms: u64) {
        println!("{}", json!({"event": "done", "elapsed_ms": elapsed_ms}));
    }

    fn error(&self, code: &str, message: &str) {
        println!(
            "{}",
            json!({"event": "error", "code": code, "message": message})
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
    } else {
        "NETWORK_ERROR"
    }
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
}
