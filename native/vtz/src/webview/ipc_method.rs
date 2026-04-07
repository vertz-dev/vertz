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

// ── Response structs ──

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

// ── IpcMethod enum ──

/// Typed IPC method with exhaustive match.
///
/// Adding a new variant without a handler arm is a compile error.
#[derive(Debug)]
pub enum IpcMethod {
    FsReadTextFile(FsPathParams),
    FsWriteTextFile(FsWriteTextFileParams),
    FsExists(FsPathParams),
    FsStat(FsPathParams),
    FsReadDir(FsPathParams),
    FsCreateDir(FsCreateDirParams),
    FsRemove(FsPathParams),
    FsRename(FsRenameParams),
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
            "fs.readTextFile" => Ok(Self::FsReadTextFile(parse_params(method, params)?)),
            "fs.writeTextFile" => Ok(Self::FsWriteTextFile(parse_params(method, params)?)),
            "fs.exists" => Ok(Self::FsExists(parse_params(method, params)?)),
            "fs.stat" => Ok(Self::FsStat(parse_params(method, params)?)),
            "fs.readDir" => Ok(Self::FsReadDir(parse_params(method, params)?)),
            "fs.createDir" => Ok(Self::FsCreateDir(parse_params(method, params)?)),
            "fs.remove" => Ok(Self::FsRemove(parse_params(method, params)?)),
            "fs.rename" => Ok(Self::FsRename(parse_params(method, params)?)),
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
