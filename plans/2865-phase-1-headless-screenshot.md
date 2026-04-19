# Phase 1 — Headless Screenshot MCP Tool

> **Issue:** [#2865](https://github.com/vertz-dev/vertz/issues/2865)
> **Status:** Design Draft — awaiting three sign-offs (DX, Product, Technical) + user approval
> **Supersedes the Phase-1 scope of:** [`plans/2865-agent-visual-handoff.md`](./2865-agent-visual-handoff.md) (vision/full-roadmap doc — Phases 2–5 still live there)
> **POC evidence:** [`plans/2865-chromium-poc-results.md`](./2865-chromium-poc-results.md)
> **Author:** Matheus Poleza
> **Date:** 2026-04-19

## What this doc delivers

One new MCP tool: `vertz_browser_screenshot({ url, viewport?, fullPage?, selector? })`. Headless `chromiumoxide`, lazy+TTL pool, Chrome for Testing download, artifacts in `.vertz/artifacts/screenshots/`, PNG returned as both MCP image content and local file URL. **No authentication, no overlay, no compiler changes, no current-tab capture.** Those live in future issues when their dependencies mature.

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

- `vertz_browser_screenshot({ url: '/' })` returns a valid PNG in under 2 s on a cached Chrome (real measurement target — POC shows 836 ms warm).
- On a machine that has never downloaded Chrome, first call completes in under 10 s (target bounded by Chrome for Testing download from googlechromelabs.github.io).
- `linear-clone` showcase dogfooding: the agent building feature X can capture before/after screenshots of any route without asking a human for help.
- Zero feature-flag or config needed — `vtz dev` + MCP connect is all the setup.
- Manual LLM-first test: give a fresh Claude Code session the MCP catalog, ask it to "take a screenshot of the home page and summarize what it sees." First-try success.

## Non-Goals

The following are explicitly **out of scope for Phase 1** and tracked as future issues:

- **Impersonation / auth-aware capture.** Public routes only in Phase 1. Future phase once `@vertz/auth` (currently in `packages/server/src/auth/`) consolidates its session-minting API.
- **Human-to-agent visual feedback / overlay.** No overlay injection, no `data-vertz-source` compiler stamp, no `Cmd+Shift+F` flow, no `vertz_get_user_feedback` tool.
- **Current-tab / client-side screenshot** (`vertz_browser_screenshot_current`). No `html2canvas`, no browser hub extension.
- **Visual regression CI / golden file diffs.**
- **Non-Chromium browsers** (Firefox, WebKit).
- **Multi-viewport batch capture** (`viewport: 'both'`, `theme: 'both'`). Phase 1 has one viewport per call.
- **Production deployment of the tool.** Tool handler is compiled out of release builds of `vtz`.

## API Surface

### New MCP tool: `vertz_browser_screenshot`

```ts
// Request schema (matches MCP tool JSON schema)
type VertzBrowserScreenshotArgs = {
  /** Route to capture. Required. Examples: "/", "/tasks", "/tasks/123". */
  url: string;
  /** Viewport size. Default: { width: 1280, height: 720 }. */
  viewport?: { width: number; height: number };
  /** If true, captures the full scrollable page (captureBeyondViewport). Default: false. */
  fullPage?: boolean;
  /** CSS selector to crop the screenshot to a single element. */
  selector?: string;
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
  | { code: 'CHROME_LAUNCH_FAILED'; message: string; hint?: string }
  | { code: 'CHROME_DOWNLOAD_FAILED'; message: string; url: string }
  | { code: 'NAVIGATION_FAILED'; message: string; url: string }
  | { code: 'NAVIGATION_TIMEOUT'; message: string; url: string; timeoutMs: number }
  | { code: 'SELECTOR_NOT_FOUND'; message: string; selector: string }
  | { code: 'SELECTOR_INVALID'; message: string; selector: string }
  | { code: 'VIEWPORT_INVALID'; message: string }
  | { code: 'CAPTURE_FAILED'; message: string };
```

`hint` on `CHROME_LAUNCH_FAILED` points the agent/human at `vtz dev --no-screenshot` if they want to disable the feature, or to the download log path if the issue is fetcher-related.

### Tool description (what the LLM actually reads)

The description is a hard constraint from Principle #3 — it is the only documentation the LLM sees when choosing which tool to call. Final wording:

```
Capture a pixel-perfect PNG screenshot of a route served by this dev server.
Returns the image inline (agent can see it) plus a local file path (can be
referenced in follow-up replies or diffs).

Use cases:
- Verify a UI change actually rendered correctly after editing .tsx
- Show a human before/after of a fix
- Sanity-check layout at mobile (375x667) vs desktop (1280x720) viewports
- Crop to a single component via CSS selector

Only works on routes this dev server serves. Public routes only in this
version — authenticated routes will show a login screen.
```

Last sentence is the LLM-safety rail against wasted calls into auth-gated routes.

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
    vertz_browser_screenshot({ url: '<route>', selector: '.my-component' })

Screenshots save to .vertz/artifacts/screenshots/ — these are working artifacts,
reference them in your replies to the human.
```

## Architecture

### POC evidence (what is no longer theoretical)

All of these were validated in the `poc/chromium-client` branch and are NOT open questions:

- `chromiumoxide` 0.9.1 with `default-features = false` is the correct dep choice.
- `Browser::launch`, `browser.set_cookies`, `page.screenshot` with viewport/fullPage/selector, graceful `close` + `wait` — every API call we need is one method.
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

Phase 1 lifecycle:

```
tool call arrives
  ├── pool state == Disabled (flag --no-screenshot) → return CHROME_LAUNCH_FAILED with hint
  ├── pool state == Warm (Browser live, idle < TTL) → reuse
  └── pool state == Idle (no Browser) →
        ├── first time on this machine → kick off Chrome for Testing download (~80 MB)
        │   → surface progress via /__vertz_diagnostics
        │   → on failure → CHROME_DOWNLOAD_FAILED
        ├── launch chromiumoxide Browser → cold start ~850 ms (POC measured)
        └── set pool state = Warm

after call completes
  ├── reset TTL timer (default 60 s idle → close)

on vtz dev SIGINT/SIGTERM
  ├── Browser::close() with 2 s timeout
  ├── if still alive → Browser::kill()
  └── await wait() to reap the child
```

Flag to force always-on for benchmark-sensitive workflows: `vtz dev --screenshot-pool=always`. Flag to opt out: `vtz dev --no-screenshot`.

### Chrome for Testing download

Resolution algorithm on first launch (all in `screenshot/fetcher.rs`):

1. Check `$VERTZ_CHROME_PATH` env → if set and executable, use it.
2. Probe common system paths (`/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`, `/usr/bin/google-chrome`, `/usr/bin/chromium`) — the `which`-crate path used internally by chromiumoxide.
3. If none found, download `chrome-headless-shell` for the current platform from the JSON index at `https://googlechromelabs.github.io/chrome-for-testing/last-known-good-versions-with-downloads.json`.
4. Unpack into `~/.vertz/chromium/<chrome-rev>/`. SHA-256 verify against the index.
5. On macOS: `xattr -d com.apple.quarantine` post-extract to avoid Gatekeeper prompts.
6. Cache the resolved path in `~/.vertz/chromium/current.json` with `{ rev, path, downloadedAt }`. Subsequent runs skip re-resolution unless forced.

Not in Phase 1: auto-updating the revision when a new Chrome ships. One revision, pinned at Phase 1 release, bumped manually.

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
| #2 "One way to do things" | Exactly one tool, one pool strategy, one artifact location, one screenshot format (PNG). No `quality`, `omitBackground`, `clip` (we use `selector` which wraps clip). |
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
| Binary size impact on `vtz` | ⏳ **Needs measurement during Task 6** — POC estimates 3–4 MB delta. Gate Task 6 on `cargo bloat` diff showing <10 MB. Fallback: feature-flag the screenshot tool out of default `vtz` build. |
| Chrome for Testing channel URL stability | ✅ **Resolved** — cache resolved URL in `current.json`, don't re-resolve per run |
| macOS Gatekeeper/quarantine on downloaded binary | ⏳ **Needs verification on fresh machine** — covered by Task 4 acceptance criteria |
| Chromium cold start on Linux/Windows CI runners | ⏳ **Needs verification** — POC only ran on Apple Silicon. Task 8 runs the E2E test on GitHub Actions Linux runner |

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
selector: string            → page.find_element → bounding_box → ScreenshotParams.clip
                            OR SELECTOR_NOT_FOUND / SELECTOR_INVALID error variant
```

`.test-d.ts` tests planned:
- `VertzBrowserScreenshotArgs` accepts each valid shape; rejects extra keys; rejects wrong types on each field
- `VertzBrowserScreenshotMeta` `impersonatedAs` field is **absent** (reviewer caught this in the big doc; Phase 1 doesn't have it)
- `VertzBrowserScreenshotError` exhausts the discriminated union in switch

## E2E Acceptance Tests

BDD per `.claude/rules/bdd-acceptance-criteria.md`. These are the tests that must pass for Phase 1 to ship.

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

  describe('Given a valid CSS selector pointing to an element', () => {
    describe('When the agent calls with selector: ".my-component"', () => {
      it('then the captured PNG dimensions match the element bounding box', () => {});
    });

    describe('When the selector does not match any element', () => {
      it('then returns SELECTOR_NOT_FOUND error with the original selector', () => {});
      it('then does not leave artifacts on disk', () => {});
    });

    describe('When the selector string is syntactically invalid', () => {
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

  describe('Given vtz dev --no-screenshot', () => {
    describe('When the tool is called', () => {
      it('then returns CHROME_LAUNCH_FAILED with a hint to remove the flag', () => {});
      it('then no browser process is spawned', () => {});
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

### Task 1: `screenshot::artifacts` module
**Files:** 2
- `native/vtz/src/server/screenshot/mod.rs` (new, minimal scaffold + `pub mod artifacts;`)
- `native/vtz/src/server/screenshot/artifacts.rs` (new, includes unit tests)

**What:** Filename generation (`<iso>-<slug>-<viewport>.png`), disk write, path sanitization, `.vertz/artifacts/screenshots/` creation.

**Acceptance:**
- [ ] `build_filename(url, viewport, full_page)` produces lexicographically sortable names
- [ ] Path sanitization rejects `..`, `/`, NUL
- [ ] Write is atomic (temp-file + rename)
- [ ] 100% line coverage on this file

### Task 2: `screenshot::fetcher` module
**Files:** 3
- `native/vtz/src/server/screenshot/fetcher.rs` (new)
- `~/.vertz/chromium/` cache directory layout doc as rustdoc in the file
- Fixture JSON for tests: `native/vtz/src/server/screenshot/testdata/chrome-versions.json` (new)

**What:** Resolve Chrome binary. Probe env → system paths → fallback to Chrome for Testing download. SHA-256 verify. macOS quarantine removal. Result cached to `~/.vertz/chromium/current.json`.

**Acceptance:**
- [ ] `$VERTZ_CHROME_PATH` takes precedence
- [ ] System Chrome detected on macOS (`/Applications/Google Chrome.app/...`)
- [ ] Download resolves latest-stable revision from fixture JSON
- [ ] SHA-256 mismatch returns `CHROME_DOWNLOAD_FAILED`
- [ ] Second invocation skips download, reads from `current.json`
- [ ] Test with injected HTTP mock (no real network calls)

### Task 3: `screenshot::chromium` wrapper + `pool`
**Files:** 3
- `native/vtz/src/server/screenshot/chromium.rs` (new)
- `native/vtz/src/server/screenshot/pool.rs` (new)
- `native/vtz/Cargo.toml` (add `chromiumoxide = { version = "0.9", default-features = false }`)

**What:** `Pool::capture(req) -> Result<(Vec<u8>, PageMeta), Error>`. Lazy launch, 60 s idle TTL, reap on drop/SIGINT, state published for diagnostics. Uses `BrowserSpawner` trait so tests mock the chromium layer.

**Acceptance:**
- [ ] First call triggers launch; subsequent within TTL reuse
- [ ] Post-TTL call relaunches
- [ ] SIGINT test: process exits without orphan chrome (integration test in `.local.rs`)
- [ ] Viewport/fullPage/selector combinations each produce correct PNG
- [ ] BrowserSpawner trait allows mocking for unit tests

### Task 4: MCP tool registration + `http.rs` artifact route
**Files:** 4
- `native/vtz/src/server/mcp.rs` (modify — register tool)
- `native/vtz/src/server/http.rs` (modify — add `/__vertz_artifacts/screenshots/*` handler)
- `native/vtz/src/server/diagnostics.rs` (modify — add `screenshotPool` field)
- `native/vtz/src/server/screenshot/mod.rs` (modify — public `capture_tool` entrypoint)

**What:** End-to-end wiring. MCP tool schema matches `VertzBrowserScreenshotArgs`. Error variants map to MCP `isError: true`. HTTP route serves saved PNGs with sanitized filenames.

**Acceptance:**
- [ ] Tool appears in `GET /tools` bridge response
- [ ] End-to-end: call tool on `data:` URL server → receive valid PNG in MCP response
- [ ] HTTP artifact route: 200 on existing file, 404 otherwise, rejects path traversal
- [ ] `diagnostics.rs` exposes pool status

### Task 5: Template rule update
**Files:** 2
- `packages/create-vertz-app/src/templates/index.ts` (modify — append to `devServerToolsRule`)
- `packages/create-vertz-app/src/templates/__tests__/templates.test.ts` (modify — snapshot assertion on the new section)

**What:** Extend `.claude/rules/dev-server-tools.md` template with the "Visual verification with screenshots" section.

**Acceptance:**
- [ ] Scaffold test verifies the new section appears in generated file
- [ ] Section text matches the block in this design doc

### Task 6: Binary size measurement + feature flag decision
**Files:** 1 (plus CI measurement log — not committed)
- `plans/2865-phase-1-binary-size.md` (new, report of before/after `cargo bloat` with `chromiumoxide` dep)

**What:** Measure `vtz` release binary with and without `chromiumoxide` dep. If delta <10 MB: ship unconditionally. If 10–20 MB: add Cargo feature `screenshot` (default=on). If >20 MB: feature flag default=off and document opt-in.

**Acceptance:**
- [ ] Report document committed
- [ ] Decision made and reflected in `Cargo.toml`

### Task 7: Docs — `mint-docs` guide
**Files:** 1
- `packages/mint-docs/guides/dev-server-tools.mdx` (modify — add `### vertz_browser_screenshot` section)

**What:** User-facing documentation. Copy from the tool description + BDD scenarios, translated to example-driven prose.

**Acceptance:**
- [ ] Section renders on mint-docs preview
- [ ] Each param is documented with at least one example
- [ ] Error codes are listed with remediation

### Task 8: E2E acceptance test (Linux CI runner)
**Files:** 2
- `native/vtz/tests/screenshot_e2e.rs` (new, gated behind `#[cfg(not(target_os = "windows"))]`)
- `.github/workflows/ci.yml` (verify — does the matrix already run on Linux? If yes, no change.)

**What:** Runs the BDD acceptance scenarios against a real Chrome download on a clean runner. Proves cross-platform.

**Acceptance:**
- [ ] All scenarios from the E2E section pass on GitHub Actions `ubuntu-latest`
- [ ] Cold start on runner measured and logged
- [ ] Test uses `TempDir` for the Chrome cache to avoid polluting runner state

## Security review (Phase 1 only)

Narrow because no auth, no overlay, no external attack surface:

- Artifact HTTP route uses a strict regex filename whitelist (`^[A-Za-z0-9._-]+\.png$`). No dot-dot, no slash, no subdirectory access.
- Route bound to the dev server's existing bind address (typically `127.0.0.1`). Inherits the dev server's scope.
- Chrome for Testing download verifies SHA-256 from the official JSON index. No custom trust store, no hand-rolled TLS.
- `vtz dev` dev-token is not used in Phase 1 (no impersonation endpoint).
- Compiler is not modified (no `data-vertz-source` stamp) — zero prod-leakage risk.
- Screenshots may contain seed/fixture PII if the dev's app uses realistic seeds. `.vertz/` is in the template `.gitignore`. Template also ensures `.dockerignore` contains `.vertz/` (update: add to template scaffold if missing — one-line fix).

## Approval checklist

- [ ] **DX:** Tool signature, description, error codes, viewport/fullPage/selector ergonomics
- [ ] **Product:** Scope matches the "Phase 1 only" agreement from the reviews on PR #2866; success criteria are measurable
- [ ] **Technical:** POC numbers cover the "needs POC" slot from design-and-planning rule; implementation tasks are sized ≤5 files each; BrowserSpawner trait is the right seam for testability
- [ ] **User (Matheus):** Final sign-off

## What happens to the big doc

`plans/2865-agent-visual-handoff.md` stays as a **vision / roadmap doc** for Phases 2–5. Its top matter is updated to mark Phase 1 as superseded by this doc. The unresolved blockers on Phases 2–5 (missing `@vertz/auth`, `StoredSession.source`, compiler dev/prod mode) are the dependencies those phases wait on — each becomes its own issue once ready.

## What happens to PR #2866

Closed as superseded by the PR opened for this doc + the POC branch.
