use std::net::TcpListener as StdTcpListener;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::time::Duration;

use vertz_runtime::config::ServerConfig;
use vertz_runtime::plugin::vertz::VertzPlugin;
use vertz_runtime::plugin::VtzPlugin;
use vertz_runtime::server::http::build_router;
use vertz_runtime::server::module_server::DevServerState;

/// Allocate an ephemeral port by binding to port 0 and releasing.
pub fn free_port() -> u16 {
    let listener = StdTcpListener::bind("127.0.0.1:0").unwrap();
    listener.local_addr().unwrap().port()
}

/// Resolve a fixture path relative to the crate root.
pub fn fixture_path(name: &str) -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("tests")
        .join("fixtures")
        .join(name)
}

/// Create the default Vertz framework plugin for tests.
pub fn test_plugin() -> Arc<dyn VtzPlugin> {
    Arc::new(VertzPlugin)
}

/// HTTP client with redirect following disabled (to test 302s, etc.).
pub fn http_client() -> reqwest::Client {
    reqwest::Client::builder()
        .redirect(reqwest::redirect::Policy::none())
        .build()
        .unwrap()
}

/// Shutdown handle — cleans up the dev server on drop.
/// Exposes `state` for tests that need direct access (e.g., HMR broadcast).
pub struct ShutdownHandle {
    shutdown_tx: Option<tokio::sync::oneshot::Sender<()>>,
    pub state: Arc<DevServerState>,
}

impl Drop for ShutdownHandle {
    fn drop(&mut self) {
        if let Some(tx) = self.shutdown_tx.take() {
            let _ = tx.send(());
        }
    }
}

/// Configuration overrides for test servers.
#[derive(Default)]
pub struct TestConfig {
    pub enable_ssr: bool,
    pub auto_install: bool,
    pub server_entry: Option<PathBuf>,
}

/// Start a dev server for a fixture app with default config.
/// Returns (base_url, ShutdownHandle).
#[allow(dead_code)]
pub async fn start_dev_server(fixture: &str) -> (String, ShutdownHandle) {
    start_dev_server_with(fixture, TestConfig::default()).await
}

/// Start a dev server rooted at an arbitrary path (e.g., a tempdir). Used by
/// tests that need to mutate source files during the run.
#[allow(dead_code)]
pub async fn start_dev_server_at_root(root: PathBuf) -> (String, ShutdownHandle) {
    start_dev_server_at_root_with(root, TestConfig::default()).await
}

/// Start a dev server at an arbitrary root with custom config overrides.
#[allow(dead_code)]
pub async fn start_dev_server_at_root_with(
    root: PathBuf,
    test_config: TestConfig,
) -> (String, ShutdownHandle) {
    let port = free_port();
    let addr = format!("127.0.0.1:{}", port);
    let base_url = format!("http://127.0.0.1:{}", port);

    let mut config = ServerConfig::with_root(
        port,
        "127.0.0.1".to_string(),
        root.join("public"),
        root.clone(),
    );
    config.enable_ssr = test_config.enable_ssr;
    config.auto_install = test_config.auto_install;
    if let Some(entry) = test_config.server_entry {
        config.server_entry = Some(entry);
    }
    let (router, state, _inspector_rx) = build_router(&config, test_plugin());
    let listener = tokio::net::TcpListener::bind(&addr).await.unwrap();
    let (shutdown_tx, shutdown_rx) = tokio::sync::oneshot::channel::<()>();

    tokio::spawn(async move {
        axum::serve(listener, router)
            .with_graceful_shutdown(async {
                let _ = shutdown_rx.await;
            })
            .await
            .unwrap();
    });

    wait_for_ready(
        &base_url,
        &root.display().to_string(),
        Duration::from_secs(5),
    )
    .await;

    (
        base_url,
        ShutdownHandle {
            shutdown_tx: Some(shutdown_tx),
            state,
        },
    )
}

/// Start a dev server with custom config overrides.
#[allow(dead_code)]
pub async fn start_dev_server_with(
    fixture: &str,
    test_config: TestConfig,
) -> (String, ShutdownHandle) {
    let root = fixture_path(fixture);
    let port = free_port();
    let addr = format!("127.0.0.1:{}", port);
    let base_url = format!("http://127.0.0.1:{}", port);

    let mut config =
        ServerConfig::with_root(port, "127.0.0.1".to_string(), root.join("public"), root);
    config.enable_ssr = test_config.enable_ssr;
    config.auto_install = test_config.auto_install;
    if let Some(entry) = test_config.server_entry {
        config.server_entry = Some(entry);
    }

    let (router, state, _inspector_rx) = build_router(&config, test_plugin());
    let listener = tokio::net::TcpListener::bind(&addr).await.unwrap();
    let (shutdown_tx, shutdown_rx) = tokio::sync::oneshot::channel::<()>();

    tokio::spawn(async move {
        axum::serve(listener, router)
            .with_graceful_shutdown(async {
                let _ = shutdown_rx.await;
            })
            .await
            .unwrap();
    });

    wait_for_ready(&base_url, fixture, Duration::from_secs(5)).await;

    (
        base_url,
        ShutdownHandle {
            shutdown_tx: Some(shutdown_tx),
            state,
        },
    )
}

/// Copy a fixture directory to a destination (e.g., tempdir).
/// Used for tests that modify fixture files (e.g., FileWatcher tests).
#[allow(dead_code)]
pub fn copy_fixture(fixture: &str, dest: &Path) {
    let src = fixture_path(fixture);
    copy_dir_recursive(&src, dest);
}

fn copy_dir_recursive(src: &Path, dst: &Path) {
    std::fs::create_dir_all(dst).unwrap();
    for entry in std::fs::read_dir(src).unwrap() {
        let entry = entry.unwrap();
        let src_path = entry.path();
        let dst_path = dst.join(entry.file_name());
        if src_path.is_dir() {
            copy_dir_recursive(&src_path, &dst_path);
        } else {
            std::fs::copy(&src_path, &dst_path).unwrap();
        }
    }
}

/// Poll `GET /` until the server responds, or panic after timeout.
pub async fn wait_for_ready(base_url: &str, fixture: &str, timeout: Duration) {
    let client = reqwest::Client::new();
    let start = std::time::Instant::now();
    loop {
        if client.get(base_url).send().await.is_ok() {
            return;
        }
        if start.elapsed() > timeout {
            panic!(
                "Server for fixture '{}' did not become ready within {:?}",
                fixture, timeout
            );
        }
        tokio::time::sleep(Duration::from_millis(50)).await;
    }
}
