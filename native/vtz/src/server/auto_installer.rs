//! Shared auto-install coordination for missing npm packages.
//!
//! Used by both the browser-side module server (`/@deps/` requests) and the
//! V8 persistent isolate (SSR/API route module loading). A single
//! `Arc<AutoInstaller>` is shared so that dedup, blacklisting, and the
//! global install lock coordinate across both code paths.

use std::collections::{HashMap, HashSet};
use std::path::PathBuf;
use std::sync::Arc;

use crate::errors::broadcaster::ErrorBroadcaster;
use crate::errors::categories::{DevError, ErrorCategory};
use crate::pm;
use crate::pm::output::DevPmOutput;

/// Coordinates auto-installation of missing npm packages during dev.
///
/// Handles:
/// - Global install lock (serializes all `pm::add` calls)
/// - Per-package inflight dedup (concurrent callers wait on a `Notify`)
/// - Failed-package blacklist (prevents retry storms, cleared on file change)
/// - Error/status broadcasting to the browser overlay
pub struct AutoInstaller {
    root_dir: PathBuf,
    /// Serializes all `pm::add()` calls to prevent `package.json` write races.
    lock: Arc<tokio::sync::Mutex<()>>,
    /// Per-package dedup: concurrent callers for the same package wait on a `Notify`.
    inflight: Arc<std::sync::Mutex<HashMap<String, Arc<tokio::sync::Notify>>>>,
    /// Packages that failed to install — prevents retry storms.
    /// Cleared on file change (watcher event).
    failed: Arc<std::sync::Mutex<HashSet<String>>>,
    /// For broadcasting "Installing..." / error messages to browser overlay.
    error_broadcaster: ErrorBroadcaster,
}

impl std::fmt::Debug for AutoInstaller {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("AutoInstaller")
            .field("root_dir", &self.root_dir)
            .finish_non_exhaustive()
    }
}

impl AutoInstaller {
    /// Create a new auto-installer for the given project root.
    pub fn new(root_dir: PathBuf, error_broadcaster: ErrorBroadcaster) -> Self {
        Self {
            root_dir,
            lock: Arc::new(tokio::sync::Mutex::new(())),
            inflight: Arc::new(std::sync::Mutex::new(HashMap::new())),
            failed: Arc::new(std::sync::Mutex::new(HashSet::new())),
            error_broadcaster,
        }
    }

    /// Check if a package is in the failed-install blacklist.
    pub fn is_blacklisted(&self, pkg_name: &str) -> bool {
        self.failed.lock().unwrap().contains(pkg_name)
    }

    /// Clear the failed-install blacklist (called on file change).
    pub fn clear_failed(&self) {
        self.failed.lock().unwrap().clear();
    }

    /// Install a missing package via `pm::add`.
    ///
    /// Handles inflight dedup (only one `pm::add` per package at a time),
    /// the global install lock, broadcasting, and blacklisting on failure.
    ///
    /// Returns `Ok(())` on success, `Err(message)` on failure.
    pub async fn install(&self, pkg_name: &str) -> Result<(), String> {
        // Check blacklist first
        if self.is_blacklisted(pkg_name) {
            return Err(format!(
                "Package '{}' previously failed to install",
                pkg_name
            ));
        }

        // Per-package dedup: single lock scope to atomically check + insert.
        let is_installer = {
            let mut inflight = self.inflight.lock().unwrap();
            if inflight.contains_key(pkg_name) {
                false
            } else {
                let notify = Arc::new(tokio::sync::Notify::new());
                inflight.insert(pkg_name.to_string(), notify);
                true
            }
        };

        if is_installer {
            let result = self.do_install(pkg_name).await;

            // Get the notify handle, remove from inflight, then notify waiters
            let notify = self.inflight.lock().unwrap().remove(pkg_name);
            if let Some(notify) = notify {
                notify.notify_waiters();
            }

            result
        } else {
            // Another caller is installing this package — wait for it
            let notify = self.inflight.lock().unwrap().get(pkg_name).cloned();

            if let Some(notify) = notify {
                let _ = tokio::time::timeout(std::time::Duration::from_secs(35), notify.notified())
                    .await;
            }

            // After wait, check if it succeeded (not in blacklist) or failed
            if self.is_blacklisted(pkg_name) {
                Err(format!(
                    "Package '{}' failed to install (waited for concurrent install)",
                    pkg_name
                ))
            } else {
                Ok(())
            }
        }
    }

    /// Perform the actual installation. Called by the "installer" path only.
    async fn do_install(&self, pkg_name: &str) -> Result<(), String> {
        // Acquire the global install lock (serializes all pm::add calls).
        let _guard = self.lock.lock().await;

        eprintln!("[PM] Auto-installing {}...", pkg_name);

        // Broadcast status to connected browser clients
        self.error_broadcaster
            .broadcast_info(&format!("Installing {}...", pkg_name))
            .await;

        let root_dir = self.root_dir.clone();
        let pkg = pkg_name.to_string();

        // Run pm::add via spawn_blocking (it does blocking I/O internally)
        let result = tokio::time::timeout(
            std::time::Duration::from_secs(30),
            tokio::task::spawn_blocking(move || {
                let rt = tokio::runtime::Handle::current();
                rt.block_on(pm::add(
                    &root_dir,
                    &[pkg.as_str()],
                    false,                                // not dev
                    false,                                // not peer
                    false,                                // not optional
                    false,                                // not exact (caret range)
                    pm::vertzrc::ScriptPolicy::IgnoreAll, // no postinstall during auto-install
                    None,                                 // no workspace target
                    Arc::new(DevPmOutput),
                ))
                .map_err(|e| e.to_string())
            }),
        )
        .await;

        match result {
            Ok(Ok(Ok(()))) => {
                // Success — clear resolve errors
                self.error_broadcaster
                    .clear_category(ErrorCategory::Resolve)
                    .await;
                Ok(())
            }
            Ok(Ok(Err(e))) => {
                // pm::add returned an error
                let msg = format!("Auto-install failed for '{}': {}", pkg_name, e);
                eprintln!("[PM] {}", msg);
                self.failed.lock().unwrap().insert(pkg_name.to_string());
                let error = DevError::resolve(&msg);
                self.error_broadcaster.report_error(error).await;
                Err(msg)
            }
            Ok(Err(e)) => {
                // spawn_blocking panicked
                let msg = format!("Auto-install panicked for '{}': {}", pkg_name, e);
                eprintln!("[PM] {}", msg);
                self.failed.lock().unwrap().insert(pkg_name.to_string());
                Err(msg)
            }
            Err(_) => {
                // Timeout
                let msg = format!(
                    "Auto-install timed out for '{}'. Run `vertz add {}` manually.",
                    pkg_name, pkg_name
                );
                eprintln!("[PM] {}", msg);
                self.failed.lock().unwrap().insert(pkg_name.to_string());
                let error = DevError::resolve(&msg);
                self.error_broadcaster.report_error(error).await;
                Err(msg)
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn test_installer() -> AutoInstaller {
        AutoInstaller::new(PathBuf::from("/tmp/test-project"), ErrorBroadcaster::new())
    }

    #[test]
    fn test_is_blacklisted_returns_false_initially() {
        let installer = test_installer();
        assert!(!installer.is_blacklisted("zod"));
    }

    #[test]
    fn test_is_blacklisted_returns_true_after_manual_insert() {
        let installer = test_installer();
        installer.failed.lock().unwrap().insert("zod".to_string());
        assert!(installer.is_blacklisted("zod"));
    }

    #[test]
    fn test_clear_failed_empties_blacklist() {
        let installer = test_installer();
        installer.failed.lock().unwrap().insert("zod".to_string());
        installer
            .failed
            .lock()
            .unwrap()
            .insert("express".to_string());
        assert!(installer.is_blacklisted("zod"));
        assert!(installer.is_blacklisted("express"));

        installer.clear_failed();

        assert!(!installer.is_blacklisted("zod"));
        assert!(!installer.is_blacklisted("express"));
    }

    #[tokio::test]
    async fn test_install_rejects_blacklisted_package() {
        let installer = test_installer();
        installer
            .failed
            .lock()
            .unwrap()
            .insert("bad-pkg".to_string());

        let result = installer.install("bad-pkg").await;
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("previously failed"));
    }

    #[tokio::test]
    async fn test_inflight_dedup_single_installer() {
        let installer = test_installer();

        // Simulate adding to inflight
        let notify = Arc::new(tokio::sync::Notify::new());
        installer
            .inflight
            .lock()
            .unwrap()
            .insert("zod".to_string(), notify.clone());

        // Verify it's tracked
        assert!(installer.inflight.lock().unwrap().contains_key("zod"));

        // Remove and notify (simulates install completion)
        installer.inflight.lock().unwrap().remove("zod");
        notify.notify_waiters();

        assert!(!installer.inflight.lock().unwrap().contains_key("zod"));
    }

    #[tokio::test]
    async fn test_inflight_dedup_waiter_sees_blacklist() {
        let installer = Arc::new(test_installer());

        // Pre-insert inflight entry to simulate another caller installing
        let notify = Arc::new(tokio::sync::Notify::new());
        installer
            .inflight
            .lock()
            .unwrap()
            .insert("failing-pkg".to_string(), notify.clone());

        let installer_clone = installer.clone();
        let handle = tokio::spawn(async move {
            // This will take the waiter path since "failing-pkg" is already inflight
            installer_clone.install("failing-pkg").await
        });

        // Simulate the "installer" finishing with a failure
        tokio::time::sleep(std::time::Duration::from_millis(50)).await;
        installer
            .failed
            .lock()
            .unwrap()
            .insert("failing-pkg".to_string());
        installer.inflight.lock().unwrap().remove("failing-pkg");
        notify.notify_waiters();

        let result = handle.await.unwrap();
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("failed to install"));
    }

    #[tokio::test]
    async fn test_inflight_dedup_waiter_sees_success() {
        let installer = Arc::new(test_installer());

        // Pre-insert inflight entry
        let notify = Arc::new(tokio::sync::Notify::new());
        installer
            .inflight
            .lock()
            .unwrap()
            .insert("zod".to_string(), notify.clone());

        let installer_clone = installer.clone();
        let handle = tokio::spawn(async move { installer_clone.install("zod").await });

        // Simulate the "installer" finishing with success (not blacklisted)
        tokio::time::sleep(std::time::Duration::from_millis(50)).await;
        installer.inflight.lock().unwrap().remove("zod");
        notify.notify_waiters();

        let result = handle.await.unwrap();
        assert!(result.is_ok());
    }

    #[test]
    fn test_debug_impl() {
        let installer = test_installer();
        let debug = format!("{:?}", installer);
        assert!(debug.contains("AutoInstaller"));
        assert!(debug.contains("/tmp/test-project"));
    }
}
