# Chromium Rust Client Research — POC #2865

**Date:** 2026-04-19

## Recommendation

**Use `chromiumoxide` (v0.9.1)** because it is the only actively maintained, tokio-native Rust CDP client and it exposes the exact screenshot fields we need (`clip`, `capture_beyond_viewport`) through `ScreenshotParams.cdp_params`, plus first-class process lifecycle control via `Browser::launch` / `kill` / `close` / `get_mut_child`.

Fallback: a minimal hand-rolled CDP client on top of `tokio-tungstenite` + `chromiumoxide_cdp` (just the generated type bindings, no client) if `chromiumoxide`'s dependency footprint grows too large for the vtz binary.

## Comparison table

| Criterion | chromiumoxide | headless_chrome | custom CDP |
|---|---|---|---|
| Latest release | **v0.9.1 — 2026-02-25** | v1.0.21 — 2026-02-03 | N/A |
| Last commit | **2026-04-03** (main active) | 2026-02-03 (main stale) | N/A |
| Commits / last 3 months | **30** | 3 | N/A |
| Open / closed issues | 37 open / 108 closed (ratio 0.34) | 142 open / 160 closed (ratio **0.89**) | N/A |
| Recent issue triage | Bugfix PRs merged through Apr 2026 | Old reports untriaged (e.g. #521 "Logging is broken" open since Oct 2024, #532 open since Jan 2025) | N/A |
| Direct deps | 18 (tokio, reqwest, async-tungstenite, serde, futures, thiserror, base64, url, which, tracing…) | 13 (tungstenite + std threads, anyhow, derive_builder, ureq when fetch is on) | ~5 (tokio-tungstenite, serde, serde_json, thiserror, tokio) |
| Heavy transitive pulls | `reqwest` (with hyper/h2/rustls) is mandatory; `tokio` already in vtz | `ureq`, `zip`, `walkdir` only with `fetch` feature → smaller if disabled | Only what we add |
| `Page.captureScreenshot` `clip` | **Yes** — `CaptureScreenshotParams.clip: Option<Viewport>` | Partial — `capture_screenshot(format, clip?, full)` but PDL-gen is older | Yes — raw JSON |
| `captureBeyondViewport` / fullPage | **Yes** — `capture_beyond_viewport: Option<bool>` and `ScreenshotParams::full_page` | Yes — docs show `captureBeyondViewport: true` | Yes — raw JSON |
| `Network.setCookies` | **Yes** — `Page::set_cookies(Vec<CookieParam>)` + single `set_cookie` | Yes — `tab.set_cookies` (has an open user report #562 that it silently fails) | Yes — raw JSON |
| Process lifecycle control | **Yes** — `Browser::launch`, `close()` (graceful), `kill()` (force), `wait()`, `try_wait()`, `get_mut_child() -> &mut Child`, `Drop` cleans up | Yes — via `LaunchOptions` + `Browser::new`; kill path less documented | We own `Command::spawn`, full control |
| Tokio compat | **Tokio-only** (stated in README) | **No — sync threads** (blocking API) | Tokio-native by construction |
| Protocol freshness | PDL regenerated per release; `chromiumoxide_cdp` 0.9 | `auto_generate_cdp` 0.4.6 at build (protocol pinned older) | Whatever we embed |

## Detailed findings

### chromiumoxide

Pros:
- Only tokio-native option. vtz already runs Tokio via deno_core, so no runtime mismatch.
- Complete typed CDP surface via `chromiumoxide_cdp` (generated from PDL each release).
- `Browser::get_mut_child()` returns the underlying `async_process::Child`, so we can own the PID, register it with vtz's signal handler, and graceful-shutdown on SIGINT/SIGTERM.
- `ScreenshotParams::builder().full_page(true).cdp_params(CaptureScreenshotParams { clip: Some(Viewport{..}), capture_beyond_viewport: Some(true), .. }).build()` is one expression — matches our POC spec 1:1.
- We can skip the `fetcher` feature (don't pull `reqwest`-for-downloads path twice) since we download Chromium ourselves.

Cons:
- `reqwest` is a non-optional dep even without `fetcher` (used for HTTP target discovery). Pulls hyper + h2 + a TLS stack. For vtz's binary we can try enabling `rustls` and turning off `native-tls` to avoid an OpenSSL link.
- 37 open issues, including #308 ("screenshot steals focus on every capture") — worth tracking, not a blocker for headless.
- Handler model requires us to `tokio::spawn` a polling task per Browser — fine, just a gotcha.

### headless_chrome

Pros:
- Simpler API for synchronous scripts.
- More stars (2.8k vs 1.2k) — better known.
- Slightly smaller when `fetch` feature is off.

Cons (disqualifying):
- **Synchronous-only API built on OS threads.** Does not integrate with tokio. We'd block a Tokio worker per screenshot or have to bounce through `spawn_blocking`, undoing most of the point of using Rust async.
- **Maintenance is stagnant.** 3 commits in the last 3 months; open-to-closed issue ratio 0.89 vs chromiumoxide's 0.34. Bug reports sit for months (logging broken since 2024, cookies-don't-work report open since Jan 2026).
- Older PDL snapshot; no guarantee `captureBeyondViewport` semantics match latest Chrome.
- `tab.set_cookies` has a known open bug report (#562) with no response.

### Custom CDP client

Pros:
- Smallest dep footprint. We'd add `tokio-tungstenite`, reuse `serde`/`serde_json` we already have, and depend only on `chromiumoxide_cdp` *types* (not its client) — that crate is published separately and is a pure type library.
- Full control over message framing and lifecycle.

Cons:
- We'd reimplement: request-id correlation, target attach/detach, session routing (flat session mode), event fan-out, navigation-settle heuristics ("network idle"), timeouts. Every one of these is a bug source.
- Maintenance burden forever: each Chrome release nudges the PDL, so we'd have to re-sync even just to read types.
- Zero value over chromiumoxide for the POC scope. Revisit only if the dependency weight of chromiumoxide becomes a real binary-size problem (measure first).

## Chromium distribution strategy

Recommendation: **mirror Playwright's approach but pull [Chrome for Testing](https://github.com/GoogleChromeLabs/chrome-for-testing) headless shell** rather than full Chromium.

- Google publishes JSON endpoints listing per-channel downloads, e.g. `https://googlechromelabs.github.io/chrome-for-testing/known-good-versions-with-downloads.json` and channel-scoped `LATEST_RELEASE_STABLE`.
- The `chrome-headless-shell` artifact (available since Chrome 120) is ~60% smaller than full Chromium and speaks the same CDP subset we need. This is exactly what Playwright uses under `--only-shell`.
- On first `vtz screenshot` invocation: resolve latest stable → download the zip → unpack into `~/.vertz/chromium/<rev>/` → verify SHA → launch. Subsequent runs reuse the extracted binary; pin revision in a manifest file in the vtz project.
- Optional opt-in flag to use the system Chrome if found (`$CHROME_PATH` env or `which google-chrome`/`chromium` probe) — matches what `chromiumoxide` does internally with the `which` crate.
- Do not bundle the binary in the npm package. The vtz release tarball stays small; users pay the ~80 MB download once, only if they use screenshots.

## Risks

- **reqwest transitive weight on the vtz binary.** Measure before/after with `cargo bloat --release`. If the delta is > ~3 MB, consider swapping to `ureq` via a fork or moving to the custom-CDP path.
- **chromiumoxide `Browser::close()` vs `kill()` semantics on SIGINT.** We must wire the child PID into vtz's existing signal handler so Chromium is reaped when the dev server dies, not left orphaned.
- **PDL drift.** chromiumoxide's `chromiumoxide_cdp` 0.9 was generated some time before Feb 2026; if we target Chrome 126+ and a new screenshot field lands, we can fall back to `Page::execute` with an untyped command payload.
- **Chrome for Testing channel churn.** Stable channel URL format has changed before. Cache the resolved URL in the manifest; don't resolve on every run.
- **macOS Gatekeeper / code signing** on the downloaded binary. Test `spctl` / quarantine-bit behavior when unzipping; `xattr -d com.apple.quarantine` may be needed post-extract on macOS.

## Sources

- chromiumoxide repo: https://github.com/mattsse/chromiumoxide (last push 2026-04-03; 30 commits since 2026-01-19)
- chromiumoxide v0.9.1 release (2026-02-25) via lib.rs
- `ScreenshotParams` / `CaptureScreenshotParams` — docs.rs/chromiumoxide and docs.rs/chromiumoxide_cdp
- `Browser` lifecycle methods — https://docs.rs/chromiumoxide/latest/chromiumoxide/browser/struct.Browser.html
- rust-headless-chrome repo: https://github.com/rust-headless-chrome/rust-headless-chrome (last push 2026-02-03; 3 commits since 2026-01-19; 142 open issues)
- Comparison / sync vs async context: https://dev.to/vhub_systems_ed5641f65d59/headless-browsers-in-rust-chromiumoxide-vs-headlesschrome-vs-the-python-alternative-25e5
- Chrome for Testing infrastructure: https://github.com/GoogleChromeLabs/chrome-for-testing
- chrome-headless-shell availability: https://developer.chrome.com/blog/chrome-headless-shell
- Alternative pure-type crates (rust-cdp, cdpkit) — viable if we go custom-CDP
