//! Native dialog IPC handlers.
//!
//! Uses `rfd` (Rust File Dialog) for cross-platform native OS dialogs.
//! These are OS-level dialogs (macOS NSOpenPanel/NSSavePanel/NSAlert),
//! NOT in-app UI dialogs.

use crate::webview::ipc_dispatcher::IpcError;
use crate::webview::ipc_method::{
    DialogConfirmParams, DialogMessageParams, DialogOpenParams, DialogSaveParams,
};

fn parse_message_level(kind: &Option<String>) -> rfd::MessageLevel {
    match kind.as_deref() {
        Some("warning") => rfd::MessageLevel::Warning,
        Some("error") => rfd::MessageLevel::Error,
        _ => rfd::MessageLevel::Info,
    }
}

/// Show a file open dialog. Returns the selected path or null if cancelled.
pub async fn open(params: DialogOpenParams) -> Result<serde_json::Value, IpcError> {
    let mut dialog = rfd::AsyncFileDialog::new();

    if let Some(title) = &params.title {
        dialog = dialog.set_title(title);
    }

    if let Some(default_path) = &params.default_path {
        dialog = dialog.set_directory(default_path);
    }

    if let Some(filters) = &params.filters {
        for filter in filters {
            let extensions: Vec<&str> = filter.extensions.iter().map(|s| s.as_str()).collect();
            dialog = dialog.add_filter(&filter.name, &extensions);
        }
    }

    let result = dialog.pick_file().await;
    match result {
        Some(handle) => Ok(serde_json::Value::String(
            handle.path().to_string_lossy().to_string(),
        )),
        None => Ok(serde_json::Value::Null),
    }
}

/// Show a file save dialog. Returns the chosen path or null if cancelled.
pub async fn save(params: DialogSaveParams) -> Result<serde_json::Value, IpcError> {
    let mut dialog = rfd::AsyncFileDialog::new();

    if let Some(title) = &params.title {
        dialog = dialog.set_title(title);
    }

    if let Some(default_path) = &params.default_path {
        dialog = dialog.set_directory(default_path);
    }

    if let Some(filters) = &params.filters {
        for filter in filters {
            let extensions: Vec<&str> = filter.extensions.iter().map(|s| s.as_str()).collect();
            dialog = dialog.add_filter(&filter.name, &extensions);
        }
    }

    let result = dialog.save_file().await;
    match result {
        Some(handle) => Ok(serde_json::Value::String(
            handle.path().to_string_lossy().to_string(),
        )),
        None => Ok(serde_json::Value::Null),
    }
}

/// Show a native confirmation dialog. Returns true if confirmed, false if cancelled.
pub async fn confirm(params: DialogConfirmParams) -> Result<serde_json::Value, IpcError> {
    let mut dialog = rfd::AsyncMessageDialog::new()
        .set_description(&params.message)
        .set_level(parse_message_level(&params.kind))
        .set_buttons(rfd::MessageButtons::OkCancel);

    if let Some(title) = &params.title {
        dialog = dialog.set_title(title);
    }

    let result = dialog.show().await;
    let confirmed = matches!(
        result,
        rfd::MessageDialogResult::Ok | rfd::MessageDialogResult::Yes
    );
    Ok(serde_json::Value::Bool(confirmed))
}

/// Show a native message dialog. Returns null.
pub async fn message(params: DialogMessageParams) -> Result<serde_json::Value, IpcError> {
    let mut dialog = rfd::AsyncMessageDialog::new()
        .set_description(&params.message)
        .set_level(parse_message_level(&params.kind))
        .set_buttons(rfd::MessageButtons::Ok);

    if let Some(title) = &params.title {
        dialog = dialog.set_title(title);
    }

    let _ = dialog.show().await;
    Ok(serde_json::Value::Null)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_message_level_info() {
        assert!(matches!(
            parse_message_level(&None),
            rfd::MessageLevel::Info
        ));
        assert!(matches!(
            parse_message_level(&Some("info".to_string())),
            rfd::MessageLevel::Info
        ));
    }

    #[test]
    fn parse_message_level_warning() {
        assert!(matches!(
            parse_message_level(&Some("warning".to_string())),
            rfd::MessageLevel::Warning
        ));
    }

    #[test]
    fn parse_message_level_error() {
        assert!(matches!(
            parse_message_level(&Some("error".to_string())),
            rfd::MessageLevel::Error
        ));
    }

    #[test]
    fn parse_message_level_unknown_defaults_to_info() {
        assert!(matches!(
            parse_message_level(&Some("success".to_string())),
            rfd::MessageLevel::Info
        ));
    }
}
