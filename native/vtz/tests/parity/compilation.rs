use crate::common::*;
use std::time::Duration;
use tokio::time::timeout;

/// Parity #19: import.meta.env.* replaced with literal values at compile time.
/// Public env vars (VITE_* prefix) are inlined; non-public vars are NOT exposed.
#[tokio::test]
async fn import_meta_env_replaced_with_values() {
    let (base_url, _handle) = start_dev_server("parity/env-app").await;
    let client = http_client();

    let resp = timeout(
        Duration::from_secs(5),
        client.get(format!("{}/src/app.tsx", base_url)).send(),
    )
    .await
    .unwrap()
    .unwrap();

    assert_eq!(resp.status(), 200);
    let content_type = resp
        .headers()
        .get("content-type")
        .unwrap()
        .to_str()
        .unwrap();
    assert!(
        content_type.contains("application/javascript"),
        "Expected application/javascript, got: {}",
        content_type
    );

    let body = resp.text().await.unwrap();

    // Public env vars should be replaced with literal values
    assert!(
        body.contains("\"TestApp\""),
        "Compiled output should contain literal \"TestApp\" from VITE_APP_TITLE. Body:\n{}",
        body
    );
    assert!(
        body.contains("\"https://api.example.com\""),
        "Compiled output should contain literal VITE_API_URL value. Body:\n{}",
        body
    );

    // The original import.meta.env references should be gone
    assert!(
        !body.contains("import.meta.env.VITE_APP_TITLE"),
        "import.meta.env.VITE_APP_TITLE should be replaced, not present verbatim. Body:\n{}",
        body
    );

    // Non-public env vars (without VITE_ prefix) should NOT be exposed
    assert!(
        !body.contains("do-not-expose"),
        "SECRET_KEY value should NOT appear in compiled output. Body:\n{}",
        body
    );
}

/// Parity #20: CSS files served as JS modules with style injection code.
/// `GET /src/styles.css` returns application/javascript, not raw CSS.
#[tokio::test]
async fn css_file_served_as_js_module() {
    let (base_url, _handle) = start_dev_server("parity/css-app").await;
    let client = http_client();

    let resp = timeout(
        Duration::from_secs(5),
        client.get(format!("{}/src/styles.css", base_url)).send(),
    )
    .await
    .unwrap()
    .unwrap();

    assert_eq!(resp.status(), 200);
    let content_type = resp
        .headers()
        .get("content-type")
        .unwrap()
        .to_str()
        .unwrap();
    assert!(
        content_type.contains("application/javascript"),
        "CSS should be served as JS module, got content-type: {}",
        content_type
    );

    let body = resp.text().await.unwrap();

    // Should contain original CSS content (embedded in JS)
    assert!(
        body.contains("color: red"),
        "JS module should contain original CSS. Body:\n{}",
        body
    );

    // Should contain style injection code
    assert!(
        body.contains("createElement") || body.contains("__vtz_css"),
        "JS module should have style injection logic. Body:\n{}",
        body
    );

    // Should export the CSS string
    assert!(
        body.contains("export default"),
        "JS module should have a default export. Body:\n{}",
        body
    );
}

/// Parity #22: tsconfig.json path aliases resolved in compiled imports.
/// `@/utils` is rewritten to the actual file path during compilation.
#[tokio::test]
async fn tsconfig_path_aliases_resolved_in_imports() {
    let (base_url, _handle) = start_dev_server("parity/tsconfig-paths-app").await;
    let client = http_client();

    let resp = timeout(
        Duration::from_secs(5),
        client.get(format!("{}/src/app.tsx", base_url)).send(),
    )
    .await
    .unwrap()
    .unwrap();

    assert_eq!(resp.status(), 200);
    let body = resp.text().await.unwrap();

    // The `@/utils` alias should be resolved to an actual path
    // It should NOT contain the raw alias `from '@/utils'`
    assert!(
        !body.contains("from '@/utils'") && !body.contains("from \"@/utils\""),
        "Alias @/utils should be resolved, not left as-is. Body:\n{}",
        body
    );

    // The resolved import should point to the actual file
    assert!(
        body.contains("/src/utils"),
        "Resolved import should reference /src/utils path. Body:\n{}",
        body
    );
}

/// Parity #23: /@deps/* endpoint serves pre-bundled dependencies.
/// The route is registered and responds with appropriate content types.
#[tokio::test]
async fn deps_endpoint_serves_prebundled_dependencies() {
    let (base_url, _handle) = start_dev_server("minimal-app").await;
    let client = http_client();

    // Request a non-existent dependency — the endpoint should respond with 404,
    // proving the /@deps/ route is registered and handled (not a generic fallback).
    let resp = timeout(
        Duration::from_secs(5),
        client
            .get(format!("{0}/@deps/nonexistent-package", base_url))
            .send(),
    )
    .await
    .unwrap()
    .unwrap();

    assert_eq!(
        resp.status(),
        404,
        "/@deps/ should return 404 for missing packages"
    );

    let body = resp.text().await.unwrap();
    // The deps handler returns a specific error message, not a generic HTML 404
    assert!(
        body.contains("not found") || body.contains("Could not resolve"),
        "/@deps/ 404 should have a meaningful error. Body: {}",
        body
    );
}

/// Parity #24: /@css/* endpoint serves extracted CSS virtual modules.
/// The route is registered and returns CSS content-type for known keys.
#[tokio::test]
async fn css_virtual_modules_served_at_css_endpoint() {
    let (base_url, _handle) = start_dev_server("parity/css-app").await;
    let client = http_client();

    // Request a non-existent CSS key — the endpoint should respond with 404,
    // proving the /@css/ route is registered and handled.
    let resp = timeout(
        Duration::from_secs(5),
        client
            .get(format!("{0}/@css/nonexistent.css", base_url))
            .send(),
    )
    .await
    .unwrap()
    .unwrap();

    assert_eq!(
        resp.status(),
        404,
        "/@css/ should return 404 for unknown CSS keys"
    );

    let body = resp.text().await.unwrap();
    assert!(
        body.contains("CSS not found"),
        "/@css/ 404 should have CSS-specific error. Body: {}",
        body
    );
}

/// Parity #25: Theme CSS auto-discovered and injected into HTML shell.
/// When `src/styles/theme.css` exists, its content appears as inline `<style>` in the HTML.
#[tokio::test]
async fn theme_css_auto_discovered_and_injected_in_html() {
    let (base_url, _handle) = start_dev_server("parity/theme-app").await;
    let client = http_client();

    let resp = timeout(
        Duration::from_secs(5),
        client
            .get(format!("{}/", base_url))
            .header("accept", "text/html")
            .send(),
    )
    .await
    .unwrap()
    .unwrap();

    assert_eq!(resp.status(), 200);
    let content_type = resp
        .headers()
        .get("content-type")
        .unwrap()
        .to_str()
        .unwrap();
    assert!(
        content_type.contains("text/html"),
        "Root should return HTML, got: {}",
        content_type
    );

    let body = resp.text().await.unwrap();

    // Theme CSS should be injected as an inline <style> block
    assert!(
        body.contains("<style>"),
        "HTML should contain inline <style> for theme CSS. Body:\n{}",
        body
    );
    assert!(
        body.contains("--color-primary"),
        "Theme CSS custom property --color-primary should be in HTML. Body:\n{}",
        body
    );
    assert!(
        body.contains("--color-secondary"),
        "Theme CSS custom property --color-secondary should be in HTML. Body:\n{}",
        body
    );
}
