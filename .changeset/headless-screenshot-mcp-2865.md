---
'@vertz/runtime': patch
'@vertz/create-vertz-app': patch
---

feat(vtz): `vertz_browser_screenshot` MCP tool — headless pixel-perfect PNG of any dev-server route

Closes Phase 1 of [#2865](https://github.com/vertz-dev/vertz/issues/2865).

New MCP tool exposed by every `vtz dev` session (no flags, no setup):

```
vertz_browser_screenshot({
  url: '/tasks',                              // path or same-origin URL
  viewport?: { width: 375, height: 667 },     // default 1280x720
  fullPage?: true,                            // default false
  crop?: '.my-component',                     // or { text | name | label: string }
  waitFor?: 'networkidle',                    // or 'domcontentloaded' | 'load'
})
```

Returns two MCP content blocks: the base64 PNG (rendered inline in the agent's UI) plus JSON metadata with `path`, `url`, `dimensions`, `pageUrl`, and `capturedInMs`. PNGs persist to `.vertz/artifacts/screenshots/` and are served via `GET /__vertz_artifacts/screenshots/:filename` so humans can click the metadata URL to open the image.

Architecture:

- **`server::screenshot::fetcher`** — probes `$VERTZ_CHROME_PATH` and common system paths (`/Applications/Google Chrome.app`, `/usr/bin/google-chrome`, `/usr/bin/chromium`). Falls back to Chrome for Testing JSON index + SHA-256 verified download into `~/.vertz/chromium/` (or `$XDG_CACHE_HOME` / `$TMPDIR` if `$HOME` is read-only). Multi-process-safe via `fs2::try_lock_exclusive` on `<cache_dir>/.lock`; partial extractions are cleaned up on failure via a scope guard.
- **`server::screenshot::pool`** — lazy + TTL (60s) browser pool around a `BrowserSpawner` trait. Concurrent captures during launch share a `futures::Shared` future (exactly one Browser per cold start). Warm captures run concurrently through a `tokio::sync::RwLock` on the handle — `close()` takes the write guard so TTL-triggered teardown waits for in-flight captures instead of interrupting them.
- **`server::screenshot::chromium`** — production `BrowserSpawner` wrapping `chromiumoxide::Browser`. Handler task is abort-owned by the handle; `close()` is bounded to 2s via `tokio::time::timeout` so a wedged Chrome child can't block server shutdown.
- **`server::screenshot::capture_tool`** — MCP entrypoint. Validates URL (same-origin only, rejects external and protocol-relative), normalizes paths to `http://localhost:PORT/...`, detects AUTH_REQUIRED by matching the final URL's last segment against `login`/`signin`/`sign_in`/`sign-in`/`signup`/`sign_up`/`sign-up`/`authenticate`/`session/new` (returns the redirect finalUrl so the agent can audit), persists the PNG through `server::screenshot::artifacts`, and maps `PoolError` variants to MCP error codes (`URL_INVALID`, `CHROME_LAUNCH_FAILED`, `NAVIGATION_FAILED`, `SELECTOR_INVALID`, `SELECTOR_NOT_FOUND`, `CAPTURE_FAILED`, `AUTH_REQUIRED`).

Safety posture:

- Download path enforces a 500 MB cap checked against `Content-Length` AND the running stream total — a hostile server can't OOM `vtz`.
- `expected_sha256` must be 64 lowercase hex chars up front; empty / malformed SHAs can't accidentally disable integrity enforcement.
- Zip extraction uses `enclosed_name()` for path traversal + explicit `S_IFLNK` check to reject symlink entries; file-type bits are masked off before `set_permissions`.
- Artifact HTTP route uses a strict allowlist: `^[A-Za-z0-9._-]+\.png$`, no leading dot, no `..`, no path traversal. Returns 404 on any mismatch (no existence leaks).
- `remove_quarantine` uses absolute `/usr/bin/xattr` to defeat PATH injection on macOS.

Template + docs:

- `@vertz/create-vertz-app`'s generated `.claude/rules/dev-server-tools.md` now documents the tool with the canonical patterns (default route, multi-viewport for layout, CSS/text-match crops) and an explicit "when to skip" clause so agents don't screenshot pure backend changes.
- Public Mintlify docs at `/guides/dev-server-tools` gained a full `vertz_browser_screenshot` reference section: examples, parameter table, error codes, scope limits, artifact naming.

Phase 1 scope deliberately excluded: impersonation / auth-aware capture, visual regression diffing, non-Chromium browsers, Windows support, overlay / human-to-agent visual feedback. Tracked as future issues.

Linux E2E CI job runs the pool + spawner against a real Chrome on every `native/**` change. macOS E2E deferred — `browser-actions/setup-chrome@v1` on Apple Silicon hangs at first launch (Gatekeeper / quarantine on the installed Chrome.app). Tracked as a follow-up.
