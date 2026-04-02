pub mod protocol;
pub mod recovery;
pub mod websocket;

use crate::watcher::InvalidationResult;
use protocol::HmrMessage;
use std::path::Path;
use std::time::{SystemTime, UNIX_EPOCH};
use websocket::HmrHub;

/// Convert an invalidation result into the appropriate HMR message.
///
/// Decision tree:
/// 1. Entry file changed → full reload
/// 2. CSS-only change → CSS update
/// 3. Otherwise → module update with all affected files
pub fn invalidation_to_message(result: &InvalidationResult, root_dir: &Path) -> HmrMessage {
    let timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0);

    if result.is_entry_file {
        return HmrMessage::FullReload {
            reason: "entry file changed".to_string(),
        };
    }

    if result.is_css_only {
        let file_url = path_to_url(&result.changed_file, root_dir);
        return HmrMessage::CssUpdate {
            file: file_url,
            timestamp,
        };
    }

    // Module update: include all invalidated files as URL paths
    let modules: Vec<String> = result
        .invalidated_files
        .iter()
        .map(|p| path_to_url(p, root_dir))
        .collect();

    HmrMessage::Update { modules, timestamp }
}

/// Convert an absolute file path to a URL path relative to root_dir.
fn path_to_url(path: &Path, root_dir: &Path) -> String {
    if let Ok(rel) = path.strip_prefix(root_dir) {
        format!("/{}", rel.to_string_lossy().replace('\\', "/"))
    } else {
        format!("/{}", path.to_string_lossy().replace('\\', "/"))
    }
}

/// Broadcast an HMR update to all connected clients.
pub async fn broadcast_update(hub: &HmrHub, result: &InvalidationResult, root_dir: &Path) {
    let message = invalidation_to_message(result, root_dir);
    hub.broadcast(message).await;
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::watcher::file_watcher::FileChangeKind;
    use std::path::PathBuf;

    #[test]
    fn test_entry_file_change_produces_full_reload() {
        let result = InvalidationResult {
            changed_file: PathBuf::from("/project/src/app.tsx"),
            change_kind: FileChangeKind::Modify,
            invalidated_files: vec![PathBuf::from("/project/src/app.tsx")],
            is_entry_file: true,
            is_css_only: false,
        };

        let msg = invalidation_to_message(&result, Path::new("/project"));
        match msg {
            HmrMessage::FullReload { reason } => {
                assert_eq!(reason, "entry file changed");
            }
            _ => panic!("Expected FullReload, got {:?}", msg),
        }
    }

    #[test]
    fn test_css_change_produces_css_update() {
        let result = InvalidationResult {
            changed_file: PathBuf::from("/project/src/styles.css"),
            change_kind: FileChangeKind::Modify,
            invalidated_files: vec![],
            is_entry_file: false,
            is_css_only: true,
        };

        let msg = invalidation_to_message(&result, Path::new("/project"));
        match msg {
            HmrMessage::CssUpdate { file, timestamp } => {
                assert_eq!(file, "/src/styles.css");
                assert!(timestamp > 0);
            }
            _ => panic!("Expected CssUpdate, got {:?}", msg),
        }
    }

    #[test]
    fn test_module_change_produces_update() {
        let result = InvalidationResult {
            changed_file: PathBuf::from("/project/src/Button.tsx"),
            change_kind: FileChangeKind::Modify,
            invalidated_files: vec![
                PathBuf::from("/project/src/Button.tsx"),
                PathBuf::from("/project/src/app.tsx"),
            ],
            is_entry_file: false,
            is_css_only: false,
        };

        let msg = invalidation_to_message(&result, Path::new("/project"));
        match msg {
            HmrMessage::Update { modules, timestamp } => {
                assert_eq!(modules.len(), 2);
                assert!(modules.contains(&"/src/Button.tsx".to_string()));
                assert!(modules.contains(&"/src/app.tsx".to_string()));
                assert!(timestamp > 0);
            }
            _ => panic!("Expected Update, got {:?}", msg),
        }
    }

    #[test]
    fn test_saving_file_imported_by_three_sends_all_four() {
        let result = InvalidationResult {
            changed_file: PathBuf::from("/project/src/utils.ts"),
            change_kind: FileChangeKind::Modify,
            invalidated_files: vec![
                PathBuf::from("/project/src/utils.ts"),
                PathBuf::from("/project/src/A.tsx"),
                PathBuf::from("/project/src/B.tsx"),
                PathBuf::from("/project/src/C.tsx"),
            ],
            is_entry_file: false,
            is_css_only: false,
        };

        let msg = invalidation_to_message(&result, Path::new("/project"));
        match msg {
            HmrMessage::Update { modules, .. } => {
                assert_eq!(modules.len(), 4);
            }
            _ => panic!("Expected Update"),
        }
    }

    #[test]
    fn test_path_to_url() {
        assert_eq!(
            path_to_url(Path::new("/project/src/Button.tsx"), Path::new("/project")),
            "/src/Button.tsx"
        );
    }

    #[test]
    fn test_css_imported_by_js_produces_module_update() {
        // When a CSS file is imported by JS, the watcher sets is_css_only=false
        // and includes the CSS file + its JS dependents in invalidated_files.
        // This should produce a module Update, not a CssUpdate.
        let result = InvalidationResult {
            changed_file: PathBuf::from("/project/src/App.css"),
            change_kind: FileChangeKind::Modify,
            invalidated_files: vec![
                PathBuf::from("/project/src/App.css"),
                PathBuf::from("/project/src/App.tsx"),
            ],
            is_entry_file: false,
            is_css_only: false, // Not CSS-only because it has JS dependents
        };

        let msg = invalidation_to_message(&result, Path::new("/project"));
        match msg {
            HmrMessage::Update { modules, .. } => {
                assert_eq!(modules.len(), 2);
                assert!(modules.contains(&"/src/App.css".to_string()));
                assert!(modules.contains(&"/src/App.tsx".to_string()));
            }
            _ => panic!("Expected Update for CSS imported by JS, got {:?}", msg),
        }
    }

    #[test]
    fn test_path_to_url_outside_root() {
        assert_eq!(
            path_to_url(Path::new("/other/file.tsx"), Path::new("/project")),
            "//other/file.tsx"
        );
    }

    #[tokio::test]
    async fn test_broadcast_update_sends_message() {
        let hub = HmrHub::new();
        let mut rx = hub.subscribe();

        let result = InvalidationResult {
            changed_file: PathBuf::from("/project/src/app.tsx"),
            change_kind: FileChangeKind::Modify,
            invalidated_files: vec![PathBuf::from("/project/src/app.tsx")],
            is_entry_file: false,
            is_css_only: false,
        };

        broadcast_update(&hub, &result, Path::new("/project")).await;

        let msg = rx.recv().await.unwrap();
        let parsed: serde_json::Value = serde_json::from_str(&msg).unwrap();
        assert_eq!(parsed["type"], "update");
    }
}
