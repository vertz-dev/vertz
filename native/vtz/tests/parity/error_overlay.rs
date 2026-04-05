use crate::common::*;
use std::time::Duration;
use tokio::time::timeout;

/// Parity #47: Client error reporting via POST endpoint.
/// The browser error overlay sends runtime errors to /__vertz_api/report-error.
#[tokio::test]
async fn client_error_reported_via_post_endpoint() {
    let (base_url, handle) = start_dev_server("minimal-app").await;
    let client = http_client();

    // Subscribe to error broadcasts before sending the error
    let mut rx = handle.state.error_broadcaster.subscribe();

    // POST a runtime error (same JSON shape the browser client sends)
    let resp = timeout(
        Duration::from_secs(5),
        client
            .post(format!("{}/__vertz_api/report-error", base_url))
            .json(&serde_json::json!({
                "message": "TypeError: Cannot read property 'foo' of undefined",
                "stack": "at App (src/app.tsx:10:5)",
                "file": "src/app.tsx",
                "line": 10,
                "column": 5
            }))
            .send(),
    )
    .await
    .unwrap()
    .unwrap();

    assert_eq!(resp.status(), 200);
    let body = resp.text().await.unwrap();
    assert!(
        body.contains("\"ok\":true"),
        "Response should confirm error was accepted. Body: {}",
        body
    );

    // Verify error appears in the broadcaster stream
    let msg = timeout(Duration::from_secs(2), rx.recv())
        .await
        .expect("no error broadcast within 2s")
        .expect("broadcast channel closed");

    assert!(
        msg.contains("TypeError") || msg.contains("Cannot read property"),
        "Broadcast should contain the error message. Got: {}",
        msg
    );
}
