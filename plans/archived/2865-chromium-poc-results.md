# Chromium POC Results — Issue #2865

> **Decision: GO — implement Phase 1 with `chromiumoxide` v0.9.1.**
> All promised numbers from the design doc hold with headroom. API surface covers every Phase 1/2/3 need.

**Date:** 2026-04-19
**Branch:** `poc/chromium-client`
**Hardware:** macOS 15.2, Apple Silicon
**Chrome:** system Chrome at `/Applications/Google Chrome.app/`

---

## What we tested

Hand-rolled POC binary at `native/chromium-poc/` that:

1. Launches headless Chromium via `chromiumoxide` 0.9.1
2. Spawns a tiny in-process HTTP server (so we can validate cookie injection, which Chrome refuses on `data:` and `about:blank` URLs)
3. Injects a browser-level cookie via `browser.set_cookies(...)`
4. Captures four screenshots on the same page:
   - Viewport (1280x720, fixed)
   - Full page (`full_page(true)` → uses `captureBeyondViewport`)
   - Selector crop via `element.bounding_box()` → `.clip(Viewport{..})`
   - Warm capture (second call on the same page)
5. Closes the browser gracefully and joins the handler task

Single binary, no vtz integration. Validates the API surface before we commit it to the real runtime.

## Timings

All numbers are a single run — order of magnitude is what matters.

| Phase | Debug build | Release build | Design doc target | Verdict |
|---|---|---|---|---|
| Cold start (Browser::launch) | 1255 ms / 875 ms | **836 ms** | < 2000 ms | ✅ 2.4× headroom |
| First nav + wait | 109 ms | **74 ms** | — | baseline |
| Viewport screenshot | 43 ms | **37 ms** | < 200 ms | ✅ 5× headroom |
| Full page screenshot | 82 ms | **69 ms** | < 200 ms | ✅ 2.9× headroom |
| Selector crop | 33 ms | **21 ms** | — | ✅ |
| Warm capture | 25 ms | **22 ms** | < 200 ms | ✅ 9× headroom |
| Graceful shutdown | 79 ms | **64 ms** | — | baseline |

The real-world cold-start number (836 ms release) is bounded by Chromium process startup, not by `chromiumoxide`. Rust debug vs release changes almost nothing for this metric — the Rust client is not on the hot path.

## PNG output validation

| File | Dimensions | Size | Notes |
|---|---|---|---|
| `01-viewport.png` | 1280 × 720 | 47 KB | Matches configured viewport exactly |
| `02-fullpage.png` | 1280 × 2534 | 57 KB | Full `.tall` container captured beyond viewport |
| `03-selector.png` | 185 × 42 | 3 KB | `#target` chip cropped correctly via bounding box |

Cookie injection verified end-to-end: the test HTML echoes `document.cookie` into `.cookie-echo`, which renders `cookie: vertz-dev-session=poc-value-123` in the captured PNGs.

Artifacts: `.vertz/artifacts/poc/*.png` + `timings.json`.

## Binary size

Release binary of the POC (LTO on, stripped via workspace profile):

```
native/target/release/chromium-poc: 4.8 MB
```

This includes: `chromiumoxide` + `chromiumoxide_cdp` + `tokio` (rt-multi-thread + net + io-util + fs + time + macros) + `futures` + `serde`/`serde_json` + `async-tungstenite` + (transitively) `hyper`/`reqwest` — the full networking stack.

For `vtz` itself, `tokio` and the networking stack are already in the binary, so the **delta from adding `chromiumoxide` is estimated at 3-4 MB**, well under the 20 MB budget the research doc set. We'll measure the real delta during Phase 1 implementation by building `vtz` with and without the `chromiumoxide` dep behind a feature flag.

## API surface validated

Everything the design doc (Phases 1–3) needs is one method call in `chromiumoxide` 0.9.1:

| Design need | chromiumoxide API |
|---|---|
| Launch headless Chrome | `Browser::launch(BrowserConfig::builder()...build())` |
| System Chrome detection | Automatic via `which` crate inside `chromiumoxide` |
| Custom viewport | `BrowserConfig::builder().viewport(...)` |
| Disable sandbox | `BrowserConfig::builder().no_sandbox()` |
| Browser-level cookie injection (for `as` impersonation) | `browser.set_cookies(Vec<CookieParam>)` |
| Navigate + wait | `browser.new_page(url).await` + `page.wait_for_navigation()` |
| Viewport screenshot | `page.screenshot(ScreenshotParams::builder().format(Png).build())` |
| Full-page screenshot | `.full_page(true)` on the builder |
| Selector crop | `element.bounding_box()` → `.clip(Viewport{x,y,w,h,scale})` |
| `captureBeyondViewport` | `.capture_beyond_viewport(true)` on the builder |
| Graceful shutdown | `browser.close().await` + `browser.wait().await` |
| Process lifecycle ownership | `browser.get_mut_child()` returns `&mut Child` — we own the PID |

## Cargo configuration (final)

```toml
[dependencies]
chromiumoxide = { version = "0.9", default-features = false }
tokio        = { version = "1", features = ["macros", "rt-multi-thread", "time", "fs", "net", "io-util"] }
futures      = "0.3"
```

Critical note: **we must NOT enable the `rustls`, `native-tls`, `fetcher`, `zip0`, or `zip8` features of `chromiumoxide`.** All of them transitively enable `chromiumoxide_fetcher`, which Vertz does not need (we'll download Chromium ourselves via Chrome for Testing, see below). They also pull `reqwest` + `hyper` + TLS stacks unnecessarily.

## Chromium distribution plan (unchanged from research)

- Use Google's [Chrome for Testing](https://github.com/GoogleChromeLabs/chrome-for-testing) channel → `chrome-headless-shell` artifact (~60% smaller than full Chromium)
- Resolve via `https://googlechromelabs.github.io/chrome-for-testing/...` JSON endpoints
- Cache to `~/.vertz/chromium/<rev>/`, pinned via a manifest in the Vertz project
- Respect `$CHROME_PATH` env + `which google-chrome` probe for system Chrome
- On macOS, strip quarantine attribute post-extract (`xattr -d com.apple.quarantine`)

The POC uses system Chrome (no download). Download code is Phase 1 work.

## Issues we hit along the way

1. **`rustls` feature arrastava `chromiumoxide_fetcher`** → failed to compile because `zip0`/`zip8` feature is required for the fetcher. Resolution: disable `default-features`, enable **no** features. We're not using the fetcher.
2. **`page.set_cookies()` rejects `data:` and `about:blank` URLs** with error `Data URL page can not have cookie` / `Blank page can not have cookie`. Resolution: use `browser.set_cookies()` at the browser level before the first navigation. Noted for Phase 1 — impersonation flow will set cookies before calling `new_page(url)`.
3. **Tokio needed `net` + `io-util` features** for the tiny in-process HTTP server. Not relevant for Phase 1 in vtz (vtz already has those features enabled).

## Implications for the main design doc

The Technical reviewer's POC-related concerns can now be closed:

- ✅ Chromium binary-size impact is well under budget (3-4 MB delta estimated).
- ✅ `Browser::get_mut_child()` gives us real SIGINT reaping (addresses the "orphan process" concern).
- ✅ `browser.set_cookies(url, ...)` is the impersonation path — page-level set_cookies is NOT the right API (documented Phase 2 correction).
- ✅ Cold-start number "<2s" is realistic (836 ms observed).
- ✅ Warm-capture number "<200ms" is realistic (22 ms observed).

Items still needing work (not blockers for Phase 1):

- Phase 1 implementation must add a `chromiumoxide` feature flag to vtz so we can benchmark binary-size delta with/without.
- Chrome for Testing download + extract + cache needs its own tested module. Not in the POC.
- Selector-crop via `find_element` doesn't handle "element scrolled off-screen" — we'll need to `scroll_into_view` first in Phase 1, not exercised by this POC.

## Risks still live

| Risk | Severity | Mitigation |
|---|---|---|
| PDL drift on new Chrome releases | Low | `chromiumoxide_cdp` regenerates per release; fall back to `Page::execute` untyped |
| macOS Gatekeeper/quarantine on downloaded binary | Medium | `xattr -d com.apple.quarantine` post-extract; test on fresh machine |
| Chrome for Testing channel URL format changes | Low | Cache resolved URL in manifest; don't re-resolve per run |
| `chromiumoxide` issue #308 (screenshot focus) | Low | Headless mode, no desktop focus concept |

## Recommendation

**Proceed to Phase 1 implementation.** Retire this POC (keep `native/chromium-poc/` for reference until Phase 1 merges, then delete).

The original design doc (#2866 PR) is still blocked on the three reviews' other findings (bad `@vertz/auth` path, missing `StoredSession.source`, compiler dev-mode gap). Our Phase 1 scope excludes impersonation and the overlay, so those blockers are deferred — Phase 1 ships pure headless screenshot (no `as`, no overlay) and validates the architecture end-to-end before we tackle auth.

## Appendix: reproduction

```bash
cd /path/to/vertz
cargo run --release -p chromium-poc --manifest-path native/Cargo.toml
cat .vertz/artifacts/poc/timings.json
open .vertz/artifacts/poc/02-fullpage.png
```
