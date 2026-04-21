//! Production [`BrowserSpawner`] / [`BrowserHandle`] wrapping `chromiumoxide`.
//!
//! Scope for Task 4 (pool wiring). Task 5 layers MCP tool logic on top.
//! Deliberately minimal surface — just enough that the Pool tests drive real
//! Chrome when explicitly opted into via `#[ignore]`d integration tests.

use async_trait::async_trait;
use chromiumoxide::browser::{Browser, BrowserConfig};
use chromiumoxide::cdp::browser_protocol::page::{CaptureScreenshotFormat, Viewport};
use chromiumoxide::page::ScreenshotParams;
use futures::StreamExt;
use std::sync::Arc;
use tokio::sync::RwLock;

#[cfg(test)]
use crate::server::screenshot::pool::WaitCondition;
use crate::server::screenshot::pool::{
    BrowserHandle, BrowserSpawner, CaptureRequest, CropSpec, LaunchConfig, PageMeta, PoolError,
};

/// Production spawner. Each `launch` call spins up a fresh headless
/// Chromium process via `chromiumoxide::Browser::launch`.
pub struct ChromiumoxideSpawner;

impl ChromiumoxideSpawner {
    pub fn new() -> Self {
        Self
    }
}

impl Default for ChromiumoxideSpawner {
    fn default() -> Self {
        Self::new()
    }
}

#[async_trait]
impl BrowserSpawner for ChromiumoxideSpawner {
    async fn launch(&self, config: LaunchConfig) -> Result<Arc<dyn BrowserHandle>, PoolError> {
        let (w, h) = config.viewport;
        let mut builder = BrowserConfig::builder().no_sandbox().viewport(
            chromiumoxide::handler::viewport::Viewport {
                width: w,
                height: h,
                device_scale_factor: Some(1.0),
                emulating_mobile: false,
                is_landscape: false,
                has_touch: false,
            },
        );
        if let Some(path) = config.chrome_path.as_ref() {
            builder = builder.chrome_executable(path.clone());
        }
        let cfg = builder.build().map_err(|e| PoolError::Launch {
            message: format!("BrowserConfig: {e}"),
            hint: None,
        })?;

        let (browser, mut handler) = Browser::launch(cfg).await.map_err(|e| PoolError::Launch {
            message: e.to_string(),
            hint: Some("check that Chrome is installed or $VERTZ_CHROME_PATH is set".into()),
        })?;

        // The handler future MUST be polled continuously — every CDP
        // message flows through it. Spawn it, keep the JoinHandle so we
        // can abort on teardown.
        let handler_task = tokio::spawn(async move {
            while let Some(event) = handler.next().await {
                if event.is_err() {
                    break;
                }
            }
        });

        Ok(Arc::new(ChromiumoxideHandle {
            browser: RwLock::new(Some(browser)),
            handler_task: std::sync::Mutex::new(Some(handler_task)),
        }))
    }
}

/// Per-browser handle.
///
/// The Browser lives behind a `tokio::sync::RwLock<Option<_>>`:
/// - `capture()` takes a **read guard** for its whole duration, so concurrent
///   captures can share one Browser without serializing on a mutex (the
///   CDP message handler is off-thread so there's no actual contention).
/// - `close()` takes a **write guard**, which blocks until every in-flight
///   capture has released its read guard. This is how we guarantee a
///   long-running capture is never interrupted by a TTL-triggered close
///   (B2 from the Task 4 review).
pub struct ChromiumoxideHandle {
    browser: RwLock<Option<Browser>>,
    handler_task: std::sync::Mutex<Option<tokio::task::JoinHandle<()>>>,
}

#[async_trait]
impl BrowserHandle for ChromiumoxideHandle {
    async fn capture(&self, req: CaptureRequest) -> Result<(Vec<u8>, PageMeta), PoolError> {
        // Hold a read guard for the ENTIRE capture. close() takes the write
        // guard and will wait for all active captures to release.
        let guard = self.browser.read().await;
        let browser = guard.as_ref().ok_or(PoolError::ShuttingDown)?;

        let page =
            browser
                .new_page(req.url.as_str())
                .await
                .map_err(|e| PoolError::NavigationFailed {
                    message: e.to_string(),
                    url: req.url.clone(),
                })?;

        page.wait_for_navigation()
            .await
            .map_err(|e| PoolError::NavigationFailed {
                message: e.to_string(),
                url: req.url.clone(),
            })?;
        // WaitCondition variants currently collapse to the same wait —
        // Task 5 will add real DOMContentLoaded / NetworkIdle dispatch via
        // CDP events. Documenting the plan so consumers see consistent
        // behavior until then.
        let _ = req.wait_for;

        let final_url = page
            .url()
            .await
            .map_err(|e| PoolError::CaptureFailed {
                message: format!("page.url: {e}"),
            })?
            .unwrap_or_else(|| req.url.clone());

        let (params, crop_dims) = build_screenshot_params(&page, &req).await?;
        let bytes = page
            .screenshot(params)
            .await
            .map_err(|e| PoolError::CaptureFailed {
                message: format!("screenshot: {e}"),
            })?;

        // Dimensions honesty: fall back to viewport only when we genuinely
        // don't know. Crop → element bounding box; full_page → the
        // captured PNG's content size isn't available here without
        // re-decoding so we signal that by zero dims (Task 5 can decode
        // the PNG to populate them if the MCP metadata needs it).
        let dimensions = match (&req.crop, req.full_page) {
            (Some(_), _) => crop_dims.unwrap_or(req.viewport),
            (None, true) => (0, 0),
            (None, false) => req.viewport,
        };

        if let Err(e) = page.close().await {
            eprintln!("[screenshot] page.close failed (leaking page): {e}");
        }

        Ok((
            bytes,
            PageMeta {
                final_url,
                dimensions,
            },
        ))
    }

    async fn close(&self) -> Result<(), PoolError> {
        // Write guard blocks until every in-flight capture drops its read
        // guard, so we never tear a browser out from under running work.
        let mut guard = self.browser.write().await;
        if let Some(mut browser) = guard.take() {
            let close_fut = async {
                let _ = browser.close().await;
                let _ = browser.wait().await;
            };
            // Bound the teardown so a wedged Chrome child can't block server
            // shutdown forever (design doc target: 2s).
            let _ = tokio::time::timeout(std::time::Duration::from_secs(2), close_fut).await;
        }
        drop(guard);
        let task_opt = self
            .handler_task
            .lock()
            .expect("handler_task mutex poisoned")
            .take();
        if let Some(task) = task_opt {
            task.abort();
            let _ = task.await;
        }
        Ok(())
    }
}

/// Turn a [`CaptureRequest`] into `chromiumoxide` screenshot params.
///
/// Returns the crop dimensions alongside so `capture` can populate an
/// accurate `PageMeta.dimensions` instead of lying with `req.viewport`.
async fn build_screenshot_params(
    page: &chromiumoxide::Page,
    req: &CaptureRequest,
) -> Result<(ScreenshotParams, Option<(u32, u32)>), PoolError> {
    let mut builder = ScreenshotParams::builder().format(CaptureScreenshotFormat::Png);
    if req.full_page {
        builder = builder.full_page(true).capture_beyond_viewport(true);
    }
    let mut crop_dims = None;
    if let Some(crop) = &req.crop {
        let selector = match crop {
            CropSpec::Css(s) => s.clone(),
            // Text / name / label locators are layered on in Task 5 —
            // keeping Task 4 tight on behavior rather than feature creep.
            CropSpec::Text(_) | CropSpec::Name(_) | CropSpec::Label(_) => {
                return Err(PoolError::SelectorInvalid {
                    message: "text/name/label crop not supported in Task 4 — use CSS".into(),
                });
            }
        };
        let element = page.find_element(selector.as_str()).await.map_err(|e| {
            PoolError::SelectorNotFound {
                message: format!("{selector}: {e}"),
            }
        })?;
        let bbox = element
            .bounding_box()
            .await
            .map_err(|e| PoolError::SelectorNotFound {
                message: format!("bounding_box({selector}): {e}"),
            })?;
        crop_dims = Some((bbox.width as u32, bbox.height as u32));
        builder = builder
            .clip(Viewport {
                x: bbox.x,
                y: bbox.y,
                width: bbox.width,
                height: bbox.height,
                scale: 1.0,
            })
            .capture_beyond_viewport(true);
    }
    Ok((builder.build(), crop_dims))
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Dimensional smoke test — confirms the `Default` impl doesn't panic
    /// and the spawner is `Send + Sync + 'static`, which is what the Pool
    /// needs to store it behind `Arc<dyn BrowserSpawner>`.
    #[test]
    fn spawner_is_send_sync_static() {
        fn assert_send_sync_static<T: Send + Sync + 'static>() {}
        assert_send_sync_static::<ChromiumoxideSpawner>();
    }

    /// Real-Chrome integration. `#[ignore]`d so regular `cargo test` skips
    /// it — opt in with `cargo test -- --ignored`. Requires a Chrome or
    /// Chromium binary on PATH (or via `$VERTZ_CHROME_PATH`).
    #[tokio::test(flavor = "multi_thread", worker_threads = 2)]
    #[ignore]
    async fn real_chrome_captures_about_blank() {
        let spawner = ChromiumoxideSpawner::new();
        let handle = spawner
            .launch(LaunchConfig {
                viewport: (800, 600),
                chrome_path: None,
            })
            .await
            .expect("launch");
        let (bytes, meta) = handle
            .capture(CaptureRequest {
                url: "about:blank".into(),
                viewport: (800, 600),
                full_page: false,
                crop: None,
                wait_for: WaitCondition::Load,
            })
            .await
            .expect("capture");
        // PNG magic bytes.
        assert_eq!(&bytes[..4], &[0x89, b'P', b'N', b'G']);
        assert_eq!(meta.dimensions, (800, 600));
        handle.close().await.unwrap();
    }
}
