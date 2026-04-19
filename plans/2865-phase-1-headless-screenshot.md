# Phase 1 — Headless Screenshot MCP Tool

> **Issue:** [#2865](https://github.com/vertz-dev/vertz/issues/2865)
> **Status:** Design Draft — awaiting three sign-offs (DX, Product, Technical) + user approval
> **Supersedes the Phase-1 scope of:** [`plans/2865-agent-visual-handoff.md`](./2865-agent-visual-handoff.md) (vision/full-roadmap doc — Phases 2–5 still live there)
> **POC evidence:** [`plans/2865-chromium-poc-results.md`](./2865-chromium-poc-results.md)
> **Author:** Matheus Poleza
> **Date:** 2026-04-19

## What this doc delivers

One new MCP tool: `vertz_browser_screenshot({ url, viewport?, fullPage?, target?, waitFor? })`. Headless `chromiumoxide`, lazy+TTL pool, Chrome for Testing download, artifacts in `.vertz/artifacts/screenshots/`, PNG returned as both MCP image content and local file URL. **No authentication, no overlay, no compiler changes, no current-tab capture, no Windows support.** Those live in future issues when their dependencies mature.

## Why just this

The original design doc at `plans/2865-agent-visual-handoff.md` tried to ship 5 phases at once. Three adversarial reviews converged on:

- `@vertz/auth` does not exist at the claimed path (auth lives in `packages/server/src/auth/`) — blocks impersonation scope
- `StoredSession.source` field does not exist — blocks impersonation scope
- Compiler has no dev/prod mode — blocks overlay scope (`data-vertz-source` stamp)
- Scope too large — reviewer Product explicitly recommended shrinking v1

Phase 1 as defined here has **none** of those blockers. It ships value on its own (pixel-level sight for agents on public routes), dogfoods the architecture end-to-end against the existing Vertz showcase apps, and earns the right to spec Phases 2–5 from real usage data.

## Goals

1. Agents can capture a pixel-perfect PNG of any URL via a single MCP tool.
2. The tool works against any route the dev server already serves (no setup from the dev).
3. First screenshot of a fresh machine completes in under 10 s (includes Chrome for Testing download). Subsequent captures under 500 ms.
4. Zero observable cost when the tool is never called (no browser launched, no RAM held).
5. An LLM using only the tool's description from the MCP catalog can call it correctly on the first try.
6. Screenshots persist to `.vertz/artifacts/screenshots/` as real demo evidence (gitignored).

### Measurable success criteria

Phase 1 is successful when all of:

- **P1. Warm-call latency.** `vertz_browser_screenshot({ url: '/' })` returns a valid PNG in under 2000 ms on a cached Chrome. **Measured in:** the E2E test (Task 8) asserts `capturedInMs < 2000`; CI fails if regressed.
- **P2. Cold-call latency with local Chrome.** First call with Chrome already on disk (e.g. system Chrome detected) returns in under 3000 ms. **Measured in:** same E2E test.
- **P3. First-ever-call latency bound.** On a machine without a cached Chrome, first call completes in under 30 seconds on a 20+ Mbps connection (Chrome for Testing headless-shell is ~80 MB). If connection is slower, tool emits a progress event to `/__vertz_diagnostics` at least every 500 ms; no timeout fires before 300 s. **Measured in:** Task 8 CI job downloads fresh, asserts ≤30 s end-to-end.
- **P4. Zero config default.** `npx create-vertz-app my-app && cd my-app && vtz dev` + MCP connect produces a working screenshot with no flags, no env vars, no `.vertz/config`. **Measured in:** scaffold test in `packages/create-vertz-app` generates a project, starts the server, issues one MCP call.
- **P5. Dogfooding — concrete.** **Owner:** Matheus Poleza. **Target:** the `linear-clone` showcase, specifically the kanban-board work in `plans/linear-clone-kanban-board.md`. **Pass/fail:** three consecutive PRs touching `.tsx` in `apps/linear-clone/` include a screenshot artifact link in the PR body (produced by the agent, referencing `.vertz/artifacts/screenshots/…`). **Evaluated at:** the end of the Phase 1 implementation branch, before the Phase 1 feature PR merges to main.
- **P6. LLM-first test.** Given **only** the MCP catalog, a fresh Claude Opus/Sonnet agent session answers "take a screenshot of the home page and describe what you see" with one correct tool call and one image observation. **Harness:** `native/vtz/tests/llm_first_screenshot.rs` runs this against the Anthropic API using a stable prompt; runs on the Phase 1 acceptance branch (not CI — costs API credits — manual gate).
- **P7. No regression in existing MCP tools.** The 20 existing tools in `native/vtz/src/server/mcp.rs` continue to pass their existing tests unchanged. **Measured in:** `cargo test -p vtz` green.

Criteria P1, P2, P4, P7 are CI-gated. P3 is CI-gated on a cold runner. P5 is a branch-merge gate owned by Matheus. P6 is a manual pre-merge check.

## Non-Goals

The following are explicitly **out of scope for Phase 1** and tracked as future issues:

- **Impersonation / auth-aware capture.** Public routes only in Phase 1. Future phase once `@vertz/auth` (currently in `packages/server/src/auth/`) consolidates its session-minting API.
- **Human-to-agent visual feedback / overlay.** No overlay injection, no `data-vertz-source` compiler stamp, no `Cmd+Shift+F` flow, no `vertz_get_user_feedback` tool.
- **Current-tab / client-side screenshot** (`vertz_browser_screenshot_current`). No `html2canvas`, no browser hub extension.
- **Visual regression CI / golden file diffs.**
- **Non-Chromium browsers** (Firefox, WebKit).
- **Windows support.** No Windows-specific Chrome detection, no quarantine-equivalent, no CI coverage. macOS and Linux only. Windows users can run through WSL.
- **Multi-viewport batch capture** (`viewport: 'both'`, `theme: 'both'`). Phase 1 has one viewport per call.
- **Production deployment of the tool.** Tool handler is compiled out of release builds of `vtz`.

## API Surface

### New MCP tool: `vertz_browser_screenshot`

```ts
// Request schema (matches MCP tool JSON schema)
type VertzBrowserScreenshotArgs = {
  /** Route to capture. Required. Must be a path ("/", "/tasks") or same-origin URL — external hosts are rejected. */
  url: string;
  /** Viewport size. Default: { width: 1280, height: 720 }. */
  viewport?: { width: number; height: number };
  /** If true, captures the full scrollable page (captureBeyondViewport). Default: false. */
  fullPage?: boolean;
  /**
   * Element locator to crop the screenshot to a single element.
   * Accepts the same shapes as vertz_browser_click's `target`:
   *   - CSS selector string: `".my-component"` or `"#submit"`
   *   - Text/name/label object: `{ text: "Save" }` | `{ name: "email" }` | `{ label: "Email" }`
   * Note: Phase 1 does NOT accept browser-hub `ref=` strings — those are scoped
   * to the connected-browser session, which this tool does not share.
   */
  target?: string | { text: string } | { name: string } | { label: string };
  /**
   * When to take the screenshot. Default: "networkidle".
   *   - "domcontentloaded": fires when DOM is parsed, ignores async data
   *   - "networkidle": waits for no network requests for 500ms (recommended default — catches query() resolution)
   *   - "load": fires on window.load (includes images, fonts)
   */
  waitFor?: 'domcontentloaded' | 'networkidle' | 'load';
};

// Response = MCP content blocks: [image, text]
type VertzBrowserScreenshotResponse = {
  content: [
    { type: 'image'; data: string /* base64 PNG */; mimeType: 'image/png' },
    { type: 'text'; text: string /* stringified VertzBrowserScreenshotMeta */ },
  ];
};

type VertzBrowserScreenshotMeta = {
  /** Absolute path to the saved PNG on disk. */
  path: string;
  /** Local dev-server URL to retrieve the PNG. Uses the existing static-artifact server. */
  url: string;
  /** Dimensions of the captured image. */
  dimensions: { width: number; height: number };
  /** Final URL after redirects. */
  pageUrl: string;
  /** Wall-clock duration of the capture. */
  capturedInMs: number;
};
```

### Error contract

Every failure returns a structured error (MCP `isError: true`) with a discriminated `code`:

```ts
type VertzBrowserScreenshotError =
  // Chromium lifecycle
  | { code: 'CHROME_LAUNCH_FAILED'; message: string; hint?: string }
  | { code: 'CHROME_DOWNLOAD_FAILED'; message: string; url: string }
  // Navigation
  | { code: 'NAVIGATION_FAILED'; message: string; url: string }
  | { code: 'NAVIGATION_TIMEOUT'; message: string; url: string; timeoutMs: number }
  | { code: 'PAGE_HTTP_ERROR'; message: string; url: string; status: number }
  | { code: 'PAGE_JS_ERROR'; message: string; url: string; errors: Array<{ text: string; source?: string }> }
  // The big one — never lie to the agent about a login screen
  | {
      code: 'AUTH_REQUIRED';
      message: string;
      url: string;
      /** Heuristics hit: any of URL-based (redirect to /login, /signin, /auth/*), DOM-based (<input type="password">), or status (401/403). */
      detectedBy: Array<'redirect' | 'password-input' | 'http-status'>;
      /** Final URL after redirect, so the agent can choose to capture the login screen if they really want. */
      finalUrl: string;
    }
  // Target resolution
  | { code: 'SELECTOR_INVALID'; message: string; target: unknown }
  | { code: 'SELECTOR_NOT_FOUND'; message: string; target: unknown }
  | { code: 'SELECTOR_AMBIGUOUS'; message: string; target: unknown; matchCount: number }
  // Inputs
  | { code: 'URL_INVALID'; message: string; reason: 'not-same-origin' | 'malformed' | 'external' }
  | { code: 'VIEWPORT_INVALID'; message: string; hint: string }
  // I/O
  | { code: 'CAPTURE_FAILED'; message: string }
  | { code: 'ARTIFACT_WRITE_FAILED'; message: string; path: string };
```

- `hint` on `CHROME_LAUNCH_FAILED` points the agent at the download log path; if the user explicitly disabled capture via config, the hint says which config key. No `--no-screenshot` flag exists (see "Pool lifecycle" below — flags were removed).
- **`AUTH_REQUIRED` is non-optional detection** — a screenshot of a login screen returned as "success" would silently mislead the agent. The heuristics fire on any of: redirect to a path matching `/(login|signin|signup|auth/.*)/`, presence of `<input type="password">` in the final DOM, or HTTP 401/403. If the agent *wants* the login screen PNG, they re-request with `allowAuthPage: true` (v2 flag; v1 never returns login-screen PNGs as success).

### Tool description (what the LLM actually reads)

The description is a hard constraint from Principle #3 — it is the only documentation the LLM sees when choosing which tool to call. Final wording:

```
Capture a pixel-perfect PNG screenshot of a route served by this dev server.
Returns the image inline (the agent sees it) plus a local file path and
URL (for follow-up replies, diffs, or sharing with a human).

Scope:
- Same-origin only. URL must be a path ("/tasks") or a URL on the dev
  server's host. External hosts return URL_INVALID.
- Public routes only in v1. If the route requires auth, this tool
  returns AUTH_REQUIRED (does NOT silently screenshot the login screen).
  Authenticated-route capture ships in a later phase.
- Does NOT share session, cookies, or state with the vertz_browser_*
  connected-tab tools. Each call launches an isolated context.

Use cases:
- Verify a UI change rendered correctly after editing a .tsx
- Show a human before/after of a fix
- Capture a full scrollable page with fullPage: true
- Check layout at mobile (375x667) and desktop (1280x720)
- Crop to a single component via target: ".my-class" or { text: "Save" }

Tips:
- Default waitFor is "networkidle" — catches query() resolution. Use
  "domcontentloaded" only when you explicitly want to see loading state.
- The returned MCP image block renders inline in the agent's UI. The
  `url` metadata field is a local dev-server link — share it with
  humans, they can click it.
```

The "Does NOT share session" sentence is the disambiguator against `vertz_browser_*` tools. The AUTH_REQUIRED line is the LLM-safety rail — the tool never silently returns a login-screen PNG as success.

### Dev-server additions

Beyond the MCP tool registration, the dev server exposes:

| Route | Method | Purpose |
|---|---|---|
| `GET /__vertz_artifacts/screenshots/{name}.png` | GET | Serves saved PNGs by name (for the `url` field in metadata) |
| `GET /__vertz_diagnostics` | (existing) | Extend to include `screenshotPool: { status: 'idle' \| 'warm' \| 'disabled', capturesSinceStart: N }` |

No new WebSocket events in Phase 1.

### `.claude/rules/dev-server-tools.md` (template update)

Append a new section to the generated rule:

```markdown
### Visual verification with screenshots

Before claiming a UI change is complete, call:

    vertz_browser_screenshot({ url: '<the-affected-route>' })

Compare the returned image against what the task asked for.

Multi-viewport check for layout changes:
    vertz_browser_screenshot({ url: '<route>', viewport: { width: 375, height: 667 } })   // mobile
    vertz_browser_screenshot({ url: '<route>', viewport: { width: 1280, height: 720 } })  // desktop

Component-isolated check:
    vertz_browser_screenshot({ url: '<route>', target: '.my-component' })      # CSS
    vertz_browser_screenshot({ url: '<route>', target: { text: 'Save' } })      # text match

Screenshots save to .vertz/artifacts/screenshots/ — these are working artifacts,
reference them in your replies to the human.
```

## Architecture

### POC evidence (what is no longer theoretical)

All of these were validated in the `poc/chromium-client` branch and are NOT open questions:

- `chromiumoxide` 0.9.1 with `default-features = false` is the correct dep choice.
- `Browser::launch`, `browser.set_cookies`, `page.screenshot` with viewport/fullPage/target (via `find_element` + `bounding_box` → `clip`), graceful `close` + `wait` — every API call we need is one method.
- Release-build numbers: cold start 836 ms, viewport capture 37 ms, warm 22 ms. All well under the targets.
- Binary delta vs vtz without the dep is estimated 3–4 MB; measurement in Task 6.
- Chrome for Testing headless shell is the right Chromium distribution strategy.

### Component map (Phase 1 only)

```
native/vtz/src/server/
├── mcp.rs                    # register vertz_browser_screenshot tool
├── http.rs                   # add GET /__vertz_artifacts/screenshots/{name}.png
├── diagnostics.rs            # extend with screenshotPool status
└── screenshot/               # NEW
    ├── mod.rs                # public module API
    ├── pool.rs               # lazy + TTL Chromium pool
    ├── chromium.rs           # chromiumoxide wrapper (launch, navigate, capture)
    ├── fetcher.rs            # Chrome for Testing download + unpack + cache
    └── artifacts.rs          # disk persistence + naming

packages/create-vertz-app/src/
└── templates/index.ts        # extend dev-server-tools.md rule
```

### Lazy + TTL pool

**No flags.** The pool is always enabled. Per principle #2 "one way to do things" and Goal P4 "zero config", Phase 1 does NOT expose `--no-screenshot` or `--screenshot-pool=always` CLI flags. The pool self-manages: zero cost when unused (no Browser launched), warm on use, TTL'd back to idle.

Phase 1 lifecycle (state machine — 4 states, not 3):

```
┌──────┐  first call arrives
│ Idle │──────────────────────────┐
└──────┘                          ▼
    ▲                      ┌───────────┐
    │ TTL expires (60s)    │ Launching │◄──┐
    │ Browser::close       └───────────┘   │
    │                            │         │ concurrent calls during
    │                            │         │ launch → await the same
    │                            ▼         │ in-flight launch future
    │                      ┌──────────┐    │ (do NOT spawn a 2nd Browser)
    └──────────────────────│   Warm   │────┘
       after call, reset   └──────────┘
       TTL timer

on vtz dev SIGINT/SIGTERM (all states):
  ├── cancel in-flight Launching future
  ├── Browser::close() with 2 s timeout (via tokio::time::timeout)
  ├── if still alive → Browser::kill()
  ├── await Browser::wait() to reap the child
  └── pool integrates with the existing `with_graceful_shutdown`
      watch channel in native/vtz/src/server/http.rs
      (does NOT install its own ctrl_c handler)
```

**Concurrency during Launching:** the state holds a `tokio::sync::OnceCell<Browser>` (or equivalent `BroadcastRx` over a "browser is ready" signal). Concurrent `capture` calls arriving in `Launching` await the same cell, then all proceed against the single Browser. No second Chromium process is spawned.

**Cold-start reference (POC):** ~850 ms on Apple Silicon with system Chrome. On Linux CI runners, expect 1.2–1.8 s (verified in Task 8).

**Chrome download (first-ever launch only):** Progress surfaces via `/__vertz_diagnostics` `screenshotPool` field at least every 500 ms. If the Idle → Launching transition hasn't reached "chrome downloaded" within 300 s, the tool returns `CHROME_DOWNLOAD_FAILED`.

**Rationale for dropping the flags (resolves Product blocker):** the only legitimate case for `--no-screenshot` was "my machine can't run Chrome." That's already handled by `CHROME_LAUNCH_FAILED`, which is returned per-call — no global flag needed. The `--screenshot-pool=always` flag was cargo-culted from Playwright; the lazy+TTL pool with warm reuse already gives us sub-100 ms warm captures (POC measured 22 ms), so pinning is a micro-optimization not worth the #2 violation.

### Chrome for Testing download

Resolution algorithm on first launch (all in `screenshot/fetcher.rs`):

1. Check `$VERTZ_CHROME_PATH` env → if set and executable, use it.
2. Probe common system paths (`/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`, `/usr/bin/google-chrome`, `/usr/bin/chromium`) — the `which`-crate path used internally by chromiumoxide.
3. If none found, download `chrome-headless-shell` for the current platform from the JSON index at `https://googlechromelabs.github.io/chrome-for-testing/last-known-good-versions-with-downloads.json`.
4. Unpack into `~/.vertz/chromium/<chrome-rev>/`. SHA-256 verify against the index.
5. On macOS: `xattr -d com.apple.quarantine` post-extract to avoid Gatekeeper prompts.
6. Cache the resolved path in `~/.vertz/chromium/current.json` with `{ rev, path, downloadedAt }`. Subsequent runs skip re-resolution unless forced.

Not in Phase 1: auto-updating the revision when a new Chrome ships. One revision, pinned at Phase 1 release, bumped manually.

### BrowserSpawner trait (test seam)

The pool depends on a trait, not directly on `chromiumoxide`. Unit tests use a fake spawner; integration tests use the real one. Signatures:

```rust
use async_trait::async_trait;

#[derive(Debug, Clone)]
pub struct LaunchConfig {
    pub viewport: (u32, u32),
    pub chrome_path: Option<std::path::PathBuf>,
}

#[derive(Debug, Clone)]
pub struct CaptureRequest {
    pub url: String,
    pub viewport: (u32, u32),
    pub full_page: bool,
    pub target: Option<TargetSpec>,
    pub wait_for: WaitCondition,
}

#[derive(Debug, Clone)]
pub enum TargetSpec {
    Css(String),
    Text(String),
    Name(String),
    Label(String),
}

#[derive(Debug, Clone, Copy)]
pub enum WaitCondition {
    DomContentLoaded,
    NetworkIdle,
    Load,
}

#[derive(Debug, Clone)]
pub struct PageMeta {
    pub final_url: url::Url,
    pub dimensions: (u32, u32),
}

#[async_trait]
pub trait BrowserSpawner: Send + Sync + 'static {
    async fn launch(&self, config: LaunchConfig) -> Result<Box<dyn BrowserHandle>, crate::screenshot::Error>;
}

#[async_trait]
pub trait BrowserHandle: Send + Sync {
    async fn capture(&mut self, req: CaptureRequest) -> Result<(Vec<u8>, PageMeta), crate::screenshot::Error>;
    async fn close(&mut self) -> Result<(), crate::screenshot::Error>;
}
```

Production impl: `ChromiumoxideSpawner` wraps `chromiumoxide::Browser::launch`. Test impl: `FakeSpawner` returns canned 1x1 PNG bytes and can be configured to inject `NAVIGATION_TIMEOUT`, `SELECTOR_NOT_FOUND`, `AUTH_REQUIRED`, etc.

The trait is deliberately narrow — no generic lifetimes, no associated types, no `'static` impls needed beyond `Send + Sync`. The `Box<dyn BrowserHandle>` return type avoids trait-object-vs-generic complexity in the pool.

### Artifact persistence

Every call writes exactly one file. Naming:

```
.vertz/artifacts/screenshots/<UTC-iso>-<slug>-<viewport>.png
```

- `<UTC-iso>` like `2026-04-19T14-23-05Z`
- `<slug>` = url slugified (e.g. `/tasks/123` → `tasks-123`), empty for `/`
- `<viewport>` = `1280x720` or `full` when `fullPage=true`

Rationale: files are lexicographically sortable (latest last), name encodes enough to browse manually.

`.vertz/` is already in the project `.gitignore` template (verified: `create-vertz-app` outputs `.vertz/` at line 130 of `scaffold.ts` helper). No new gitignore entries needed.

### Serving artifacts as URLs

New handler in `http.rs`:

```
GET /__vertz_artifacts/screenshots/<filename>.png
```

- 200 with `Content-Type: image/png` + `Cache-Control: no-store` if file exists
- 404 otherwise
- Filename is sanitized — must match `^[A-Za-z0-9._-]+\.png$`, no path traversal, no directory access

This is the URL returned in `VertzBrowserScreenshotMeta.url`. A human clicking it in a chat message opens the PNG directly.

## Manifesto alignment

| Principle | Phase 1 posture |
|---|---|
| #1 "If it builds, it works" | MCP tool schema is typed; error variants are a discriminated union. Impossible to call the tool with wrong shape and have it "mostly work." |
| #2 "One way to do things" | Exactly one tool, one pool strategy (no flags to toggle it — removed `--no-screenshot` and `--screenshot-pool`), one artifact location, one screenshot format (PNG). The `target` param accepts the same shapes as `vertz_browser_click` — no divergent locator dialect. |
| #3 "AI agents are first-class users" | Tool description is the LLM-facing API. Short, specific, includes when-to-use cases. Non-goal rail ("public routes only") in the description. |
| #4 "Test what matters, nothing more" | Unit tests for: pool state machine, artifact naming, fetcher resolution path, error code mapping. Smoke E2E test for: tool returns valid PNG. No pixel-diff. |
| #5 "If you can't test it, don't build it" | Pool is testable with a `trait BrowserSpawner` mock. Fetcher is testable with a fake HTTP server. MCP tool is testable by calling it directly. |
| #6 "If you can't demo it, it's not done" | Demo **is** the output — the PNG. Every PR closing a Phase 1 task attaches a screenshot artifact. |
| #7 "Performance is not optional" | Zero cost when unused (no Browser launched, no RAM). Warm capture <50 ms on the measured hardware. |
| #8 "No ceilings" | We don't accept `html2canvas` fidelity, don't accept Playwright-over-Node indirection. Native Rust CDP client, full control, own the Chrome process. |

## Unknowns (mostly closed after POC)

| Unknown | Status |
|---|---|
| Rust Chromium client choice | ✅ **Resolved** — `chromiumoxide` 0.9.1 |
| Binary size impact on `vtz` | ⏳ **Gated by Task 2 (decision gate)** — POC estimates 3–4 MB delta. Measurement via `ls -la target/release/vtz` (before/after); `cargo bloat` for attribution. Decision tree in Task 2. |
| Chrome for Testing channel URL stability | ✅ **Resolved** — cache resolved URL in `current.json`, don't re-resolve per run |
| macOS Gatekeeper/quarantine on downloaded binary | ⏳ **Needs verification on fresh machine** — covered by Task 3 acceptance criteria (macOS E2E job in Task 8) |
| Chromium cold start on Linux CI runners | ⏳ **Verified in Task 8** — POC only ran on Apple Silicon. Task 8 adds `ubuntu-latest` + `macos-latest` runners |
| Windows support | ❌ **Out of scope** — no Windows-specific Chrome detection path, no `xattr` equivalent needed, and no CI coverage. Documented in Non-Goals. |
| `~/.vertz/` unwritable on CI | ⏳ **Addressed by Task 3 fallback** — retries `$XDG_CACHE_HOME/vertz` then `$TMPDIR/vertz`; test coverage in Task 3 acceptance criteria |

None are design-level unknowns. All are verification items on specific tasks.

## POC Results

**Status: Complete** — see [`plans/2865-chromium-poc-results.md`](./2865-chromium-poc-results.md) for full report. Summary:

- Crate choice validated
- API coverage validated
- Timings measured: cold start 836 ms (target <2000 ms), warm capture 22 ms (target <200 ms)
- Binary delta estimated 3–4 MB (target <20 MB)
- Chrome cookie-origin constraint discovered (use browser-level cookies before `new_page`, not `page.set_cookies` on an already-loaded page) — documented for future Phase 2 impersonation work

## Type Flow Map

Every typed parameter traced from the MCP tool boundary to its consumption site.

```
VertzBrowserScreenshotArgs.url: string
    ↓ (MCP JSON Schema validation, serde deserialize)
ScreenshotRequest { url: String, ... }
    ↓
pool.capture(req) → selects/launches Browser
    ↓
page.goto(url) → chromiumoxide::Page
    ↓
capture returns Vec<u8> + PageMeta { final_url: Url }
    ↓
artifacts.persist(png_bytes, meta) → (path, url)
    ↓
VertzBrowserScreenshotMeta { path, url, dimensions, pageUrl, capturedInMs }
    ↓
MCP content blocks [image, text]
```

Every field of `VertzBrowserScreenshotArgs` is consumed at exactly one site. No dead generics, no variants that land in `_`.

```
viewport: { width, height } → BrowserConfig::builder().viewport(...) (pool pre-launch)
                            OR Page.set_viewport(...) (if pool is warm with different viewport)
fullPage: bool              → ScreenshotParams::builder().full_page(true)
                            AND artifact slug `<viewport>` becomes "full"
target: string | {text} | {name} | {label}
                            → TargetSpec::{Css|Text|Name|Label}  (Rust enum)
                            → page.find_element(locator) → bounding_box → ScreenshotParams.clip
                            OR SELECTOR_NOT_FOUND | SELECTOR_AMBIGUOUS | SELECTOR_INVALID
waitFor: enum                → WaitCondition (Rust enum)
                            → page.wait_for_navigation(NetworkIdle | DomContentLoaded | Load)
```

`.test-d.ts` tests planned:
- `VertzBrowserScreenshotArgs` accepts each valid shape; rejects extra keys; rejects wrong types on each field
- `VertzBrowserScreenshotMeta` `impersonatedAs` field is **absent** (reviewer caught this in the big doc; Phase 1 doesn't have it)
- `VertzBrowserScreenshotError` exhausts the discriminated union in switch

## E2E Acceptance Tests

BDD per `.claude/rules/bdd-acceptance-criteria.md`. These are the tests that must pass for Phase 1 to ship.

**Language and runner mapping:** Every scenario below implements as a Rust `#[tokio::test] async fn <snake_case_then_clause>` in `native/vtz/tests/screenshot_e2e.rs`. Not TypeScript, not vitest. The `describe/it` shape below is the specification; the actual file uses function names like `given_valid_url_when_called_then_returns_valid_png`. Tests use `FakeSpawner` for unit-style coverage and the real `ChromiumoxideSpawner` for end-to-end coverage (the latter gated with `#[ignore]` so it only runs in the dedicated CI job — see Task 8).

```typescript
describe('Feature: vertz_browser_screenshot', () => {
  describe('Given a Vertz dev server on a public route "/"', () => {
    describe('When the agent calls vertz_browser_screenshot({ url: "/" })', () => {
      it('then returns an MCP image content block with a valid PNG signature', () => {});
      it('then writes the PNG to .vertz/artifacts/screenshots/', () => {});
      it('then metadata.url resolves to a 200 at that local dev server', () => {});
      it('then metadata.dimensions equals the default viewport 1280x720', () => {});
      it('then metadata.capturedInMs is under 2000 on a warm pool', () => {});
    });
  });

  describe('Given a custom viewport 375x667', () => {
    describe('When the agent calls with viewport: { width: 375, height: 667 }', () => {
      it('then the captured PNG dimensions equal 375x667', () => {});
      it('then artifact filename includes "375x667"', () => {});
    });
  });

  describe('Given fullPage: true', () => {
    describe('When the route has content taller than the viewport', () => {
      it('then the captured PNG height exceeds the viewport height', () => {});
      it('then artifact filename includes "full"', () => {});
    });
  });

  describe('Given a valid CSS target pointing to a single element', () => {
    describe('When the agent calls with target: ".my-component"', () => {
      it('then the captured PNG dimensions match the element bounding box', () => {});
    });

    describe('When the target is { text: "Save" } and matches one button', () => {
      it('then the captured PNG is cropped to that button', () => {});
    });

    describe('When the target does not match any element', () => {
      it('then returns SELECTOR_NOT_FOUND error with the original target', () => {});
      it('then does not leave artifacts on disk', () => {});
    });

    describe('When the target CSS string is syntactically invalid', () => {
      it('then returns SELECTOR_INVALID error', () => {});
    });
  });

  describe('Given a machine without a cached Chrome binary', () => {
    describe('When the first tool call occurs', () => {
      it('then Chrome for Testing is downloaded and cached', () => {});
      it('then the call completes under 10000 ms (includes download)', () => {});
      it('then subsequent calls under 500 ms (reuses cache)', () => {});
    });

    describe('When the download fails (network off)', () => {
      it('then returns CHROME_DOWNLOAD_FAILED error with the attempted URL', () => {});
    });
  });

  describe('Given the pool has been idle for > TTL (60 s)', () => {
    describe('When a new tool call arrives', () => {
      it('then Chromium relaunches (cold start)', () => {});
      it('then the call completes under 3000 ms', () => {});
    });
  });

  describe('Given a route that redirects to /login', () => {
    describe('When the tool is called', () => {
      it('then returns AUTH_REQUIRED with detectedBy including "redirect"', () => {});
      it('then does NOT save a login-screen PNG as a success artifact', () => {});
      it('then metadata.finalUrl is the /login path', () => {});
    });
  });

  describe('Given a route with <input type="password"> in its body', () => {
    describe('When the tool is called', () => {
      it('then returns AUTH_REQUIRED with detectedBy including "password-input"', () => {});
    });
  });

  describe('Given a route that returns 500', () => {
    describe('When the tool is called', () => {
      it('then returns PAGE_HTTP_ERROR with status: 500', () => {});
    });
  });

  describe('Given a target that matches multiple elements', () => {
    describe('When the tool is called with target: ".card"', () => {
      it('then returns SELECTOR_AMBIGUOUS with matchCount', () => {});
    });
  });

  describe('Given an external URL "https://example.com"', () => {
    describe('When the tool is called', () => {
      it('then returns URL_INVALID with reason: "external"', () => {});
      it('then no Chromium launch occurs', () => {});
    });
  });

  describe('Given vtz dev is shutting down (SIGINT)', () => {
    describe('When Chromium is warm', () => {
      it('then Browser::close is called', () => {});
      it('then the Chromium child process exits within 2 s', () => {});
      it('then no orphan chrome-headless-shell process remains', () => {});
    });
  });
});
```

## Implementation plan — tasks

Per `.claude/rules/phase-implementation-plans.md`, max 5 files per task. Tasks are sequential; each builds on the previous.

**Ordering note:** The binary-size measurement is **Task 2** (not Task 6 as in the first draft). Rationale: adding `chromiumoxide` to `vtz/Cargo.toml` is a permanent dep-graph change. If the measurement shows >20 MB delta, we need to decide between feature-flag or dropping the whole approach — before we wire a pool that depends on `chromiumoxide`. Measuring first, deciding, then wiring is the only cheap rollback path.

### Task 1: `screenshot::artifacts` module
**Files:** 2
- `native/vtz/src/server/screenshot/mod.rs` (new, minimal scaffold + `pub mod artifacts;`)
- `native/vtz/src/server/screenshot/artifacts.rs` (new, includes unit tests)

**What:** Filename generation (`<iso>-<slug>-<viewport>.png`), disk write, atomic temp+rename, `.vertz/artifacts/screenshots/` creation. **No path sanitization here** — this module only receives filenames it generated itself; user-supplied path sanitization is Task 5's HTTP-route responsibility.

**Acceptance:**
- [ ] `build_filename(url, viewport, full_page)` produces lexicographically sortable names
- [ ] Url slugification collapses `..`, `/`, NUL, and non-ASCII to `-` (defence-in-depth on the generated slug)
- [ ] Two concurrent calls for the same logical filename resolve via an atomic `O_EXCL` create + millisecond-suffix disambiguation
- [ ] Write is atomic (temp-file + `rename`)
- [ ] 100% line coverage on this file

### Task 2: Binary size measurement + dep decision (gate)
**Files:** 1 (plus CI measurement log — not committed)
- `plans/2865-phase-1-binary-size.md` (new, report)

**What:** On a scratch branch, temporarily add `chromiumoxide = { version = "0.9", default-features = false }` to `native/vtz/Cargo.toml`. Build `vtz` release twice:

```bash
git stash                                                  # baseline
cargo build --release --manifest-path native/Cargo.toml -p vtz
BEFORE=$(stat -f%z native/target/release/vtz)              # bytes
git stash pop                                              # with chromiumoxide
cargo build --release --manifest-path native/Cargo.toml -p vtz
AFTER=$(stat -f%z native/target/release/vtz)
echo "delta: $(( (AFTER - BEFORE) / 1024 / 1024 )) MB"
```

`cargo bloat` (separately) to identify which crates dominate the delta — informational, not the measurement.

**Decision tree:**
- <10 MB delta → ship unconditionally, `chromiumoxide` is a plain `[dependencies]` entry
- 10–20 MB → add Cargo feature `screenshot` (default=on), gate `screenshot::` module behind it
- ≥20 MB → feature flag default=off, document opt-in, block the rest of Phase 1 pending a working dep trim or custom CDP client (see Unknowns table)

**Acceptance:**
- [ ] Report committed with before/after numbers and decision
- [ ] Decision reflected in `Cargo.toml` (stays in the scratch commit for Task 3 to pick up)
- [ ] `cargo bloat --release --manifest-path native/Cargo.toml -p vtz --crates` output captured in the report

### Task 3: `screenshot::fetcher` module
**Files:** 3
- `native/vtz/src/server/screenshot/fetcher.rs` (new)
- `native/vtz/src/server/screenshot/testdata/chrome-versions.json` (new, fixture for tests)
- `native/vtz/Cargo.toml` (modify — add `chromiumoxide` per Task 2's decision)

**What:** Resolve Chrome binary. Probe env (`$VERTZ_CHROME_PATH`) → system paths → fallback to Chrome for Testing download. SHA-256 verify. macOS quarantine removal (via `xattr` subprocess; failure to invoke xattr is non-fatal, logged). Result cached to `~/.vertz/chromium/current.json`.

**Fallback if `~/.vertz/` is read-only** (some CI runners): retry with `$XDG_CACHE_HOME/vertz/chromium/` → `$TMPDIR/vertz/chromium/`. Log the chosen path.

**Acceptance:**
- [ ] `$VERTZ_CHROME_PATH` takes precedence
- [ ] System Chrome detected on macOS (`/Applications/Google Chrome.app/...`) and Linux (`/usr/bin/google-chrome`, `/usr/bin/chromium`)
- [ ] Download resolves revision from fixture JSON; live calls against `googlechromelabs.github.io` are gated behind `#[ignore]` in tests
- [ ] SHA-256 mismatch returns `CHROME_DOWNLOAD_FAILED`
- [ ] Second invocation skips download, reads from `current.json`
- [ ] `wiremock` crate used for HTTP mocking in unit tests
- [ ] Read-only `$HOME` fallback exercised in a temp-dir test

### Task 4: `screenshot::chromium` + `pool`
**Files:** 3
- `native/vtz/src/server/screenshot/chromium.rs` (new — `ChromiumoxideSpawner`)
- `native/vtz/src/server/screenshot/pool.rs` (new — state machine + TTL)
- `native/vtz/src/server/screenshot/mod.rs` (modify — export `BrowserSpawner`, `BrowserHandle`, `Pool`)

**What:** `BrowserSpawner` and `BrowserHandle` traits (signatures in the Architecture section above). Real impl wraps `chromiumoxide::Browser::launch`. `Pool` holds `Arc<dyn BrowserSpawner>`, a `tokio::sync::Mutex<PoolState>` (states: Idle, Launching, Warm), a `tokio::sync::OnceCell<...>` for the in-flight launch future, and an idle-timer.

**Shutdown integration:** `Pool::install_shutdown(watch::Receiver<ShutdownSignal>)` subscribes to the existing `with_graceful_shutdown` watch channel in `native/vtz/src/server/http.rs`. Pool does NOT install its own `tokio::signal::ctrl_c` handler.

**Acceptance:**
- [ ] First call triggers Idle → Launching → Warm transition
- [ ] Concurrent calls during Launching await the same `OnceCell`; exactly one Browser is spawned (assert with `FakeSpawner` call-count)
- [ ] Post-TTL call relaunches (timer fires → Warm → Idle → next call triggers launch again)
- [ ] Shutdown signal cancels an in-flight Launching future
- [ ] Viewport/fullPage/target combinations each produce correct PNG (integration test in `native/vtz/tests/screenshot_integration.rs`, `#[ignore]`d because it spawns Chrome)
- [ ] `BrowserSpawner` trait allows mocking: `FakeSpawner` unit-tests cover pool state transitions without touching Chromium

### Task 5: MCP tool registration + `http.rs` artifact route
**Files:** 4
- `native/vtz/src/server/mcp.rs` (modify — register tool, add JSON schema, wire handler)
- `native/vtz/src/server/http.rs` (modify — add `/__vertz_artifacts/screenshots/:filename` handler)
- `native/vtz/src/server/diagnostics.rs` (modify — add `screenshotPool` field)
- `native/vtz/src/server/screenshot/mod.rs` (modify — public `capture_tool(args) -> Result<...>` entrypoint)

**What:** End-to-end wiring. MCP tool schema matches `VertzBrowserScreenshotArgs`. Error variants map to MCP `isError: true` with `code`, `message`, and variant-specific fields.

**HTTP artifact route path sanitization (moved here from Task 1):** The route's `filename` path param is user-controlled (the MCP response includes the URL but nothing stops someone hitting the route directly). Filename must match `^[A-Za-z0-9._-]+\.png$` AND `!filename.contains("..")` AND `!filename.starts_with('.')` — rejects dotfiles and anything pathological. Return 404 on mismatch.

**Acceptance:**
- [ ] Tool appears in `GET /tools` bridge response
- [ ] End-to-end: call tool against an in-process HTTP server (same pattern as the POC) → receive valid PNG in MCP response
- [ ] HTTP artifact route: 200 on existing file, 404 on missing, 404 on any path-traversal attempt (property-test with a fuzzing generator)
- [ ] `diagnostics.rs` exposes pool status (`{ status, capturesSinceStart, chromePath }`)
- [ ] AUTH_REQUIRED fires on a fixture route that redirects to `/login`

### Task 6: Template rule update
**Files:** 2
- `packages/create-vertz-app/src/templates/index.ts` (modify — append to `devServerToolsRule` at line 1957)
- `packages/create-vertz-app/src/templates/__tests__/templates.test.ts` (modify — snapshot assertion on the new section)

**What:** Extend `.claude/rules/dev-server-tools.md` template with the "Visual verification with screenshots" section.

**Acceptance:**
- [ ] Scaffold test verifies the new section appears in generated file
- [ ] Section text matches the block in this design doc
- [ ] Section includes an explicit "skip when" clause (pure backend / docs changes → no screenshot needed)

### Task 7: Docs — `mint-docs` guide
**Files:** 1
- `packages/mint-docs/guides/dev-server-tools.mdx` (modify — add `### vertz_browser_screenshot` section)

**What:** User-facing documentation. Tool description + BDD scenarios translated to example-driven prose.

**Acceptance:**
- [ ] Section renders on mint-docs preview
- [ ] Each param is documented with at least one example
- [ ] All error codes are listed with remediation

### Task 8: E2E acceptance test (Linux + macOS CI)
**Files:** 2
- `native/vtz/tests/screenshot_e2e.rs` (new, `#[ignore]`d by default; run via `cargo test -- --ignored` or in the dedicated CI job)
- `.github/workflows/ci.yml` (modify if needed — add a `screenshot-e2e` job pinned to `ubuntu-latest` and `macos-latest`)

**What:** Runs the BDD acceptance scenarios against a real Chrome download on a clean runner. Proves cross-platform.

**Acceptance:**
- [ ] All scenarios from the Acceptance Tests section pass on `ubuntu-latest` and `macos-latest`
- [ ] Cold start on runner measured and logged as CI artifact
- [ ] Test uses `TempDir` for the Chrome cache to avoid polluting runner state
- [ ] `#[ignore]`d so it doesn't block the normal `cargo test` cycle; explicit CI job opts in
- [ ] Each test honors `.claude/rules/integration-test-safety.md`: Browser closed in a `Drop` guard, WebSocket timeouts, `tokio::test` teardown via `tokio::time::timeout` on every wait

## Security review (Phase 1 only)

Narrow because no auth, no overlay, no external attack surface:

- Artifact HTTP route uses a strict regex filename whitelist (`^[A-Za-z0-9._-]+\.png$`). No dot-dot, no slash, no subdirectory access.
- Route bound to the dev server's existing bind address (typically `127.0.0.1`). Inherits the dev server's scope.
- Chrome for Testing download verifies SHA-256 from the official JSON index. No custom trust store, no hand-rolled TLS.
- `vtz dev` dev-token is not used in Phase 1 (no impersonation endpoint).
- Compiler is not modified (no `data-vertz-source` stamp) — zero prod-leakage risk.
- Screenshots may contain seed/fixture PII if the dev's app uses realistic seeds. `.vertz/` is in the template `.gitignore`. **Correction from earlier draft:** the scaffold does NOT write a `.dockerignore` today (verified: no `dockerignore` reference in `packages/create-vertz-app/src/`). Task 6 gets a second acceptance line: "scaffold writes a `.dockerignore` with `.vertz/` (or appends to existing one)". This is a 3-line scaffold change, not a blocker for Phase 1 but should land in the same template PR.

## Approval checklist

- [ ] **DX:** Tool signature, description, error codes, viewport/fullPage/target/waitFor ergonomics
- [ ] **Product:** Scope matches the "Phase 1 only" agreement from the reviews on PR #2866; success criteria are measurable
- [ ] **Technical:** POC numbers cover the "needs POC" slot from design-and-planning rule; implementation tasks are sized ≤5 files each; BrowserSpawner trait is the right seam for testability
- [ ] **User (Matheus):** Final sign-off

## What happens to the big doc

`plans/2865-agent-visual-handoff.md` stays as a **vision / roadmap doc** for Phases 2–5. Its top matter is updated to mark Phase 1 as superseded by this doc. The unresolved blockers on Phases 2–5 (missing `@vertz/auth`, `StoredSession.source`, compiler dev/prod mode) are the dependencies those phases wait on — each becomes its own issue once ready.

## What happens to PR #2866

PR #2866 was merged to main before this doc was written — the big doc is now history. A follow-up comment was added to #2866 pointing readers at this doc for the real Phase 1 scope. The big doc stays in main as a vision/roadmap reference for Phases 2-5 (see "What happens to the big doc" above).

## Changelog (post-initial-review revisions)

This doc incorporates feedback from three adversarial reviews run against the initial version:

- **DX review** → `target: union` locator (was CSS-only string); added `waitFor` param; added `AUTH_REQUIRED` / `PAGE_HTTP_ERROR` / `PAGE_JS_ERROR` / `SELECTOR_AMBIGUOUS` / `URL_INVALID` / `ARTIFACT_WRITE_FAILED` error codes; tool description rewritten to disambiguate from `vertz_browser_*` session tools and explicitly state auth-route behavior.
- **Product review** → dogfooding criterion now has owner (Matheus), target (`linear-clone` kanban), and pass/fail (3 consecutive PRs); removed `--no-screenshot` and `--screenshot-pool` flags (violated #2); Task 6 (binary-size decision gate) moved to Task 2 (before the `chromiumoxide` dep lands); added P7 no-regression criterion.
- **Technical review** → `BrowserSpawner` / `BrowserHandle` trait signatures now specified; pool state machine gained explicit `Launching` state with `OnceCell` serialization for concurrent calls; BDD scenarios explicitly map to Rust `#[tokio::test]` (not vitest); path sanitization moved from artifacts module (Task 1) to HTTP route (Task 5); `.local.rs` convention replaced with `#[ignore]`; `.dockerignore` claim corrected (scaffold doesn't write one today, add in Task 6); `$HOME` unwritable fallback added to Task 3.
