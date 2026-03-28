# Phase 4b: Server-Side Rendering

**Prerequisites:** Phase 2 (V8 embedding), Phase 3 (compilation pipeline) complete.

**Goal:** Pages load with server-rendered HTML that hydrates on the client. Full SSR with CSS collection and hydration data.

**Design doc:** `plans/vertz-dev-server.md` — Phase 1.4b

**Note:** This phase can run in parallel with Phase 5 (HMR). HMR only needs client-only rendering (Phase 4a).

---

## Context — Read These First

- Current SSR (two-pass): `packages/ui-server/src/ssr-render.ts`
- Current SSR (single-pass): `packages/ui-server/src/ssr-single-pass.ts`
- DOM shim: `packages/ui-server/src/dom-shim/index.ts`
- SSR context: `packages/ui-server/src/ssr-context.ts`

---

## Tasks

### Task 1: AsyncLocalStorage polyfill via PromiseHook

**What to do:**
- The SSR pipeline uses `AsyncLocalStorage` from `node:async_hooks` for per-request context
- `deno_core` does not provide `node:async_hooks`
- Implement a minimal `AsyncLocalStorage` polyfill:
  - Use V8's `PromiseHook` API to track async context propagation
  - Support `run(store, callback)` — executes callback with `store` as the current context
  - Support `getStore()` — returns the current context (or undefined if none)
  - Only needs to work for the SSR use case (no full `node:async_hooks` compatibility)

**Files to create:**
```
native/vertz-runtime/src/ssr/
├── mod.rs
└── async_local_storage.rs    # NEW — PromiseHook-based polyfill
native/vertz-runtime/src/runtime/
└── polyfills/
    └── async_local_storage.js # NEW — JS-side API
```

**Acceptance criteria:**
- [ ] `asyncLocalStorage.run(store, fn)` sets the store for the duration of `fn`
- [ ] `asyncLocalStorage.getStore()` returns the current store
- [ ] Context propagates across `await` boundaries
- [ ] Two concurrent `run()` calls have isolated stores
- [ ] Works with `Promise.all()` (parallel async operations)

---

### Task 2: Load DOM shim into V8

**What to do:**
- The existing DOM shim (`packages/ui-server/src/dom-shim/`) provides `document`, `window`, `Element`, etc. for SSR
- Load it as a V8 module before the app code
- Verify: after loading, `globalThis.document` and `globalThis.window` are available

**Files to create:**
```
native/vertz-runtime/src/ssr/
└── dom_shim.rs               # NEW — load DOM shim into V8
```

**Acceptance criteria:**
- [ ] `globalThis.document` is defined after shim loads
- [ ] `globalThis.window` is defined
- [ ] `document.createElement('div')` returns an element-like object
- [ ] The shim doesn't interfere with other V8 modules

---

### Task 3: SSR render function — basic (single-pass)

**What to do:**
- Create the SSR orchestration:
  1. Load DOM shim
  2. Load the app entry module (via ModuleLoader with SSR compilation target)
  3. Call the app's render function with the request URL
  4. Collect the rendered HTML string
- Return the HTML as the response for page requests
- For now: single-pass rendering (no query discovery)

**Files to create:**
```
native/vertz-runtime/src/ssr/
└── render.rs                 # NEW — SSR orchestration
```

**Acceptance criteria:**
- [ ] SSR renders a simple component to HTML string
- [ ] HTML contains the rendered component content (not empty `<div id="app">`)
- [ ] The correct route is rendered based on request URL
- [ ] SSR errors are caught (no crash) — fallback to client-only shell

---

### Task 4: CSS collection during SSR

**What to do:**
- During SSR rendering, components inject CSS (via `css()` / `variants()`)
- Intercept this CSS injection and collect all CSS
- Inline collected CSS as `<style>` tags in the SSR HTML `<head>`
- This prevents FOUC — CSS is available before JavaScript loads

**Files to modify:**
```
native/vertz-runtime/src/ssr/render.rs    # MODIFY — collect CSS
```

**Files to create:**
```
native/vertz-runtime/src/ssr/
└── css_collector.rs          # NEW — CSS interception during SSR
```

**Acceptance criteria:**
- [ ] Theme CSS is inlined in `<head>`
- [ ] Component-level CSS (from `css()` calls) is inlined
- [ ] No FOUC on page load
- [ ] CSS is deduplicated (same CSS not included twice)

---

### Task 5: Hydration data serialization

**What to do:**
- After SSR, serialize the query cache (pre-fetched data) into the HTML
- Embed as `<script>window.__VERTZ_SSR_DATA__ = {...}</script>` before the app script
- Client reads this data on hydration — no re-fetch for SSR'd queries

**Files to create:**
```
native/vertz-runtime/src/ssr/
└── hydration.rs              # NEW — serialize SSR data for client
```

**Acceptance criteria:**
- [ ] SSR data is embedded in the HTML as a script tag
- [ ] Client-side hydration reads the data (no duplicate API calls)
- [ ] Data is JSON-serializable (no functions, no circular refs)
- [ ] Large payloads are handled (no truncation)

---

### Task 6: Two-pass SSR with query discovery

**What to do:**
- Implement the full two-pass SSR flow:
  1. **Pass 1 (discover):** Run the component tree to collect query registrations
  2. **Fetch:** Execute all discovered queries in parallel
  3. **Pass 2 (render):** Re-run with pre-populated query cache → produce final HTML
- Use the `AsyncLocalStorage` polyfill for per-request query tracking

**Files to modify:**
```
native/vertz-runtime/src/ssr/render.rs    # MODIFY — add two-pass flow
```

**Acceptance criteria:**
- [ ] Queries registered during Pass 1 are discovered
- [ ] All discovered queries are fetched in parallel between passes
- [ ] Pass 2 renders with pre-populated data (no loading states for discovered queries)
- [ ] Components with queries show data in SSR HTML (not loading placeholders)

---

### Task 7: Session/auth resolution

**What to do:**
- Extract session data from request cookies
- Pass session context to SSR rendering (accessible via `useAuth()` etc.)
- If no session, render as unauthenticated

**Files to create:**
```
native/vertz-runtime/src/ssr/
└── session.rs                # NEW — cookie → session resolution
```

**Acceptance criteria:**
- [ ] Authenticated requests render user-specific content in SSR
- [ ] Unauthenticated requests render public content
- [ ] Session resolution doesn't block SSR (timeout if cookie validation is slow)

---

### Task 8: Full HTML document assembly

**What to do:**
- Assemble the complete SSR HTML response:
  - `<!DOCTYPE html>` + standard head tags
  - Inlined CSS (theme + component CSS)
  - Pre-rendered HTML in `<div id="app">`
  - Hydration data script
  - Module script for client hydration
  - `<link rel="modulepreload">` hints

**Files to create:**
```
native/vertz-runtime/src/ssr/
└── html_document.rs          # NEW — full HTML assembly
```

**Acceptance criteria:**
- [ ] Response is a complete, valid HTML document
- [ ] SSR content is inside `<div id="app">`
- [ ] CSS is in `<head>` before content (no FOUC)
- [ ] Hydration data is before the app script
- [ ] Module preload hints are included

---

### Task 9: End-to-end — SSR with example apps

**What to do:**
- Validate SSR with task-manager and linear-clone example apps
- Check: SSR HTML contains rendered content, hydration works, no errors

**Acceptance criteria:**
- [ ] Task manager homepage SSR contains task list content in HTML
- [ ] Linear clone homepage SSR contains rendered content
- [ ] Client-side hydration succeeds (app becomes interactive)
- [ ] No "hydration mismatch" warnings
- [ ] SSR performance: < 200ms for a typical page

---

## Quality Gates

```bash
cd native && cargo test -p vertz-runtime
```

---

## Notes

- AsyncLocalStorage polyfill is the highest risk item. If PromiseHook doesn't work, fallback: add `deno_node` for just `async_hooks` (heavy but proven).
- This phase can overlap with Phase 5 since HMR doesn't depend on SSR.
- SSR performance benchmark: compare against the current Bun-based SSR on the same app. Must be within 2x.
