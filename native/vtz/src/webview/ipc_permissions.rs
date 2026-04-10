//! IPC permission enforcement for desktop apps.
//!
//! Production desktop apps declare which IPC methods they need in `.vertzrc`.
//! The dispatcher checks permissions before executing any method.
//! Dev mode uses `AllowAll` — no checking occurs.

use std::collections::HashSet;

/// All known IPC method strings. Used to validate individual method permissions.
const KNOWN_METHODS: &[&str] = &[
    "fs.readTextFile",
    "fs.writeTextFile",
    "fs.readDir",
    "fs.exists",
    "fs.stat",
    "fs.remove",
    "fs.rename",
    "fs.createDir",
    "shell.execute",
    "clipboard.readText",
    "clipboard.writeText",
    "dialog.open",
    "dialog.save",
    "dialog.confirm",
    "dialog.message",
    "appWindow.setTitle",
    "appWindow.setSize",
    "appWindow.setFullscreen",
    "appWindow.innerSize",
    "appWindow.minimize",
    "appWindow.close",
    "app.dataDir",
    "app.cacheDir",
    "app.version",
];

/// Resolved set of allowed IPC method strings.
///
/// Two states: allow-all (dev mode) or restricted (production).
/// Using an enum makes the states exhaustive and eliminates
/// the impossible state of allow_all=true with a non-empty set.
#[derive(Debug, Clone)]
pub enum IpcPermissions {
    /// Dev mode — all methods allowed, no checking.
    AllowAll,
    /// Production mode — only methods in the set are allowed.
    Restricted(HashSet<String>),
}

impl IpcPermissions {
    /// Dev mode — all methods allowed, no checking.
    pub fn allow_all() -> Self {
        Self::AllowAll
    }

    /// Production mode — resolve capability strings to concrete methods.
    pub fn from_capabilities(capabilities: &[String]) -> Self {
        let mut allowed = HashSet::new();
        for cap in capabilities {
            let resolved = resolve_capability(cap);
            if resolved.is_empty() {
                // Not a group — try as an individual method string
                if KNOWN_METHODS.contains(&cap.as_str()) {
                    allowed.insert(cap.clone());
                }
                // Unknown strings are silently ignored (build-time validation catches them)
            } else {
                for method in resolved {
                    allowed.insert(method.to_string());
                }
            }
        }
        Self::Restricted(allowed)
    }

    /// Check if a method string is allowed.
    pub fn is_allowed(&self, method: &str) -> bool {
        match self {
            Self::AllowAll => true,
            Self::Restricted(set) => set.contains(method),
        }
    }
}

/// Map a capability group string to the concrete method strings it includes.
/// Returns empty vec for non-group strings (individual methods, unknown strings).
fn resolve_capability(cap: &str) -> Vec<&'static str> {
    match cap {
        "fs:read" => vec!["fs.readTextFile", "fs.exists", "fs.stat", "fs.readDir"],
        "fs:write" => vec!["fs.writeTextFile", "fs.createDir", "fs.remove", "fs.rename"],
        "fs:all" => vec![
            "fs.readTextFile",
            "fs.writeTextFile",
            "fs.readDir",
            "fs.exists",
            "fs.stat",
            "fs.remove",
            "fs.rename",
            "fs.createDir",
        ],
        "shell:execute" | "shell:all" => vec!["shell.execute"],
        "clipboard:read" => vec!["clipboard.readText"],
        "clipboard:write" => vec!["clipboard.writeText"],
        "clipboard:all" => vec!["clipboard.readText", "clipboard.writeText"],
        "dialog:all" => vec![
            "dialog.open",
            "dialog.save",
            "dialog.confirm",
            "dialog.message",
        ],
        "appWindow:all" => vec![
            "appWindow.setTitle",
            "appWindow.setSize",
            "appWindow.setFullscreen",
            "appWindow.innerSize",
            "appWindow.minimize",
            "appWindow.close",
        ],
        "app:all" => vec!["app.dataDir", "app.cacheDir", "app.version"],
        _ => vec![],
    }
}

/// Reverse lookup: find the capability group that covers a given method.
/// Used in error messages to suggest the right group to add.
pub fn suggest_capability(method: &str) -> Option<&'static str> {
    match method {
        "fs.readTextFile" | "fs.exists" | "fs.stat" | "fs.readDir" => Some("fs:read"),
        "fs.writeTextFile" | "fs.createDir" | "fs.remove" | "fs.rename" => Some("fs:write"),
        "shell.execute" => Some("shell:all"),
        "clipboard.readText" => Some("clipboard:read"),
        "clipboard.writeText" => Some("clipboard:write"),
        "dialog.open" | "dialog.save" | "dialog.confirm" | "dialog.message" => Some("dialog:all"),
        "appWindow.setTitle"
        | "appWindow.setSize"
        | "appWindow.setFullscreen"
        | "appWindow.innerSize"
        | "appWindow.minimize"
        | "appWindow.close" => Some("appWindow:all"),
        "app.dataDir" | "app.cacheDir" | "app.version" => Some("app:all"),
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    // ── AllowAll ──

    #[test]
    fn allow_all_permits_any_method() {
        let perms = IpcPermissions::allow_all();
        assert!(perms.is_allowed("fs.readTextFile"));
        assert!(perms.is_allowed("shell.execute"));
        assert!(perms.is_allowed("unknown.method"));
        assert!(perms.is_allowed(""));
    }

    // ── from_capabilities: group capabilities ──

    #[test]
    fn fs_read_allows_read_methods() {
        let perms = IpcPermissions::from_capabilities(&["fs:read".to_string()]);
        assert!(perms.is_allowed("fs.readTextFile"));
        assert!(perms.is_allowed("fs.exists"));
        assert!(perms.is_allowed("fs.stat"));
        assert!(perms.is_allowed("fs.readDir"));
    }

    #[test]
    fn fs_read_denies_write_methods() {
        let perms = IpcPermissions::from_capabilities(&["fs:read".to_string()]);
        assert!(!perms.is_allowed("fs.writeTextFile"));
        assert!(!perms.is_allowed("fs.createDir"));
        assert!(!perms.is_allowed("fs.remove"));
        assert!(!perms.is_allowed("fs.rename"));
    }

    #[test]
    fn fs_read_denies_non_fs_methods() {
        let perms = IpcPermissions::from_capabilities(&["fs:read".to_string()]);
        assert!(!perms.is_allowed("shell.execute"));
        assert!(!perms.is_allowed("clipboard.readText"));
        assert!(!perms.is_allowed("dialog.open"));
    }

    #[test]
    fn fs_write_allows_write_methods() {
        let perms = IpcPermissions::from_capabilities(&["fs:write".to_string()]);
        assert!(perms.is_allowed("fs.writeTextFile"));
        assert!(perms.is_allowed("fs.createDir"));
        assert!(perms.is_allowed("fs.remove"));
        assert!(perms.is_allowed("fs.rename"));
    }

    #[test]
    fn fs_write_denies_read_methods() {
        let perms = IpcPermissions::from_capabilities(&["fs:write".to_string()]);
        assert!(!perms.is_allowed("fs.readTextFile"));
        assert!(!perms.is_allowed("fs.exists"));
    }

    #[test]
    fn fs_all_allows_all_fs_methods() {
        let perms = IpcPermissions::from_capabilities(&["fs:all".to_string()]);
        assert!(perms.is_allowed("fs.readTextFile"));
        assert!(perms.is_allowed("fs.writeTextFile"));
        assert!(perms.is_allowed("fs.readDir"));
        assert!(perms.is_allowed("fs.exists"));
        assert!(perms.is_allowed("fs.stat"));
        assert!(perms.is_allowed("fs.remove"));
        assert!(perms.is_allowed("fs.rename"));
        assert!(perms.is_allowed("fs.createDir"));
    }

    #[test]
    fn shell_execute_allows_shell() {
        let perms = IpcPermissions::from_capabilities(&["shell:execute".to_string()]);
        assert!(perms.is_allowed("shell.execute"));
        assert!(!perms.is_allowed("fs.readTextFile"));
    }

    #[test]
    fn shell_all_allows_shell() {
        let perms = IpcPermissions::from_capabilities(&["shell:all".to_string()]);
        assert!(perms.is_allowed("shell.execute"));
    }

    #[test]
    fn clipboard_read_allows_only_read() {
        let perms = IpcPermissions::from_capabilities(&["clipboard:read".to_string()]);
        assert!(perms.is_allowed("clipboard.readText"));
        assert!(!perms.is_allowed("clipboard.writeText"));
    }

    #[test]
    fn clipboard_write_allows_only_write() {
        let perms = IpcPermissions::from_capabilities(&["clipboard:write".to_string()]);
        assert!(perms.is_allowed("clipboard.writeText"));
        assert!(!perms.is_allowed("clipboard.readText"));
    }

    #[test]
    fn clipboard_all_allows_both() {
        let perms = IpcPermissions::from_capabilities(&["clipboard:all".to_string()]);
        assert!(perms.is_allowed("clipboard.readText"));
        assert!(perms.is_allowed("clipboard.writeText"));
    }

    #[test]
    fn dialog_all_allows_all_dialog_methods() {
        let perms = IpcPermissions::from_capabilities(&["dialog:all".to_string()]);
        assert!(perms.is_allowed("dialog.open"));
        assert!(perms.is_allowed("dialog.save"));
        assert!(perms.is_allowed("dialog.confirm"));
        assert!(perms.is_allowed("dialog.message"));
    }

    #[test]
    fn app_window_all_allows_all_window_methods() {
        let perms = IpcPermissions::from_capabilities(&["appWindow:all".to_string()]);
        assert!(perms.is_allowed("appWindow.setTitle"));
        assert!(perms.is_allowed("appWindow.setSize"));
        assert!(perms.is_allowed("appWindow.setFullscreen"));
        assert!(perms.is_allowed("appWindow.innerSize"));
        assert!(perms.is_allowed("appWindow.minimize"));
        assert!(perms.is_allowed("appWindow.close"));
    }

    #[test]
    fn app_all_allows_all_app_methods() {
        let perms = IpcPermissions::from_capabilities(&["app:all".to_string()]);
        assert!(perms.is_allowed("app.dataDir"));
        assert!(perms.is_allowed("app.cacheDir"));
        assert!(perms.is_allowed("app.version"));
    }

    // ── from_capabilities: multiple groups ──

    #[test]
    fn multiple_groups_combine() {
        let perms = IpcPermissions::from_capabilities(&[
            "fs:read".to_string(),
            "clipboard:write".to_string(),
        ]);
        assert!(perms.is_allowed("fs.readTextFile"));
        assert!(perms.is_allowed("clipboard.writeText"));
        assert!(!perms.is_allowed("fs.writeTextFile"));
        assert!(!perms.is_allowed("clipboard.readText"));
    }

    // ── from_capabilities: individual methods ──

    #[test]
    fn individual_method_string_allows_only_that_method() {
        let perms = IpcPermissions::from_capabilities(&["fs.readTextFile".to_string()]);
        assert!(perms.is_allowed("fs.readTextFile"));
        assert!(!perms.is_allowed("fs.exists"));
        assert!(!perms.is_allowed("fs.writeTextFile"));
    }

    #[test]
    fn individual_method_combined_with_group() {
        let perms = IpcPermissions::from_capabilities(&[
            "clipboard:read".to_string(),
            "fs.writeTextFile".to_string(),
        ]);
        assert!(perms.is_allowed("clipboard.readText"));
        assert!(perms.is_allowed("fs.writeTextFile"));
        assert!(!perms.is_allowed("fs.readTextFile"));
    }

    // ── from_capabilities: unknown strings ──

    #[test]
    fn unknown_capability_string_is_ignored() {
        let perms = IpcPermissions::from_capabilities(&["bogus:thing".to_string()]);
        assert!(!perms.is_allowed("bogus.thing"));
        assert!(!perms.is_allowed("fs.readTextFile"));
    }

    #[test]
    fn unknown_method_string_is_ignored() {
        let perms = IpcPermissions::from_capabilities(&["not.a.method".to_string()]);
        assert!(!perms.is_allowed("not.a.method"));
    }

    // ── from_capabilities: empty ──

    #[test]
    fn empty_capabilities_denies_everything() {
        let perms = IpcPermissions::from_capabilities(&[]);
        assert!(!perms.is_allowed("fs.readTextFile"));
        assert!(!perms.is_allowed("shell.execute"));
    }

    // ── suggest_capability ──

    #[test]
    fn suggest_capability_fs_read_methods() {
        assert_eq!(suggest_capability("fs.readTextFile"), Some("fs:read"));
        assert_eq!(suggest_capability("fs.exists"), Some("fs:read"));
        assert_eq!(suggest_capability("fs.stat"), Some("fs:read"));
        assert_eq!(suggest_capability("fs.readDir"), Some("fs:read"));
    }

    #[test]
    fn suggest_capability_fs_write_methods() {
        assert_eq!(suggest_capability("fs.writeTextFile"), Some("fs:write"));
        assert_eq!(suggest_capability("fs.createDir"), Some("fs:write"));
        assert_eq!(suggest_capability("fs.remove"), Some("fs:write"));
        assert_eq!(suggest_capability("fs.rename"), Some("fs:write"));
    }

    #[test]
    fn suggest_capability_shell() {
        assert_eq!(suggest_capability("shell.execute"), Some("shell:all"));
    }

    #[test]
    fn suggest_capability_clipboard() {
        assert_eq!(
            suggest_capability("clipboard.readText"),
            Some("clipboard:read")
        );
        assert_eq!(
            suggest_capability("clipboard.writeText"),
            Some("clipboard:write")
        );
    }

    #[test]
    fn suggest_capability_dialog() {
        assert_eq!(suggest_capability("dialog.open"), Some("dialog:all"));
        assert_eq!(suggest_capability("dialog.save"), Some("dialog:all"));
        assert_eq!(suggest_capability("dialog.confirm"), Some("dialog:all"));
        assert_eq!(suggest_capability("dialog.message"), Some("dialog:all"));
    }

    #[test]
    fn suggest_capability_app_window() {
        assert_eq!(
            suggest_capability("appWindow.setTitle"),
            Some("appWindow:all")
        );
        assert_eq!(suggest_capability("appWindow.close"), Some("appWindow:all"));
    }

    #[test]
    fn suggest_capability_app() {
        assert_eq!(suggest_capability("app.dataDir"), Some("app:all"));
        assert_eq!(suggest_capability("app.version"), Some("app:all"));
    }

    #[test]
    fn suggest_capability_unknown_returns_none() {
        assert_eq!(suggest_capability("unknown.method"), None);
        assert_eq!(suggest_capability(""), None);
    }

    // ── resolve_capability coverage ──

    #[test]
    fn resolve_capability_unknown_returns_empty() {
        assert!(resolve_capability("not:a:thing").is_empty());
        assert!(resolve_capability("fs.readTextFile").is_empty());
    }

    // ── Debug formatting ──

    #[test]
    fn debug_format_allow_all() {
        let perms = IpcPermissions::allow_all();
        let debug = format!("{:?}", perms);
        assert!(debug.contains("AllowAll"));
    }

    #[test]
    fn debug_format_restricted() {
        let perms = IpcPermissions::from_capabilities(&["fs:read".to_string()]);
        let debug = format!("{:?}", perms);
        assert!(debug.contains("Restricted"));
    }
}
