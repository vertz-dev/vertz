//! HTTP sidecar routes for binary file I/O.
//!
//! These routes serve raw bytes over HTTP instead of JSON-over-evaluate_script,
//! avoiding the 33% base64 overhead that the JSON IPC wire protocol would impose
//! on binary data.

use axum::body::Body;
use axum::extract::State;
use axum::http::{header, Request, Response, StatusCode};
use std::sync::Arc;

use super::module_server::DevServerState;

/// Maximum file size for buffered reads (2 GiB).
/// Files larger than this should use the streaming endpoint.
const MAX_BUFFERED_SIZE: u64 = 2 * 1024 * 1024 * 1024;

/// Expand a leading `~/` or bare `~` to the user's home directory.
fn expand_tilde(path: &str) -> String {
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

/// Generate a random 256-bit hex nonce for session authentication.
pub fn generate_nonce() -> String {
    use rand::Rng;
    let bytes: [u8; 32] = rand::thread_rng().gen();
    bytes.iter().map(|b| format!("{:02x}", b)).collect()
}

/// Build a JSON error response with the given HTTP status, error code, and message.
fn error_response(status: StatusCode, code: &str, message: &str) -> Response<Body> {
    let body = serde_json::json!({ "code": code, "message": message });
    Response::builder()
        .status(status)
        .header(header::CONTENT_TYPE, "application/json")
        .body(Body::from(body.to_string()))
        .unwrap()
}

/// Validate the `X-VTZ-IPC-Token` header against the session nonce.
/// Returns `Ok(())` on match, or a 403 response on mismatch/missing.
// Response<Body> is inherently large; boxing would add an unnecessary allocation
// for this handler-internal early-return pattern.
#[allow(clippy::result_large_err)]
fn validate_nonce(req: &Request<Body>, nonce: &str) -> Result<(), Response<Body>> {
    match req.headers().get("x-vtz-ipc-token") {
        Some(value) if value.as_bytes() == nonce.as_bytes() => Ok(()),
        _ => Err(error_response(
            StatusCode::FORBIDDEN,
            "PERMISSION_DENIED",
            "Invalid or missing IPC session token",
        )),
    }
}

/// Extract the `path` query parameter from the request URL.
// Response<Body> is inherently large; boxing would add an unnecessary allocation
// for this handler-internal early-return pattern.
#[allow(clippy::result_large_err)]
fn extract_path_param(req: &Request<Body>) -> Result<String, Response<Body>> {
    let query = req.uri().query().unwrap_or("");
    for pair in query.split('&') {
        if let Some(value) = pair.strip_prefix("path=") {
            match urlencoding::decode(value) {
                Ok(decoded) => return Ok(decoded.into_owned()),
                Err(_) => {
                    return Err(error_response(
                        StatusCode::BAD_REQUEST,
                        "INVALID_PATH",
                        "Failed to decode path parameter",
                    ));
                }
            }
        }
    }
    Err(error_response(
        StatusCode::BAD_REQUEST,
        "INVALID_PATH",
        "Missing required 'path' query parameter",
    ))
}

/// Map a `std::io::Error` to an HTTP error response.
fn map_io_error_response(e: std::io::Error, path: &str) -> Response<Body> {
    match e.kind() {
        std::io::ErrorKind::NotFound => error_response(
            StatusCode::NOT_FOUND,
            "NOT_FOUND",
            &format!("No such file or directory: {}", path),
        ),
        std::io::ErrorKind::PermissionDenied => error_response(
            StatusCode::FORBIDDEN,
            "PERMISSION_DENIED",
            &format!("Permission denied: {}", path),
        ),
        _ => error_response(
            StatusCode::INTERNAL_SERVER_ERROR,
            "IO_ERROR",
            &format!("I/O error on {}: {}", path, e),
        ),
    }
}

/// `GET /__vertz_fs_binary/read?path=<url-encoded-path>`
///
/// Returns raw bytes with `Content-Type: application/octet-stream`.
/// Files larger than 2 GiB return 413 suggesting `readBinaryStream`.
pub async fn handle_binary_read(
    State(state): State<Arc<DevServerState>>,
    req: Request<Body>,
) -> Response<Body> {
    // Validate session nonce
    if let Err(resp) = validate_nonce(&req, &state.ipc_nonce) {
        return resp;
    }

    // Permission check
    if !state.ipc_permissions.is_allowed("fs.readBinaryFile") {
        return error_response(
            StatusCode::FORBIDDEN,
            "PERMISSION_DENIED",
            "IPC method 'fs.readBinaryFile' is not allowed. Add \"fs:read\" to desktop.permissions in .vertzrc",
        );
    }

    // Extract and expand path
    let raw_path = match extract_path_param(&req) {
        Ok(p) => p,
        Err(resp) => return resp,
    };
    let expanded = expand_tilde(&raw_path);

    // Get file metadata for size check and Content-Length
    let metadata = match tokio::fs::metadata(&expanded).await {
        Ok(m) => m,
        Err(e) => return map_io_error_response(e, &expanded),
    };

    if !metadata.is_file() {
        return error_response(
            StatusCode::BAD_REQUEST,
            "INVALID_PATH",
            &format!("Not a regular file: {}", expanded),
        );
    }

    let file_size = metadata.len();
    if file_size > MAX_BUFFERED_SIZE {
        return error_response(
            StatusCode::PAYLOAD_TOO_LARGE,
            "IO_ERROR",
            &format!(
                "File is {} bytes (>{} bytes). Use readBinaryStream() for files larger than 2 GiB",
                file_size, MAX_BUFFERED_SIZE
            ),
        );
    }

    // Read file contents
    let bytes = match tokio::fs::read(&expanded).await {
        Ok(b) => b,
        Err(e) => return map_io_error_response(e, &expanded),
    };

    Response::builder()
        .status(StatusCode::OK)
        .header(header::CONTENT_TYPE, "application/octet-stream")
        .header(header::CONTENT_LENGTH, bytes.len())
        .body(Body::from(bytes))
        .unwrap()
}

/// Maximum request body size for buffered writes (2 GiB).
const MAX_WRITE_SIZE: usize = 2 * 1024 * 1024 * 1024;

/// `POST /__vertz_fs_binary/write?path=<url-encoded-path>`
///
/// Writes the request body to the file atomically (temp file + rename).
/// Creates parent directories if needed. Returns `204 No Content` on success.
pub async fn handle_binary_write(
    State(state): State<Arc<DevServerState>>,
    req: Request<Body>,
) -> Response<Body> {
    // Validate session nonce
    if let Err(resp) = validate_nonce(&req, &state.ipc_nonce) {
        return resp;
    }

    // Permission check
    if !state.ipc_permissions.is_allowed("fs.writeBinaryFile") {
        return error_response(
            StatusCode::FORBIDDEN,
            "PERMISSION_DENIED",
            "IPC method 'fs.writeBinaryFile' is not allowed. Add \"fs:write\" to desktop.permissions in .vertzrc",
        );
    }

    // Extract and expand path
    let raw_path = match extract_path_param(&req) {
        Ok(p) => p,
        Err(resp) => return resp,
    };
    let expanded = expand_tilde(&raw_path);

    // Create parent directories if needed
    if let Some(parent) = std::path::Path::new(&expanded).parent() {
        if !parent.as_os_str().is_empty() {
            if let Err(e) = tokio::fs::create_dir_all(parent).await {
                return map_io_error_response(e, &parent.to_string_lossy());
            }
        }
    }

    // Read request body
    let body_bytes = match axum::body::to_bytes(req.into_body(), MAX_WRITE_SIZE).await {
        Ok(b) => b,
        Err(_) => {
            return error_response(
                StatusCode::PAYLOAD_TOO_LARGE,
                "IO_ERROR",
                &format!(
                    "Request body exceeds {} bytes. Use writeBinaryStream() for files larger than 2 GiB",
                    MAX_WRITE_SIZE
                ),
            );
        }
    };

    // Atomic write: write to temp file, then rename.
    // Random suffix avoids collisions with concurrent writes to the same path.
    let tmp_path = format!("{}.vtz-tmp-{:016x}", expanded, rand::random::<u64>());
    if let Err(e) = tokio::fs::write(&tmp_path, &body_bytes).await {
        // Clean up temp file on write failure
        let _ = tokio::fs::remove_file(&tmp_path).await;
        return map_io_error_response(e, &expanded);
    }

    if let Err(e) = tokio::fs::rename(&tmp_path, &expanded).await {
        // Clean up temp file on rename failure
        let _ = tokio::fs::remove_file(&tmp_path).await;
        return map_io_error_response(e, &expanded);
    }

    Response::builder()
        .status(StatusCode::NO_CONTENT)
        .body(Body::empty())
        .unwrap()
}

/// `GET /__vertz_fs_binary/stream/read?path=<url-encoded-path>`
///
/// Streams file contents as chunked HTTP response. No size limit.
pub async fn handle_binary_stream_read(
    State(state): State<Arc<DevServerState>>,
    req: Request<Body>,
) -> Response<Body> {
    // Validate session nonce
    if let Err(resp) = validate_nonce(&req, &state.ipc_nonce) {
        return resp;
    }

    // Permission check (same permission as buffered read)
    if !state.ipc_permissions.is_allowed("fs.readBinaryFile") {
        return error_response(
            StatusCode::FORBIDDEN,
            "PERMISSION_DENIED",
            "IPC method 'fs.readBinaryFile' is not allowed. Add \"fs:read\" to desktop.permissions in .vertzrc",
        );
    }

    // Extract and expand path
    let raw_path = match extract_path_param(&req) {
        Ok(p) => p,
        Err(resp) => return resp,
    };
    let expanded = expand_tilde(&raw_path);

    // Open file
    let file = match tokio::fs::File::open(&expanded).await {
        Ok(f) => f,
        Err(e) => return map_io_error_response(e, &expanded),
    };

    // Get file size for Content-Length
    let file_size = match file.metadata().await {
        Ok(m) => {
            if !m.is_file() {
                return error_response(
                    StatusCode::BAD_REQUEST,
                    "INVALID_PATH",
                    &format!("Not a regular file: {}", expanded),
                );
            }
            m.len()
        }
        Err(e) => return map_io_error_response(e, &expanded),
    };

    // Stream the file
    let stream = tokio_util::io::ReaderStream::new(file);

    Response::builder()
        .status(StatusCode::OK)
        .header(header::CONTENT_TYPE, "application/octet-stream")
        .header(header::CONTENT_LENGTH, file_size)
        .body(Body::from_stream(stream))
        .unwrap()
}

/// `POST /__vertz_fs_binary/stream/write?path=<url-encoded-path>`
///
/// Writes a streaming request body to a file atomically.
/// No size limit — data is written chunk by chunk without buffering.
pub async fn handle_binary_stream_write(
    State(state): State<Arc<DevServerState>>,
    req: Request<Body>,
) -> Response<Body> {
    use futures_util::StreamExt;
    use tokio::io::AsyncWriteExt;

    // Validate session nonce
    if let Err(resp) = validate_nonce(&req, &state.ipc_nonce) {
        return resp;
    }

    // Permission check
    if !state.ipc_permissions.is_allowed("fs.writeBinaryFile") {
        return error_response(
            StatusCode::FORBIDDEN,
            "PERMISSION_DENIED",
            "IPC method 'fs.writeBinaryFile' is not allowed. Add \"fs:write\" to desktop.permissions in .vertzrc",
        );
    }

    // Extract and expand path
    let raw_path = match extract_path_param(&req) {
        Ok(p) => p,
        Err(resp) => return resp,
    };
    let expanded = expand_tilde(&raw_path);

    // Create parent directories if needed
    if let Some(parent) = std::path::Path::new(&expanded).parent() {
        if !parent.as_os_str().is_empty() {
            if let Err(e) = tokio::fs::create_dir_all(parent).await {
                return map_io_error_response(e, &parent.to_string_lossy());
            }
        }
    }

    // Atomic streaming write: write chunks to temp file, then rename.
    // Random suffix avoids collisions with concurrent writes to the same path.
    let tmp_path = format!("{}.vtz-tmp-{:016x}", expanded, rand::random::<u64>());
    let mut file = match tokio::fs::File::create(&tmp_path).await {
        Ok(f) => f,
        Err(e) => return map_io_error_response(e, &expanded),
    };

    let mut stream = req.into_body().into_data_stream();
    while let Some(chunk) = stream.next().await {
        match chunk {
            Ok(bytes) => {
                if let Err(e) = file.write_all(&bytes).await {
                    let _ = tokio::fs::remove_file(&tmp_path).await;
                    return map_io_error_response(e, &expanded);
                }
            }
            Err(_) => {
                let _ = tokio::fs::remove_file(&tmp_path).await;
                return error_response(
                    StatusCode::BAD_REQUEST,
                    "IO_ERROR",
                    "Error reading request body stream",
                );
            }
        }
    }

    if let Err(e) = file.flush().await {
        let _ = tokio::fs::remove_file(&tmp_path).await;
        return map_io_error_response(e, &expanded);
    }
    drop(file);

    if let Err(e) = tokio::fs::rename(&tmp_path, &expanded).await {
        let _ = tokio::fs::remove_file(&tmp_path).await;
        return map_io_error_response(e, &expanded);
    }

    Response::builder()
        .status(StatusCode::NO_CONTENT)
        .body(Body::empty())
        .unwrap()
}

#[cfg(test)]
mod tests {
    use super::*;

    // ── generate_nonce ──

    #[test]
    fn nonce_is_64_hex_chars() {
        let nonce = generate_nonce();
        assert_eq!(nonce.len(), 64);
        assert!(nonce.chars().all(|c| c.is_ascii_hexdigit()));
    }

    #[test]
    fn nonce_is_unique_per_call() {
        let a = generate_nonce();
        let b = generate_nonce();
        assert_ne!(a, b);
    }

    // ── error_response ──

    #[test]
    fn error_response_has_json_content_type() {
        let resp = error_response(StatusCode::NOT_FOUND, "NOT_FOUND", "test");
        assert_eq!(resp.status(), StatusCode::NOT_FOUND);
        assert_eq!(
            resp.headers().get(header::CONTENT_TYPE).unwrap(),
            "application/json"
        );
    }

    // ── validate_nonce ──

    #[test]
    fn validate_nonce_accepts_correct_token() {
        let nonce = "abc123";
        let req = Request::builder()
            .header("x-vtz-ipc-token", nonce)
            .body(Body::empty())
            .unwrap();
        assert!(validate_nonce(&req, nonce).is_ok());
    }

    #[test]
    fn validate_nonce_rejects_wrong_token() {
        let req = Request::builder()
            .header("x-vtz-ipc-token", "wrong")
            .body(Body::empty())
            .unwrap();
        let result = validate_nonce(&req, "correct");
        assert!(result.is_err());
        let resp = result.unwrap_err();
        assert_eq!(resp.status(), StatusCode::FORBIDDEN);
    }

    #[test]
    fn validate_nonce_rejects_missing_header() {
        let req = Request::builder().body(Body::empty()).unwrap();
        let result = validate_nonce(&req, "any");
        assert!(result.is_err());
        let resp = result.unwrap_err();
        assert_eq!(resp.status(), StatusCode::FORBIDDEN);
    }

    // ── extract_path_param ──

    #[test]
    fn extract_path_param_decodes_path() {
        let req = Request::builder()
            .uri("/__vertz_fs_binary/read?path=%2Ftmp%2Ftest.bin")
            .body(Body::empty())
            .unwrap();
        let path = extract_path_param(&req).unwrap();
        assert_eq!(path, "/tmp/test.bin");
    }

    #[test]
    fn extract_path_param_decodes_tilde() {
        let req = Request::builder()
            .uri("/__vertz_fs_binary/read?path=~%2Ffile.bin")
            .body(Body::empty())
            .unwrap();
        let path = extract_path_param(&req).unwrap();
        assert_eq!(path, "~/file.bin");
    }

    #[test]
    fn extract_path_param_missing_returns_400() {
        let req = Request::builder()
            .uri("/__vertz_fs_binary/read")
            .body(Body::empty())
            .unwrap();
        let result = extract_path_param(&req);
        assert!(result.is_err());
        assert_eq!(result.unwrap_err().status(), StatusCode::BAD_REQUEST);
    }

    #[test]
    fn extract_path_param_empty_query_returns_400() {
        let req = Request::builder()
            .uri("/__vertz_fs_binary/read?")
            .body(Body::empty())
            .unwrap();
        let result = extract_path_param(&req);
        assert!(result.is_err());
    }

    // ── map_io_error_response ──

    #[test]
    fn io_error_not_found_maps_to_404() {
        let e = std::io::Error::new(std::io::ErrorKind::NotFound, "gone");
        let resp = map_io_error_response(e, "/tmp/test");
        assert_eq!(resp.status(), StatusCode::NOT_FOUND);
    }

    #[test]
    fn io_error_permission_denied_maps_to_403() {
        let e = std::io::Error::new(std::io::ErrorKind::PermissionDenied, "nope");
        let resp = map_io_error_response(e, "/tmp/test");
        assert_eq!(resp.status(), StatusCode::FORBIDDEN);
    }

    #[test]
    fn io_error_other_maps_to_500() {
        let e = std::io::Error::other("disk failure");
        let resp = map_io_error_response(e, "/tmp/test");
        assert_eq!(resp.status(), StatusCode::INTERNAL_SERVER_ERROR);
    }

    // ── handler integration tests ──

    #[tokio::test]
    async fn handle_binary_read_rejects_missing_nonce() {
        let state = test_state();
        let req = Request::builder()
            .uri("/__vertz_fs_binary/read?path=%2Ftmp%2Ftest.bin")
            .body(Body::empty())
            .unwrap();
        let resp = handle_binary_read(State(state), req).await;
        assert_eq!(resp.status(), StatusCode::FORBIDDEN);
    }

    #[tokio::test]
    async fn handle_binary_read_rejects_wrong_nonce() {
        let state = test_state();
        let req = Request::builder()
            .uri("/__vertz_fs_binary/read?path=%2Ftmp%2Ftest.bin")
            .header("x-vtz-ipc-token", "wrong-nonce")
            .body(Body::empty())
            .unwrap();
        let resp = handle_binary_read(State(state), req).await;
        assert_eq!(resp.status(), StatusCode::FORBIDDEN);
    }

    #[tokio::test]
    async fn handle_binary_read_rejects_missing_path() {
        let state = test_state();
        let req = Request::builder()
            .uri("/__vertz_fs_binary/read")
            .header("x-vtz-ipc-token", TEST_NONCE)
            .body(Body::empty())
            .unwrap();
        let resp = handle_binary_read(State(state), req).await;
        assert_eq!(resp.status(), StatusCode::BAD_REQUEST);
    }

    #[tokio::test]
    async fn handle_binary_read_returns_not_found_for_missing_file() {
        let state = test_state();
        let req = Request::builder()
            .uri("/__vertz_fs_binary/read?path=%2Fnonexistent%2Ffile.bin")
            .header("x-vtz-ipc-token", TEST_NONCE)
            .body(Body::empty())
            .unwrap();
        let resp = handle_binary_read(State(state), req).await;
        assert_eq!(resp.status(), StatusCode::NOT_FOUND);
    }

    #[tokio::test]
    async fn handle_binary_read_returns_file_contents() {
        let dir = tempfile::tempdir().unwrap();
        let file_path = dir.path().join("test.bin");
        let data = vec![0xDE, 0xAD, 0xBE, 0xEF];
        std::fs::write(&file_path, &data).unwrap();

        let state = test_state();
        let encoded_path = urlencoding::encode(file_path.to_str().unwrap());
        let uri = format!("/__vertz_fs_binary/read?path={}", encoded_path);
        let req = Request::builder()
            .uri(&uri)
            .header("x-vtz-ipc-token", TEST_NONCE)
            .body(Body::empty())
            .unwrap();
        let resp = handle_binary_read(State(state), req).await;

        assert_eq!(resp.status(), StatusCode::OK);
        assert_eq!(
            resp.headers().get(header::CONTENT_TYPE).unwrap(),
            "application/octet-stream"
        );
        assert_eq!(
            resp.headers()
                .get(header::CONTENT_LENGTH)
                .unwrap()
                .to_str()
                .unwrap(),
            "4"
        );

        let body_bytes = axum::body::to_bytes(resp.into_body(), 1024).await.unwrap();
        assert_eq!(body_bytes.as_ref(), &data);
    }

    #[tokio::test]
    async fn handle_binary_read_rejects_directory() {
        let dir = tempfile::tempdir().unwrap();
        let state = test_state();
        let encoded_path = urlencoding::encode(dir.path().to_str().unwrap());
        let uri = format!("/__vertz_fs_binary/read?path={}", encoded_path);
        let req = Request::builder()
            .uri(&uri)
            .header("x-vtz-ipc-token", TEST_NONCE)
            .body(Body::empty())
            .unwrap();
        let resp = handle_binary_read(State(state), req).await;
        assert_eq!(resp.status(), StatusCode::BAD_REQUEST);
    }

    #[tokio::test]
    async fn handle_binary_read_rejects_denied_permission() {
        use crate::ipc_permissions::IpcPermissions;
        // State with only shell permissions — no fs:read
        let state = test_state_with_permissions(IpcPermissions::from_capabilities(&[
            "shell:all".to_string()
        ]));
        let req = Request::builder()
            .uri("/__vertz_fs_binary/read?path=%2Ftmp%2Ftest.bin")
            .header("x-vtz-ipc-token", TEST_NONCE)
            .body(Body::empty())
            .unwrap();
        let resp = handle_binary_read(State(state), req).await;
        assert_eq!(resp.status(), StatusCode::FORBIDDEN);
    }

    // ── handle_binary_write tests ──

    #[tokio::test]
    async fn handle_binary_write_rejects_missing_nonce() {
        let state = test_state();
        let req = Request::builder()
            .method("POST")
            .uri("/__vertz_fs_binary/write?path=%2Ftmp%2Ftest.bin")
            .body(Body::from(vec![0xDE, 0xAD]))
            .unwrap();
        let resp = handle_binary_write(State(state), req).await;
        assert_eq!(resp.status(), StatusCode::FORBIDDEN);
    }

    #[tokio::test]
    async fn handle_binary_write_rejects_missing_path() {
        let state = test_state();
        let req = Request::builder()
            .method("POST")
            .uri("/__vertz_fs_binary/write")
            .header("x-vtz-ipc-token", TEST_NONCE)
            .body(Body::from(vec![0xDE, 0xAD]))
            .unwrap();
        let resp = handle_binary_write(State(state), req).await;
        assert_eq!(resp.status(), StatusCode::BAD_REQUEST);
    }

    #[tokio::test]
    async fn handle_binary_write_writes_file() {
        let dir = tempfile::tempdir().unwrap();
        let file_path = dir.path().join("test.bin");
        let data = vec![0xDE, 0xAD, 0xBE, 0xEF];

        let state = test_state();
        let encoded_path = urlencoding::encode(file_path.to_str().unwrap());
        let uri = format!("/__vertz_fs_binary/write?path={}", encoded_path);
        let req = Request::builder()
            .method("POST")
            .uri(&uri)
            .header("x-vtz-ipc-token", TEST_NONCE)
            .body(Body::from(data.clone()))
            .unwrap();
        let resp = handle_binary_write(State(state), req).await;

        assert_eq!(resp.status(), StatusCode::NO_CONTENT);
        let written = std::fs::read(&file_path).unwrap();
        assert_eq!(written, data);
    }

    #[tokio::test]
    async fn handle_binary_write_creates_parent_dirs() {
        let dir = tempfile::tempdir().unwrap();
        let file_path = dir.path().join("a/b/c/test.bin");
        let data = vec![0x01, 0x02];

        let state = test_state();
        let encoded_path = urlencoding::encode(file_path.to_str().unwrap());
        let uri = format!("/__vertz_fs_binary/write?path={}", encoded_path);
        let req = Request::builder()
            .method("POST")
            .uri(&uri)
            .header("x-vtz-ipc-token", TEST_NONCE)
            .body(Body::from(data.clone()))
            .unwrap();
        let resp = handle_binary_write(State(state), req).await;

        assert_eq!(resp.status(), StatusCode::NO_CONTENT);
        let written = std::fs::read(&file_path).unwrap();
        assert_eq!(written, data);
    }

    #[tokio::test]
    async fn handle_binary_write_is_atomic_no_temp_file_remains() {
        let dir = tempfile::tempdir().unwrap();
        let file_path = dir.path().join("atomic.bin");
        let data = vec![0xFF; 1024];

        let state = test_state();
        let encoded_path = urlencoding::encode(file_path.to_str().unwrap());
        let uri = format!("/__vertz_fs_binary/write?path={}", encoded_path);
        let req = Request::builder()
            .method("POST")
            .uri(&uri)
            .header("x-vtz-ipc-token", TEST_NONCE)
            .body(Body::from(data.clone()))
            .unwrap();
        let resp = handle_binary_write(State(state), req).await;
        assert_eq!(resp.status(), StatusCode::NO_CONTENT);

        // No temp file should remain after successful write
        let dir_entries: Vec<_> = std::fs::read_dir(dir.path())
            .unwrap()
            .filter_map(|e| e.ok())
            .filter(|e| e.file_name().to_string_lossy().contains(".vtz-tmp-"))
            .collect();
        assert!(dir_entries.is_empty(), "temp file should be cleaned up");
        assert_eq!(std::fs::read(&file_path).unwrap(), data);
    }

    #[tokio::test]
    async fn handle_binary_write_overwrites_existing_file() {
        let dir = tempfile::tempdir().unwrap();
        let file_path = dir.path().join("existing.bin");
        std::fs::write(&file_path, b"old data").unwrap();

        let new_data = vec![0xCA, 0xFE];
        let state = test_state();
        let encoded_path = urlencoding::encode(file_path.to_str().unwrap());
        let uri = format!("/__vertz_fs_binary/write?path={}", encoded_path);
        let req = Request::builder()
            .method("POST")
            .uri(&uri)
            .header("x-vtz-ipc-token", TEST_NONCE)
            .body(Body::from(new_data.clone()))
            .unwrap();
        let resp = handle_binary_write(State(state), req).await;

        assert_eq!(resp.status(), StatusCode::NO_CONTENT);
        assert_eq!(std::fs::read(&file_path).unwrap(), new_data);
    }

    #[tokio::test]
    async fn handle_binary_write_rejects_denied_permission() {
        use crate::ipc_permissions::IpcPermissions;
        let state =
            test_state_with_permissions(IpcPermissions::from_capabilities(
                &["fs:read".to_string()],
            ));
        let req = Request::builder()
            .method("POST")
            .uri("/__vertz_fs_binary/write?path=%2Ftmp%2Ftest.bin")
            .header("x-vtz-ipc-token", TEST_NONCE)
            .body(Body::from(vec![0x01]))
            .unwrap();
        let resp = handle_binary_write(State(state), req).await;
        assert_eq!(resp.status(), StatusCode::FORBIDDEN);
    }

    // ── handle_binary_stream_read tests ──

    #[tokio::test]
    async fn handle_stream_read_rejects_missing_nonce() {
        let state = test_state();
        let req = Request::builder()
            .uri("/__vertz_fs_binary/stream/read?path=%2Ftmp%2Ftest.bin")
            .body(Body::empty())
            .unwrap();
        let resp = handle_binary_stream_read(State(state), req).await;
        assert_eq!(resp.status(), StatusCode::FORBIDDEN);
    }

    #[tokio::test]
    async fn handle_stream_read_returns_file_contents() {
        let dir = tempfile::tempdir().unwrap();
        let file_path = dir.path().join("stream.bin");
        let data = vec![0xCA, 0xFE, 0xBA, 0xBE];
        std::fs::write(&file_path, &data).unwrap();

        let state = test_state();
        let encoded_path = urlencoding::encode(file_path.to_str().unwrap());
        let uri = format!("/__vertz_fs_binary/stream/read?path={}", encoded_path);
        let req = Request::builder()
            .uri(&uri)
            .header("x-vtz-ipc-token", TEST_NONCE)
            .body(Body::empty())
            .unwrap();
        let resp = handle_binary_stream_read(State(state), req).await;

        assert_eq!(resp.status(), StatusCode::OK);
        assert_eq!(
            resp.headers().get(header::CONTENT_TYPE).unwrap(),
            "application/octet-stream"
        );
        assert_eq!(
            resp.headers()
                .get(header::CONTENT_LENGTH)
                .unwrap()
                .to_str()
                .unwrap(),
            "4"
        );

        let body_bytes = axum::body::to_bytes(resp.into_body(), 1024).await.unwrap();
        assert_eq!(body_bytes.as_ref(), &data);
    }

    #[tokio::test]
    async fn handle_stream_read_returns_not_found() {
        let state = test_state();
        let req = Request::builder()
            .uri("/__vertz_fs_binary/stream/read?path=%2Fnonexistent%2Ffile.bin")
            .header("x-vtz-ipc-token", TEST_NONCE)
            .body(Body::empty())
            .unwrap();
        let resp = handle_binary_stream_read(State(state), req).await;
        assert_eq!(resp.status(), StatusCode::NOT_FOUND);
    }

    // ── handle_binary_stream_write tests ──

    #[tokio::test]
    async fn handle_stream_write_writes_file() {
        let dir = tempfile::tempdir().unwrap();
        let file_path = dir.path().join("stream-write.bin");
        let data = vec![0x01, 0x02, 0x03, 0x04, 0x05];

        let state = test_state();
        let encoded_path = urlencoding::encode(file_path.to_str().unwrap());
        let uri = format!("/__vertz_fs_binary/stream/write?path={}", encoded_path);
        let req = Request::builder()
            .method("POST")
            .uri(&uri)
            .header("x-vtz-ipc-token", TEST_NONCE)
            .body(Body::from(data.clone()))
            .unwrap();
        let resp = handle_binary_stream_write(State(state), req).await;

        assert_eq!(resp.status(), StatusCode::NO_CONTENT);
        assert_eq!(std::fs::read(&file_path).unwrap(), data);
    }

    #[tokio::test]
    async fn handle_stream_write_creates_parent_dirs() {
        let dir = tempfile::tempdir().unwrap();
        let file_path = dir.path().join("deep/nested/dir/file.bin");
        let data = vec![0xAB, 0xCD];

        let state = test_state();
        let encoded_path = urlencoding::encode(file_path.to_str().unwrap());
        let uri = format!("/__vertz_fs_binary/stream/write?path={}", encoded_path);
        let req = Request::builder()
            .method("POST")
            .uri(&uri)
            .header("x-vtz-ipc-token", TEST_NONCE)
            .body(Body::from(data.clone()))
            .unwrap();
        let resp = handle_binary_stream_write(State(state), req).await;

        assert_eq!(resp.status(), StatusCode::NO_CONTENT);
        assert_eq!(std::fs::read(&file_path).unwrap(), data);
    }

    #[tokio::test]
    async fn handle_stream_write_rejects_missing_nonce() {
        let state = test_state();
        let req = Request::builder()
            .method("POST")
            .uri("/__vertz_fs_binary/stream/write?path=%2Ftmp%2Ftest.bin")
            .body(Body::from(vec![0x01]))
            .unwrap();
        let resp = handle_binary_stream_write(State(state), req).await;
        assert_eq!(resp.status(), StatusCode::FORBIDDEN);
    }

    // ── Test helpers ──

    const TEST_NONCE: &str = "test-nonce-1234";

    fn test_state() -> Arc<DevServerState> {
        use crate::ipc_permissions::IpcPermissions;
        test_state_with_permissions(IpcPermissions::allow_all())
    }

    fn test_state_with_permissions(
        perms: crate::ipc_permissions::IpcPermissions,
    ) -> Arc<DevServerState> {
        // Minimal DevServerState for handler testing.
        // Only ipc_permissions and ipc_nonce are used by binary_fs handlers.
        Arc::new(DevServerState {
            plugin: Arc::new(crate::plugin::vertz::VertzPlugin),
            pipeline: crate::compiler::pipeline::CompilationPipeline::new(
                std::path::PathBuf::from("/tmp"),
                std::path::PathBuf::from("/tmp/src"),
                Arc::new(crate::plugin::vertz::VertzPlugin),
            ),
            root_dir: std::path::PathBuf::from("/tmp"),
            src_dir: std::path::PathBuf::from("/tmp/src"),
            entry_file: std::path::PathBuf::from("/tmp/src/main.ts"),
            deps_dir: std::path::PathBuf::from("/tmp/.vertz/deps"),
            theme_css: None,
            hmr_hub: crate::hmr::websocket::HmrHub::new(),
            module_graph: crate::watcher::SharedModuleGraph::default(),
            error_broadcaster: crate::errors::broadcaster::ErrorBroadcaster::new(),
            audit_log: crate::server::audit_log::AuditLog::default(),
            mcp_sessions: crate::server::mcp::McpSessions::default(),
            mcp_event_hub: crate::server::mcp_events::McpEventHub::new(),
            start_time: std::time::Instant::now(),
            enable_ssr: false,
            port: 3000,
            typecheck_enabled: false,
            api_isolate: Arc::new(std::sync::RwLock::new(None)),
            ssr_pool: None,
            api_proxy: None,
            auto_installer: None,
            last_file_change: Arc::new(std::sync::Mutex::new(None)),
            favicon_tag: None,
            browser_hub: crate::server::browser_hub::BrowserInteractionHub::new(),
            ipc_permissions: Arc::new(perms),
            ipc_nonce: TEST_NONCE.to_string(),
        })
    }
}
