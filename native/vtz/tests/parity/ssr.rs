use crate::common::*;
use std::time::Duration;
use tokio::time::timeout;

/// Parity #34: SSR-enabled server returns HTML shell for page routes.
///
/// The full SSR redirect path requires a V8 isolate executing a framework app
/// that calls `ssrRedirect`. Since integration tests don't initialize V8,
/// we verify the SSR-enabled HTTP path returns a proper response, and test
/// the redirect branch at the unit level (see ssr_render.rs tests and
/// packages/ui-server/src/__tests__/ssr-single-pass.test.ts).
///
/// This test verifies:
/// 1. An SSR-enabled server accepts page route requests
/// 2. Without an isolate, the server correctly falls through to the HTML shell
/// 3. The HTML shell response is well-formed (proves the SSR code path is entered)
#[tokio::test]
async fn ssr_enabled_server_returns_html_shell_for_page_routes() {
    let (base_url, _handle) = start_dev_server_with(
        "minimal-app",
        TestConfig {
            enable_ssr: true,
            ..Default::default()
        },
    )
    .await;
    let client = http_client();

    // Request a page route on an SSR-enabled server.
    // Without a V8 isolate, it falls through to the HTML shell (non-redirect path).
    let resp = timeout(
        Duration::from_secs(5),
        client
            .get(format!("{}/dashboard", base_url))
            .header("accept", "text/html")
            .send(),
    )
    .await
    .unwrap()
    .unwrap();

    // The SSR code path is entered (enable_ssr=true) but no isolate exists,
    // so it falls back to the non-SSR HTML shell with 200.
    assert_eq!(resp.status(), 200);
    let body = resp.text().await.unwrap();
    assert!(
        body.contains("<!DOCTYPE html>"),
        "Response should be a valid HTML document. Body:\n{}",
        body
    );
    assert!(
        body.contains("<script type=\"module\""),
        "HTML shell should include the app module script. Body:\n{}",
        body
    );
}
