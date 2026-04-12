//! Typed IPC method enum with exhaustive dispatch.
//!
//! Each IPC method is a variant of `IpcMethod` with its own typed params struct.
//! Unknown method strings produce a `MethodNotFound` error instead of a panic.

use serde::{Deserialize, Serialize};

use super::ipc_dispatcher::{IpcError, IpcErrorCode};

// ── Params structs ──

#[derive(Debug, Deserialize)]
pub struct FsPathParams {
    pub path: String,
}

#[derive(Debug, Deserialize)]
pub struct FsWriteTextFileParams {
    pub path: String,
    pub content: String,
}

#[derive(Debug, Deserialize)]
pub struct FsCreateDirParams {
    pub path: String,
    pub recursive: Option<bool>,
}

#[derive(Debug, Deserialize)]
pub struct FsRenameParams {
    pub from: String,
    pub to: String,
}

// ── Shell params ──

#[derive(Debug, Deserialize)]
pub struct ShellExecuteParams {
    pub command: String,
    pub args: Option<Vec<String>>,
    pub cwd: Option<String>,
    pub env: Option<std::collections::HashMap<String, String>>,
    /// JS-side timeout in milliseconds. When provided, the Rust-side timeout
    /// is set to `timeout + SAFETY_MARGIN` instead of the default 300s.
    pub timeout: Option<u64>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ShellSpawnParams {
    pub command: String,
    pub args: Option<Vec<String>>,
    pub cwd: Option<String>,
    pub env: Option<std::collections::HashMap<String, String>>,
    pub sub_id: u64,
}

// ── Clipboard params ──

#[derive(Debug, Deserialize)]
pub struct ClipboardWriteTextParams {
    pub text: String,
}

// ── Dialog params ──

#[derive(Debug, Deserialize)]
pub struct FileFilterParam {
    pub name: String,
    pub extensions: Vec<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProcessKillParams {
    pub sub_id: u64,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DialogOpenParams {
    pub filters: Option<Vec<FileFilterParam>>,
    pub default_path: Option<String>,
    pub title: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DialogSaveParams {
    pub default_path: Option<String>,
    pub filters: Option<Vec<FileFilterParam>>,
    pub title: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct DialogConfirmParams {
    pub message: String,
    pub title: Option<String>,
    pub kind: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct DialogMessageParams {
    pub message: String,
    pub title: Option<String>,
    pub kind: Option<String>,
}

// ── Window params ──

#[derive(Debug, Deserialize)]
pub struct AppWindowSetTitleParams {
    pub title: String,
}

#[derive(Debug, Deserialize)]
pub struct AppWindowSetSizeParams {
    pub width: u32,
    pub height: u32,
}

#[derive(Debug, Deserialize)]
pub struct AppWindowSetFullscreenParams {
    pub fullscreen: bool,
}

// ── Response structs ──

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ShellOutputResponse {
    pub code: i32,
    pub stdout: String,
    pub stderr: String,
}

#[derive(Debug, Serialize)]
pub struct ShellSpawnResponse {
    pub pid: u32,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FileStatResponse {
    pub size: u64,
    pub is_file: bool,
    pub is_dir: bool,
    /// Unix timestamp in milliseconds.
    pub modified: u64,
    /// Unix timestamp in milliseconds.
    pub created: u64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DirEntryResponse {
    pub name: String,
    pub is_file: bool,
    pub is_dir: bool,
}

#[derive(Debug, Serialize)]
pub struct WindowSizeResponse {
    pub width: u32,
    pub height: u32,
}

// ── IpcMethod enum ──

/// Typed IPC method with exhaustive match.
///
/// Adding a new variant without a handler arm is a compile error.
#[derive(Debug)]
pub enum IpcMethod {
    // ── Filesystem ──
    FsReadTextFile(FsPathParams),
    FsWriteTextFile(FsWriteTextFileParams),
    FsExists(FsPathParams),
    FsStat(FsPathParams),
    FsReadDir(FsPathParams),
    FsCreateDir(FsCreateDirParams),
    FsRemove(FsPathParams),
    FsRename(FsRenameParams),
    // ── Shell ──
    ShellExecute(ShellExecuteParams),
    ShellSpawn(ShellSpawnParams),
    ProcessKill(ProcessKillParams),
    // ── Clipboard ──
    ClipboardReadText,
    ClipboardWriteText(ClipboardWriteTextParams),
    // ── Dialog ──
    DialogOpen(DialogOpenParams),
    DialogSave(DialogSaveParams),
    DialogConfirm(DialogConfirmParams),
    DialogMessage(DialogMessageParams),
    // ── Window ──
    AppWindowSetTitle(AppWindowSetTitleParams),
    AppWindowSetSize(AppWindowSetSizeParams),
    AppWindowSetFullscreen(AppWindowSetFullscreenParams),
    AppWindowInnerSize,
    AppWindowMinimize,
    AppWindowClose,
    // ── App ──
    AppDataDir,
    AppCacheDir,
    AppVersion,
}

fn parse_params<T: serde::de::DeserializeOwned>(
    method: &str,
    params: serde_json::Value,
) -> Result<T, IpcError> {
    serde_json::from_value(params).map_err(|e| IpcError {
        code: IpcErrorCode::IoError,
        message: format!("Invalid params for {}: {}", method, e),
    })
}

impl IpcMethod {
    /// Parse a method string + params JSON into a typed `IpcMethod`.
    ///
    /// Returns `MethodNotFound` for unknown method strings.
    pub fn parse(method: &str, params: serde_json::Value) -> Result<Self, IpcError> {
        match method {
            // ── Filesystem ──
            "fs.readTextFile" => Ok(Self::FsReadTextFile(parse_params(method, params)?)),
            "fs.writeTextFile" => Ok(Self::FsWriteTextFile(parse_params(method, params)?)),
            "fs.exists" => Ok(Self::FsExists(parse_params(method, params)?)),
            "fs.stat" => Ok(Self::FsStat(parse_params(method, params)?)),
            "fs.readDir" => Ok(Self::FsReadDir(parse_params(method, params)?)),
            "fs.createDir" => Ok(Self::FsCreateDir(parse_params(method, params)?)),
            "fs.remove" => Ok(Self::FsRemove(parse_params(method, params)?)),
            "fs.rename" => Ok(Self::FsRename(parse_params(method, params)?)),
            // ── Shell ──
            "shell.execute" => Ok(Self::ShellExecute(parse_params(method, params)?)),
            "shell.spawn" => Ok(Self::ShellSpawn(parse_params(method, params)?)),
            "process.kill" => Ok(Self::ProcessKill(parse_params(method, params)?)),
            // ── Clipboard ──
            "clipboard.readText" => Ok(Self::ClipboardReadText),
            "clipboard.writeText" => Ok(Self::ClipboardWriteText(parse_params(method, params)?)),
            // ── Dialog ──
            "dialog.open" => Ok(Self::DialogOpen(parse_params(method, params)?)),
            "dialog.save" => Ok(Self::DialogSave(parse_params(method, params)?)),
            "dialog.confirm" => Ok(Self::DialogConfirm(parse_params(method, params)?)),
            "dialog.message" => Ok(Self::DialogMessage(parse_params(method, params)?)),
            // ── Window ──
            "appWindow.setTitle" => Ok(Self::AppWindowSetTitle(parse_params(method, params)?)),
            "appWindow.setSize" => Ok(Self::AppWindowSetSize(parse_params(method, params)?)),
            "appWindow.setFullscreen" => {
                Ok(Self::AppWindowSetFullscreen(parse_params(method, params)?))
            }
            "appWindow.innerSize" => Ok(Self::AppWindowInnerSize),
            "appWindow.minimize" => Ok(Self::AppWindowMinimize),
            "appWindow.close" => Ok(Self::AppWindowClose),
            // ── App ──
            "app.dataDir" => Ok(Self::AppDataDir),
            "app.cacheDir" => Ok(Self::AppCacheDir),
            "app.version" => Ok(Self::AppVersion),
            _ => Err(IpcError::method_not_found(method)),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_fs_read_text_file() {
        let params = serde_json::json!({"path": "/tmp/test.txt"});
        let method = IpcMethod::parse("fs.readTextFile", params).unwrap();
        assert!(matches!(method, IpcMethod::FsReadTextFile(p) if p.path == "/tmp/test.txt"));
    }

    #[test]
    fn parse_fs_write_text_file() {
        let params = serde_json::json!({"path": "/tmp/out.txt", "content": "hello"});
        let method = IpcMethod::parse("fs.writeTextFile", params).unwrap();
        assert!(
            matches!(method, IpcMethod::FsWriteTextFile(p) if p.path == "/tmp/out.txt" && p.content == "hello")
        );
    }

    #[test]
    fn parse_fs_exists() {
        let params = serde_json::json!({"path": "/tmp"});
        let method = IpcMethod::parse("fs.exists", params).unwrap();
        assert!(matches!(method, IpcMethod::FsExists(p) if p.path == "/tmp"));
    }

    #[test]
    fn parse_fs_stat() {
        let params = serde_json::json!({"path": "/tmp"});
        let method = IpcMethod::parse("fs.stat", params).unwrap();
        assert!(matches!(method, IpcMethod::FsStat(p) if p.path == "/tmp"));
    }

    #[test]
    fn parse_fs_read_dir() {
        let params = serde_json::json!({"path": "/tmp"});
        let method = IpcMethod::parse("fs.readDir", params).unwrap();
        assert!(matches!(method, IpcMethod::FsReadDir(p) if p.path == "/tmp"));
    }

    #[test]
    fn parse_fs_create_dir() {
        let params = serde_json::json!({"path": "/tmp/new", "recursive": true});
        let method = IpcMethod::parse("fs.createDir", params).unwrap();
        assert!(
            matches!(method, IpcMethod::FsCreateDir(p) if p.path == "/tmp/new" && p.recursive == Some(true))
        );
    }

    #[test]
    fn parse_fs_create_dir_no_recursive() {
        let params = serde_json::json!({"path": "/tmp/new"});
        let method = IpcMethod::parse("fs.createDir", params).unwrap();
        assert!(
            matches!(method, IpcMethod::FsCreateDir(p) if p.path == "/tmp/new" && p.recursive.is_none())
        );
    }

    #[test]
    fn parse_fs_remove() {
        let params = serde_json::json!({"path": "/tmp/old.txt"});
        let method = IpcMethod::parse("fs.remove", params).unwrap();
        assert!(matches!(method, IpcMethod::FsRemove(p) if p.path == "/tmp/old.txt"));
    }

    #[test]
    fn parse_fs_rename() {
        let params = serde_json::json!({"from": "/tmp/a.txt", "to": "/tmp/b.txt"});
        let method = IpcMethod::parse("fs.rename", params).unwrap();
        assert!(
            matches!(method, IpcMethod::FsRename(p) if p.from == "/tmp/a.txt" && p.to == "/tmp/b.txt")
        );
    }

    // ── Shell ──

    #[test]
    fn parse_shell_execute() {
        let params = serde_json::json!({"command": "echo", "args": ["hello"]});
        let method = IpcMethod::parse("shell.execute", params).unwrap();
        assert!(
            matches!(method, IpcMethod::ShellExecute(p) if p.command == "echo" && p.args == Some(vec!["hello".to_string()]))
        );
    }

    #[test]
    fn parse_shell_execute_minimal() {
        let params = serde_json::json!({"command": "ls"});
        let method = IpcMethod::parse("shell.execute", params).unwrap();
        assert!(
            matches!(method, IpcMethod::ShellExecute(p) if p.command == "ls" && p.args.is_none() && p.cwd.is_none() && p.env.is_none())
        );
    }

    #[test]
    fn parse_shell_execute_empty_args() {
        let params = serde_json::json!({"command": "ls", "args": []});
        let method = IpcMethod::parse("shell.execute", params).unwrap();
        assert!(
            matches!(method, IpcMethod::ShellExecute(p) if p.command == "ls" && p.args == Some(vec![]))
        );
    }

    #[test]
    fn parse_shell_execute_with_cwd_and_env() {
        let params = serde_json::json!({"command": "git", "args": ["status"], "cwd": "/tmp", "env": {"GIT_DIR": "/tmp/.git"}});
        let method = IpcMethod::parse("shell.execute", params).unwrap();
        match method {
            IpcMethod::ShellExecute(p) => {
                assert_eq!(p.command, "git");
                assert_eq!(p.args, Some(vec!["status".to_string()]));
                assert_eq!(p.cwd, Some("/tmp".to_string()));
                assert_eq!(
                    p.env.unwrap().get("GIT_DIR"),
                    Some(&"/tmp/.git".to_string())
                );
            }
            _ => panic!("expected ShellExecute"),
        }
    }

    // ── Clipboard ──

    #[test]
    fn parse_clipboard_read_text() {
        let params = serde_json::json!({});
        let method = IpcMethod::parse("clipboard.readText", params).unwrap();
        assert!(matches!(method, IpcMethod::ClipboardReadText));
    }

    #[test]
    fn parse_clipboard_write_text() {
        let params = serde_json::json!({"text": "hello"});
        let method = IpcMethod::parse("clipboard.writeText", params).unwrap();
        assert!(matches!(method, IpcMethod::ClipboardWriteText(p) if p.text == "hello"));
    }

    #[test]
    fn parse_clipboard_write_text_missing_text_returns_error() {
        let params = serde_json::json!({});
        let result = IpcMethod::parse("clipboard.writeText", params);
        assert!(result.is_err());
    }

    // ── Dialog ──

    #[test]
    fn parse_dialog_open_minimal() {
        let params = serde_json::json!({});
        let method = IpcMethod::parse("dialog.open", params).unwrap();
        assert!(
            matches!(method, IpcMethod::DialogOpen(p) if p.filters.is_none() && p.title.is_none())
        );
    }

    #[test]
    fn parse_dialog_open_with_options() {
        let params = serde_json::json!({
            "filters": [{"name": "Images", "extensions": ["png", "jpg"]}],
            "defaultPath": "/tmp",
            "multiple": true,
            "directory": false,
            "title": "Open file"
        });
        let method = IpcMethod::parse("dialog.open", params).unwrap();
        assert!(
            matches!(method, IpcMethod::DialogOpen(p) if p.title == Some("Open file".to_string()))
        );
    }

    #[test]
    fn parse_dialog_save() {
        let params = serde_json::json!({"title": "Save as"});
        let method = IpcMethod::parse("dialog.save", params).unwrap();
        assert!(
            matches!(method, IpcMethod::DialogSave(p) if p.title == Some("Save as".to_string()))
        );
    }

    #[test]
    fn parse_dialog_confirm() {
        let params = serde_json::json!({"message": "Are you sure?", "kind": "warning"});
        let method = IpcMethod::parse("dialog.confirm", params).unwrap();
        assert!(
            matches!(method, IpcMethod::DialogConfirm(p) if p.message == "Are you sure?" && p.kind == Some("warning".to_string()))
        );
    }

    #[test]
    fn parse_dialog_confirm_missing_message_returns_error() {
        let params = serde_json::json!({});
        let result = IpcMethod::parse("dialog.confirm", params);
        assert!(result.is_err());
    }

    #[test]
    fn parse_dialog_message() {
        let params = serde_json::json!({"message": "Done!", "title": "Info"});
        let method = IpcMethod::parse("dialog.message", params).unwrap();
        assert!(
            matches!(method, IpcMethod::DialogMessage(p) if p.message == "Done!" && p.title == Some("Info".to_string()))
        );
    }

    // ── Window ──

    #[test]
    fn parse_app_window_set_title() {
        let params = serde_json::json!({"title": "My App"});
        let method = IpcMethod::parse("appWindow.setTitle", params).unwrap();
        assert!(matches!(method, IpcMethod::AppWindowSetTitle(p) if p.title == "My App"));
    }

    #[test]
    fn parse_app_window_set_size() {
        let params = serde_json::json!({"width": 800, "height": 600});
        let method = IpcMethod::parse("appWindow.setSize", params).unwrap();
        assert!(
            matches!(method, IpcMethod::AppWindowSetSize(p) if p.width == 800 && p.height == 600)
        );
    }

    #[test]
    fn parse_app_window_set_fullscreen() {
        let params = serde_json::json!({"fullscreen": true});
        let method = IpcMethod::parse("appWindow.setFullscreen", params).unwrap();
        assert!(matches!(method, IpcMethod::AppWindowSetFullscreen(p) if p.fullscreen));
    }

    #[test]
    fn parse_app_window_inner_size() {
        let params = serde_json::json!({});
        let method = IpcMethod::parse("appWindow.innerSize", params).unwrap();
        assert!(matches!(method, IpcMethod::AppWindowInnerSize));
    }

    #[test]
    fn parse_app_window_minimize() {
        let params = serde_json::json!({});
        let method = IpcMethod::parse("appWindow.minimize", params).unwrap();
        assert!(matches!(method, IpcMethod::AppWindowMinimize));
    }

    #[test]
    fn parse_app_window_close() {
        let params = serde_json::json!({});
        let method = IpcMethod::parse("appWindow.close", params).unwrap();
        assert!(matches!(method, IpcMethod::AppWindowClose));
    }

    // ── App ──

    #[test]
    fn parse_app_data_dir() {
        let params = serde_json::json!({});
        let method = IpcMethod::parse("app.dataDir", params).unwrap();
        assert!(matches!(method, IpcMethod::AppDataDir));
    }

    #[test]
    fn parse_app_cache_dir() {
        let params = serde_json::json!({});
        let method = IpcMethod::parse("app.cacheDir", params).unwrap();
        assert!(matches!(method, IpcMethod::AppCacheDir));
    }

    #[test]
    fn parse_app_version() {
        let params = serde_json::json!({});
        let method = IpcMethod::parse("app.version", params).unwrap();
        assert!(matches!(method, IpcMethod::AppVersion));
    }

    // ── Error cases ──

    #[test]
    fn parse_shell_spawn() {
        let params = serde_json::json!({"command": "node", "args": ["server.js"], "subId": 42});
        let method = IpcMethod::parse("shell.spawn", params).unwrap();
        assert!(
            matches!(method, IpcMethod::ShellSpawn(p) if p.command == "node" && p.sub_id == 42)
        );
    }

    #[test]
    fn parse_shell_spawn_minimal() {
        let params = serde_json::json!({"command": "cat", "subId": 1});
        let method = IpcMethod::parse("shell.spawn", params).unwrap();
        assert!(
            matches!(method, IpcMethod::ShellSpawn(p) if p.command == "cat" && p.args.is_none() && p.cwd.is_none())
        );
    }

    #[test]
    fn parse_process_kill() {
        let params = serde_json::json!({"subId": 7});
        let method = IpcMethod::parse("process.kill", params).unwrap();
        assert!(matches!(method, IpcMethod::ProcessKill(p) if p.sub_id == 7));
    }

    #[test]
    fn parse_unknown_method_returns_error() {
        let params = serde_json::json!({});
        let result = IpcMethod::parse("unknown.method", params);
        assert!(result.is_err());
        let err = result.unwrap_err();
        assert!(matches!(err.code, IpcErrorCode::MethodNotFound));
        assert!(err.message.contains("unknown.method"));
    }

    #[test]
    fn parse_missing_required_params_returns_error() {
        let params = serde_json::json!({});
        let result = IpcMethod::parse("fs.readTextFile", params);
        assert!(result.is_err());
        let err = result.unwrap_err();
        assert!(matches!(err.code, IpcErrorCode::IoError));
    }

    #[test]
    fn parse_wrong_param_type_returns_error() {
        let params = serde_json::json!({"path": 42});
        let result = IpcMethod::parse("fs.readTextFile", params);
        assert!(result.is_err());
    }
}
