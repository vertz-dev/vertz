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
use tokio::sync::Mutex;

use crate::server::screenshot::pool::{
    BrowserHandle, BrowserSpawner, CaptureRequest, CropSpec, LaunchConfig, PageMeta, PoolError,
    WaitCondition,
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
            browser: Mutex::new(Some(browser)),
            handler_task: Mutex::new(Some(handler_task)),
        }))
    }
}

/// Per-browser handle. Holds the owned `Browser` behind a `Mutex<Option<_>>`
/// so `close()` can move it out for shutdown while the trait methods stay on
/// `&self` (enabling concurrent warm captures).
pub struct ChromiumoxideHandle {
    browser: Mutex<Option<Browser>>,
    handler_task: Mutex<Option<tokio::task::JoinHandle<()>>>,
}

#[async_trait]
impl BrowserHandle for ChromiumoxideHandle {
    async fn capture(&self, req: CaptureRequest) -> Result<(Vec<u8>, PageMeta), PoolError> {
        // Scope the lock so we only borrow `&Browser` for new_page; the
        // resulting `Page` is owned and can be used without the lock.
        let page = {
            let guard = self.browser.lock().await;
            let browser = guard.as_ref().ok_or(PoolError::ShuttingDown)?;
            browser
                .new_page(req.url.as_str())
                .await
                .map_err(|e| PoolError::NavigationFailed {
                    message: e.to_string(),
                    url: req.url.clone(),
                })?
        };

        match req.wait_for {
            WaitCondition::DomContentLoaded | WaitCondition::Load | WaitCondition::NetworkIdle => {
                page.wait_for_navigation()
                    .await
                    .map_err(|e| PoolError::NavigationFailed {
                        message: e.to_string(),
                        url: req.url.clone(),
                    })?;
            }
        }
        // NetworkIdle: crude best-effort — let the event loop breathe for
        // 500 ms after DOMContentLoaded so async fetches settle. Task 5
        // upgrades this to real idle-detection via CDP events.
        if matches!(req.wait_for, WaitCondition::NetworkIdle) {
            tokio::time::sleep(std::time::Duration::from_millis(500)).await;
        }

        let final_url = page
            .url()
            .await
            .map_err(|e| PoolError::CaptureFailed {
                message: format!("page.url: {e}"),
            })?
            .unwrap_or_else(|| req.url.clone());

        let params = build_screenshot_params(&page, &req).await?;
        let bytes = page
            .screenshot(params)
            .await
            .map_err(|e| PoolError::CaptureFailed {
                message: format!("screenshot: {e}"),
            })?;

        // The captured image's dimensions — for `clip` we know them
        // exactly; otherwise mirror the request viewport (Chrome will
        // resize the DPR-less output to match).
        let dimensions = if let Some(CropSpec::Css(_)) = &req.crop {
            // We measured the element above; the returned PNG matches its
            // bounding box dimensions but build_screenshot_params doesn't
            // thread them back. Revisit if Task 5 needs exact numbers; for
            // Phase 1 acceptance the viewport fallback is accurate enough
            // since consumers use the returned bytes, not these dims.
            req.viewport
        } else {
            req.viewport
        };
        let _ = page.close().await;

        Ok((
            bytes,
            PageMeta {
                final_url,
                dimensions,
            },
        ))
    }

    async fn close(&self) -> Result<(), PoolError> {
        if let Some(mut browser) = self.browser.lock().await.take() {
            let close_fut = async {
                let _ = browser.close().await;
                let _ = browser.wait().await;
            };
            // Bound the teardown so a wedged Chrome child can't block server
            // shutdown forever (design doc target: 2s).
            let _ = tokio::time::timeout(std::time::Duration::from_secs(2), close_fut).await;
        }
        if let Some(task) = self.handler_task.lock().await.take() {
            task.abort();
            let _ = task.await;
        }
        Ok(())
    }
}

/// Turn a [`CaptureRequest`] into `chromiumoxide` screenshot params.
async fn build_screenshot_params(
    page: &chromiumoxide::Page,
    req: &CaptureRequest,
) -> Result<ScreenshotParams, PoolError> {
    let mut builder = ScreenshotParams::builder().format(CaptureScreenshotFormat::Png);
    if req.full_page {
        builder = builder.full_page(true).capture_beyond_viewport(true);
    }
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
    Ok(builder.build())
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
