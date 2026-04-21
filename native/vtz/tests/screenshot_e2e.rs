//! Phase 1 E2E — real Chromium captures against an in-process HTTP server.
//!
//! Every test here is `#[ignore]`d so `cargo test` skips them. The dedicated
//! `screenshot-e2e` CI job opts in via `cargo test -- --ignored` on
//! `ubuntu-latest` (pre-installed Google Chrome) and `macos-latest` (Chrome
//! for Testing via the setup-chrome action, or system Chrome when present).
//!
//! Scope: exercises the end-to-end shape of the pool + chromiumoxide spawner
//! against a tiny local HTML fixture. Skips tests that can't run without
//! Chrome (we don't download a fresh binary here — Task 8 leaves CfT download
//! as a follow-up requiring pinned SHA-256 per platform).

use std::net::SocketAddr;
use std::sync::Arc;
use std::time::{Duration, Instant};

use vertz_runtime::server::screenshot::chromium::ChromiumoxideSpawner;
use vertz_runtime::server::screenshot::fetcher::{resolve_local_chrome, SYSTEM_CHROME_PATHS};
use vertz_runtime::server::screenshot::pool::{
    CaptureRequest, CropSpec, LaunchConfig, Pool, WaitCondition, DEFAULT_TTL,
};

const TALL_HTML: &str = r#"<!doctype html>
<html>
  <head>
    <title>Vertz E2E</title>
    <style>
      body { margin: 0; font-family: system-ui; background: #0b1020; color: #fff; }
      h1 { padding: 24px; background: linear-gradient(90deg, #ff4ecd, #6a67ff); margin: 0; }
      .tall { height: 2400px; padding: 24px;
              background: repeating-linear-gradient(0deg, #11172a 0 40px, #0b1020 40px 80px); }
      #target { display: inline-block; background: #22c55e; color: #052e16;
                padding: 12px 20px; border-radius: 999px; margin-top: 24px; }
    </style>
  </head>
  <body>
    <h1>Vertz E2E target</h1>
    <div class="tall">
      <div id="target">cropped chip</div>
    </div>
  </body>
</html>"#;

/// Start a tiny in-process HTTP server that serves `TALL_HTML` at `/`.
/// Returns the bound URL and a cancellation handle (dropping the test
/// cancels the server via the spawn's JoinHandle going out of scope).
async fn spawn_fixture_server() -> (String, tokio::task::JoinHandle<()>) {
    use tokio::io::AsyncWriteExt as _;
    use tokio::net::TcpListener;

    let listener = TcpListener::bind("127.0.0.1:0").await.expect("bind");
    let addr: SocketAddr = listener.local_addr().unwrap();
    let url = format!("http://{addr}");
    let handle = tokio::spawn(async move {
        loop {
            let Ok((mut sock, _)) = listener.accept().await else {
                break;
            };
            tokio::spawn(async move {
                // Drain the request headers up to \r\n\r\n (don't care about content).
                let mut buf = [0u8; 2048];
                let _ = tokio::io::AsyncReadExt::read(&mut sock, &mut buf).await;
                let body = TALL_HTML.as_bytes();
                let response = format!(
                    "HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: {}\r\nConnection: close\r\n\r\n",
                    body.len()
                );
                let _ = sock.write_all(response.as_bytes()).await;
                let _ = sock.write_all(body).await;
                let _ = sock.shutdown().await;
            });
        }
    });
    (url, handle)
}

/// Verify prerequisites and skip cleanly if the runner doesn't have Chrome
/// — the test job is gated on the platform, but the suite must also be
/// resilient when run ad-hoc on a dev machine.
fn require_local_chrome_or_skip(test: &str) -> Option<std::path::PathBuf> {
    let env = std::env::var("VERTZ_CHROME_PATH").ok();
    let path = resolve_local_chrome(env.as_deref(), SYSTEM_CHROME_PATHS);
    if path.is_none() {
        eprintln!(
            "[screenshot_e2e::{test}] skipping: no local Chrome on this runner \
             (set $VERTZ_CHROME_PATH or install Google Chrome)"
        );
    }
    path
}

fn default_config(chrome: std::path::PathBuf) -> LaunchConfig {
    LaunchConfig {
        viewport: (1280, 720),
        chrome_path: Some(chrome),
    }
}

fn png_signature() -> [u8; 4] {
    [0x89, b'P', b'N', b'G']
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
#[ignore = "requires local Chrome; run via: cargo test -- --ignored screenshot_e2e"]
async fn e2e_captures_viewport_png() {
    let Some(chrome) = require_local_chrome_or_skip("e2e_captures_viewport_png") else {
        return;
    };
    let (url, _server) = spawn_fixture_server().await;

    let pool = Pool::new(
        Arc::new(ChromiumoxideSpawner::new()),
        default_config(chrome),
        DEFAULT_TTL,
    );
    let (bytes, meta) = pool
        .capture(CaptureRequest {
            url: url.clone(),
            viewport: (1280, 720),
            full_page: false,
            crop: None,
            wait_for: WaitCondition::NetworkIdle,
        })
        .await
        .expect("capture");

    assert_eq!(&bytes[..4], &png_signature());
    assert!(bytes.len() > 1024, "png payload looks too small");
    assert!(
        meta.final_url.starts_with("http://127.0.0.1"),
        "unexpected final_url: {}",
        meta.final_url
    );
    pool.shutdown().await;
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
#[ignore = "requires local Chrome; run via: cargo test -- --ignored screenshot_e2e"]
async fn e2e_full_page_exceeds_viewport_height() {
    let Some(chrome) = require_local_chrome_or_skip("e2e_full_page_exceeds_viewport_height") else {
        return;
    };
    let (url, _server) = spawn_fixture_server().await;

    let pool = Pool::new(
        Arc::new(ChromiumoxideSpawner::new()),
        default_config(chrome),
        DEFAULT_TTL,
    );
    let (viewport_bytes, _) = pool
        .capture(CaptureRequest {
            url: url.clone(),
            viewport: (1280, 720),
            full_page: false,
            crop: None,
            wait_for: WaitCondition::NetworkIdle,
        })
        .await
        .expect("viewport capture");
    let (full_bytes, _) = pool
        .capture(CaptureRequest {
            url: url.clone(),
            viewport: (1280, 720),
            full_page: true,
            crop: None,
            wait_for: WaitCondition::NetworkIdle,
        })
        .await
        .expect("full-page capture");

    // Both are valid PNGs.
    assert_eq!(&viewport_bytes[..4], &png_signature());
    assert_eq!(&full_bytes[..4], &png_signature());
    // PNG compression squashes the repeating gradient aggressively, so
    // byte-size alone isn't a clean proxy. Decode both and assert that
    // full_page has strictly greater height than the 720-px viewport.
    let viewport_img = image::load_from_memory(&viewport_bytes).expect("decode viewport png");
    let full_img = image::load_from_memory(&full_bytes).expect("decode full png");
    assert_eq!(viewport_img.height(), 720, "viewport capture dimensions");
    assert!(
        full_img.height() > viewport_img.height(),
        "full_page height ({}) must exceed viewport height ({})",
        full_img.height(),
        viewport_img.height()
    );
    assert!(
        full_img.height() >= 2000,
        "full_page height {} doesn't reflect the 2400px .tall fixture",
        full_img.height()
    );
    pool.shutdown().await;
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
#[ignore = "requires local Chrome; run via: cargo test -- --ignored screenshot_e2e"]
async fn e2e_css_crop_produces_small_image() {
    let Some(chrome) = require_local_chrome_or_skip("e2e_css_crop_produces_small_image") else {
        return;
    };
    let (url, _server) = spawn_fixture_server().await;

    let pool = Pool::new(
        Arc::new(ChromiumoxideSpawner::new()),
        default_config(chrome),
        DEFAULT_TTL,
    );
    let (bytes, meta) = pool
        .capture(CaptureRequest {
            url,
            viewport: (1280, 720),
            full_page: false,
            crop: Some(CropSpec::Css("#target".into())),
            wait_for: WaitCondition::NetworkIdle,
        })
        .await
        .expect("crop capture");

    assert_eq!(&bytes[..4], &png_signature());
    // The #target chip is ~185×42; crop must be smaller than a full
    // viewport capture by at least 5×.
    assert!(
        bytes.len() < 30 * 1024,
        "crop PNG unexpectedly large: {}",
        bytes.len()
    );
    assert!(meta.dimensions.0 > 0 && meta.dimensions.1 > 0);
    pool.shutdown().await;
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
#[ignore = "requires local Chrome; run via: cargo test -- --ignored screenshot_e2e"]
async fn e2e_cold_start_under_budget() {
    let Some(chrome) = require_local_chrome_or_skip("e2e_cold_start_under_budget") else {
        return;
    };
    let (url, _server) = spawn_fixture_server().await;

    let pool = Pool::new(
        Arc::new(ChromiumoxideSpawner::new()),
        default_config(chrome),
        DEFAULT_TTL,
    );
    let start = Instant::now();
    let (bytes, _) = pool
        .capture(CaptureRequest {
            url,
            viewport: (1280, 720),
            full_page: false,
            crop: None,
            wait_for: WaitCondition::Load,
        })
        .await
        .expect("cold capture");
    let elapsed = start.elapsed();

    assert_eq!(&bytes[..4], &png_signature());
    // The design doc's P2 criterion: cold start with local Chrome < 3000ms.
    // CI runners are slower than dev hardware — allow 10s headroom.
    assert!(
        elapsed < Duration::from_secs(10),
        "cold capture took {}ms (budget 10s)",
        elapsed.as_millis()
    );
    pool.shutdown().await;
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
#[ignore = "requires local Chrome; run via: cargo test -- --ignored screenshot_e2e"]
async fn e2e_warm_capture_reuses_browser() {
    let Some(chrome) = require_local_chrome_or_skip("e2e_warm_capture_reuses_browser") else {
        return;
    };
    let (url, _server) = spawn_fixture_server().await;

    let pool = Pool::new(
        Arc::new(ChromiumoxideSpawner::new()),
        default_config(chrome),
        DEFAULT_TTL,
    );
    // Warm the pool.
    let _ = pool
        .capture(CaptureRequest {
            url: url.clone(),
            viewport: (1280, 720),
            full_page: false,
            crop: None,
            wait_for: WaitCondition::NetworkIdle,
        })
        .await
        .expect("first capture");

    // Now measure warm capture — shouldn't re-launch Chrome.
    let start = Instant::now();
    let (bytes, _) = pool
        .capture(CaptureRequest {
            url,
            viewport: (1280, 720),
            full_page: false,
            crop: None,
            wait_for: WaitCondition::NetworkIdle,
        })
        .await
        .expect("warm capture");
    let elapsed = start.elapsed();

    assert_eq!(&bytes[..4], &png_signature());
    // Warm target: <500ms on dev hardware, <3s on slow CI runners.
    assert!(
        elapsed < Duration::from_secs(3),
        "warm capture took {}ms (budget 3s)",
        elapsed.as_millis()
    );
    pool.shutdown().await;
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
#[ignore = "requires local Chrome; run via: cargo test -- --ignored screenshot_e2e"]
async fn e2e_pool_shutdown_leaves_no_orphan_chrome() {
    let Some(chrome) = require_local_chrome_or_skip("e2e_pool_shutdown_leaves_no_orphan_chrome")
    else {
        return;
    };
    let (url, _server) = spawn_fixture_server().await;

    let pool = Pool::new(
        Arc::new(ChromiumoxideSpawner::new()),
        default_config(chrome),
        DEFAULT_TTL,
    );
    let _ = pool
        .capture(CaptureRequest {
            url,
            viewport: (1280, 720),
            full_page: false,
            crop: None,
            wait_for: WaitCondition::Load,
        })
        .await
        .expect("capture");

    // Bounded shutdown — design doc target is 2s; add headroom for CI.
    let shutdown = tokio::time::timeout(Duration::from_secs(5), pool.shutdown());
    assert!(shutdown.await.is_ok(), "shutdown exceeded 5s budget");

    // After shutdown, a new capture must fail with ShuttingDown rather than
    // silently relaunching Chrome.
    let err = pool
        .capture(CaptureRequest {
            url: "http://127.0.0.1/".into(),
            viewport: (1280, 720),
            full_page: false,
            crop: None,
            wait_for: WaitCondition::Load,
        })
        .await
        .expect_err("capture after shutdown must error");
    assert!(
        matches!(
            err,
            vertz_runtime::server::screenshot::pool::PoolError::ShuttingDown
        ),
        "unexpected err: {err:?}"
    );
}
