# Plan: Universal Rendering Model — One Pipeline, Every Target

**Status:** Draft (Rev 2 — addressing review feedback)
**Priority:** P1
**Owner:** TBD
**GitHub Issues:** [#664](https://github.com/vertz-dev/vertz/issues/664) (universal rendering), [#660](https://github.com/vertz-dev/vertz/issues/660) (effect internal-only)

> **Note:** This is a greenfield project with no external users. Breaking changes are fully allowed. Review feedback about migration strategy, backward compatibility, and deprecation paths has been acknowledged and dismissed — correctness, DX quality, and architectural soundness are the review criteria.

## Problem

After fixing SSR DOM compiler bugs in PR #662 and PR #663, the root cause of recurring SSR issues is clear: **three divergent code paths**.

Every DOM primitive (`__text`, `__child`, `__conditional`, `__attr`, `__list`, `__insert`) has three branches:

1. **CSR** — `effect()` runs, DOM is live
2. **SSR** — `effect()` is a no-op, DOM is empty (the bug class we keep patching)
3. **Hydration** — client claims existing DOM, re-attaches effects

This means every new feature multiplies across three paths. The `effect()` no-op during SSR is a permanent source of bugs — components that work in the browser silently produce empty or broken HTML on the server.

### Evidence

- **PR #662**: Fixed SSR artifacts in JSX runtime path (signal unwrapping)
- **PR #663**: Fixed SSR artifacts in DOM compiler path (8 separate fixes)
- **`__conditional`** has a 37-line SSR-specific function (`ssrConditional`, lines 68–104 of `conditional.ts`) that duplicates logic from the CSR path
- **`__insert`** has a `unwrapSignal` duck-typing hack that only exists because effects don't run during SSR
- **Signal values render as `[object Object]`** in SSR because the effect that would populate text content never fires
- **`ThemeProvider`** (`css/theme-provider.ts`) has its own SSR detection heuristic (`import.meta.env.SSR`, `__VERTZ_IS_SSR__`, `typeof document`) and returns a VNode-compatible plain object during SSR — a fourth divergent code path not in the DOM primitives

Every one of these bugs has the same root cause: code that assumes effects will populate the DOM, but effects are skipped during SSR.

## Proposal

### Universal render pipeline

Every component, everywhere, does the same thing:

1. **Synchronous render** — component function runs, produces a node tree, **DOM effects** run once to populate initial state
2. **Output adapter** determines what happens next:

| Target | After render |
|--------|-------------|
| Browser (first load) | Serialize to HTML, hydrate, effects track reactivity |
| Browser (navigation) | Tree IS the live DOM, effects track reactivity |
| Server | Serialize to HTML string, discard tree |
| Tauri / Electron-Bun | Same as browser — real webview |
| Custom Bun native runtime | Node tree maps to native widgets, effects update them |

### Two-tier effect model

The key insight from review feedback: **not all effects should run during SSR**. There are two categories:

| Effect type | Purpose | SSR behavior | Examples |
|-------------|---------|-------------|----------|
| **DOM effects** | Populate node content (text, attributes, conditionals, lists) | **Run once, no tracking** | `__text`, `__child`, `__conditional`, `__attr`, `__list` |
| **Side effects** | React to signal changes over time (navigation, logging, timers) | **Skip entirely** | `watch()`, `onMount()`, `RouterView` page switching |

This is NOT a new bifurcation — it's making the existing implicit distinction explicit. Today, DOM effects and side effects are already different (DOM effects use `effect()` directly in framework internals; side effects use `watch()`/`onMount()` which wrap `effect()`). The difference is that today both are no-ops during SSR, causing bugs in the DOM path. After this change, only DOM effects run during SSR — which is exactly what's needed to populate content.

#### Implementation mechanism

```ts
// Internal: DOM effect — runs during SSR (populates content)
export function effect(fn: () => void): DisposeFn {
  if (isSSR()) {
    fn();             // Run once, populate DOM content
    return () => {};  // No subscriptions, no tracking
  }
  // ... run fn, track dependencies (unchanged for CSR)
}

// Internal: side effect — skips during SSR
export function sideEffect(fn: () => void): DisposeFn {
  if (isSSR()) {
    return () => {};  // Skip entirely — no DOM to populate, no reactivity needed
  }
  // ... same as effect() in CSR
}
```

`watch()` and `onMount()` use `sideEffect()` internally. DOM primitives (`__text`, `__child`, `__conditional`, etc.) use `effect()`. This is a clean, enforceable separation:

- **`effect()`** = "this callback populates DOM content" → runs during SSR
- **`sideEffect()`** = "this callback reacts to changes over time" → skips during SSR

Both are internal-only. App developers never see either one.

#### Why this is correct for RouterView

`RouterView` uses `watch()` to react to route changes and swap page content (`container.innerHTML = ''`). During SSR:
- `watch()` uses `sideEffect()` → skips entirely → no page swapping
- The component function still runs → returns the container element
- The SSR rendering pipeline renders the initial route's page component directly (the SSR entry already matches the URL and renders the correct page)

If `watch()` ran during SSR, it would call `container.innerHTML = ''` and destroy the SSR content. Skipping is correct.

### Error handling during SSR effects

When a DOM effect (`effect()`) throws during SSR:

1. **The error is caught and logged** — the SSR render continues with partial content
2. **The failing node gets a placeholder** — empty text or comment node, not a crash
3. **The error is surfaced in the SSR response metadata** — the caller can decide to retry, fall back, or return a 500

```ts
export function effect(fn: () => void): DisposeFn {
  if (isSSR()) {
    try {
      fn();
    } catch (err) {
      // Log but don't crash — SSR should be resilient
      console.error('[vertz:ssr] Effect error during render:', err);
      // The node retains its default/empty state
    }
    return () => {};
  }
  // ... CSR path unchanged
}
```

This matches the behavior of other SSR frameworks (React, Solid) where component errors during SSR are caught at the boundary level and don't crash the entire response.

#### Signal writes during SSR effects

Effects that read and write the same signal (e.g., `count++` inside an effect) execute once — there's no tracking, so no re-execution loop. Signal `.value` writes are allowed during SSR (they update the value) but trigger no subscribers (because none exist). This is safe and deterministic.

#### Microtasks and timers in effects

Effects that schedule `queueMicrotask`, `setTimeout`, or `requestAnimationFrame` during SSR: the microtask/timer fires but the SSR tree may already be serialized and discarded by then. This is the same behavior as every SSR framework — side effects scheduled from render callbacks are fire-and-forget. Users who need to schedule work should use `onMount()`, which skips during SSR entirely.

### Lifecycle API simplification ([#660](https://github.com/vertz-dev/vertz/issues/660))

This proposal includes a breaking simplification of the public reactivity/lifecycle API, aligning with issue #660.

#### `effect()` becomes internal-only

`effect()` is removed from `@vertz/ui` public exports. It stays as the internal primitive that powers DOM reactivity (`__text()`, `__attr()`, etc.) — but app developers never call it directly.

**Why:** Raw `effect()` is the same trap as React's `useEffect` — powerful but dangerous. Users write effects that run at wrong times, leak subscriptions, create cascading updates, and mix side effects with rendering. It also confuses LLMs, who can't predict when to use `effect()` vs `watch()` vs `onMount()`. Removing it eliminates the ambiguity (Principle 2: one way to do things).

#### `onMount()` returns cleanup

Today `onMount()` returns `void` and users call a separate `onCleanup()` inside it. This is a footgun — `onCleanup()` throws `DisposalScopeError` if called outside a valid scope, and users regularly call it in the wrong place.

**Before:**
```tsx
import { onMount, onCleanup } from '@vertz/ui';

onMount(() => {
  const id = setInterval(() => seconds++, 1000);
  onCleanup(() => clearInterval(id));  // can throw if called wrong
});
```

**After:**
```tsx
import { onMount } from '@vertz/ui';

onMount(() => {
  const id = setInterval(() => seconds++, 1000);
  return () => clearInterval(id);  // return the cleanup — impossible to misuse
});
```

The returned function runs when the component is disposed. This mirrors the pattern from React's `useEffect` return value and Solid's `onCleanup`, but is simpler: `onMount` runs once, cleanup runs once. No dependency arrays, no re-execution.

**SSR behavior:** `onMount()` does NOT run during SSR. It's a side effect (timers, event listeners, DOM measurements) — none of which make sense on the server. The component function still runs and produces DOM content via DOM effects; `onMount` is strictly for client-side setup.

**Disposal scope interaction:** `onMount` creates an internal disposal scope. The returned cleanup function is registered in the parent scope via `_tryOnCleanup()`. If `onMount` is called outside any scope (e.g., at module level), the cleanup is simply not registered — same as today. No `DisposalScopeError` because `onCleanup()` is never called by the user.

#### `onCleanup()` becomes internal-only

With `onMount` returning the cleanup, standalone `onCleanup()` is no longer needed in user code. It stays internal for `watch()` and framework DOM helpers.

#### Two-tier export strategy

Not all consumers of `signal()` are app developers. Framework companion packages (`@vertz/ui-primitives`, `@vertz/tui`, `@vertz/ui-canvas`) build reusable components that need raw signal access. These are library authors, not app developers.

```ts
// @vertz/ui — public exports for app developers
export { onMount } from './component/lifecycle';
export { computed } from './runtime/signal';
export { batch } from './runtime/scheduler';
export { untrack } from './runtime/tracking';
export { query } from './query/query';
export { form } from './form/form';

// @vertz/ui/primitives — sub-export for library/component authors
export { signal, effect, sideEffect, watch, onCleanup } from './runtime/signal';
```

App developers import from `@vertz/ui`. Library authors who need raw primitives import from `@vertz/ui/primitives`. This is an explicit opt-in — the compiler can warn (or error) when app code imports from the primitives sub-export.

**Why not just export everything?** Because `signal()` and `effect()` in app code break the compiler's ability to do automatic field selection (see VertzQL section). The sub-export exists for the 1% who need it, with clear documentation that it opts out of compiler optimizations.

#### `watch()` — internal-only, SSR-safe

**Decision (resolved from Unknown #2):** Keep the implementation, make it internal-only, skip during SSR.

`watch()` uses `sideEffect()` internally, which means it's a no-op during SSR. This is correct:
- `RouterView` uses `watch()` to swap pages on navigation → no navigation happens during SSR
- Theme change listeners → no theme changes during SSR
- localStorage sync → no localStorage on the server

`watch()` stays internal for framework code that needs it. If user demand emerges, it can be promoted to public or added to `@vertz/ui/primitives`.

#### Summary of public API changes

| API | Before | After |
|-----|--------|-------|
| `effect()` | Public | **Internal-only** (`@vertz/ui/primitives` for library authors) |
| `signal()` | Public | **Internal-only** (`@vertz/ui/primitives` for library authors) |
| `onCleanup()` | Public (standalone) | **Internal-only** (use `onMount` return) |
| `watch()` | Public | **Internal-only** (for now) |
| `onMount()` | Public, returns `void` | Public, **returns cleanup**, **no-op during SSR** |
| `computed()` | Public | Public (typically via compiler `const`) |
| `query()` | Public | Public |
| `form()` | Public | Public |
| `batch()` | Public | Public |
| `untrack()` | Public | Public |

### Automatic query field selection (VertzQL integration)

A critical reason for making `signal`, `effect`, and `watch` internal-only in app code: **the compiler needs full control over data flow to enable automatic query field selection.**

#### What this enables

The compiler already has the infrastructure to track which fields of a `query()` result are accessed — both within the component and across component boundaries via props. This is the `FieldAccessAnalyzer` and `CrossComponentAnalyzer` in `packages/compiler/src/analyzers/`.

When all reactive state flows through compiler-controlled primitives (`let` → `signal`, `const` → `computed`, `query()` → tracked signals), the compiler can statically analyze the full data access graph:

```tsx
// Parent component
export function UserList() {
  const users = query(() => sdk.users.list());

  return (
    <ul>
      {users.data.map((user) => (
        <UserCard key={user.id} user={user} />
      ))}
    </ul>
  );
}

// Child component
export function UserCard({ user }: { user: User }) {
  return (
    <div>
      <h3>{user.name}</h3>
      <p>{user.email}</p>
    </div>
  );
}
```

The compiler traces:
1. **Intra-component**: `UserList` accesses `users.data` (iterates with `.map()`)
2. **Prop flow**: `UserList` passes `user` (array element of `users.data`) to `UserCard` via prop
3. **Child access**: `UserCard` accesses `user.name` and `user.email`
4. **Backward propagation**: Aggregate → the query needs fields: `['id', 'name', 'email']`

This compiles to a VertzQL query that only requests those three fields — like GraphQL field selection, but automatic. No query language to learn, no manual field selection, no overfetching.

```
Narrowing hierarchy:
  DB table (all columns)
    → Schema annotations (.hidden(), .readOnly())
      → Entity relations config
        → Client query (per-request narrowing)
          → Compiler (auto-selects only fields the code actually reads)
```

#### Why internal-only APIs are required for app code

If users call `signal()` or `effect()` directly in app code, the compiler loses visibility into data flow:

```tsx
// BAD: compiler can't track what happens inside a raw effect
const userSignal = signal(null);
effect(() => {
  const data = users.data;
  userSignal.value = data;  // compiler loses the trail here
});
// Later: userSignal.value.name — compiler doesn't know this came from users query
```

```tsx
// GOOD: compiler-controlled primitives maintain full traceability
const users = query(() => sdk.users.list());
const firstUser = users.data[0];  // compiler tracks: firstUser derives from users.data
return <span>{firstUser.name}</span>;  // compiler knows: users needs 'name'
```

Library authors who import from `@vertz/ui/primitives` accept this trade-off explicitly — their components opt out of automatic field selection. This is documented and intentional.

#### Current status

- **`FieldAccessAnalyzer`**: Implemented, 18 test cases, handles direct access, nested access, `.map()`/`.filter()` chains, destructuring, opaque access detection
- **`CrossComponentAnalyzer`**: Implemented, handles prop flow graphs, backward aggregation, cycle detection
- **Not yet wired into codegen**: The analyzers produce field lists but don't yet compile to VertzQL queries. This is future work that depends on the universal rendering model being in place.

#### How the universal model helps

With the universal rendering model, the same component code runs on both server and client. The field analysis happens at compile time (not runtime), so it works regardless of rendering target. The compiled VertzQL query is the same whether the component renders on the server or in the browser — the compiler has already determined the minimal field set.

### What gets deleted

- `isSSR()` / `isInSSRContext()` checks in all DOM primitives (`element.ts`, `conditional.ts`)
- SSR-specific functions: `ssrConditional()` in `conditional.ts`
- `effect()` no-op guard in `signal.ts` (replaced with run-once)
- `unwrapSignal` duck-typing in `element.ts` and `conditional.ts`
- VNode duck-typing (`isVNode`, `vnodeToDOM`) from PR #663
- `effect` from `@vertz/ui` public exports (available via `@vertz/ui/primitives`)
- `signal` from `@vertz/ui` public exports (available via `@vertz/ui/primitives`)
- `onCleanup` from `@vertz/ui` public exports
- `watch` from `@vertz/ui` public exports
- `DisposalScopeError` from public exports (no longer reachable from user code)
- `ThemeProvider` VNode path — replaced by universal DOM rendering (SSR shim handles `document.createElement` directly)

### What gets refactored (NOT deleted)

- **Existing SSR tests** — rewritten to test the same behaviors through the universal pipeline (not deleted, not skipped)
- **`ThemeProvider`** — SSR VNode branch removed, unified to use `document.createElement` in all environments (SSR shim provides `document`)
- **`__conditional`** hydration path — merged into the single path using a `getIsHydrating()` check for claim behavior only (see Phase 2)

### What stays the same

- Component authoring model (unchanged for users — `let`, `const`, JSX)
- `onMount()`, `computed()`, `query()`, `form()` public APIs
- Compiler output (`__text`, `__child`, etc. — same calls, simpler implementation)
- Hydration (still needed for browser first-load)

### What must NOT be deleted

These environment checks serve a different purpose than SSR rendering and must be preserved:

- **`navigate.ts` browser-API guards** — `typeof window === 'undefined'` checks guard `history.pushState`, `window.addEventListener('popstate')`, and `window.location` access. These are not SSR rendering branches — they protect against calling browser-only APIs on the server. Removing them would crash the server.
- **`createRouter()` SSR detection** — `typeof window === 'undefined' || typeof globalThis.__SSR_URL__ !== 'undefined'` determines the initial URL source (server: `__SSR_URL__`, browser: `window.location`). This is routing infrastructure, not rendering.
- **Any `typeof document === 'undefined'` guards** that protect against accessing DOM APIs that the SSR shim doesn't implement (e.g., `getBoundingClientRect`, `getComputedStyle`). These guards prevent runtime crashes, not rendering divergence.

## Alternatives Considered

### 1. Fix bugs at the compiler level

**Approach:** Instead of changing the runtime, make the compiler generate eager initialization code for SSR. The compiler would see `<span>{count}</span>` and generate `<span>0</span>` directly, bypassing effects entirely.

**Why rejected:** This requires the compiler to evaluate expressions at build time, which is impossible for dynamic values (props, query results, computed state). It works for `let count = 0` but fails for `const label = task.priority === 'high' ? 'Urgent' : 'Normal'` — the compiler doesn't know `task.priority` at build time. This would fix a subset of SSR bugs while leaving the fundamental three-path problem intact.

### 2. Keep three paths but make them explicit (RenderMode enum)

**Approach:** Pass a `RenderMode` enum to every DOM primitive. Make the branching visible and testable instead of hiding it behind `isSSR()` checks.

**Why rejected:** This adds a parameter to every internal function call, threading `mode` through the entire call stack. It makes the three-path problem MORE explicit but doesn't reduce it. Every new DOM primitive still needs three implementations. The bug surface area is unchanged — you just see it more clearly.

### 3. Different compilation path per target (Marko-style)

**Approach:** Compile separate client and server builds. The server build generates static HTML without effects; the client build generates reactive DOM.

**Why rejected:** This doubles the compiler's output surface and creates a new class of bugs: "server compilation generated different HTML than client." It also makes the compiler harder to port to native (two codegen paths instead of one). The universal model achieves the same goal (correct SSR output) with zero compiler changes.

## API Surface

### For component authors: minimal changes

Rendering code is unchanged. The only change is lifecycle: `onMount` returns a cleanup function, and `onCleanup` is no longer imported.

```tsx
// Rendering: identical before and after.
export function TaskCard({ task, onClick }: TaskCardProps) {
  let isHovered = false;

  const priorityLabel = task.priority === 'high' ? 'Urgent' : 'Normal';

  return (
    <div
      class={card({ priority: task.priority })}
      onMouseEnter={() => { isHovered = true; }}
      onMouseLeave={() => { isHovered = false; }}
      onClick={() => onClick(task.id)}
    >
      <span>{task.title}</span>
      <span>{priorityLabel}</span>
      {isHovered && <div class={styles.tooltip}>Click to view details</div>}
    </div>
  );
}
```

```tsx
// Lifecycle: onMount returns cleanup instead of separate onCleanup import.
export function Timer() {
  let seconds = 0;

  onMount(() => {
    const id = setInterval(() => { seconds++; }, 1000);
    return () => clearInterval(id);  // cleanup on disposal
  });

  return <p>{seconds}s</p>;
}
```

```tsx
// Data fetching: unchanged.
export function TaskList() {
  const tasks = query(() => fetchTasks(), { key: 'task-list' });

  onMount(() => {
    return () => tasks.dispose();  // cleanup on disposal
  });

  return (
    <ul>
      {tasks.loading && <li>Loading...</li>}
      {tasks.data?.items.map((t) => <li key={t.id}>{t.title}</li>)}
    </ul>
  );
}
```

### Complete public API after this change

```ts
// @vertz/ui — public exports (app developers)
export { onMount } from './component/lifecycle';    // lifecycle: run once, return cleanup
export { computed } from './runtime/signal';          // derived state (usually via compiler const)
export { batch } from './runtime/scheduler';          // batch signal updates
export { untrack } from './runtime/tracking';         // escape tracking
export { query } from './query/query';                // async data fetching
export { form } from './form/form';                   // form handling

// Types
export type { Computed, ReadonlySignal, Signal, DisposeFn } from './runtime/signal-types';

// @vertz/ui/primitives — sub-export for library/component authors
// WARNING: Using these opts out of automatic query field selection.
export { signal, computed, effect, sideEffect, watch, onCleanup } from './runtime/signal';
```

### For framework internals: two effect primitives

```ts
// effect() — DOM effect, runs during SSR
export function effect(fn: () => void): DisposeFn {
  if (isSSR()) {
    try {
      fn();             // Run once, populate DOM content
    } catch (err) {
      console.error('[vertz:ssr] Effect error during render:', err);
    }
    return () => {};  // No subscriptions, no tracking
  }
  // ... run fn, track dependencies (unchanged for CSR)
}

// sideEffect() — side effect, skips during SSR
export function sideEffect(fn: () => void): DisposeFn {
  if (isSSR()) {
    return () => {};  // No-op — side effects don't run on server
  }
  // ... same implementation as effect() for CSR
}
```

### For `__conditional`: one path instead of three

```ts
// Before: ssrConditional (37 lines) + csrConditional (72 lines) + hydrateConditional (78 lines)
// After: single path that works everywhere (hydration claim handled inline)

export function __conditional(
  condFn: () => boolean,
  trueFn: () => Node | null,
  falseFn: () => Node | null,
): DisposableNode {
  // Hydration: claim existing comment anchor from SSR output
  if (getIsHydrating()) {
    return hydrateConditional(condFn, trueFn, falseFn);
  }

  // Universal path: works for both CSR and SSR.
  // In CSR, effect tracks and re-runs on signal changes.
  // In SSR, effect runs once to populate, no tracking.
  const anchor = document.createComment('conditional');
  let currentNode: Node | null = null;
  let branchCleanups: DisposeFn[] = [];

  const outerScope = pushScope();
  effect(() => {
    runCleanups(branchCleanups);

    const scope = pushScope();
    const cond = condFn();
    const branchResult = cond ? trueFn() : falseFn();
    popScope();
    branchCleanups = scope;

    let newNode: Node;
    if (branchResult == null || typeof branchResult === 'boolean') {
      newNode = document.createComment('empty');
    } else if (branchResult instanceof Node) {
      newNode = branchResult;
    } else {
      newNode = document.createTextNode(String(branchResult));
    }

    if (currentNode?.parentNode) {
      currentNode.parentNode.replaceChild(newNode, currentNode);
    } else if (anchor.parentNode) {
      anchor.parentNode.insertBefore(newNode, anchor.nextSibling);
    }

    currentNode = newNode;
  });
  popScope();

  const wrapper = () => {
    runCleanups(branchCleanups);
    runCleanups(outerScope);
  };
  _tryOnCleanup(wrapper);

  const fragment = document.createDocumentFragment();
  fragment.appendChild(anchor);
  if (currentNode) fragment.appendChild(currentNode);

  return Object.assign(fragment, { dispose: wrapper });
}
```

Note: `ssrConditional` is deleted entirely. `hydrateConditional` stays because hydration claim logic (`claimComment()`) is fundamentally different from fresh rendering — it needs to find and reuse existing DOM nodes rather than create new ones. This is the only remaining "mode" in `__conditional`, and it's additive (hydration augments the DOM) rather than divergent (SSR replaces the logic).

### SSR DOM shim: `remove()` addition

The unified `__conditional` path uses `parentNode.replaceChild()` (not `node.remove()`), which `SSRNode` already implements. No shim changes needed for Phase 1-2.

If future code needs `node.remove()`, the SSR shim addition is trivial:
```ts
// SSRNode
remove(): void {
  if (this.parentNode) {
    this.parentNode.removeChild(this);
  }
}
```

## Manifesto Alignment

### One way to do things (Principle 2)

Today there are three code paths for rendering. After this change there is one (plus hydration claim, which is additive). This is the most direct application of "one way to do things" possible — we're reducing three divergent implementations to one shared implementation.

### If it builds, it works (Principle 1)

The current SSR bugs happen because `effect()` no-ops silently produce incorrect output that TypeScript can't catch. With the universal model, the same code runs everywhere — if it works in the browser, it works on the server.

### AI agents are first-class users (Principle 3)

LLMs struggle with environment-dependent behavior. When `effect()` means "run this" in the browser but "do nothing" on the server, the mental model fractures. One behavior everywhere is easier to reason about, predict, and generate correct code for.

### Performance is not optional (Principle 7)

The universal model replaces per-primitive `isSSR()` guard checks, `unwrapSignal()` calls, and the JSX-to-VNode conversion pipeline with a single `isSSR()` check at the `effect()` boundary. Performance claims will be validated with benchmarks during Phase 1 implementation (see acceptance criteria).

### No ceilings (Principle 8)

The universal model unlocks native rendering targets (Tauri, TUI, custom Bun runtimes) by formalizing the output adapter interface. The current SSR shim classes (`SSRElement`, `SSRTextNode`) become the prototype for a native adapter API. We stop being a browser-only framework.

### Compile-time over runtime — automatic query field selection

Making `signal`, `effect`, and `watch` internal-only in app code isn't just API hygiene — it's a compile-time guarantee. When all reactive data flows through compiler-controlled primitives, the `FieldAccessAnalyzer` and `CrossComponentAnalyzer` can statically determine which fields every query needs. This compiles to VertzQL queries that fetch exactly the right data — no overfetching, no underfetching, no runtime introspection. GraphQL field selection, but automatic and at build time.

### Tradeoffs accepted

- **Explicit over implicit**: DOM effects running during SSR is more explicit than silently no-opping. The `effect()`/`sideEffect()` distinction makes intent explicit in framework code.
- **Convention over configuration**: SSR is the default rendering model, not an opt-in mode.
- **Compile-time over runtime**: The universal model + internal-only reactivity primitives in app code enable the compiler to optimize data fetching at build time (automatic field selection). Library authors who need raw primitives can opt in via `@vertz/ui/primitives`.

## Non-Goals

### Phase 1–2 non-goals

- **Compiler output changes** — The compiler generates the same `__text`, `__child`, `__conditional` calls. Only the runtime behavior of these functions changes. Zero compiler modifications.
- **Server components** — Components run on both client and server, but there is no concept of "server-only components" that never ship to the client. This is a React Server Components pattern that we deliberately do not adopt.
- **SSR data loading threshold** — `query()` waiting for fast data during SSR is a follow-up (Phase 3)
- **Component streaming** — Progressive SSR rendering is a follow-up (Phase 4)
- **Live deploy streaming** — Component-level hot deployment is future work (Phase 6)
- **Output adapter interface** — Formalizing the native adapter API is a follow-up (Phase 5)
- **Replacing Vite** — The build tooling migration (Vite → Bun) is a separate effort (see Appendix A)
- **Native compiler** — Porting transforms to Zig/Rust is a separate effort that builds on this work
- **Suspense boundaries** — Not in scope for Phases 1–2. Interaction with Suspense will be designed in Phase 4 (streaming) when it becomes relevant.

### Permanent non-goals

- **Public `effect()` in `@vertz/ui`** — `effect()` stays out of the main export. Available via `@vertz/ui/primitives` for library authors.
- **Environment-specific component code** — Components must not check `isSSR()` or branch on environment. If a component needs to, the framework has a gap.

## Implementation Phases

### Phase 1: Two-tier effect model

Introduce `sideEffect()` and change `effect()` to run-once during SSR.

**Changes:**
- `packages/ui/src/runtime/signal.ts`:
  - Replace `isSSR() → return () => {}` with `isSSR() → try { fn() } catch { log } return () => {}`
  - Add `sideEffect()` function (skips during SSR, same as `effect()` in CSR)
- `packages/ui/src/component/lifecycle.ts`:
  - `onMount()` uses `sideEffect()` instead of `effect()` — no-op during SSR
  - `onMount()` returns the cleanup function
  - `watch()` uses `sideEffect()` instead of `effect()` — no-op during SSR

**Acceptance criteria:**
- Integration test: Component with `let count = 0` and `<span>{count}</span>` renders `<span>0</span>` in SSR (not `<span></span>` or `<span>[object Object]</span>`)
- Integration test: Component with `__conditional` renders correct branch in SSR without the SSR-specific code path
- Integration test: Signal subscriptions are NOT created during SSR (memory test — effect count stays at 0)
- Integration test: `onMount` callback does NOT run during SSR
- Integration test: `watch` callback does NOT run during SSR
- Integration test: Effect that throws during SSR logs error but does not crash the server
- Integration test: Nested component rendering during SSR — parent and child DOM effects run in correct order (depth-first)
- Integration test: Effect that reads and writes the same signal during SSR runs exactly once (no infinite loop)
- Performance baseline: Measure SSR render time for task-manager example before and after the change

### Phase 2: Simplify DOM primitives

Remove three-way branching from all DOM helpers. Single code path that works because `effect()` does the right thing. Hydration claim logic remains as an additive path.

**Changes:**
- `packages/ui/src/dom/conditional.ts`: Delete `ssrConditional()`, merge CSR path as the universal path. `hydrateConditional` stays but only for hydration claim.
- `packages/ui/src/dom/element.ts`: Remove `unwrapSignal()` from `__insert`, `__child`, `__text`
- `packages/ui/src/dom/attributes.ts`: Remove any SSR guards in `__attr`
- `packages/ui/src/dom/list.ts`: Verify `__list` works with universal effects, remove SSR-specific logic if any
- `packages/ui/src/css/theme-provider.ts`: Remove VNode SSR path, use `document.createElement` universally (SSR shim provides `document`)
- Delete `isSSR()` / `isInSSRContext()` imports from DOM primitive files

**Acceptance criteria:**
- All existing SSR tests pass (rewritten to test the same behaviors through the universal pipeline)
- All existing CSR tests pass unchanged
- All existing hydration tests pass unchanged — hydration `claimComment()` path verified
- No `isSSR()` / `isInSSRContext()` calls remain in `packages/ui/src/dom/`
- `ThemeProvider` renders correctly in both CSR and SSR without VNode path
- Integration test: Full task-manager example renders correctly via SSR with simplified primitives
- Hydration mismatch detection: test that when SSR HTML doesn't match client expectations, a warning is logged (not a crash)

### Phase 3: SSR data threshold

When rendering on the server, `query()` waits for data that resolves within a configurable threshold before serializing.

**Changes:**
- `query()` API gains an optional `ssrTimeout` option (default: 100ms)
- SSR rendering pipeline awaits pending queries up to the threshold
- If data resolves in time, SSR output includes real content instead of loading state

**Acceptance criteria:**
- Integration test: `query()` that resolves in <50ms returns data in SSR HTML
- Integration test: `query()` that resolves in >200ms returns loading state in SSR HTML
- Integration test: Configurable threshold per-query (`ssrTimeout: 0` disables waiting)

### Phase 4: Component streaming

Stream individual components during SSR for progressive rendering.

**Acceptance criteria:**
- Integration test: SSR response starts streaming HTML before all components finish rendering
- Integration test: Slow component appears after fast components in the stream
- Design decision: Interaction with Suspense boundaries documented

### Phase 5: Output adapter interface

Formalize the adapter pattern for non-browser targets.

**Acceptance criteria:**
- Type-level test: Adapter interface has minimal surface (`createElement`, `setAttribute`, `appendChild`, `createTextNode`)
- Integration test: TUI adapter renders component to terminal output
- SSR DOM shim (`SSRElement`, `SSRTextNode`) implements the adapter interface

### Phase 6: Live deploy streaming (future)

Component identity, interaction detection, incremental builds. Deferred — design doc required when we get here.

## Unknowns

### 1. Effect cleanup during SSR — run cleanup functions?

**Assessment:** Resolved.

**Decision:** No. During SSR, DOM effects run once to populate content, then the tree is serialized and discarded. Cleanup functions are not called — there's nothing to clean up. `onCleanup()` callbacks registered during SSR DOM effects are silently ignored. `onMount()` doesn't run during SSR, so its cleanup is irrelevant.

**Validation:** Integration test — register cleanup during SSR, verify it doesn't fire. Verify no memory leaks from accumulated cleanup references (disposal scopes are discarded with the SSR tree).

### 2. `watch()` behavior during SSR

**Assessment:** Resolved.

**Decision:** `watch()` skips during SSR (uses `sideEffect()`, not `effect()`). See "Two-tier effect model" section above for the full rationale.

### 3. Threshold default for SSR data loading (Phase 3)

**Assessment:** Needs POC.

**Question:** What's the right default? 50ms? 100ms? Should it be per-query or global?

**Resolution:** Build Phase 3 POC, measure real-world query latencies from the task-manager example, decide based on data.

### 4. Streaming granularity (Phase 4)

**Assessment:** Needs POC.

**Question:** Per-component or per-Suspense-boundary?

**Resolution:** Deferred to Phase 4 design.

### 5. Adapter interface minimal surface (Phase 5)

**Assessment:** Discussion-resolvable.

**Question:** What's the minimal set of DOM operations an adapter must implement?

**Current thinking:** `createElement(tag)`, `createTextNode(text)`, `createComment(text)`, `createDocumentFragment()`, `setAttribute(el, name, value)`, `removeAttribute(el, name)`, `appendChild(parent, child)`, `insertBefore(parent, newNode, ref)`, `removeChild(parent, child)`, `replaceChild(parent, newNode, oldNode)`, `addEventListener(el, event, handler)`. The SSR shim already implements most of this.

**Resolution:** Formalize during Phase 5 after Phases 1-2 reveal the actual minimal surface.

## Type Flow Map

The universal rendering model doesn't introduce new generic type parameters. The type flow is unchanged from the current architecture:

```
Component props → JSX transform → __element/__text/__child calls → effect(fn) → DOM/SSR output
Signal<T>.value → effect callback → Node.textContent / setAttribute
```

The change is behavioral (effect runs vs no-ops), not structural (no new types). The new `sideEffect()` has the same signature as `effect()`: `(fn: () => void) => DisposeFn`.

## E2E Acceptance Test

```ts
// packages/integration-tests/src/universal-rendering.test.ts
import { describe, it, expect } from 'bun:test';

describe('Universal rendering model', () => {
  it('renders identical output in CSR and SSR', async () => {
    // Given a component with reactive state, conditionals, lists, and attributes
    // When rendered in the browser (CSR)
    // And rendered on the server (SSR)
    // Then the initial HTML output is identical

    // CSR: component renders, effects fire, DOM has content
    const csrHtml = renderToDOM(TaskCard, { task: mockTask }).innerHTML;

    // SSR: component renders, effects fire once (no tracking), DOM shim has content
    const ssrHtml = await renderToSSR(TaskCard, { task: mockTask });

    expect(ssrHtml).toBe(csrHtml);
  });

  it('does not create signal subscriptions during SSR', async () => {
    // Given a component with 5 reactive bindings
    // When rendered on the server
    // Then zero subscriptions exist (effects ran but didn't track)
    const stats = await renderToSSRWithStats(TaskCard, { task: mockTask });
    expect(stats.subscriptionCount).toBe(0);
  });

  it('does not run onMount during SSR', async () => {
    // Given a component with onMount that sets a flag
    // When rendered on the server
    // Then the flag is NOT set (onMount skipped)
    let mounted = false;
    const TestComp = () => {
      onMount(() => { mounted = true; });
      return <div>test</div>;
    };
    await renderToSSR(TestComp, {});
    expect(mounted).toBe(false);
  });

  it('does not run watch during SSR', async () => {
    // Given a component with watch that sets a flag
    // When rendered on the server
    // Then the flag is NOT set (watch skipped)
  });

  it('recovers from effect errors during SSR', async () => {
    // Given a component where an effect throws
    // When rendered on the server
    // Then the render completes (not crashes)
    // And the error is logged
    // And the failing node has placeholder content
  });

  it('hydrates SSR output without re-rendering', async () => {
    // Given SSR HTML from the universal pipeline
    // When the client hydrates
    // Then DOM nodes are claimed (not recreated)
    // And effects are attached for future reactivity
  });

  // @ts-expect-error — components should not import isSSR
  it('components cannot check isSSR()', () => {
    // isSSR is not exported from @vertz/ui public API
    // This ensures components never branch on environment
  });
});
```

---

## Appendix A: Bun Migration Path (Separate Effort)

> **Scope note:** This appendix captures research for a FUTURE effort. Nothing here is in scope for the universal rendering model (Phases 1–6 above). It's included because the architectural decisions in Phases 1–2 directly enable this path. A separate design doc will be created when this work begins.

### Context: What Bun ships today

Bun has shipped native capabilities that overlap significantly with Vite:

| Capability | Bun | Vite equivalent |
|-----------|-----|-----------------|
| Dev server | `bun ./index.html` — zero config | `vite dev` |
| HMR | Built-in via WebSocket (`bun --hot`) | Vite HMR |
| HTML entrypoints | First-class — processes `<script>`, `<link>`, assets | `index.html` as entry |
| TypeScript/JSX | Native transpiler, zero config | Via esbuild |
| CSS bundling | Native CSS parser (58k lines of Zig), `@import` support | Via PostCSS/esbuild |
| Asset handling | Auto-copy + content hashing | Via asset pipeline |
| Code splitting | `splitting: true` | `build.rollupOptions` |
| Source maps | `linked`, `inline`, `external` | Similar options |
| Minification | Native (whitespace, syntax, identifiers) | Via esbuild/terser |
| Watch mode | `bun build --watch` | `vite build --watch` |
| Static file serving | `Bun.serve` with routes | Vite static middleware |
| Full-stack | `import html from "./index.html"` in server code | Vite SSR middleware |
| Plugin API | `onLoad`, `onResolve`, `onBeforeParse` (native) | Vite/Rollup plugin API |
| SPA fallback | Single HTML serves all routes | `historyApiFallback` |
| Env var inlining | `env: "PUBLIC_*"` | `import.meta.env` |
| Console forwarding | `--console` flag (browser logs in terminal) | Not built-in |

### Bun-only capabilities

- **`onBeforeParse` native plugins**: Multi-threaded NAPI modules (Rust/Zig) that transform source before Bun's parser. The Vertz compiler could run here at native speed.
- **HTML imports in server code**: `import app from "./index.html"` in `Bun.serve` gives a full-stack app with zero config. Dev mode does on-demand bundling + HMR; prod mode uses pre-built manifest.
- **In-memory bundling**: `files: { "./src/config.ts": "..." }` lets you pass virtual files without disk IO — replaces the virtual SSR entry module pattern.
- **`bun build --compile --target=browser`**: Compile entire frontend into a single self-contained HTML file.

### Migration phases

| Phase | What | Benefit |
|-------|------|---------|
| **A. Bun dev server** | Replace Vite with `bun ./index.html` + `onLoad` plugin for Vertz transforms | Drop Vite dependency, native CSS/asset handling, faster dev startup |
| **B. Bun full-stack** | `Bun.serve` + HTML imports for SSR | Unified dev/prod server, HMR for free |
| **C. Native transforms** | Port compiler to `onBeforeParse` NAPI module (Rust + `oxc_parser`) | Multi-threaded compilation, significant build speed improvement |
| **D. Native CSS extraction** | Port CSS token resolution to native NAPI module | Faster build for large apps |

### Why the universal model enables this

1. **Simpler compiler output**: One rendering path means the compiler generates one output instead of three. Fewer codegen branches = easier to implement in any language.
2. **No SSR-specific codegen**: Today the Vite plugin generates a virtual SSR entry with DOM shim installation, VNode conversion, and stream rendering. With the universal model, the SSR entry becomes trivial — just run the component and serialize.
3. **`onLoad` maps to `transform`**: Vite's `transform` hook is the only place the Vertz compiler runs. Bun's `onLoad` is a direct equivalent — same input (file contents), same output (transformed source + loader hint).
4. **In-memory files replace virtual modules**: The virtual `\0vertz:ssr-entry` module maps directly to Bun's `files` option in `Bun.build()`.

### Compiler portability analysis

The Vertz compiler is a source-to-source transform pipeline:

```
Source TSX → Parse (ts-morph) → Analyze → Transform (MagicString) → Output JS
```

| Layer | Portability to native | Notes |
|-------|----------------------|-------|
| CSS token resolution | Easy | Pure lookup tables + string generation |
| Text replacement engine | Medium | MagicString is a rope data structure; Zig/Rust equivalents exist |
| Reactivity classification | Hard | Two-pass taint analysis over TypeScript AST. Needs a TS parser |
| JSX transform | Hard | Reads results of prior transforms via `source.slice()`, deeply coupled to MagicString positions |

**Critical dependency: TypeScript parsing.** The compiler uses `ts-morph` (TypeScript compiler API) for AST walking. To go native, options are:

- **`oxc_parser`** (Rust) — fastest JS/TS/JSX parser, well-documented AST types
- **`swc_ecma_parser`** (Rust) — battle-tested, used by Next.js
- **`tree-sitter-typescript`** — fast incremental parser, Rust bindings available
- **Bun's internal parser** — Zig-based, not yet exposed as a plugin API

The most realistic near-term path is **Rust via `napi-rs`** using Bun's `onBeforeParse` hook, with `oxc_parser` for AST access. The `bun-native-plugin` crate provides the scaffolding.

### What stays in JS regardless

- **Vite dev server integration** (until Phase A replaces it) — HMR, SSR middleware
- **Source map chaining** — unless `@ampproject/remapping` is also ported
- **CSS dead-code elimination** — needs the full module graph from the bundler

### Recommended architecture post-migration

```
Dev mode:   bun ./index.html + onLoad plugin (JS transforms, fast iteration)
Prod build: Bun.build + onBeforeParse NAPI module (native transforms, max performance)
```

This split is natural — dev doesn't need to be as fast as prod, and the JS compiler can serve as the reference implementation that the native version is tested against.

### What's still missing in Bun vs Vite

1. **Custom JSX transforms at the compiler level**: Bun supports `jsx.factory` and `jsx.importSource` config, but Vertz's compiler does signal/computed/mutation transforms that go far beyond JSX factory swapping. This must run as a plugin (`onLoad` or `onBeforeParse`).
2. **Plugin support in CLI builds**: As of the docs, "plugins are only supported through `Bun.build`'s API or through `bunfig.toml` with the frontend dev server — not yet supported in `bun build`'s CLI." Production builds would use the JS API.
3. **SSR rendering pipeline**: Bun handles the frontend but doesn't own SSR rendering. `ssrStorage`, DOM shim, and `renderToStream` stay in Vertz's TypeScript regardless.

---

## Open Questions

1. **Threshold default for SSR data loading** — 50ms? 100ms? Configurable per-query? (Phase 3, needs POC.)
2. **Streaming granularity** — Per-component or per-Suspense-boundary? (Phase 4.)
3. **Adapter interface minimal surface** — What must a native adapter implement? (Phase 5.)
4. **Bun migration timeline** — When does Bun's plugin ecosystem mature enough to replace Vite? (Separate effort, track `onBeforeParse` adoption.)

## References

- [Issue #664](https://github.com/vertz-dev/vertz/issues/664): Universal rendering model proposal
- [Issue #660](https://github.com/vertz-dev/vertz/issues/660): Make effect() internal-only + SSR-safe
- PR #662: Fixed SSR artifacts in JSX runtime path
- PR #663: Fixed SSR artifacts in DOM compiler path
- [Bun bundler plugin docs](https://bun.sh/docs/bundler/plugins): `onBeforeParse` native plugin API
- [Bun HTML & static sites](https://bun.sh/docs/bundler/html): HTML entrypoint support, dev server
- [Bun.serve](https://bun.sh/docs/runtime/http/server): Full-stack server with HTML imports
- `plans/ssr-zero-config.md`: Previous SSR design (zero-config Vite SSR)
