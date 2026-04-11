//! Clipboard IPC handlers.

use crate::webview::ipc_dispatcher::IpcError;
use crate::webview::ipc_method::ClipboardWriteTextParams;

/// Read text from the system clipboard.
pub async fn read_text() -> Result<serde_json::Value, IpcError> {
    tokio::task::spawn_blocking(|| {
        let mut clipboard = arboard::Clipboard::new()
            .map_err(|e| IpcError::io_error(format!("Clipboard error: {}", e)))?;

        let text = clipboard
            .get_text()
            .map_err(|e| IpcError::io_error(format!("Failed to read clipboard: {}", e)))?;

        Ok(serde_json::Value::String(text))
    })
    .await
    .map_err(|e| IpcError::io_error(format!("Clipboard task panicked: {}", e)))?
}

/// Write text to the system clipboard.
pub async fn write_text(params: ClipboardWriteTextParams) -> Result<serde_json::Value, IpcError> {
    tokio::task::spawn_blocking(move || {
        let mut clipboard = arboard::Clipboard::new()
            .map_err(|e| IpcError::io_error(format!("Clipboard error: {}", e)))?;

        clipboard
            .set_text(&params.text)
            .map_err(|e| IpcError::io_error(format!("Failed to write clipboard: {}", e)))?;

        Ok(serde_json::Value::Null)
    })
    .await
    .map_err(|e| IpcError::io_error(format!("Clipboard task panicked: {}", e)))?
}

#[cfg(test)]
mod tests {
    use super::*;

    // Clipboard tests are inherently platform-dependent and may fail in CI
    // environments without a display server. We test the roundtrip in a
    // single test to avoid clipboard race conditions between tests.

    #[tokio::test]
    async fn clipboard_roundtrip() {
        let write_params = ClipboardWriteTextParams {
            text: "vertz-clipboard-test-value".to_string(),
        };

        let write_result = write_text(write_params).await;
        // Skip test if clipboard is unavailable (CI, headless)
        if write_result.is_err() {
            eprintln!("Skipping clipboard test: clipboard not available");
            return;
        }
        assert_eq!(write_result.unwrap(), serde_json::Value::Null);

        let read_result = read_text().await.unwrap();
        assert_eq!(read_result, "vertz-clipboard-test-value");
    }
}
