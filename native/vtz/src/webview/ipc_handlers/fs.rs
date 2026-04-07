//! Filesystem IPC handlers.

use std::time::UNIX_EPOCH;

use crate::webview::ipc_dispatcher::{IpcError, IpcErrorCode};
use crate::webview::ipc_method::{
    DirEntryResponse, FileStatResponse, FsCreateDirParams, FsPathParams, FsRenameParams,
    FsWriteTextFileParams,
};

/// Expand `~` at the start of a path to the user's home directory.
pub fn expand_tilde(path: &str) -> String {
    if let Some(rest) = path.strip_prefix("~/") {
        if let Some(home) = std::env::var_os("HOME") {
            return format!("{}/{}", home.to_string_lossy(), rest);
        }
    } else if path == "~" {
        if let Some(home) = std::env::var_os("HOME") {
            return home.to_string_lossy().to_string();
        }
    }
    path.to_string()
}

fn map_io_error(e: std::io::Error, path: &str) -> IpcError {
    match e.kind() {
        std::io::ErrorKind::NotFound => {
            IpcError::not_found(format!("No such file or directory: {}", path))
        }
        std::io::ErrorKind::PermissionDenied => IpcError {
            code: IpcErrorCode::PermissionDenied,
            message: format!("Permission denied: {}", path),
        },
        _ => IpcError::io_error(format!("I/O error on {}: {}", path, e)),
    }
}

pub async fn read_text_file(params: FsPathParams) -> Result<serde_json::Value, IpcError> {
    let path = expand_tilde(&params.path);
    match tokio::fs::read_to_string(&path).await {
        Ok(content) => Ok(serde_json::Value::String(content)),
        Err(e) => Err(map_io_error(e, &path)),
    }
}

pub async fn write_text_file(params: FsWriteTextFileParams) -> Result<serde_json::Value, IpcError> {
    let path = expand_tilde(&params.path);

    // Create parent directories if needed (idempotent, avoids TOCTOU)
    if let Some(parent) = std::path::Path::new(&path).parent() {
        tokio::fs::create_dir_all(parent)
            .await
            .map_err(|e| map_io_error(e, &parent.to_string_lossy()))?;
    }

    tokio::fs::write(&path, &params.content)
        .await
        .map_err(|e| map_io_error(e, &path))?;

    Ok(serde_json::Value::Null)
}

pub async fn exists(params: FsPathParams) -> Result<serde_json::Value, IpcError> {
    let path = expand_tilde(&params.path);
    let exists = tokio::fs::try_exists(&path).await.unwrap_or(false);
    Ok(serde_json::Value::Bool(exists))
}

pub async fn stat(params: FsPathParams) -> Result<serde_json::Value, IpcError> {
    let path = expand_tilde(&params.path);
    let metadata = tokio::fs::metadata(&path)
        .await
        .map_err(|e| map_io_error(e, &path))?;

    let modified = metadata
        .modified()
        .ok()
        .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0);

    let created = metadata
        .created()
        .ok()
        .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0);

    let response = FileStatResponse {
        size: metadata.len(),
        is_file: metadata.is_file(),
        is_dir: metadata.is_dir(),
        modified,
        created,
    };

    serde_json::to_value(response).map_err(|e| IpcError::io_error(format!("Serialization: {}", e)))
}

pub async fn read_dir(params: FsPathParams) -> Result<serde_json::Value, IpcError> {
    let path = expand_tilde(&params.path);
    let mut entries = tokio::fs::read_dir(&path)
        .await
        .map_err(|e| map_io_error(e, &path))?;

    let mut result = Vec::new();
    while let Some(entry) = entries
        .next_entry()
        .await
        .map_err(|e| map_io_error(e, &path))?
    {
        let file_type = entry
            .file_type()
            .await
            .map_err(|e| map_io_error(e, &path))?;
        result.push(DirEntryResponse {
            name: entry.file_name().to_string_lossy().to_string(),
            is_file: file_type.is_file(),
            is_dir: file_type.is_dir(),
        });
    }

    serde_json::to_value(result).map_err(|e| IpcError::io_error(format!("Serialization: {}", e)))
}

pub async fn create_dir(params: FsCreateDirParams) -> Result<serde_json::Value, IpcError> {
    let path = expand_tilde(&params.path);
    if params.recursive.unwrap_or(false) {
        tokio::fs::create_dir_all(&path)
            .await
            .map_err(|e| map_io_error(e, &path))?;
    } else {
        tokio::fs::create_dir(&path)
            .await
            .map_err(|e| map_io_error(e, &path))?;
    }
    Ok(serde_json::Value::Null)
}

pub async fn remove(params: FsPathParams) -> Result<serde_json::Value, IpcError> {
    let path = expand_tilde(&params.path);
    let metadata = tokio::fs::metadata(&path)
        .await
        .map_err(|e| map_io_error(e, &path))?;

    if metadata.is_dir() {
        tokio::fs::remove_dir(&path)
            .await
            .map_err(|e| map_io_error(e, &path))?;
    } else {
        tokio::fs::remove_file(&path)
            .await
            .map_err(|e| map_io_error(e, &path))?;
    }

    Ok(serde_json::Value::Null)
}

pub async fn rename(params: FsRenameParams) -> Result<serde_json::Value, IpcError> {
    let from = expand_tilde(&params.from);
    let to = expand_tilde(&params.to);
    tokio::fs::rename(&from, &to)
        .await
        .map_err(|e| map_io_error(e, &from))?;
    Ok(serde_json::Value::Null)
}

#[cfg(test)]
mod tests {
    use super::*;

    // ── expand_tilde ──

    #[test]
    fn expand_tilde_with_home() {
        let home = std::env::var("HOME").unwrap();
        assert_eq!(expand_tilde("~/Documents"), format!("{}/Documents", home));
    }

    #[test]
    fn expand_tilde_bare() {
        let home = std::env::var("HOME").unwrap();
        assert_eq!(expand_tilde("~"), home);
    }

    #[test]
    fn expand_tilde_no_tilde() {
        assert_eq!(expand_tilde("/tmp/test.txt"), "/tmp/test.txt");
    }

    #[test]
    fn expand_tilde_mid_path_unchanged() {
        assert_eq!(expand_tilde("/home/~/test"), "/home/~/test");
    }

    // ── read_text_file ──

    #[tokio::test]
    async fn read_text_file_success() {
        let path = "/tmp/vtz_ipc_fs_read.txt";
        tokio::fs::write(path, "hello fs").await.unwrap();

        let result = read_text_file(FsPathParams {
            path: path.to_string(),
        })
        .await;
        assert!(result.is_ok());
        assert_eq!(
            result.unwrap(),
            serde_json::Value::String("hello fs".to_string())
        );

        tokio::fs::remove_file(path).await.unwrap();
    }

    #[tokio::test]
    async fn read_text_file_not_found() {
        let result = read_text_file(FsPathParams {
            path: "/tmp/vtz_ipc_nonexistent.txt".to_string(),
        })
        .await;
        assert!(result.is_err());
        assert!(matches!(result.unwrap_err().code, IpcErrorCode::NotFound));
    }

    // ── write_text_file ──

    #[tokio::test]
    async fn write_text_file_creates_file() {
        let path = "/tmp/vtz_ipc_fs_write.txt";
        let _ = tokio::fs::remove_file(path).await;

        let result = write_text_file(FsWriteTextFileParams {
            path: path.to_string(),
            content: "written content".to_string(),
        })
        .await;
        assert!(result.is_ok());

        let content = tokio::fs::read_to_string(path).await.unwrap();
        assert_eq!(content, "written content");

        tokio::fs::remove_file(path).await.unwrap();
    }

    #[tokio::test]
    async fn write_text_file_creates_parent_dirs() {
        let dir = "/tmp/vtz_ipc_nested_write";
        let path = format!("{}/deep/file.txt", dir);
        let _ = tokio::fs::remove_dir_all(dir).await;

        let result = write_text_file(FsWriteTextFileParams {
            path: path.clone(),
            content: "nested".to_string(),
        })
        .await;
        assert!(result.is_ok());

        let content = tokio::fs::read_to_string(&path).await.unwrap();
        assert_eq!(content, "nested");

        tokio::fs::remove_dir_all(dir).await.unwrap();
    }

    #[tokio::test]
    async fn write_then_read_roundtrip() {
        let path = "/tmp/vtz_ipc_roundtrip.txt";
        let content = "round-trip content with unicode: 日本語";

        write_text_file(FsWriteTextFileParams {
            path: path.to_string(),
            content: content.to_string(),
        })
        .await
        .unwrap();

        let result = read_text_file(FsPathParams {
            path: path.to_string(),
        })
        .await
        .unwrap();
        assert_eq!(result, serde_json::Value::String(content.to_string()));

        tokio::fs::remove_file(path).await.unwrap();
    }

    // ── exists ──

    #[tokio::test]
    async fn exists_true_for_existing() {
        let result = exists(FsPathParams {
            path: "/tmp".to_string(),
        })
        .await;
        assert_eq!(result.unwrap(), serde_json::Value::Bool(true));
    }

    #[tokio::test]
    async fn exists_false_for_nonexistent() {
        let result = exists(FsPathParams {
            path: "/tmp/vtz_ipc_no_such_path".to_string(),
        })
        .await;
        assert_eq!(result.unwrap(), serde_json::Value::Bool(false));
    }

    // ── stat ──

    #[tokio::test]
    async fn stat_file() {
        let path = "/tmp/vtz_ipc_stat.txt";
        tokio::fs::write(path, "stat me").await.unwrap();

        let result = stat(FsPathParams {
            path: path.to_string(),
        })
        .await
        .unwrap();

        assert_eq!(result["isFile"], true);
        assert_eq!(result["isDir"], false);
        assert!(result["size"].as_u64().unwrap() > 0);
        assert!(result["modified"].as_u64().unwrap() > 0);

        tokio::fs::remove_file(path).await.unwrap();
    }

    #[tokio::test]
    async fn stat_directory() {
        let result = stat(FsPathParams {
            path: "/tmp".to_string(),
        })
        .await
        .unwrap();

        assert_eq!(result["isDir"], true);
        assert_eq!(result["isFile"], false);
    }

    #[tokio::test]
    async fn stat_not_found() {
        let result = stat(FsPathParams {
            path: "/tmp/vtz_ipc_no_such_stat".to_string(),
        })
        .await;
        assert!(result.is_err());
        assert!(matches!(result.unwrap_err().code, IpcErrorCode::NotFound));
    }

    // ── read_dir ──

    #[tokio::test]
    async fn read_dir_lists_entries() {
        let dir = "/tmp/vtz_ipc_readdir";
        let _ = tokio::fs::remove_dir_all(dir).await;
        tokio::fs::create_dir(dir).await.unwrap();
        tokio::fs::write(format!("{}/a.txt", dir), "a")
            .await
            .unwrap();
        tokio::fs::create_dir(format!("{}/subdir", dir))
            .await
            .unwrap();

        let result = read_dir(FsPathParams {
            path: dir.to_string(),
        })
        .await
        .unwrap();

        let entries = result.as_array().unwrap();
        assert_eq!(entries.len(), 2);

        let names: Vec<&str> = entries
            .iter()
            .map(|e| e["name"].as_str().unwrap())
            .collect();
        assert!(names.contains(&"a.txt"));
        assert!(names.contains(&"subdir"));

        tokio::fs::remove_dir_all(dir).await.unwrap();
    }

    #[tokio::test]
    async fn read_dir_not_found() {
        let result = read_dir(FsPathParams {
            path: "/tmp/vtz_ipc_no_such_dir".to_string(),
        })
        .await;
        assert!(result.is_err());
        assert!(matches!(result.unwrap_err().code, IpcErrorCode::NotFound));
    }

    // ── create_dir ──

    #[tokio::test]
    async fn create_dir_simple() {
        let dir = "/tmp/vtz_ipc_mkdir";
        let _ = tokio::fs::remove_dir(dir).await;

        let result = create_dir(FsCreateDirParams {
            path: dir.to_string(),
            recursive: None,
        })
        .await;
        assert!(result.is_ok());
        assert!(tokio::fs::metadata(dir).await.unwrap().is_dir());

        tokio::fs::remove_dir(dir).await.unwrap();
    }

    #[tokio::test]
    async fn create_dir_recursive() {
        let dir = "/tmp/vtz_ipc_mkdir_rec/a/b/c";
        let _ = tokio::fs::remove_dir_all("/tmp/vtz_ipc_mkdir_rec").await;

        let result = create_dir(FsCreateDirParams {
            path: dir.to_string(),
            recursive: Some(true),
        })
        .await;
        assert!(result.is_ok());
        assert!(tokio::fs::metadata(dir).await.unwrap().is_dir());

        tokio::fs::remove_dir_all("/tmp/vtz_ipc_mkdir_rec")
            .await
            .unwrap();
    }

    #[tokio::test]
    async fn create_dir_non_recursive_nested_fails() {
        let dir = "/tmp/vtz_ipc_mkdir_fail/nested";
        let _ = tokio::fs::remove_dir_all("/tmp/vtz_ipc_mkdir_fail").await;

        let result = create_dir(FsCreateDirParams {
            path: dir.to_string(),
            recursive: Some(false),
        })
        .await;
        assert!(result.is_err());
    }

    // ── remove ──

    #[tokio::test]
    async fn remove_file() {
        let path = "/tmp/vtz_ipc_remove.txt";
        tokio::fs::write(path, "remove me").await.unwrap();

        let result = remove(FsPathParams {
            path: path.to_string(),
        })
        .await;
        assert!(result.is_ok());
        assert!(tokio::fs::metadata(path).await.is_err());
    }

    #[tokio::test]
    async fn remove_not_found() {
        let result = remove(FsPathParams {
            path: "/tmp/vtz_ipc_no_such_remove".to_string(),
        })
        .await;
        assert!(result.is_err());
        assert!(matches!(result.unwrap_err().code, IpcErrorCode::NotFound));
    }

    // ── rename ──

    #[tokio::test]
    async fn rename_file() {
        let from = "/tmp/vtz_ipc_rename_from.txt";
        let to = "/tmp/vtz_ipc_rename_to.txt";
        let _ = tokio::fs::remove_file(to).await;
        tokio::fs::write(from, "move me").await.unwrap();

        let result = rename(FsRenameParams {
            from: from.to_string(),
            to: to.to_string(),
        })
        .await;
        assert!(result.is_ok());
        assert!(tokio::fs::metadata(from).await.is_err());
        assert_eq!(tokio::fs::read_to_string(to).await.unwrap(), "move me");

        tokio::fs::remove_file(to).await.unwrap();
    }
}
