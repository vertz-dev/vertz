# Design: Clean Server Runtime (Scope DOM Shim to SSR Renders)

**Issue:** #2760
**Status:** Draft (Rev 2 — addressing DX, Product, and Technical review findings)
**Date:** 2026-04-18

## Summary

Vertz server handlers run in the same V8 context as SSR rendering, which pre-installs a DOM shim (`window`, `document`, `navigator`, `location`, `history`, DOM constructors, no-op event APIs). Third-party SDKs like `@anthropic-ai/sdk` detect `typeof window !== 'undefined' && typeof document !== 'undefined'` and refuse to run without `dangerouslyAllowBrowser: true`. This design scopes the browser-confusing subset of the shim to SSR render boundaries so server handlers see a Cloudflare-Workers-like environment.

## Problem Statement

Today, `native/vtz/src/ssr/dom_shim.rs` is executed at snapshot creation time (`native/vtz/src/runtime/snapshot.rs:225-234`) and unconditionally installs browser-like globals on `globalThis`. Both SSR and API handler messages are dispatched sequentially through the same V8 isolate on one thread (`native/vtz/src/runtime/persistent_isolate.rs::process_messages` line 915; verified: `run_event_loop()` does not dequeue the next message until the current Rust future completes, so renders are serialized at message granularity). A handler that calls `new Anthropic({ apiKey })` sees `window` and `document` defined, the SDK's browser check fires, and the constructor throws:

```
It looks like you're running in a browser-like environment.
This is disabled by default, as it risks exposing your secret API credentials to attackers.
```

Users work around this with `dangerouslyAllowBrowser: true`, which is semantically wrong (the code is on the server) and disables a real safety check for anyone copying the code into a client component. The same issue affects any SDK that gates on browser globals (OpenAI, Stripe, etc.).

## Goals

1. Server handler code sees a Cloudflare-Workers-like environment: **no `window`, no `document`, no `location`, no `history`, no DOM element constructors (`HTMLElement`, `Element`, `Text`, `Document`, `DocumentFragment`, `SVGElement`)**.
2. `navigator` stays permanently defined with a Worker-compatible `userAgent` (Workers have `navigator.userAgent = 'Cloudflare-Workers'`; we match the shape so local dev matches production).
3. SSR rendering still has the full DOM shim available.
4. `new Anthropic({ apiKey })` (and similarly-guarded SDKs) works without `dangerouslyAllowBrowser`.
5. Vertz's own `isBrowser()` continues to return the right answer: `false` in handlers, `false` in SSR (via `hasSSRResolver()`), `true` only in real browsers.
6. No regression in SSR output, client hydration, or CSS collection.

## Non-Goals

- **Split the V8 isolate into two isolates.** Kept as a single isolate for snapshot reuse and memory footprint. The scoped-shim approach provides equivalent user-visible behavior.
- **Provide a Vertz SDK wrapper for Anthropic/OpenAI/etc.** Users instantiate standard SDKs directly with their documented APIs.
- **Sandbox server handler code.** This design removes confusing globals, it does not add isolation. Server code retains full Vertz API access.
- **Add a throwing `document` Proxy in handler context for better error messages.** A plain `ReferenceError: document is not defined` is acceptable; user-facing UI code inside a handler is already a bug. If user telemetry shows the raw error is confusing, we can revisit in a later issue.
- **Introduce `isServer()` / `isSSR()` helpers.** `isBrowser()` is sufficient for the cases users hit today. A new helper is out of scope (tracked separately if needed).
- **Change how the compiled client bundle works.** Client code still runs in a real browser with a real `window`.

## Why Not The Minimal Fix

The smallest change that makes Anthropic's SDK stop complaining is: remove the line `globalThis.window = globalThis;` from `dom_shim.rs`. We reject this for three reasons:

1. **Insufficient coverage.** The Anthropic SDK's check is `typeof window !== 'undefined' && typeof document !== 'undefined'` (both). Some SDKs only check `window`, others check `document`, others check `XMLHttpRequest` or `localStorage`. Removing just `window` fixes Anthropic today but leaves the next SDK broken tomorrow.
2. **Misleading `isBrowser()`.** With `window` gone but `document`, `location`, `history` still defined, user code doing `typeof document !== 'undefined'` still thinks it's in a browser. The handler environment would be internally inconsistent.
3. **No Worker parity.** Workers have neither `window` nor `document` nor DOM constructors. A handler that works locally but fails on Vertz Cloud is an "if it builds, it works" violation.

## Design

### Architecture

Split the existing single-IIFE DOM shim into two sections:

**Permanent (executed once at snapshot creation, visible to both handlers and SSR):**
- `navigator` (Worker-compatible: `{ userAgent: 'vertz-server/1.0', ... }`)
- CSS collector state and functions: `__vertz_collected_css` (module-closed array), `__vertz_inject_css`, `__vertz_get_collected_css`, `__vertz_clear_collected_css`
- `URLSearchParams` shim (only if deno_core doesn't provide one — verify in Phase 1; most likely already present, in which case this line is removed)
- `__vertz_install_dom_shim()` / `__vertz_uninstall_dom_shim()` function registrations

**Scoped (installed/uninstalled per SSR render via the functions above):**
- `window` (alias for `globalThis`)
- `document` (fresh `SSRDocument` instance per install — see "State isolation between renders" below)
- `location` (object reflecting the current SSR request URL — already overwritten per-request by `set_ssr_location` in `dispatch_ssr_request`)
- `history` (no-op stub)
- DOM element constructors: `HTMLElement`, `Element`, `Text`, `Document`, `DocumentFragment`, `SVGElement`, `Node`, `Comment`
- Event API stubs: `addEventListener`, `removeEventListener`, `dispatchEvent`
- `ELEMENT_NODE` and other nodeType constants (if still referenced)

### CSS collector: moved out of the closure

Today `__vertz_collected_css` is a `const` inside the shim's IIFE. If we re-executed the shim per render, every render would create a fresh closure and break any code holding a reference to the old `__vertz_inject_css`. Fix: move `__vertz_collected_css` to a non-enumerable property on `globalThis` (e.g., `globalThis.__vertz_css_state`) owned by the permanent block. The install function resets it at the start of each SSR render (clears the array); the uninstall function does nothing to it (the array stays so handler code that called `__vertz_inject_css` mid-response still works, though no handler should do that).

### `__vertz_install_dom_shim` and `__vertz_uninstall_dom_shim`

Both functions are plain JS registered once in the permanent block. No IIFE re-execution. Each toggles ~10 specific properties on `globalThis`. Execution cost per call is on the order of tens of microseconds (handful of property writes + one `SSRDocument` allocation on install). The heavy `dom_shim.rs` parse/compile happens once at snapshot time.

```js
let __vertz_shim_installed = false;
globalThis.__vertz_install_dom_shim = function () {
  if (__vertz_shim_installed) return;
  __vertz_shim_installed = true;
  globalThis.window = globalThis;
  globalThis.document = new SSRDocument();
  globalThis.location = { /* default; overwritten by set_ssr_location */ };
  globalThis.history = { pushState(){}, replaceState(){}, back(){}, forward(){}, go(){}, state: null, length: 1 };
  globalThis.addEventListener = function () {};
  globalThis.removeEventListener = function () {};
  globalThis.dispatchEvent = function () { return true; };
  globalThis.HTMLElement = HTMLElement_ctor;
  globalThis.Element = Element_ctor;
  // …other DOM constructors…
  globalThis.__vertz_css_state.length = 0; // reset collector for this render
};
globalThis.__vertz_uninstall_dom_shim = function () {
  if (!__vertz_shim_installed) return;
  __vertz_shim_installed = false;
  delete globalThis.window;
  delete globalThis.document;
  delete globalThis.location;
  delete globalThis.history;
  delete globalThis.addEventListener;
  delete globalThis.removeEventListener;
  delete globalThis.dispatchEvent;
  delete globalThis.HTMLElement;
  delete globalThis.Element;
  // …other DOM constructors…
};
```

The constructor references (`HTMLElement_ctor`, etc.) are captured in the permanent block's closure once, so install is a cheap assignment, not a class-definition.

### Where install/uninstall is called (correct hook location)

The correct integration points are both JS-dispatch functions in `native/vtz/src/runtime/persistent_isolate.rs`:

1. **`dispatch_ssr_request`** (line 1358) — add install before `SSR_RESET_JS` execution (line 1366) and uninstall in a Rust-side cleanup that runs even if `run_event_loop` returns an error or times out.
2. **`dispatch_component_render`** (line 1670) — same pattern: install before `COMPONENT_RESET_JS`, uninstall in cleanup.

Cleanup pattern: wrap the dispatch body in a Rust `scopeguard::defer!` (the crate is already in use) or, more minimally, capture the result in a variable and run uninstall before returning. Every early-return path goes through the uninstall.

`native/vtz/src/ssr/component_render.rs::assemble_component_document` is **not** a hook point — it is pure Rust that builds the outer HTML skeleton and does not execute JS. (An earlier revision of this design mis-identified it; corrected here.)

No other JS-dispatching SSR paths exist — verified by grep: no streaming SSR, no suspense dispatch, no resumed-hydration path outside these two functions.

### Fetch interceptor dependency on `location`

`FETCH_INTERCEPTOR_JS` (`native/vtz/src/runtime/js_runtime.rs` around line 1137) currently reads `globalThis.location.origin` at installation time to set `selfOrigin`. After this change, the interceptor installs when `location` is undefined. Two options:

1. **Preferred:** change the interceptor to read `globalThis.location?.origin` **lazily per fetch call** instead of caching `selfOrigin` at init. Cost per fetch is a single property read — negligible.
2. Fallback: keep `location` permanently installed (contradicts Worker parity, rejected).

Option 1 is part of this feature's Phase 2 work.

### Why `hasSSRResolver()` stays

DX reviewer asked whether `hasSSRResolver()` is dead code after this change. It is not. During SSR renders, the shim is installed, so `typeof window !== 'undefined'` returns true. `isBrowser()` must still return `false` during SSR renders (user components use it to decide whether to skip client-only effects). `hasSSRResolver()` is what tells us "we're rendering on the server, not in a real browser" — it is load-bearing, not belt-and-braces. Comment updated accordingly.

### Audit: no handler-reachable unguarded DOM access

All `window.X` / `document.X` / `location.X` references in packages transitively importable by handlers fall into one of three safe classes:

| File:line | Code | Classification |
|---|---|---|
| `packages/ui/src/env/is-browser.ts:14` | `typeof window !== 'undefined' && !hasSSRResolver()` | SAFE — `typeof` guard |
| `packages/ui/src/router/reactive-search-params.ts:60` | `typeof window !== 'undefined' ? window.location.pathname : '/'` | SAFE — `typeof` guard |
| `packages/ui/src/router/view-transitions.ts:57,64` | `typeof document === 'undefined'`, `typeof window !== 'undefined'` | SAFE — `typeof` guards |
| `packages/ui/src/router/navigate.ts:395` | `initialUrl ?? window.location.pathname + window.location.search` | FN-GATED — inside `navigate()`, which is only called client-side (SSR provides `initialUrl`; `??` short-circuits) |
| `packages/ui/src/router/navigate.ts:642,644,678,695,698` | `window.history.*`, `window.addEventListener` | FN-GATED — all inside `navigate()` / `onPopState` / disposer, client-only code paths |
| `packages/ui/src/router/server-nav.ts:67,99` | `document.dispatchEvent(...)` | FN-GATED — inside callbacks that only fire client-side, gated by `globalThis.__VERTZ_SSR_PUSH__` / prefetch-active globals |
| `packages/ui/src/auth/auth-context.ts:530`, `create-access-provider.ts:39` | `window.__VERTZ_ACCESS_SET__` | FN-GATED — inside `createAccessProvider()`, client-bundle path |
| `packages/ui/src/query/query.ts:592,598,604` | `document.addEventListener` for nav-prefetch-done | FN-GATED — inside reactive effect, activated only when `globalThis.__VERTZ_NAV_PREFETCH_ACTIVE__` is set (client-only) |

No module-level unguarded reference. The audit is exhaustive for `packages/ui`, `packages/server`, `packages/agents`, `packages/forms`, `packages/codegen`, `packages/ui-server`. Phase 1's first task is to re-run this grep against the current tree and fail CI if any unclassified hit appears.

### Test snapshot path

`TEST_DOM_SHIM_JS` (test-only snapshot) is updated the same way: split into permanent + scoped functions. Test suites that exercise the DOM shim now call `globalThis.__vertz_install_dom_shim()` at the top of each test (or in a shared `beforeEach`). This is a mechanical update to maybe a dozen test files.

### API Surface

No public TypeScript API changes. Internal JS API (not user-facing):

```js
globalThis.__vertz_install_dom_shim(): void
globalThis.__vertz_uninstall_dom_shim(): void
```

`packages/ui/src/env/is-browser.ts` signature and body unchanged:

```ts
export function isBrowser(): boolean {
  return typeof window !== 'undefined' && !hasSSRResolver();
}
```

## Manifesto Alignment

- **"If it builds, it works"** — Handlers that `new Anthropic({...})` today produce runtime errors without `dangerouslyAllowBrowser`. After this change, the SDK sees a Worker-like env and initializes correctly.
- **"Zero-config DX"** — No workaround flag, no Vertz-specific config, no wrapper.
- **"No escape hatches that compromise safety"** — Removing the need for `dangerouslyAllowBrowser` is a safety win.
- **"Local dev matches production"** — Handlers now see a Worker-compatible environment; Vertz Cloud users do not hit new issues when deploying.

**Trade-off accepted:** Two JS function calls per SSR render (install + uninstall, ~tens of microseconds each). Negligible given the render itself is milliseconds to seconds of user code.

**Trade-off rejected:** Two V8 isolates / two contexts per isolate. Better isolation but doubles snapshot restore cost and complicates module sharing. Not worth it for the user-visible outcome.

## Unknowns

All previously open items from Rev 1 are now resolved or scheduled into Phase 1:

1. ~~Handler-reachable unguarded DOM access~~ → resolved in "Audit" table above.
2. ~~Right hook point~~ → resolved: `dispatch_ssr_request` and `dispatch_component_render` in `persistent_isolate.rs`.
3. ~~CSS collector closure issue~~ → resolved: state moves to `globalThis.__vertz_css_state`.
4. ~~Fetch interceptor `location` dependency~~ → resolved: read `location?.origin` lazily per fetch call.
5. ~~Other streaming / suspense paths~~ → resolved: verified only two dispatch functions exist.

Remaining open (to be resolved during Phase 1):

- Does deno_core's baseline snapshot already provide `URLSearchParams`? If yes, delete the shim's polyfill; if no, keep it in the permanent block. Answer: read the deno_core `ops` list; one-line decision.
- Does `@anthropic-ai/sdk` also check `XMLHttpRequest` or `self`? Install the SDK locally, read its detection code, confirm that removing `window` + `document` is sufficient. If it also checks `self`, permanent block must explicitly `delete globalThis.self` (note: deno_core may define `self` by default).

## POC Results

No separate POC. The mechanism — toggling a handful of globals on `globalThis` around a JS function call on a single-threaded runtime — is a well-understood pattern. Risk is concentrated in the grep audit (now included inline) and the fetch interceptor lazy-read (mechanical).

## Type Flow Map

No new TypeScript generics. `isBrowser(): boolean` signature unchanged. All changes are Rust and runtime-internal JS.

## E2E Acceptance Test

### Developer walkthrough

```ts
// src/api/summarize.ts
import Anthropic from '@anthropic-ai/sdk';
import { service } from '@vertz/server';

export default service({
  summarize: async ({ text }: { text: string }) => {
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });
    // No dangerouslyAllowBrowser flag needed — works without it.
    const msg = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1024,
      messages: [{ role: 'user', content: `Summarize: ${text}` }],
    });
    return msg.content;
  },
});
```

**Before:** `new Anthropic(...)` throws `"It looks like you're running in a browser-like environment"`.
**After:** `new Anthropic(...)` succeeds.

### BDD Acceptance Criteria

```ts
// Rust tests live at native/vtz/src/ssr/__tests__/dom_shim_scope_test.rs
// (Rust syntax #[test] fn; BDD structure shown below as pseudocode for clarity)

describe('Feature: DOM shim is scoped to SSR renders', () => {
  describe('Given a fresh V8 runtime from the production snapshot', () => {
    describe('When the runtime evaluates `typeof window` before any SSR render', () => {
      it('then returns "undefined"', () => {});
    });
    describe('When the runtime evaluates `typeof document` before any SSR render', () => {
      it('then returns "undefined"', () => {});
    });
    describe('When the runtime evaluates `typeof HTMLElement`', () => {
      it('then returns "undefined"', () => {});
    });
    describe('When the runtime evaluates `typeof navigator`', () => {
      it('then returns "object" with userAgent set', () => {});
    });
  });

  describe('Given an SSR render is in flight', () => {
    describe('When user component code reads `window`', () => {
      it('then window is defined and equals globalThis', () => {});
    });
    describe('When the SSR render completes normally', () => {
      it('then window is undefined in the next evaluation', () => {});
    });
    describe('When the SSR render throws mid-flight', () => {
      it('then window is still undefined after the throw (uninstall ran in finally)', () => {});
    });
    describe('When the SSR render awaits a Promise, completes, then a second render runs', () => {
      it('then the second render starts with a fresh document and empty CSS collector', () => {});
    });
  });

  describe('Given two back-to-back SSR renders', () => {
    describe('When the first render injects CSS via __vertz_inject_css("body{...}")', () => {
      it('then the first render\'s response contains that CSS', () => {});
      it('then the second render\'s __vertz_get_collected_css() does NOT contain that CSS', () => {});
    });
  });

  describe('Given a server handler imports `@anthropic-ai/sdk`', () => {
    describe('When the handler runs `new Anthropic({ apiKey: "x" })`', () => {
      it('then construction succeeds without dangerouslyAllowBrowser', () => {});
    });
  });
});
```

### TypeScript integration test

```ts
// packages/integration-tests/src/__tests__/server-clean-env.test.ts (new)
import { describe, it, expect } from '@vertz/testing';
import Anthropic from '@anthropic-ai/sdk';

describe('Feature: server handlers see a Worker-like environment', () => {
  describe('Given a handler evaluates `typeof window`', () => {
    it('then the result is "undefined"', async () => {
      const result = await invokeHandlerReturning(() => typeof window);
      expect(result).toBe('undefined');
    });
  });

  describe('Given a handler constructs @anthropic-ai/sdk', () => {
    it('then construction succeeds without dangerouslyAllowBrowser', async () => {
      await invokeHandler(() => {
        const client = new Anthropic({ apiKey: 'test-key' });
        return !!client;
      });
      // No throw = pass
    });
  });
});
```

The helper `invokeHandlerReturning` runs user code inside the server handler context via the same dispatch path a real HTTP request would take, so we exercise the actual install/uninstall pattern.

## Rollout

1. **Phase 1** (foundation + audit): permanent/scoped split of `dom_shim.rs`, move CSS collector state out of IIFE, register install/uninstall functions, do not yet wire into dispatch. Re-run audit grep and fail CI on unclassified handler-reachable DOM references.
2. **Phase 2** (wiring + fetch fix): call install/uninstall in `dispatch_ssr_request` and `dispatch_component_render` with cleanup-on-error; change `FETCH_INTERCEPTOR_JS` to read `location` lazily.
3. **Phase 3** (tests + docs): all BDD scenarios pass, docs update in `packages/mint-docs/` under Server → Environment ("Server handlers run in a Worker-compatible environment; you can use any SDK without `dangerouslyAllowBrowser` flags").
4. Changeset as `patch`.

Full quality gates (`vtz test && vtz run typecheck && vtz run lint`; `cargo test --all && cargo clippy --all-targets -- -D warnings && cargo fmt --all -- --check`) after every phase.
