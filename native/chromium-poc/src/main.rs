//! POC for Issue #2865 — validates chromiumoxide covers the Vertz screenshot surface.
//!
//! Measures:
//!   - Cold start (first Browser::launch)
//!   - Warm capture (subsequent screenshot on same Page)
//!   - Viewport-only vs full-page
//!   - Selector crop via clip params
//!   - Cookie injection (proof for impersonation phase)
//!   - Graceful shutdown
//!
//! Target: uses a data: URL so the POC doesn't depend on a running dev server.

use chromiumoxide::browser::{Browser, BrowserConfig};
use chromiumoxide::cdp::browser_protocol::network::CookieParam;
use chromiumoxide::cdp::browser_protocol::page::{CaptureScreenshotFormat, Viewport};
use chromiumoxide::page::ScreenshotParams;
use futures::StreamExt;
use serde_json::json;
use std::path::PathBuf;
use std::time::Instant;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::TcpListener;

const TARGET_HTML: &str = r#"
<!doctype html>
<html>
  <head>
    <title>Vertz POC target</title>
    <style>
      body { margin: 0; font-family: system-ui; background: #0b1020; color: #fff; }
      h1 { padding: 24px; background: linear-gradient(90deg, #ff4ecd, #6a67ff); margin: 0; }
      .tall { height: 2400px; padding: 24px;
              background: repeating-linear-gradient(0deg, #11172a 0 40px, #0b1020 40px 80px); }
      .chip { display: inline-block; background: #22c55e; color: #052e16;
              padding: 12px 20px; border-radius: 999px; margin-top: 24px; }
      .cookie-echo { margin-top: 24px; font-size: 14px; color: #ffd700; }
    </style>
    <script>
      window.addEventListener('DOMContentLoaded', () => {
        const el = document.querySelector('.cookie-echo');
        el.textContent = 'cookie: ' + document.cookie;
      });
    </script>
  </head>
  <body>
    <h1>Vertz POC — visual sanity check</h1>
    <div class="tall">
      <div id="target" class="chip">selector-crop target</div>
      <div class="cookie-echo">cookie: (pending)</div>
    </div>
  </body>
</html>
"#;

#[derive(Debug, Default)]
struct Timings {
    cold_start_ms: u128,
    first_nav_ms: u128,
    viewport_capture_ms: u128,
    fullpage_capture_ms: u128,
    selector_capture_ms: u128,
    warm_capture_ms: u128,
    shutdown_ms: u128,
    binary_sizes_bytes: Sizes,
}

#[derive(Debug, Default)]
struct Sizes {
    viewport: usize,
    fullpage: usize,
    selector: usize,
}

#[tokio::main(flavor = "multi_thread", worker_threads = 4)]
async fn main() -> anyhow::Result<()> {
    let artifacts_dir = PathBuf::from(".vertz/artifacts/poc");
    tokio::fs::create_dir_all(&artifacts_dir).await?;

    let mut timings = Timings::default();

    println!("→ launching headless Chromium via chromiumoxide…");
    let t0 = Instant::now();
    let config = BrowserConfig::builder()
        .no_sandbox()
        .viewport(chromiumoxide::handler::viewport::Viewport {
            width: 1280,
            height: 720,
            device_scale_factor: Some(1.0),
            emulating_mobile: false,
            is_landscape: false,
            has_touch: false,
        })
        .build()
        .map_err(|e| anyhow::anyhow!("BrowserConfig: {e}"))?;
    let (mut browser, mut handler) = Browser::launch(config).await?;
    timings.cold_start_ms = t0.elapsed().as_millis();
    println!("   cold start: {} ms", timings.cold_start_ms);

    let handler_task = tokio::spawn(async move {
        while let Some(event) = handler.next().await {
            if let Err(err) = event {
                eprintln!("   handler event error: {err}");
                break;
            }
        }
    });

    let target_url = spawn_poc_server().await?;
    println!("   target url: {}", target_url);

    browser
        .set_cookies(vec![CookieParam::builder()
            .name("vertz-dev-session")
            .value("poc-value-123")
            .url(target_url.as_str())
            .build()
            .map_err(|e| anyhow::anyhow!("CookieParam: {e}"))?])
        .await?;

    let t_nav = Instant::now();
    let page = browser.new_page(target_url.as_str()).await?;
    page.wait_for_navigation().await?;
    timings.first_nav_ms = t_nav.elapsed().as_millis();
    println!("   first nav:  {} ms", timings.first_nav_ms);

    println!("→ capturing viewport screenshot…");
    let t1 = Instant::now();
    let viewport_png = page
        .screenshot(
            ScreenshotParams::builder()
                .format(CaptureScreenshotFormat::Png)
                .build(),
        )
        .await?;
    timings.viewport_capture_ms = t1.elapsed().as_millis();
    timings.binary_sizes_bytes.viewport = viewport_png.len();
    tokio::fs::write(artifacts_dir.join("01-viewport.png"), &viewport_png).await?;
    println!(
        "   viewport:   {} ms, {} KB",
        timings.viewport_capture_ms,
        viewport_png.len() / 1024
    );

    println!("→ capturing full-page screenshot…");
    let t2 = Instant::now();
    let fullpage_png = page
        .screenshot(
            ScreenshotParams::builder()
                .format(CaptureScreenshotFormat::Png)
                .full_page(true)
                .build(),
        )
        .await?;
    timings.fullpage_capture_ms = t2.elapsed().as_millis();
    timings.binary_sizes_bytes.fullpage = fullpage_png.len();
    tokio::fs::write(artifacts_dir.join("02-fullpage.png"), &fullpage_png).await?;
    println!(
        "   fullpage:   {} ms, {} KB",
        timings.fullpage_capture_ms,
        fullpage_png.len() / 1024
    );

    println!("→ capturing selector crop (#target)…");
    let t3 = Instant::now();
    let selector_png = capture_selector(&page, "#target").await?;
    timings.selector_capture_ms = t3.elapsed().as_millis();
    timings.binary_sizes_bytes.selector = selector_png.len();
    tokio::fs::write(artifacts_dir.join("03-selector.png"), &selector_png).await?;
    println!(
        "   selector:   {} ms, {} KB",
        timings.selector_capture_ms,
        selector_png.len() / 1024
    );

    println!("→ capturing warm screenshot (same page)…");
    let t4 = Instant::now();
    let _warm_png = page
        .screenshot(
            ScreenshotParams::builder()
                .format(CaptureScreenshotFormat::Png)
                .build(),
        )
        .await?;
    timings.warm_capture_ms = t4.elapsed().as_millis();
    println!("   warm:       {} ms", timings.warm_capture_ms);

    println!("→ graceful shutdown…");
    let t5 = Instant::now();
    browser.close().await?;
    browser.wait().await?;
    let _ = handler_task.await;
    timings.shutdown_ms = t5.elapsed().as_millis();
    println!("   shutdown:   {} ms", timings.shutdown_ms);

    let report = json!({
        "cold_start_ms": timings.cold_start_ms,
        "first_nav_ms": timings.first_nav_ms,
        "viewport_capture_ms": timings.viewport_capture_ms,
        "fullpage_capture_ms": timings.fullpage_capture_ms,
        "selector_capture_ms": timings.selector_capture_ms,
        "warm_capture_ms": timings.warm_capture_ms,
        "shutdown_ms": timings.shutdown_ms,
        "viewport_bytes": timings.binary_sizes_bytes.viewport,
        "fullpage_bytes": timings.binary_sizes_bytes.fullpage,
        "selector_bytes": timings.binary_sizes_bytes.selector,
    });
    tokio::fs::write(
        artifacts_dir.join("timings.json"),
        serde_json::to_vec_pretty(&report)?,
    )
    .await?;

    println!("\n✅ POC OK — all phases covered.");
    println!("   artifacts: {}", artifacts_dir.display());
    println!("   timings:   {}", serde_json::to_string_pretty(&report)?);

    Ok(())
}

async fn capture_selector(
    page: &chromiumoxide::Page,
    selector: &str,
) -> anyhow::Result<Vec<u8>> {
    let element = page.find_element(selector).await?;
    let bbox = element.bounding_box().await?;

    let clip = Viewport {
        x: bbox.x,
        y: bbox.y,
        width: bbox.width,
        height: bbox.height,
        scale: 1.0,
    };

    let params = ScreenshotParams::builder()
        .format(CaptureScreenshotFormat::Png)
        .clip(clip)
        .capture_beyond_viewport(true)
        .build();

    Ok(page.screenshot(params).await?)
}

async fn spawn_poc_server() -> anyhow::Result<String> {
    let listener = TcpListener::bind("127.0.0.1:0").await?;
    let addr = listener.local_addr()?;
    let url = format!("http://{}/", addr);

    tokio::spawn(async move {
        loop {
            let Ok((mut socket, _)) = listener.accept().await else {
                return;
            };
            tokio::spawn(async move {
                let mut buf = [0u8; 4096];
                let _ = socket.read(&mut buf).await;
                let body = TARGET_HTML.as_bytes();
                let header = format!(
                    "HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: {}\r\nConnection: close\r\n\r\n",
                    body.len()
                );
                let _ = socket.write_all(header.as_bytes()).await;
                let _ = socket.write_all(body).await;
                let _ = socket.shutdown().await;
            });
        }
    });

    Ok(url)
}
