# Agent Visual Handoff

> **Issue:** [#2865](https://github.com/vertz-dev/vertz/issues/2865)
> **Status:** Design Draft — awaiting three sign-offs (DX, Product, Technical) + user approval
> **Feature slug:** `agent-visual-handoff`
> **Primary packages:** `native/vtz/` (runtime), `packages/create-vertz-app/` (templates), `packages/auth/` (impersonation)
> **Author:** Matheus Poleza
> **Date:** 2026-04-19

## Summary

Give AI agents real visual artifacts of the running app (PNG screenshots, not just HTML or a11y trees) and give humans an in-browser channel to send visual feedback back to the agent with rich context (component name, source file, source line, element bbox, screenshot).

This closes a gap in the existing dev-server MCP: today an agent can read errors, the audit log, and a structured page snapshot, but it **cannot see pixels**. It also cannot receive visual feedback from the human reviewer — every correction has to be typed into chat from scratch, even when the human is looking right at the bug.

## Problem

The current `@vertz/cli` dev-server MCP exposes 20 tools (see `packages/mint-docs/guides/dev-server-tools.mdx`), including:

- `vertz_render_page` — returns rendered HTML ("text screenshot")
- `vertz_browser_snapshot` — returns structured a11y tree with element refs
- `vertz_browser_click` / `type` / `fill_form` / `submit` / `wait` — browser control via injected WebSocket client

None of these give pixel-level ground truth. The agent sees HTML, not what the user sees. That leaves entire classes of bugs invisible:

- Layout overflow, z-index collisions, truncated text
- Color contrast, theme inconsistencies, dark-mode regressions
- Spacing/alignment drift vs design references
- Animation states, hover states, loading states
- Viewport-specific issues (mobile vs desktop)

Conversely, when a human reviews the app and finds a visual bug, they have no structured way to flag it to the agent — they type `"the submit button is invisible on dark mode"` into chat, and the agent has to guess which button, on which page, in which component file.

## Goals

1. Agents can take pixel-perfect screenshots of any app route through a single MCP tool.
2. Agents can take screenshots **as a specific user role** via framework-native impersonation — no manual cookie juggling.
3. Humans can send visual feedback from the running app with a single keyboard shortcut, pointing at a specific element.
4. Every feedback message the agent receives carries rich framework context: component name, source file, source line, element bbox, screenshot, url, user state.
5. Screenshots and feedback items persist as real artifacts on disk (`.vertz/artifacts/`), gitignored, available as demo evidence for PRs.
6. Best practices for using these tools ship automatically with every new project via template-injected `.claude/rules/`.

## Non-Goals

- **Production deployment of impersonation.** The impersonation endpoint is strictly dev-only, localhost-only, dev-token-protected. No production artifact ships it.
- **Visual regression testing as a CI quality gate.** Golden-file pixel diffs in CI add cross-platform flakiness we don't want to own. Screenshots are artifacts for agents and humans, not assertions.
- **A browser extension.** The overlay is injected by the dev server (same mechanism as the HMR client), no Chrome-Web-Store distribution.
- **Annotations beyond a single element + text (in v1).** Drawing, multi-point numbering, rectangular area selection are follow-ups. V1 is element-click + text + screenshot.
- **Non-Chromium browsers for headless capture.** Firefox/WebKit headless are not in scope for v1.
- **Replacing `vertz_render_page`.** HTML output remains useful for text-only checks (SEO, SSR hydration validation). Both coexist.

## API Surface

All examples must compile. TypeScript signatures below match the MCP tool schemas one-to-one.

### New MCP tool: `vertz_browser_screenshot`

```ts
// Request
type VertzBrowserScreenshotArgs = {
  /** Route to capture, e.g. "/tasks" or "/tasks/123". Required. */
  url: string;
  /** Viewport size. Default: { width: 1280, height: 720 }. */
  viewport?: { width: number; height: number };
  /** Capture full scrollable page vs viewport only. Default: false. */
  fullPage?: boolean;
  /** CSS selector to crop the screenshot to a single element. */
  selector?: string;
  /** Impersonate a user before capturing. Only works when @vertz/auth is present. */
  as?:
    | string // email
    | { id: string }
    | { email: string }
    | { role: string };
};

// Response (MCP content blocks)
type VertzBrowserScreenshotResponse = {
  content: [
    { type: 'image'; data: string /* base64 PNG */; mimeType: 'image/png' },
    { type: 'text'; text: string /* JSON with metadata below */ },
  ];
};

// Metadata JSON (in the text content block)
type VertzBrowserScreenshotMeta = {
  /** Absolute path to the saved PNG on disk. */
  path: string;
  /** Local URL to retrieve the PNG via the dev server. */
  url: string;
  /** Dimensions of the captured image. */
  dimensions: { width: number; height: number };
  /** Page URL actually navigated to (after redirects). */
  pageUrl: string;
  /** If impersonation ran, the resolved user. */
  impersonatedAs?: {
    id: string;
    email?: string;
    role?: string;
  };
  /** Elapsed wall time for the capture. */
  capturedInMs: number;
};
```

### New MCP tool: `vertz_get_user_feedback`

```ts
// Request
type VertzGetUserFeedbackArgs = {
  /** If true, mark returned items as consumed (default true). */
  consume?: boolean;
  /** Maximum items to return. Default: 50. */
  limit?: number;
};

// Response
type VertzUserFeedbackItem = {
  id: string;
  message: string;
  element: {
    selector: string;
    bbox: { x: number; y: number; w: number; h: number };
    component?: string;
    sourceFile?: string;
    sourceLine?: number;
  };
  url: string;
  screenshot: {
    path: string;
    url: string;
  };
  createdAt: string; // ISO 8601
  consumedAt: string | null; // null = pending
};

type VertzGetUserFeedbackResponse = {
  items: VertzUserFeedbackItem[];
  pendingCount: number;
};
```

### New event: `user_feedback` on `/__vertz_mcp/events`

Emits whenever a human submits feedback. Agents subscribed to the event stream receive push notifications.

```ts
type UserFeedbackEvent = {
  type: 'user_feedback';
  item: VertzUserFeedbackItem;
};
```

### New dev-only HTTP endpoint: `POST /__vertz_auth/impersonate`

Mounted only when:
- `NODE_ENV !== 'production'`
- `vtz dev` is running
- Server bind address is `127.0.0.1` or `localhost`
- `@vertz/auth` is detected in the app

```ts
// Request
type ImpersonateRequest = {
  as: string | { id: string } | { email: string } | { role: string };
};

// Response
type ImpersonateResponse = {
  cookie: string; // Set-Cookie header value
  token: string; // raw session token
  expiresAt: string; // ISO 8601
  user: {
    id: string;
    email?: string;
    role?: string;
  };
};

// Authentication
// Required header: X-Vertz-Dev-Token: <token printed to console at `vtz dev` startup>
```

### Phase 3 addition: `vertz_browser_screenshot_current`

Captures the current state of the connected browser tab (the one the human is looking at). Uses client-side capture through the existing browser hub — not the headless Chromium. Shares cookies, auth state, form state with what the human sees.

```ts
type VertzBrowserScreenshotCurrentArgs = {
  /** Browser session id. Optional if only one tab is connected. */
  sessionId?: string;
  /** CSS selector to crop to. */
  selector?: string;
  /** Full page vs viewport. Default: false. */
  fullPage?: boolean;
};

type VertzBrowserScreenshotCurrentResponse = VertzBrowserScreenshotResponse;
```

### `.claude/rules/ui-development.md` additions (Phase 4)

The existing template rule gets new sections:

```markdown
## Visual Verification Workflow

Before touching any `.tsx` file:

1. Capture baseline via `vertz_browser_screenshot({ url: '<route>' })`.
2. Call `vertz_get_user_feedback` — address pending items first.

After any UI change:

3. Capture after-state at the same URL + viewport.
4. For layout changes, capture both mobile (375x667) and desktop (1280x720).
5. For access-gated UI, capture as each relevant role via `as: { role: '...' }`.
6. For theme changes, capture in both light and dark.

Definition of done for UI tasks:

- Tests, typecheck, lint green
- Screenshot captured of the final state
- Before/after diff reviewed (for fixes)
- Multi-viewport verified (if layout changed)
- `vertz_get_user_feedback` returns zero pending items
```

## Architecture

### Component map

```
native/vtz/
├── src/
│   ├── server/
│   │   ├── mcp.rs                       # register new tools
│   │   ├── mcp_events.rs                # emit user_feedback events
│   │   ├── browser_hub.rs               # extend with overlay support
│   │   ├── screenshot/                  # NEW: screenshot subsystem
│   │   │   ├── mod.rs
│   │   │   ├── chromium_pool.rs         # lazy+TTL Chromium lifecycle
│   │   │   ├── capture.rs               # viewport/fullPage/selector logic
│   │   │   └── artifacts.rs             # disk persistence
│   │   ├── feedback/                    # NEW: feedback subsystem
│   │   │   ├── mod.rs
│   │   │   ├── inbox.rs                 # consumed-flag queue
│   │   │   ├── persistence.rs           # .vertz/artifacts/feedback/ IO
│   │   │   └── overlay_protocol.rs      # messages between overlay ↔ hub
│   │   └── auth_impersonate.rs          # NEW: dev-only impersonate endpoint
│   └── bridge/
│       └── tools.rs                     # add tool handlers

packages/
├── auth/
│   └── src/
│       └── impersonate.ts               # NEW: dev-only impersonation helper
├── ui-server/
│   └── src/
│       └── build-plugin/
│           └── overlay-injection.ts     # NEW: inject overlay script tag
├── create-vertz-app/
│   └── src/
│       └── templates/
│           └── index.ts                 # update ui-development.md + dev-server-tools.md
└── mint-docs/
    └── guides/
        └── dev-server-tools.mdx         # document new tools
```

### Phase 1: Headless screenshot

**Chromium integration approach:** Use the [Chrome DevTools Protocol (CDP)](https://chromedevtools.github.io/devtools-protocol/) directly from Rust via a lightweight client crate (e.g. `chromiumoxide` or `headless_chrome`). Playwright is rejected — it requires a Node process to control, and we already have V8/deno_core embedded; adding a second process is overhead we don't need.

**POC needed:** Confirm we can embed Chromium launch + CDP client in `vtz` without blowing the binary size past the runtime's acceptable budget. Fallback: ship Chromium as a post-install download (like Playwright does) into `~/.vertz/chromium/`, not bundled in the `vtz` binary.

**Lifecycle (Lazy + TTL):**

```
screenshot call arrives
  ├── pool has live browser? → reuse
  └── no → launch Chromium (~1-2s cold start)
       └── set idle timer (default 60s)

every subsequent call resets the idle timer
idle timer expires → gracefully close browser

SIGINT on vtz dev → close browser
--browser-pool flag → skip idle timer, keep always-on
```

**Capture flow:**

```
1. If `as`: call internal /__vertz_auth/impersonate → get cookie
2. Create new incognito context in Chromium
3. If cookie: set cookie on context
4. Navigate to resolved URL (respect dev-server port)
5. Wait for network idle (max 5s) OR domcontentloaded + 200ms settle
6. If `selector`: wait for element, compute bounding box
7. Capture:
   - PNG buffer
   - page URL (post-redirect)
   - viewport dimensions
8. Save to .vertz/artifacts/screenshots/<timestamp>-<slug>.png
9. Return MCP content blocks: image + metadata JSON
```

**Artifact naming:** `<ISO-timestamp>-<url-slug>-<viewport>.png`
Example: `2026-04-19T14-23-05Z-tasks-1280x720.png`

### Phase 2: Feedback overlay

**Overlay injection:** The dev server already injects an HMR client script into every served HTML page. We extend that injection to include a new script tag for the overlay. The overlay code ships as a precompiled JS asset served from `__vertz_overlay.js` (gzipped, <20KB target).

**Overlay UI:**

The overlay renders as a Web Component with Shadow DOM to guarantee zero CSS leakage into the user's app. Hidden by default. Keyboard shortcut `Cmd+Shift+F` (or `Ctrl+Shift+F` on non-Mac) toggles it.

```
[Cmd+Shift+F pressed]
  ├── overlay activates
  ├── cursor becomes crosshair
  ├── hover any element → highlight outline
  └── click element
       ├── outline locks on clicked element
       ├── modal appears with textarea
       ├── [user types feedback + Enter to submit | Esc to cancel]
       └── on submit:
            ├── take client-side screenshot of visible viewport
            ├── resolve component/sourceFile/sourceLine from build metadata
            ├── WebSocket send to browser hub:
            │     { kind: 'user_feedback', payload: {...} }
            └── show toast "Feedback sent to agent"
```

**Framework context resolution:**

The Vertz compiler already emits source-map-like metadata per JSX node during dev builds. We extend the compiler plugin to stamp a `data-vertz-source` attribute on all root JSX elements in development mode only:

```
data-vertz-source="<file>:<line>:<col>:<componentName>"
```

The overlay reads this attribute on the clicked element (or walks up to the nearest ancestor with it) to resolve `sourceFile`, `sourceLine`, and `component`. In production builds, this attribute is stripped — zero runtime cost.

**Persistence (consumed-flag inbox):**

```
feedback arrives
  ├── write .vertz/artifacts/feedback/<timestamp>-<id>.json
  │     { id, message, element, url, screenshot: {path, url}, createdAt, consumedAt: null }
  ├── write screenshot PNG alongside
  ├── push to in-memory inbox
  └── emit user_feedback event on /__vertz_mcp/events

agent calls vertz_get_user_feedback
  ├── load all feedback files where consumedAt is null
  ├── if consume=true: set consumedAt on returned items, rewrite files
  └── return items
```

Files are never deleted automatically. `vtz dev --clear-artifacts` is the manual reset.

### Phase 3: Current-tab screenshot (client-side)

Uses the existing browser hub protocol. A new command `screenshot_current` is sent over the WebSocket. The client script uses the browser's native `HTMLCanvasElement` + `html2canvas` library (bundled with the overlay) to serialize the current DOM to PNG, returns it over WebSocket.

Known fidelity limitations (documented in the tool description):
- Cross-origin iframes render blank
- Some CSS features (backdrop-filter, certain filter stacks) may approximate
- Canvas/WebGL content only renders if `preserveDrawingBuffer: true`

For pixel-perfect capture, the agent should prefer `vertz_browser_screenshot` (headless). Use `vertz_browser_screenshot_current` when the agent specifically needs to see the human's *current session state*.

### Impersonation endpoint

**Security gates:**

1. Mount guard: `mount_if(env == "development" && bind == 127.0.0.1 && detect_vertz_auth())`
2. Dev-token header: `X-Vertz-Dev-Token` generated at `vtz dev` startup, printed to console and stored in `.vertz/dev-token` (gitignored). Matched constant-time.
3. Never ships in production build — the route handler module is feature-gated out at release.
4. Token rotates per `vtz dev` invocation.

**Implementation:**

`packages/auth/src/impersonate.ts` exposes:

```ts
// Only registered when vtz dev wires it in
export async function mintDevImpersonationSession(
  authContext: AuthContext,
  target: string | { id: string } | { email: string } | { role: string },
): Promise<ImpersonateResponse>;
```

Uses the standard `@vertz/auth` session-minting primitives with:
- `session.createdAt` = now
- `session.expiresAt` = now + 1 hour (not configurable — dev sessions are short-lived)
- `session.source` = `'dev-impersonate'` (auditable in logs)

The dev server calls this function when serving `/__vertz_auth/impersonate`.

### Artifact directory layout

```
<project-root>/.vertz/
├── artifacts/                     # gitignored
│   ├── screenshots/
│   │   └── 2026-04-19T14-23-05Z-tasks-1280x720.png
│   └── feedback/
│       ├── 2026-04-19T14-25-12Z-fb-001.json
│       └── 2026-04-19T14-25-12Z-fb-001.png
├── dev-token                      # gitignored; dev impersonation token
└── ...
```

A `create-vertz-app` scaffold step adds `.vertz/artifacts/` and `.vertz/dev-token` to `.gitignore` if not already present.

## Manifesto Alignment

| Principle | Alignment | Tradeoff / Rejected alternative |
|-----------|-----------|---------------------------------|
| #1 "If it builds, it works" | MCP tool schemas are fully typed; TypeScript signatures above reflect the runtime contract. | Rejected: untyped `Record<string, unknown>` args on tools. Rejected: dynamic route for screenshot params. |
| #2 "One way to do things" | One screenshot tool per purpose: headless-URL vs current-tab. One feedback tool. One impersonation mechanism. | Rejected: multiple screenshot tools with flags; rejected: "advanced mode" with clip/deviceScaleFactor/omitBackground. |
| #3 "AI agents are first-class" | `as: { role: 'admin' }` is unambiguous. Feedback carries component/sourceFile/sourceLine so the agent never has to guess. Rules ship automatically with the template. | Rejected: cookie-header-passthrough for auth (error-prone for LLMs). Rejected: feedback without framework context. |
| #4 "Test what matters, nothing more" | Unit tests on queue logic, impersonation token minting, pool lifecycle. Smoke E2E on "tool returns valid PNG." No pixel-diff CI. | Rejected: golden-file visual regression suite. |
| #5 "If you can't test it, don't build it" | Feedback flow is testable end-to-end: inject simulated overlay event → agent calls tool → verify disk artifact. Screenshot flow is testable: call tool → verify PNG file on disk + valid dimensions. | |
| #6 "If you can't demo it, it's not done" | Screenshots *are* the demo artifact. Every PR touching this feature ships a screenshot. | |
| #7 "Performance is not optional" | Chromium is lazy+TTL. Zero RAM cost when idle. Cold start budget: <2s. Warm capture: <200ms. `--browser-pool` opt-in for always-on. | Rejected: always-on Chromium (would cost every dev 200MB RAM). |
| #8 "No ceilings" | We don't accept "screenshot auth is complex" → impersonation is first-class. We don't accept html2canvas fidelity → headless Chromium is the default. | |

## Type Flow Map

Dead generics are bugs. Every generic below is traced from definition to consumer.

### `VertzBrowserScreenshotArgs.as`

```
as: string | { id } | { email } | { role }
    ↓
Chromium pool → impersonation client
    ↓
POST /__vertz_auth/impersonate { as }
    ↓
mintDevImpersonationSession(ctx, target: typeof as)
    ↓
@vertz/auth session minter → typed by existing auth package
    ↓
Response { user: { id, email?, role? } } → surfaces back to tool metadata.impersonatedAs
```

Every variant of `as` lands somewhere type-checked. No dead paths.

### `VertzUserFeedbackItem.element.sourceFile`

```
compiler plugin adds data-vertz-source="file:line:col:component"
    ↓
overlay Web Component reads DOM attribute (typed as string)
    ↓
parses to { sourceFile: string, sourceLine: number, component: string }
    ↓
WebSocket payload typed in overlay_protocol.rs with serde
    ↓
inbox.rs stores typed JSON
    ↓
MCP response serializes VertzUserFeedbackItem { element: { sourceFile?, sourceLine?, component? } }
    ↓
agent reads; `?` optional because minified/stripped builds won't have it
```

Optional by design because production builds strip the attribute.

### `.test-d.ts` tests planned

- `vertz_browser_screenshot` args: every variant of `as` compiles; invalid shape errors.
- `vertz_get_user_feedback` response: `consumedAt: string | null` narrows correctly.
- `mintDevImpersonationSession` accepts all target shapes; rejects wrong types.

## E2E Acceptance Tests

Written in vitest-compatible BDD format per `.claude/rules/bdd-acceptance-criteria.md`.

### Feature: Headless screenshot

```typescript
describe('Feature: vertz_browser_screenshot', () => {
  describe('Given a Vertz dev server running and a public route "/"', () => {
    describe('When the agent calls vertz_browser_screenshot({ url: "/" })', () => {
      it('then returns an MCP image content block with a valid PNG', () => {});
      it('then writes the PNG to .vertz/artifacts/screenshots/', () => {});
      it('then returns metadata.url as a local dev server path', () => {});
      it('then metadata.dimensions matches the default viewport 1280x720', () => {});
    });
  });

  describe('Given @vertz/auth is installed and user "alice@test.com" exists', () => {
    describe('When the agent calls vertz_browser_screenshot({ url: "/tasks", as: "alice@test.com" })', () => {
      it('then the captured page is authenticated as Alice', () => {});
      it('then metadata.impersonatedAs.email equals "alice@test.com"', () => {});
    });

    describe('When the agent calls with as: { role: "admin" }', () => {
      it('then the first user with role "admin" is impersonated', () => {});
      it('then metadata.impersonatedAs.role equals "admin"', () => {});
    });
  });

  describe('Given the Chromium pool has been idle for > TTL (60s)', () => {
    describe('When the agent calls vertz_browser_screenshot', () => {
      it('then Chromium is launched fresh (cold start)', () => {});
      it('then the call still completes under 3000ms', () => {});
    });
  });

  describe('Given --browser-pool flag is set', () => {
    describe('When the pool is idle for > 60s', () => {
      it('then Chromium remains running', () => {});
    });
  });

  describe('Given an invalid selector is passed', () => {
    describe('When the agent calls with selector: ".does-not-exist"', () => {
      it('then returns an error with message indicating selector not found', () => {});
      it('then does not leave artifacts on disk', () => {});
    });
  });
});
```

### Feature: Human visual feedback

```typescript
describe('Feature: vertz_get_user_feedback', () => {
  describe('Given a human has submitted feedback via the overlay on "/tasks"', () => {
    describe('When the agent calls vertz_get_user_feedback', () => {
      it('then returns the feedback item with message, element, url, screenshot', () => {});
      it('then element.sourceFile and element.sourceLine are populated', () => {});
      it('then consumedAt is set on the returned item after the call', () => {});
      it('then a subsequent call returns zero pending items', () => {});
    });
  });

  describe('Given the agent is subscribed to /__vertz_mcp/events', () => {
    describe('When the human submits feedback', () => {
      it('then a user_feedback event is pushed within 100ms', () => {});
      it('then the event payload matches VertzUserFeedbackItem shape', () => {});
    });
  });

  describe('Given 10 feedback items have been submitted', () => {
    describe('When the agent calls vertz_get_user_feedback({ limit: 3 })', () => {
      it('then returns exactly 3 items (most recent first)', () => {});
      it('then pendingCount reflects remaining items', () => {});
    });
  });

  describe('Given the agent calls with consume: false', () => {
    describe('When feedback exists', () => {
      it('then items are returned without being marked consumed', () => {});
      it('then a subsequent call returns the same items', () => {});
    });
  });
});
```

### Feature: Impersonation security

```typescript
describe('Feature: POST /__vertz_auth/impersonate', () => {
  describe('Given NODE_ENV=development and bind=127.0.0.1', () => {
    describe('When the endpoint is called with a valid dev token', () => {
      it('then returns a valid session cookie for the target user', () => {});
      it('then the session expires in exactly 1 hour', () => {});
      it('then session.source equals "dev-impersonate" in auth logs', () => {});
    });

    describe('When the endpoint is called without dev token', () => {
      it('then responds with 401', () => {});
    });

    describe('When the endpoint is called with wrong dev token', () => {
      it('then responds with 401 and constant-time comparison is used', () => {});
    });
  });

  describe('Given NODE_ENV=production', () => {
    describe('When the dev server starts', () => {
      it('then the impersonation route is not mounted (returns 404)', () => {});
    });
  });

  describe('Given bind=0.0.0.0 (explicit network exposure)', () => {
    describe('When the dev server starts', () => {
      it('then the impersonation route is not mounted (returns 404)', () => {});
    });
  });
});
```

## Unknowns

| Unknown | Resolution plan |
|---------|-----------------|
| **Rust Chromium client choice** (`chromiumoxide` vs `headless_chrome` vs custom CDP) | **Needs POC**: benchmark cold start, binary size impact, maintenance burden. POC branch: `poc/chromium-client`. Decision criterion: smallest binary impact that supports CDP `Page.captureScreenshot` + `Network.setCookies`. |
| **Chromium bundling strategy** (bundle with vtz vs post-install download) | Depends on POC above. If binary impact <20MB → bundle. Otherwise: post-install to `~/.vertz/chromium/` with integrity check. |
| **`data-vertz-source` attribute performance cost** (hundreds of elements × string allocation per render) | **Needs benchmark**: measure added bytes + render time on a 500-element page in dev. Mitigation: strip unless `VERTZ_DEV_OVERLAY=1` env var is set. |
| **html2canvas license compatibility with Vertz (MIT)** | Verify before Phase 3 implementation. Backup: write a minimal DOM-to-canvas serializer ourselves (we already have `platform-agnosticism-runtime-audit` reducing dep surface). |
| **Overlay script size budget** | Target <20KB gzipped. If html2canvas blows past, Phase 3 gets split: Phase 3a for feedback overlay (no canvas) + Phase 3b for current-tab screenshot. |

## POC Results

**Status: POCs not yet run.** Unknowns table lists required POCs. Feature does not enter Phase 1 implementation until `poc/chromium-client` completes.

## Phases / Implementation Plan

Each phase is a vertical slice — deliverable end-to-end. Full plan files will be written per `.claude/rules/phase-implementation-plans.md` (max 5 files per task) once this design doc is approved.

### Phase 1: Headless screenshot (minimum viable)

**Deliverable:** Agent can call `vertz_browser_screenshot({ url })` and get back a real PNG.

Tasks:
1. Chromium client integration in `native/vtz/src/server/screenshot/chromium_pool.rs`
2. Capture logic (viewport, fullPage, selector) in `capture.rs`
3. Artifact persistence in `artifacts.rs`
4. MCP tool registration in `mcp.rs`
5. Unit tests + smoke E2E in `.local.ts`

Acceptance: first 3 scenarios in "Feature: Headless screenshot" BDD pass.

### Phase 2: Impersonation + auth-aware screenshot

**Deliverable:** `as: { role: 'admin' }` param works. Agent captures authenticated routes.

Tasks:
1. `mintDevImpersonationSession` in `packages/auth/src/impersonate.ts`
2. `/__vertz_auth/impersonate` endpoint in `native/vtz/src/server/auth_impersonate.rs`
3. Dev-token generation + `.vertz/dev-token` file
4. Wire `as` param in screenshot capture flow
5. Security tests (production gate, bind gate, token gate)

Acceptance: "Given @vertz/auth is installed" + "Feature: Impersonation security" scenarios pass.

### Phase 3: Overlay + human feedback

**Deliverable:** Human presses `Cmd+Shift+F`, clicks element, types message, agent receives structured feedback via both tool pull and event push.

Tasks:
1. `data-vertz-source` attribute in compiler (dev-only)
2. Overlay Web Component (Shadow DOM, crosshair, textarea modal)
3. Overlay injection in `packages/ui-server/src/build-plugin/overlay-injection.ts`
4. Feedback inbox + persistence in `native/vtz/src/server/feedback/`
5. `vertz_get_user_feedback` MCP tool
6. `user_feedback` event emission on `/__vertz_mcp/events`
7. E2E tests simulating overlay events

Acceptance: "Feature: Human visual feedback" scenarios pass.

### Phase 4: Current-tab screenshot

**Deliverable:** `vertz_browser_screenshot_current` captures what the human sees right now, with current auth/form state.

Tasks:
1. Client-side DOM-to-canvas serialization in overlay script
2. WebSocket `screenshot_current` command in browser hub protocol
3. `vertz_browser_screenshot_current` MCP tool
4. Tool docs + known limitations documentation

Acceptance: tool returns PNG that visually matches the human's viewport within documented tolerance.

### Phase 5: Template + docs update

**Deliverable:** New projects ship with visual-verification rules baked in.

Tasks:
1. Update `packages/create-vertz-app/src/templates/index.ts` — add sections to `ui-development.md` and `dev-server-tools.md`
2. Update `packages/mint-docs/guides/dev-server-tools.mdx` with the new tools
3. Scaffold adds `.vertz/artifacts/` + `.vertz/dev-token` to `.gitignore` automatically

Acceptance: scaffold test verifies generated `CLAUDE.md` and `.claude/rules/` include the new sections.

## Developer walkthrough (the demo)

This is what a developer or agent sees end-to-end after the feature ships:

1. `npx create-vertz-app my-app` → project scaffolds. `CLAUDE.md` references `.claude/rules/ui-development.md` which includes the visual workflow.
2. `cd my-app && vtz dev` → dev server starts. Console prints `Dev token: abc123...` (for MCP impersonation).
3. Agent (e.g. Claude Code) opens the project. Its rules say "before any UI change, call `vertz_browser_screenshot`".
4. Agent calls `vertz_browser_screenshot({ url: '/', as: { role: 'admin' } })`.
5. First call: Chromium boots (cold start ~1.5s). Subsequent calls: ~150ms.
6. Agent receives: MCP image content block (renders in the agent's chat UI) + metadata path.
7. Human opens the app in their browser. Presses `Cmd+Shift+F`. Clicks a button. Types "this should be red, not gray." Enter.
8. Agent (subscribed to events) receives `user_feedback` event containing component name `SubmitButton`, source file `src/components/TaskForm.tsx`, line `42`, screenshot path.
9. Agent opens the file, fixes the color, captures a new screenshot via `vertz_browser_screenshot({ url: '/tasks/new', selector: '.submit-btn' })`.
10. Agent replies: "Fixed. Before: /path/before.png. After: /path/after.png."
11. Human can literally see the before/after side-by-side.

That is the demo. It satisfies principle #6: "If you can't demo it, it's not done."

## Security review

- Impersonation endpoint is feature-flagged out of production builds (compile-time, not runtime) — verify with a test that imports the production build and asserts the route handler module is absent.
- Dev token is 256-bit CSPRNG, constant-time comparison on validation.
- Localhost bind check uses the actual bound address, not the `--host` flag (defense against config-level misconfiguration).
- `@vertz/auth` impersonation session has `source: 'dev-impersonate'` → audit log flags it distinctly from real user logins.
- Screenshots stored on disk may contain PII from seed data. Artifact directory is added to `.gitignore` automatically; `.dockerignore` template also updated.
- `data-vertz-source` attribute is stripped in production compiler output → no source file leakage to deployed clients.

## Approval checklist

- [ ] DX (josh): Is the API intuitive? Will developers love the `Cmd+Shift+F` flow? Is `as: { role: 'admin' }` obvious?
- [ ] Product: Does this match the roadmap? Is the scope right for v1?
- [ ] Technical: Can we deliver Phase 1 in the POC window? Does the Chromium bundling story hold up?
- [ ] User (Matheus): Final sign-off before implementation.

---

**After approval:** break this doc into phase files at `plans/2865-agent-visual-handoff/phase-0N-*.md` per `.claude/rules/phase-implementation-plans.md` (each ≤5 files per task).
