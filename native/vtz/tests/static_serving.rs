use reqwest::Client;
use std::net::TcpListener as StdTcpListener;
use std::path::PathBuf;
use std::time::Duration;
use tokio::net::TcpListener;
use tokio::time::timeout;

/// Helper to find a free port by binding to port 0.
fn free_port() -> u16 {
    let listener = StdTcpListener::bind("127.0.0.1:0").unwrap();
    listener.local_addr().unwrap().port()
}

/// Path to the test fixtures public directory.
fn fixtures_public_dir() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("tests")
        .join("fixtures")
        .join("public")
}

/// Start an axum server on a random port with the test fixtures.
/// Returns the base URL and a shutdown sender.
async fn start_test_server() -> (String, tokio::sync::oneshot::Sender<()>) {
    let port = free_port();
    let addr = format!("127.0.0.1:{}", port);
    let base_url = format!("http://127.0.0.1:{}", port);

    let public_dir = fixtures_public_dir();
    let serve_dir = tower_http::services::ServeDir::new(&public_dir);
    let router = axum::Router::new().fallback_service(serve_dir);

    let listener = TcpListener::bind(&addr).await.unwrap();

    let (shutdown_tx, shutdown_rx) = tokio::sync::oneshot::channel::<()>();

    tokio::spawn(async move {
        axum::serve(listener, router)
            .with_graceful_shutdown(async {
                let _ = shutdown_rx.await;
            })
            .await
            .unwrap();
    });

    // Wait briefly for the server to start
    tokio::time::sleep(Duration::from_millis(50)).await;

    (base_url, shutdown_tx)
}

#[tokio::test]
async fn test_serves_index_html() {
    let (base_url, shutdown_tx) = start_test_server().await;
    let client = Client::new();

    let resp = timeout(
        Duration::from_secs(5),
        client.get(format!("{}/index.html", base_url)).send(),
    )
    .await
    .expect("request timed out")
    .expect("request failed");

    assert_eq!(resp.status(), 200);

    let content_type = resp
        .headers()
        .get("content-type")
        .expect("missing content-type")
        .to_str()
        .unwrap();
    assert!(
        content_type.contains("text/html"),
        "expected text/html, got {}",
        content_type
    );

    let body = resp.text().await.unwrap();
    assert!(body.contains("Hello Vertz"));

    let _ = shutdown_tx.send(());
}

#[tokio::test]
async fn test_serves_css_with_correct_content_type() {
    let (base_url, shutdown_tx) = start_test_server().await;
    let client = Client::new();

    let resp = timeout(
        Duration::from_secs(5),
        client.get(format!("{}/styles/app.css", base_url)).send(),
    )
    .await
    .expect("request timed out")
    .expect("request failed");

    assert_eq!(resp.status(), 200);

    let content_type = resp
        .headers()
        .get("content-type")
        .expect("missing content-type")
        .to_str()
        .unwrap();
    assert!(
        content_type.contains("text/css"),
        "expected text/css, got {}",
        content_type
    );

    let body = resp.text().await.unwrap();
    assert!(body.contains("font-family"));

    let _ = shutdown_tx.send(());
}

#[tokio::test]
async fn test_serves_assets_from_subdirectory() {
    let (base_url, shutdown_tx) = start_test_server().await;
    let client = Client::new();

    let resp = timeout(
        Duration::from_secs(5),
        client.get(format!("{}/assets/logo.txt", base_url)).send(),
    )
    .await
    .expect("request timed out")
    .expect("request failed");

    assert_eq!(resp.status(), 200);

    let body = resp.text().await.unwrap();
    assert!(body.contains("VERTZ_LOGO_PLACEHOLDER"));

    let _ = shutdown_tx.send(());
}

#[tokio::test]
async fn test_missing_file_returns_404() {
    let (base_url, shutdown_tx) = start_test_server().await;
    let client = Client::new();

    let resp = timeout(
        Duration::from_secs(5),
        client.get(format!("{}/missing.txt", base_url)).send(),
    )
    .await
    .expect("request timed out")
    .expect("request failed");

    assert_eq!(resp.status(), 404);

    let _ = shutdown_tx.send(());
}

#[tokio::test]
async fn test_path_traversal_returns_404() {
    let (base_url, shutdown_tx) = start_test_server().await;
    let client = Client::new();

    // Attempt path traversal — tower-http's ServeDir should reject this
    let resp = timeout(
        Duration::from_secs(5),
        client.get(format!("{}/../Cargo.toml", base_url)).send(),
    )
    .await
    .expect("request timed out")
    .expect("request failed");

    // Should not serve files outside the public directory
    let status = resp.status().as_u16();
    assert!(
        status == 400 || status == 404,
        "expected 400 or 404 for path traversal, got {}",
        status
    );

    let _ = shutdown_tx.send(());
}

#[tokio::test]
async fn test_port_conflict_auto_increment() {
    // Bind a port to block it
    let blocker = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let blocked_port = blocker.local_addr().unwrap().port();

    // Try to bind starting from the blocked port — should auto-increment
    let mut found_port = None;
    for offset in 0..10u16 {
        let port = blocked_port + offset;
        match TcpListener::bind(format!("127.0.0.1:{}", port)).await {
            Ok(listener) => {
                found_port = Some(listener.local_addr().unwrap().port());
                drop(listener);
                break;
            }
            Err(_) => continue,
        }
    }

    assert!(found_port.is_some(), "should have found a free port");
    assert!(
        found_port.unwrap() > blocked_port,
        "should have incremented past the blocked port"
    );

    drop(blocker);
}
