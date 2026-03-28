# Vertz Dev Server — Next Steps Implementation Plan

> Comprehensive plan for post-Phase-1.6 work: fast-follows, LLM integration enhancements, DX parity validation, and deferred features.

## Context

Phase 1.0 through 1.6 of the Rust dev server are complete or in progress. The server has:
- HTTP serving with axum, static file serving, port conflict handling
- V8 embedding via deno_core with custom ModuleLoader and ops
- On-demand compilation pipeline with import rewriting and dep pre-bundling
- Client-only and SSR rendering (two-pass with query prefetch)
- File watcher + module graph + HMR with Fast Refresh
- Error overlay, auto-recovery, zero-restart for source changes
- MCP server (SSE + Streamable HTTP) with 5 tools: `vertz_get_errors`, `vertz_render_page`, `vertz_get_console`, `vertz_navigate`, `vertz_get_diagnostics`
- WebSocket error broadcast channel with priority categories
- Console log ring buffer for diagnostic capture
- Diagnostics endpoint with server health snapshot

This plan covers the four categories of work that follow.

---

## Category 1: Fast-Follows (Committed Timeline)

These were explicitly committed in the original plan with target timelines.

---

### 1.1 Chrome DevTools Protocol (`--inspect`)

**What:** Add V8 Inspector Protocol support so developers can attach Chrome DevTools (or VS Code debugger) to the dev server's V8 Isolate. This means adding the `--inspect` and `--inspect-brk` CLI flags, opening a WebSocket on `127.0.0.1:9229` (or configurable port) that speaks the Chrome DevTools Protocol, and connecting the V8 inspector agent from `deno_core`'s `JsRuntime`.

**Why:** Debugging SSR renders, API handlers, and reactive state currently requires `console.log` spraying. The Bun dev server supports `--inspect` natively because Bun/JSC provides it. Without this, the Rust server is a DX regression for any developer who uses breakpoints. The original plan committed to "4 weeks post-1.6" for this.

**Key files:**
- `native/vertz-runtime/src/cli.rs` — add `--inspect`, `--inspect-brk`, `--inspect-port` args to `DevArgs`
- `native/vertz-runtime/src/runtime/js_runtime.rs` — enable V8 inspector on `JsRuntime` creation
- `native/vertz-runtime/src/runtime/inspector.rs` (new) — WebSocket server for CDP, session management
- `native/vertz-runtime/src/server/http.rs` — announce inspector URL in startup banner
- `native/vertz-runtime/src/banner.rs` — display `Debugger: ws://127.0.0.1:9229/...` line

**Dependencies:**
- Phase 1.6 complete (inspector needs a working V8 Isolate with module loading)
- Investigate `deno_core`'s `InspectorServer` API — it may provide most of this out of the box (deno_core v0.311.0 has `JsRuntime::inspector()`)

**Acceptance criteria:**
- Running `vertz-runtime dev --inspect` opens a CDP WebSocket and prints the `chrome-devtools://` URL in the banner
- Chrome DevTools can connect, set breakpoints in SSR code, and hit them during a page render
- `--inspect-brk` pauses execution at the first line of the entry module, waiting for debugger attach
- Source maps work in the debugger (breakpoints align with original `.tsx` source, not compiled output)

**Estimated effort:** L (3-4 weeks) — `deno_core` has inspector primitives, but wiring them through the module loader with source maps and HMR module replacement is non-trivial.

---

### 1.2 `tsc` Error Integration in the Overlay

**What:** Run TypeScript's type checker (`tsc --noEmit --watch`) as a child process and pipe its diagnostics into the dev server's error overlay. Type errors appear in the same overlay as build/runtime errors, with file location, error message, and code snippet.

**Why:** The Vertz compiler (oxc) strips types but does not type-check. Developers currently need a separate terminal running `tsc --watch` or rely on their editor. Surfacing type errors in the browser overlay closes the feedback loop — save a file, see type errors alongside build errors, fix, overlay dismisses. This is table stakes for DX parity with tools like Vite + vue-tsc.

**Key files:**
- `native/vertz-runtime/src/typecheck/mod.rs` (new) — child process management for `tsc`
- `native/vertz-runtime/src/typecheck/parser.rs` (new) — parse `tsc` diagnostic output into `DevError` structs
- `native/vertz-runtime/src/errors/categories.rs` — add `TypeCheck` category (priority between `Resolve` and `Build`, or equal to `Build`)
- `native/vertz-runtime/src/server/http.rs` — spawn tsc watcher on server start
- `native/vertz-runtime/src/cli.rs` — add `--no-typecheck` flag to disable
- `native/vertz-runtime/src/config.rs` — add `enable_typecheck: bool` field

**Dependencies:**
- Phase 1.6 complete (error overlay infrastructure must exist)
- `tsc` must be available in the project's `node_modules/.bin/` or globally

**Acceptance criteria:**
- Type errors from `tsc` appear in the browser error overlay with correct file, line, column, and error message
- Type errors are categorized and participate in the priority system (a `build` error still suppresses a `typecheck` error)
- Fixing a type error auto-clears it from the overlay (via `tsc --watch` incremental output)
- `--no-typecheck` flag disables the tsc subprocess entirely
- If `tsc` is not found, the server starts without type checking and logs a warning

**Estimated effort:** M (1-2 weeks) — parsing `tsc` output is well-understood, the error overlay infrastructure already exists, the main work is child process lifecycle management and incremental diagnostic parsing.

---

## Category 2: LLM Integration Enhancements

Building on the existing MCP server (`native/vertz-runtime/src/server/mcp.rs`) which provides 5 tools over SSE and Streamable HTTP transports.

---

### 2.1 Component-Level Screenshots

**What:** Add an MCP tool `vertz_render_component` that renders a single component in isolation (not a full page) and returns the HTML output. The tool accepts a component file path, optional props as JSON, and optional viewport dimensions. It wraps the component in a minimal shell (theme CSS, no router/layout) and SSR-renders it.

**Why:** The existing `vertz_render_page` renders full pages, which includes layout, navigation, and data fetching. When an LLM is iterating on a single component's styling or markup, rendering the full page is wasteful and noisy. Component-level rendering gives the LLM a focused view of exactly the component it's working on, making edit-render-check cycles faster and more precise.

**Key files:**
- `native/vertz-runtime/src/server/mcp.rs` — add `vertz_render_component` tool definition and handler
- `native/vertz-runtime/src/ssr/component_render.rs` (new) — isolated component rendering logic
- `native/vertz-runtime/src/ssr/render.rs` — extract reusable SSR primitives (V8 setup, CSS collection) that both page and component rendering share

**Dependencies:**
- Phase 1.4b (SSR) complete — needs V8 module loading and DOM shim
- The component must be importable as an ES module with a default export or named export

**Acceptance criteria:**
- `vertz_render_component({ file: "src/components/TaskCard.tsx", props: { title: "Test" } })` returns the rendered HTML of just that component
- Theme CSS is included in the output so styling is accurate
- If the component requires context providers (router, settings), a clear error message explains what's missing rather than crashing
- The render includes timing metadata (`_meta.renderTimeMs`)

**Estimated effort:** M (1-2 weeks) — SSR infrastructure exists, the main work is creating the isolated rendering shell and handling the case where components depend on context providers.

---

### 2.2 Signal/State Inspection Per Component

**What:** Add an MCP tool `vertz_inspect_state` that exposes the current reactive state (signals, computed values) of components in the running application. Given a component name or file path, it returns a structured snapshot of all signal values, computed derivations, and query states.

**Why:** When an LLM is debugging why a component isn't rendering correctly, it needs to see the actual runtime state — not just the source code. Today, the LLM has to add `console.log` statements, save, wait for HMR, read the console output, then remove the logs. Direct state inspection eliminates this round-trip entirely. This is one of the most impactful LLM-first features: it gives the LLM "eyes" into the reactive system.

**Key files:**
- `native/vertz-runtime/src/server/mcp.rs` — add `vertz_inspect_state` tool definition and handler
- `native/vertz-runtime/src/runtime/state_inspector.rs` (new) — V8 op that walks the component registry and reads signal values
- `native/vertz-runtime/assets/state-inspector.js` (new) — client-side script injected during dev that exposes `globalThis.__VERTZ_STATE__` via the Fast Refresh registry
- `native/vertz-runtime/src/hmr/protocol.rs` — add `StateSnapshot` message type for client-to-server state reports

**Dependencies:**
- Phase 1.5 (HMR/Fast Refresh) complete — the Fast Refresh registry (`globalThis[Symbol.for('vertz:fast-refresh')]`) is the source of truth for mounted component instances
- Phase 1.4b (SSR) for server-side state inspection of SSR renders
- Requires extending the Fast Refresh runtime to track signal values per component instance

**Acceptance criteria:**
- `vertz_inspect_state({ component: "TaskCard" })` returns a JSON object with all signal values, computed values, and query states for all mounted instances of `TaskCard`
- Signal values are serialized as plain JSON (no circular references, functions shown as `"[Function]"`)
- Query states include `data`, `error`, `isLoading`, and `key`
- If no instances are mounted, returns an empty array with a message

**Estimated effort:** L (3-4 weeks) — requires extending the Fast Refresh runtime to expose state, building a client-server protocol for state snapshots, and handling serialization edge cases (DOM nodes, functions, circular references).

---

### 2.3 Full-Stack Audit Log

**What:** Build a unified timeline that captures all server-side events — API requests (method, path, status, duration), database queries (if using `@vertz/db`), SSR renders (URL, duration, query count), file changes, compilation events, and errors — as a single chronological log. Expose via an MCP tool `vertz_get_audit_log` and the existing `/__vertz_diagnostics` endpoint.

**Why:** When an LLM is debugging a data-fetching issue, it needs to correlate: "the component called `query()` during SSR, which made an API request to `/api/tasks`, which ran a DB query, which returned 0 rows because of a WHERE clause." Today these events are scattered across terminal output, browser console, and DB logs. A unified timeline connects the dots.

**Key files:**
- `native/vertz-runtime/src/server/audit_log.rs` (new) — ring buffer of typed audit events with nanosecond timestamps
- `native/vertz-runtime/src/server/mcp.rs` — add `vertz_get_audit_log` tool
- `native/vertz-runtime/src/server/http.rs` — middleware to capture API request/response events
- `native/vertz-runtime/src/ssr/render.rs` — emit SSR render events to audit log
- `native/vertz-runtime/src/compiler/pipeline.rs` — emit compilation events to audit log
- `native/vertz-runtime/src/watcher/file_watcher.rs` — emit file change events to audit log
- `native/vertz-runtime/src/server/console_log.rs` — bridge console entries to audit log (or replace with audit log)

**Dependencies:**
- Phase 1.6 complete (all event sources must exist)
- For DB query capture: requires `@vertz/db` to emit query events (may need a hook/middleware on the DB client — can start without this and add later)

**Acceptance criteria:**
- `vertz_get_audit_log({ last: 100 })` returns a chronological array of typed events
- Each event has: `timestamp` (ISO 8601), `type` (api_request, ssr_render, compilation, file_change, error), `duration_ms` (where applicable), and type-specific fields
- Events can be filtered by type: `vertz_get_audit_log({ type: "api_request", last: 50 })`
- The audit log replaces or subsumes the existing `ConsoleLog` to avoid duplication

**Estimated effort:** M (2-3 weeks) — the event sources already exist (console_log, diagnostics), the work is defining a unified event schema, adding capture points at each source, and building the query/filter API.

---

### 2.4 WebSocket Push for Real-Time Error/Change Notifications to LLMs

**What:** Add a dedicated WebSocket endpoint `/__vertz_mcp_events` that LLMs can subscribe to for real-time push notifications. Events include: file changes, compilation results, error state changes, SSR render completions, and HMR update confirmations. This complements the existing request-response MCP tools with an event stream.

**Why:** The current MCP tools are polling-based — the LLM calls `vertz_get_errors` to check for errors. With WebSocket push, the LLM gets notified immediately when a build error occurs after it saves a file, without needing to poll. This reduces latency in the LLM's edit-check loop from seconds (polling interval) to milliseconds (push).

**Key files:**
- `native/vertz-runtime/src/server/mcp_events.rs` (new) — WebSocket endpoint for LLM event subscriptions
- `native/vertz-runtime/src/server/http.rs` — mount the `/__vertz_mcp_events` route
- `native/vertz-runtime/src/server/mcp.rs` — add `vertz_subscribe` tool that returns the WebSocket URL
- `native/vertz-runtime/src/errors/broadcaster.rs` — hook to also push to MCP event clients
- `native/vertz-runtime/src/hmr/websocket.rs` — hook to also push file change events to MCP event clients

**Dependencies:**
- Phase 1.6 complete (error broadcaster and HMR hub must exist)
- MCP server must be functional (for the `vertz_subscribe` tool)

**Acceptance criteria:**
- Connecting to `ws://localhost:3000/__vertz_mcp_events` receives a JSON stream of server events
- Events are typed: `{ "event": "error", "data": { ... } }`, `{ "event": "hmr_update", "data": { "modules": [...] } }`, `{ "event": "file_change", "data": { "path": "..." } }`
- Error events include the full `DevError` structure (same as `vertz_get_errors` output)
- Connection/disconnection is logged to the console log
- Multiple LLM clients can subscribe simultaneously

**Estimated effort:** S (1 week) — the WebSocket infrastructure already exists (HMR hub, error broadcaster), this is largely wiring existing event sources to a new WebSocket endpoint with a unified event envelope.

---

### 2.5 Custom LLM Wrapper for WebSocket Bridge

**What:** Build a lightweight bridge process that connects an LLM API (via HTTP long-polling or server-sent events) to the dev server's WebSocket endpoints. This allows LLMs that don't support native WebSocket connections (some hosted API endpoints) to receive real-time events. The bridge exposes a simple HTTP API: `GET /events` (SSE stream) and `POST /command` (forward to MCP).

**Why:** Not all LLM integration points support WebSocket. Claude Code connects via MCP (which we support), but other LLMs (Kimi, Minimax, custom wrappers) may connect via HTTP. A bridge process converts between the protocols, making the dev server's real-time features available to any LLM client.

**Key files:**
- `native/vertz-runtime/src/bridge/mod.rs` (new) — HTTP-to-WebSocket bridge server
- `native/vertz-runtime/src/bridge/sse_stream.rs` (new) — SSE event stream from WebSocket events
- `native/vertz-runtime/src/bridge/command_proxy.rs` (new) — HTTP POST to MCP JSON-RPC proxy
- `native/vertz-runtime/src/cli.rs` — add `--bridge-port` flag (e.g., `--bridge-port 3001`)

**Dependencies:**
- 2.4 (WebSocket push) should be complete first — the bridge wraps the WebSocket events
- MCP server functional

**Acceptance criteria:**
- `GET http://localhost:3001/events` returns an SSE stream of dev server events
- `POST http://localhost:3001/command` with `{ "tool": "vertz_get_errors", "args": {} }` returns the tool result
- The bridge auto-discovers the dev server port (or accepts `--dev-server-url`)
- The bridge is opt-in (only starts when `--bridge-port` is specified)

**Estimated effort:** M (1-2 weeks) — straightforward HTTP-to-WebSocket proxying, but needs robust reconnection handling and clean lifecycle management.

---

## Category 3: DX Parity & Validation

---

### 3.1 Validate Against Linear-Clone Example App

**What:** Run the linear-clone example app (`examples/linear-clone/`) end-to-end on the Rust dev server and verify that every feature works: routing (nested layouts), SSR with data fetching, HMR with state preservation, error overlay, auth flows, entity CRUD, and real-time updates. Document any failures as issues and fix them.

**Why:** The linear-clone is the most complex example app — it exercises routing, auth, entities, queries, forms, dialogs, and theme components. If it works on the Rust server, simpler apps will too. This is the ultimate validation of DX parity with the Bun server.

**Key files:**
- `examples/linear-clone/` — the target app
- `native/vertz-runtime/` — bug fixes discovered during validation
- `plans/vertz-dev-server/linear-clone-validation.md` (new) — validation report with pass/fail per feature

**Dependencies:**
- Phase 1.6 complete (all core features must be functional)
- 1.2 (`tsc` integration) is nice-to-have but not blocking

**Acceptance criteria:**
- All pages render via SSR with correct HTML
- Client-side hydration works without re-fetching data
- HMR updates components without page reload and preserves signal state
- Error overlay appears for syntax errors and auto-dismisses on fix
- Auth flows (login, logout, session persistence) work
- No JavaScript console errors during normal usage
- A written validation report documents each feature area with pass/fail

**Estimated effort:** L (2-3 weeks) — validation itself is fast, but fixing discovered issues will take time. The linear-clone has complex routing and data patterns.

---

### 3.2 `vertz dev --experimental-runtime` CLI Flag Integration

**What:** Wire the Rust dev server binary into the `@vertz/cli` package so that `vertz dev --experimental-runtime` spawns the Rust binary instead of the Bun dev server. The CLI detects the binary location (installed via npm postinstall or built locally), passes through all relevant flags (port, host, etc.), and forwards stdin/stdout for terminal interaction.

**Why:** This is the opt-in stage from the transition plan. Developers need a way to try the Rust server without changing their workflow. The CLI flag is the bridge between the existing `vertz dev` command and the new runtime.

**Key files:**
- `packages/cli/src/commands/dev.ts` — add `--experimental-runtime` option, spawn Rust binary
- `packages/cli/src/runtime/launcher.ts` (new) — binary detection, platform-specific paths, subprocess management
- `packages/cli/src/runtime/binary.ts` (new) — download/detect the `vertz-runtime` binary
- `native/vertz-runtime/src/cli.rs` — ensure all flags match what the CLI passes
- `native/vertz-runtime/src/config.rs` — accept `vertz.config.ts` settings via CLI args or config file

**Dependencies:**
- Phase 1.6 complete
- 3.1 (linear-clone validation) should be done first — don't expose an opt-in flag for a broken server

**Acceptance criteria:**
- `vertz dev --experimental-runtime` starts the Rust dev server with the same project detection as the Bun server
- All existing CLI flags (`--port`, `--host`, `--open`) are forwarded to the Rust binary
- If the Rust binary is not found, a clear error message is shown with installation instructions
- `vertz dev` (without the flag) continues to use the Bun server unchanged
- Ctrl+C cleanly stops the Rust subprocess

**Estimated effort:** M (1-2 weeks) — subprocess management and flag forwarding are straightforward, binary distribution strategy needs design.

---

### 3.3 Feature Parity Checklist Validation

**What:** Systematically verify every row in the Feature Parity Checklist from the original plan (Section "Feature Parity Checklist vs Current Bun Dev Server"). For each feature, write an automated integration test that runs against both the Bun and Rust dev servers and verifies identical behavior. Document any deltas.

**Why:** The parity checklist is the contract for when the Rust server can become the default. Without systematic validation, subtle regressions will slip through. Automated tests ensure parity is maintained as the Rust server evolves.

**Key files:**
- `native/vertz-runtime/tests/parity/` (new directory) — integration tests per feature area
- `native/vertz-runtime/tests/parity/http_serving.rs` — HTTP serving + routing
- `native/vertz-runtime/tests/parity/static_files.rs` — static file serving
- `native/vertz-runtime/tests/parity/compilation.rs` — on-demand compilation
- `native/vertz-runtime/tests/parity/ssr.rs` — SSR rendering
- `native/vertz-runtime/tests/parity/hmr.rs` — HMR/Fast Refresh
- `native/vertz-runtime/tests/parity/error_overlay.rs` — error overlay
- `native/vertz-runtime/tests/parity/diagnostics.rs` — diagnostic endpoint

**Dependencies:**
- Phase 1.6 complete
- 3.1 (linear-clone validation) — manual validation first, automated tests follow

**Acceptance criteria:**
- Every "Included" row in the parity checklist has at least one automated test
- Tests run as part of `cargo test` (unit-level) or `cargo test --test parity` (integration)
- Any "Deferred" feature is documented as explicitly not tested, with a reference to this plan
- A summary report maps each checklist row to its test file and status

**Estimated effort:** L (2-3 weeks) — many tests, each individually small, but covering the full surface area takes time.

---

## Category 4: Deferred Features

These were explicitly deferred in the original plan's Feature Parity Checklist. They are lower priority but needed for full feature parity with the Bun server.

---

### 4.1 Font Fallback Extraction

**What:** During SSR, detect `@font-face` declarations in CSS and generate `font-display: swap` fallback CSS with size-adjusted system fonts. This prevents layout shift (CLS) when web fonts load. The current Bun server does this via `packages/ui-server/src/font-fallback.ts`.

**Why:** Without font fallback extraction, SSR pages show a brief layout shift when custom fonts load. This degrades both perceived performance and Lighthouse/CWV scores. It's a DX regression from the Bun server.

**Key files:**
- `native/vertz-runtime/src/ssr/font_fallback.rs` (new) — parse `@font-face` rules, generate fallback CSS
- `native/vertz-runtime/src/ssr/html_document.rs` — inject font fallback `<style>` in `<head>`
- `native/vertz-runtime/src/ssr/css_collector.rs` — feed collected CSS through font fallback extraction

**Dependencies:**
- Phase 1.4b (SSR) complete
- CSS collection must be working

**Acceptance criteria:**
- Pages with custom `@font-face` declarations include size-adjusted fallback CSS in the SSR response
- The fallback CSS uses `font-display: swap` and metrics-matched system fonts
- Pages without custom fonts are unaffected (no extra CSS injected)

**Estimated effort:** M (1-2 weeks) — CSS parsing for `@font-face` is well-scoped, font metrics matching requires a lookup table of system font metrics.

---

### 4.2 Image Proxy

**What:** Serve an image optimization proxy at `/__vertz_image/` that resizes, converts (to WebP/AVIF), and caches images from `public/` or remote URLs. The Bun server has this via `packages/ui-server/src/image-proxy.ts`.

**Why:** Image optimization is a common DX need — developers want to use `<img src="/__vertz_image/hero.png?w=800&format=webp">` in development and see the optimized result. Without it, development images are unoptimized, and the switch to production optimization causes visual differences.

**Key files:**
- `native/vertz-runtime/src/server/image_proxy.rs` (new) — axum handler for `/__vertz_image/**`
- `native/vertz-runtime/src/server/http.rs` — mount the image proxy route
- `native/vertz-runtime/src/server/image_cache.rs` (new) — disk cache in `.vertz/images/`

**Dependencies:**
- Phase 1.1 (HTTP server) complete
- Rust image processing crate (`image` or `libvips` bindings)

**Acceptance criteria:**
- `GET /__vertz_image/public/hero.png?w=800&h=600&format=webp` returns a resized WebP image
- Results are cached in `.vertz/images/` (cache key includes source path + query params)
- Remote URLs are supported: `GET /__vertz_image/https://example.com/photo.jpg?w=400`
- Invalid inputs return a 400 with a descriptive error message

**Estimated effort:** M (2-3 weeks) — image processing in Rust is mature (`image` crate), but WebP/AVIF encoding, caching strategy, and remote URL fetching add scope.

---

### 4.3 OpenAPI Spec Serving

**What:** Serve the app's OpenAPI spec at `/__vertz_openapi` by introspecting the registered API routes and their schemas. The Bun server generates this from `@vertz/server`'s route definitions.

**Why:** LLMs and developer tools (Swagger UI, API clients) benefit from having the OpenAPI spec available during development. This enables auto-generated API documentation and client SDK generation in the dev workflow.

**Key files:**
- `native/vertz-runtime/src/server/openapi.rs` (new) — OpenAPI spec generation from route metadata
- `native/vertz-runtime/src/server/http.rs` — mount `/__vertz_openapi` route
- `native/vertz-runtime/src/server/mcp.rs` — optionally add `vertz_get_api_spec` MCP tool

**Dependencies:**
- Phase 1.4b (SSR/API handler delegation) — API routes must be registered in the V8 Isolate
- `@vertz/server` must expose route metadata in a V8-readable format

**Acceptance criteria:**
- `GET /__vertz_openapi` returns a valid OpenAPI 3.1 JSON document
- All registered API routes are included with their HTTP methods, path parameters, and request/response schemas
- Schemas are derived from the Zod/`@vertz/schema` validators attached to routes
- The spec updates automatically when API routes change (via HMR)

**Estimated effort:** L (3-4 weeks) — requires bridging between V8-side route registration and Rust-side spec generation, plus schema introspection from `@vertz/schema` validators.

---

### 4.4 Upstream Dependency Watching (Monorepo)

**What:** Watch `node_modules` and linked workspace packages for changes, not just `src/`. When a dependency's `dist/` changes (e.g., after `bun run build` in a sibling package), invalidate the pre-bundled deps cache and trigger recompilation. The Bun server handles this via its bundler's module graph.

**Why:** In a monorepo, developers often work on framework packages (`@vertz/ui`, `@vertz/server`) alongside their app. When they rebuild a framework package, the app's dev server must pick up the changes without a manual restart. Without this, developers must `Ctrl+C` and restart after every framework change — a major friction point in monorepo workflows.

**Key files:**
- `native/vertz-runtime/src/watcher/file_watcher.rs` — extend watch scope to include linked workspace paths
- `native/vertz-runtime/src/watcher/dep_watcher.rs` (new) — watch `node_modules/.vertz-link` or symlinked package `dist/` directories
- `native/vertz-runtime/src/deps/prebundle.rs` — invalidation logic for upstream dep changes
- `native/vertz-runtime/src/deps/mod.rs` — detect linked workspace packages from `package.json` `workspaces` field
- `native/vertz-runtime/src/config.rs` — add `watchDeps: string[]` config option for explicit paths

**Dependencies:**
- Phase 1.5 (file watcher) complete
- Phase 1.3 (dep pre-bundling) complete

**Acceptance criteria:**
- Changing a file in a linked workspace package's `dist/` triggers cache invalidation and recompilation
- The re-bundling only targets the changed dependency (not all deps)
- A `watchDeps` config option allows explicit paths for non-standard monorepo layouts
- The file watcher efficiently handles the additional watch scope without CPU overhead (use coalesce/debounce)

**Estimated effort:** M (2-3 weeks) — file watching infrastructure exists, the work is detecting linked packages, determining which deps to re-bundle, and handling the invalidation cascade.

---

### 4.5 Theme-from-Request

**What:** Support per-request theme resolution based on cookies, headers, or URL parameters. This enables multi-tenant apps where the theme varies per user/tenant. The SSR render uses the resolved theme to generate the correct CSS, and the client hydrates with matching styles.

**Why:** Multi-tenant Vertz apps need different visual themes per tenant. Today, the theme is resolved once at server start from `vertz.config.ts`. Per-request resolution allows the same server instance to render different themes for different users, which is required for the Vertz Cloud multi-tenant deployment model.

**Key files:**
- `native/vertz-runtime/src/ssr/theme_resolver.rs` (new) — resolve theme from request headers/cookies
- `native/vertz-runtime/src/ssr/render.rs` — pass resolved theme to SSR render
- `native/vertz-runtime/src/server/theme_css.rs` — support multiple theme CSS bundles keyed by theme ID
- `native/vertz-runtime/src/config.rs` — add `themeResolver` config option
- `native/vertz-runtime/src/ssr/html_document.rs` — inject theme-specific CSS based on request

**Dependencies:**
- Phase 1.4b (SSR) complete
- Theme infrastructure (`@vertz/theme-shadcn`, `registerTheme()`) stable
- Multi-level tenancy design (referenced in MEMORY.md) should inform the resolver API

**Acceptance criteria:**
- A `themeResolver` function in `vertz.config.ts` receives the request and returns a theme ID
- SSR renders use the resolved theme's CSS (different tenants get different styles)
- The theme CSS is cached per theme ID (not per request)
- Client hydration receives the correct theme ID and applies matching styles
- Default behavior (no `themeResolver`) is unchanged — single theme from config

**Estimated effort:** M (2-3 weeks) — theme resolution is straightforward, but caching multiple theme bundles and ensuring SSR/client consistency requires care.

---

## Priority and Sequencing

### Recommended execution order:

```
Phase A (immediate, weeks 1-4):
  1.2 tsc error integration (M)        — highest DX value, smallest effort
  2.4 WebSocket push for LLMs (S)      — enables event-driven LLM workflows
  3.1 Linear-clone validation (L)      — validates everything, surfaces bugs early

Phase B (weeks 5-10):
  1.1 Chrome DevTools --inspect (L)    — committed fast-follow, DX regression blocker
  2.1 Component-level screenshots (M)  — high LLM value
  2.3 Full-stack audit log (M)         — unified debugging for LLMs
  3.2 --experimental-runtime CLI (M)   — enables opt-in adoption

Phase C (weeks 11-16):
  2.2 Signal/state inspection (L)      — deep LLM debugging capability
  3.3 Feature parity tests (L)         — systematic validation
  4.4 Upstream dep watching (M)        — monorepo DX

Phase D (weeks 17+, as needed):
  4.1 Font fallback extraction (M)     — CWV optimization
  4.2 Image proxy (M)                  — image optimization DX
  4.3 OpenAPI spec serving (L)         — API documentation DX
  4.5 Theme-from-request (M)           — multi-tenant support
  2.5 Custom LLM bridge (M)           — niche use case, low priority
```

### Rationale:

- **Phase A** prioritizes the two fast-follows (tsc and DevTools, but tsc first because it's smaller) plus validation against the most complex example app. The WebSocket push is small and high-value.
- **Phase B** delivers the committed DevTools fast-follow and the most impactful LLM tools. The CLI flag integration enables public opt-in.
- **Phase C** handles deeper LLM integration and systematic validation. Upstream dep watching is important for monorepo users.
- **Phase D** covers deferred features that are lower priority or have smaller user impact.

---

## Open Questions

1. **Binary distribution for `--experimental-runtime`:** How is the Rust binary distributed? Options: (a) pre-built binaries on GitHub Releases downloaded at `postinstall`, (b) compiled from source via `cargo build` during install, (c) bundled in the npm package per platform. This affects 3.2 significantly.

2. **tsc diagnostic format:** Should we parse `tsc`'s human-readable output or use `tsc --pretty false` for machine-parseable output? The `--pretty false` format is more stable but less rich.

3. **State inspection security:** Exposing reactive state via MCP could leak sensitive data (auth tokens, API keys stored in signals). Should we add an allowlist/blocklist for which signals are exposed?

4. **Audit log retention:** How many events should the audit log retain? The current `ConsoleLog` retains 100 entries. For a full audit log with API requests and DB queries, this may be too small. Consider configurable retention or time-based eviction.

5. **Image proxy scope:** Should the image proxy support only local files (simpler, no SSRF risk) or also remote URLs (more useful but needs URL allowlisting)?
