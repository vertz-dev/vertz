# Plan: Universal Rendering Model — One Pipeline, Every Target

**Status:** Draft (Rev 3 — addressing review feedback)
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
| **Lifecycle effects** | React to signal changes over time (navigation, logging, timers) | **Skip entirely** | `watch()`, `onMount()`, `RouterView` page switching |

Today, DOM effects and lifecycle effects are already different in practice — DOM effects use `effect()` directly in framework internals (`__text`, `__conditional`, etc.); lifecycle effects use `watch()`/`onMount()` which wrap `effect()`. The difference is that today both are no-ops during SSR, causing bugs in the DOM path. After this change, only DOM effects run during SSR — which is exactly what's needed to populate content.

**Path count, honestly:** This reduces the rendering model from three divergent paths (CSR implementation + SSR implementation + hydration implementation per DOM primitive) to one shared implementation + hydration claim. Hydration claim is additive (it reuses existing DOM nodes instead of creating new ones) and isolated to one branch at the top of each primitive. The SSR-specific `ssrConditional`, `unwrapSignal`, and VNode code paths are eliminated entirely. This is a reduction from 3 to 1+hydration, not a reduction to 1.

#### Implementation mechanism

```ts
// Internal: DOM effect — runs during SSR (populates content)
export function domEffect(fn: () => void): DisposeFn {
  if (isSSR()) {
    fn();             // Run once, populate DOM content
    return () => {};  // No subscriptions, no tracking
  }
  // ... run fn, track dependencies (unchanged for CSR)
}

// Internal: lifecycle effect — skips during SSR
export function lifecycleEffect(fn: () => void): DisposeFn {
  if (isSSR()) {
    return () => {};  // Skip entirely — no lifecycle on server
  }
  // ... same reactive tracking as domEffect() in CSR
}
```

`watch()` and `onMount()` use `lifecycleEffect()` internally. DOM primitives (`__text`, `__child`, `__conditional`, etc.) use `domEffect()`. The naming makes intent unambiguous:

- **`domEffect()`** = "this callback populates DOM content" → runs during SSR
- **`lifecycleEffect()`** = "this callback manages component lifecycle" → skips during SSR

Both are internal-only. App developers never see either one. Neither is exported publicly — not from `@vertz/ui`, not from any sub-export.

#### Enforcement: lint rule, not just naming

The `effect()`/`lifecycleEffect()` naming alone is not sufficient enforcement. A Biome GritQL plugin (`biome-plugins/no-wrong-effect.gql`) will flag:
- `domEffect()` called from `component/` or `router/` (lifecycle code should use `lifecycleEffect()`)
- `lifecycleEffect()` called from `dom/` (DOM primitives should use `domEffect()`)

This catches misuse at lint time, not code review time.

#### Why this is correct for RouterView

`RouterView` uses `watch()` to react to route changes and swap page content (`container.innerHTML = ''`). During SSR:
- `watch()` uses `lifecycleEffect()` → skips entirely → no page swapping
- The component function still runs → returns the container element
- The SSR rendering pipeline renders the initial route's page component directly (the SSR entry already matches the URL and renders the correct page)

If `watch()` ran during SSR, it would call `container.innerHTML = ''` and destroy the SSR content. Skipping is correct.

### Error handling during SSR effects

When a DOM effect (`domEffect()`) throws during SSR:

1. **The error is caught and logged** — the SSR render continues
2. **The node retains its initial state** — the state it had before the effect ran. For `__text` this is an empty text node (`""`). For `__conditional` this is the comment anchor (`<!--conditional-->`). For `__attr` the attribute is simply not set. These are the concrete "default states" — not a special placeholder mechanism, just the DOM state before the effect populates it.
3. **The error is collected on the SSR context** — `ssrStorage.getStore().errors.push(err)`. The `renderToStream` / `renderToString` caller receives the errors array in the render result, and can decide to retry, fall back, or return a 500.

```ts
export function domEffect(fn: () => void): DisposeFn {
  if (isSSR()) {
    try {
      fn();
    } catch (err) {
      console.error('[vertz:ssr] Effect error during render:', err);
      // Collect error on SSR context for caller inspection
      const store = ssrStorage.getStore();
      if (store) store.errors.push(err);
      // Node retains its pre-effect state (empty text, comment anchor, etc.)
    }
    return () => {};
  }
  // ... CSR path unchanged
}
```

**Partial failure:** If `fn()` partially succeeds before throwing (e.g., sets `textContent` then throws on the next line), the partial state is kept. This is acceptable — the alternative (transactional rollback of DOM mutations) is disproportionate complexity for SSR error recovery. The error is surfaced to the caller, who can decide whether partial content is acceptable.

This matches the behavior of other SSR frameworks (React, Solid) where component errors during SSR are caught at the boundary level and don't crash the entire response.

#### Effect execution order during SSR

Effects run **synchronously in source order, depth-first**. This is the same order as CSR — the only difference is that SSR effects run once without tracking.

Concretely: when a component function executes, each `domEffect()` call runs `fn()` inline before returning. Parent effects run before child component functions are called (because the parent's JSX expression evaluates child components). This means:

```tsx
function Parent() {
  let shared = signal(0);
  domEffect(() => { shared.value = 42; });  // Runs FIRST (parent body)
  return <Child shared={shared} />;          // Child runs SECOND
}

function Child({ shared }) {
  return <span>{shared.value}</span>;        // Reads 42, not 0
}
```

The parent's effect runs before `<Child>` is evaluated, so the child sees `shared.value = 42`. This is deterministic and matches CSR behavior (effects run synchronously during the initial render pass).

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

With `onMount` returning the cleanup, standalone `onCleanup()` is no longer needed in user code. It stays internal for DOM primitives.

#### `watch()` — removed entirely

**Decision (resolved from Unknown #2):** Remove `watch()`. It has no legitimate callers.

The only production caller is `RouterView`, which uses `watch()` for imperative DOM manipulation — `container.innerHTML = ''` + `appendChild()`. This is an anti-pattern: the framework teaches developers to use declarative JSX, but `RouterView` itself builds DOM imperatively. It doesn't eat its own dog food.

`RouterView` should be rewritten as a compiled component that uses reactive JSX:

```tsx
// Before (imperative, uses watch)
export function RouterView({ router, fallback }: RouterViewProps) {
  const container = document.createElement('div');
  watch(
    () => router.current.value,
    (match) => {
      container.innerHTML = '';
      if (match) container.appendChild(match.route.component());
    },
  );
  return container;
}

// After (declarative, compiler-driven)
export function RouterView({ router, fallback }: RouterViewProps) {
  return (
    <div>
      {router.current.value
        ? RouterContext.Provider(router, () => router.current.value!.route.component())
        : (fallback ? fallback() : null)
      }
    </div>
  );
}
```

The compiler sees `router.current.value` in the JSX ternary, generates `__conditional` + `domEffect()`, and the route page swaps reactively. Disposal scope cleanup happens automatically (old page components get cleaned up by `__conditional`). No `watch()` needed.

**Async/lazy routes:** The current `RouterView` hand-rolls `Promise.then` for lazy components. This should be a framework-level primitive (e.g., an `AsyncComponent` wrapper) that any component can use, not special-cased in `RouterView`.

#### Framework components audit: eat your own dog food

An audit of framework components found three that use imperative DOM patterns instead of the compiler-driven reactive flow:

| Component | Anti-pattern | Fix |
|-----------|-------------|-----|
| **`RouterView`** (`router/router-view.ts`) | `watch()` + `innerHTML = ''` + `appendChild()` | Rewrite as compiled JSX component (see above) |
| **`Link`** (`router/link.ts`) | `document.createElement('a')` + `effect()` + `classList.add/remove` | Rewrite as compiled JSX: `<a class={isActive ? activeClass : className} href={href}>{children}</a>` |
| **`ThemeProvider`** (`css/theme-provider.ts`) | `document.createElement('div')` + loop of `appendChild()` + SSR VNode branch | Rewrite as compiled JSX: `<div data-theme={theme}>{children}</div>` |

All three components were written before the compiler could handle their patterns. They should be refactored in Phase 2 to use declarative JSX compiled through the framework's own compiler — the same patterns we teach every user.

**Why this matters:** These components are reference implementations. Developers read framework code to learn patterns. When `RouterView` uses `watch()` + `innerHTML`, developers copy that pattern instead of using reactive JSX. When `Link` uses `effect()` + `classList.add/remove`, developers think that's how reactive styling works instead of using class attributes. Framework code must demonstrate the intended usage patterns.

Additionally, `element.ts` contains a leftover `console.log` debug statement in the `unwrapSignal` function that should be removed.

#### No public escape hatch

There is **no** `@vertz/ui/primitives` sub-export. `signal`, `domEffect`, `lifecycleEffect`, and `onCleanup` are not exported from any public entry point. `watch()` is removed entirely — zero callers after the RouterView refactor.

Framework companion packages (`@vertz/ui-primitives`, `@vertz/tui`, `@vertz/ui-canvas`) are **first-party internal packages** — they import from relative paths within the monorepo, not from published package exports. They don't need a public sub-export; they have direct access to the source.

If a future ecosystem package outside the monorepo needs signal access, that's a bridge we cross when we get there. Starting constrained and expanding later is always possible; starting permissive and restricting later is not.

#### Summary of public API changes

| API | Before | After |
|-----|--------|-------|
| `effect()` | Public | **Internal-only** (no public export) |
| `signal()` | Public | **Internal-only** (no public export) |
| `onCleanup()` | Public (standalone) | **Internal-only** (use `onMount` return) |
| `watch()` | Public | **Removed** (no callers after RouterView refactor) |
| `onMount()` | Public, returns `void` | Public, **returns cleanup**, **no-op during SSR** |
| `computed()` | Public | Public (typically via compiler `const`) |
| `query()` | Public | Public |
| `form()` | Public | Public |
| `batch()` | Public | Public |
| `untrack()` | Public | Public |

### Automatic query field selection (VertzQL integration)

The primary reason for making `signal`, `effect`, and `watch` internal-only is **footgun removal** — raw `effect()` is the same trap as React's `useEffect`, and raw `signal()` bypasses compiler transforms that make reactivity work correctly (see "effect becomes internal-only" above).

A secondary benefit: **with all reactive state flowing through compiler-controlled primitives, the compiler can enable automatic query field selection.**

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

#### Why internal-only APIs enable this

If users could call `signal()` or `effect()` directly, the compiler would lose visibility into data flow:

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

Since `signal` and `effect` are not exported from any public entry point, every reactive data path goes through compiler-analyzed primitives.

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
- `effect` from `@vertz/ui` public exports (internal-only, no public export anywhere)
- `signal` from `@vertz/ui` public exports (internal-only, no public export anywhere)
- `onCleanup` from `@vertz/ui` public exports
- `watch` — **removed entirely** (implementation + tests + public export). Only caller (`RouterView`) is rewritten to use reactive JSX.
- `DisposalScopeError` from public exports (no longer reachable from user code)
- `ThemeProvider` VNode path — replaced by universal DOM rendering (SSR shim handles `document.createElement` directly)
- `console.log` debug statement in `element.ts` `unwrapSignal` function

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
// @vertz/ui — complete public exports
export { onMount } from './component/lifecycle';    // lifecycle: run once, return cleanup
export { computed } from './runtime/signal';          // derived state (usually via compiler const)
export { batch } from './runtime/scheduler';          // batch signal updates
export { untrack } from './runtime/tracking';         // escape tracking
export { query } from './query/query';                // async data fetching
export { form } from './form/form';                   // form handling

// Types
export type { Computed, ReadonlySignal, Signal, DisposeFn } from './runtime/signal-types';

// NOT exported from any public entry point:
// - signal         — users use `let`, compiler transforms it
// - effect         — internal: renamed to domEffect(), powers DOM primitives
// - lifecycleEffect — internal: powers watch(), onMount()
// - watch          — internal: used by RouterView and framework code
// - onCleanup      — internal: use onMount return value instead
```

### For framework internals: two effect primitives

```ts
// domEffect() — populates DOM content, runs during SSR
export function domEffect(fn: () => void): DisposeFn {
  if (isSSR()) {
    try {
      fn();
    } catch (err) {
      console.error('[vertz:ssr] Effect error during render:', err);
      const store = ssrStorage.getStore();
      if (store) store.errors.push(err);
    }
    return () => {};
  }
  // ... run fn, track dependencies (unchanged for CSR)
}

// lifecycleEffect() — component lifecycle, skips during SSR
export function lifecycleEffect(fn: () => void): DisposeFn {
  if (isSSR()) {
    return () => {};  // No-op — lifecycle doesn't run on server
  }
  // ... same reactive tracking as domEffect() for CSR
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
  // In CSR, domEffect tracks and re-runs on signal changes.
  // In SSR, domEffect runs once to populate, no tracking.
  const anchor = document.createComment('conditional');
  let currentNode: Node | null = null;
  let branchCleanups: DisposeFn[] = [];

  const outerScope = pushScope();
  domEffect(() => {
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

**Scope lifecycle clarification:** The adversarial review raised a concern about `pushScope()`/`popScope()` creating "destroyed" scopes. This is a misunderstanding of the disposal API — `popScope()` doesn't destroy the scope or its cleanup functions. It removes the scope from the active stack (so new `onCleanup` calls no longer register on it), but the cleanup array (`scope`) remains valid and is referenced by `branchCleanups`. `runCleanups(branchCleanups)` executes those cleanups when the branch switches. This is the same pattern used by the existing `csrConditional` (lines 194–266 of `conditional.ts`) which works correctly today.

Note: `ssrConditional` is deleted entirely. `hydrateConditional` stays because hydration claim logic (`claimComment()`) is fundamentally different from fresh rendering — it needs to find and reuse existing DOM nodes rather than create new ones. This is the only remaining "mode" in `__conditional`, and it's isolated (hydration augments the DOM) rather than divergent (SSR replaces the logic).

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

The universal model replaces per-primitive `isSSR()` guard checks, `unwrapSignal()` calls, and the JSX-to-VNode conversion pipeline with a single `isSSR()` check at the `domEffect()` boundary. Performance will be validated with the 20% threshold gate in Phase 1 acceptance criteria.

### No ceilings (Principle 8)

The universal model unlocks native rendering targets (Tauri, TUI, custom Bun runtimes) by formalizing the output adapter interface. The current SSR shim classes (`SSRElement`, `SSRTextNode`) become the prototype for a native adapter API. We stop being a browser-only framework.

### Compile-time over runtime — automatic query field selection

Making `signal`, `effect`, and `watch` internal-only in app code isn't just API hygiene — it's a compile-time guarantee. When all reactive data flows through compiler-controlled primitives, the `FieldAccessAnalyzer` and `CrossComponentAnalyzer` can statically determine which fields every query needs. This compiles to VertzQL queries that fetch exactly the right data — no overfetching, no underfetching, no runtime introspection. GraphQL field selection, but automatic and at build time.

### Tradeoffs accepted

- **Explicit over implicit**: DOM effects running during SSR is more explicit than silently no-opping. The `domEffect()`/`lifecycleEffect()` naming makes intent explicit and enforceable via lint rule.
- **Convention over configuration**: SSR is the default rendering model, not an opt-in mode.
- **Compile-time over runtime**: The universal model + internal-only reactivity primitives enable the compiler to optimize data fetching at build time (automatic field selection). No public escape hatch — all reactive state flows through compiler-controlled primitives.

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

- **Public `effect()` or `signal()`** — Neither is exported from any public entry point. `watch()` is removed entirely.
- **Environment-specific component code** — Components must not check `isSSR()` or branch on environment. If a component needs to, the framework has a gap.

## Implementation Phases

### Phase 1: Two-tier effect model

Rename `effect()` to `domEffect()`, introduce `lifecycleEffect()`, and change `domEffect()` to run-once during SSR.

**Changes:**
- `packages/ui/src/runtime/signal.ts`:
  - Rename `effect()` → `domEffect()` (DOM content population)
  - Replace SSR guard: `isSSR() → return () => {}` with `isSSR() → try { fn() } catch { log + collect } return () => {}`
  - Add `lifecycleEffect()` function (skips during SSR, same reactive tracking as `domEffect()` in CSR)
  - Add SSR error collection to `ssrStorage` context
- `packages/ui/src/component/lifecycle.ts`:
  - `onMount()` uses `lifecycleEffect()` — no-op during SSR
  - `onMount()` returns the cleanup function
  - Remove `watch()` entirely (implementation + export)
- `packages/ui/src/dom/*.ts`: Update all `effect()` calls to `domEffect()`
- `biome-plugins/no-wrong-effect.gql`: Lint rule enforcing `domEffect` in `dom/`, `lifecycleEffect` in `component/`/`router/`

**Acceptance criteria:**
- Integration test: Component with `let count = 0` and `<span>{count}</span>` renders `<span>0</span>` in SSR (not `<span></span>` or `<span>[object Object]</span>`)
- Integration test: Component with `__conditional` renders correct branch in SSR without the SSR-specific code path
- Integration test: Signal subscriptions are NOT created during SSR (memory test — effect count stays at 0)
- Integration test: `onMount` callback does NOT run during SSR
- Integration test: DOM effect that throws during SSR logs error, collects on SSR context, does not crash the server
- Integration test: Nested component rendering during SSR — parent and child DOM effects run in correct order (depth-first, parent before child)
- Integration test: Effect that reads and writes the same signal during SSR runs exactly once (no infinite loop)
- Integration test: Signal written in parent's `domEffect()`, read in child's render — child sees the updated value
- Performance gate: SSR render time for task-manager example must NOT increase by more than 20% (measured before and after)

### Phase 2: Simplify DOM primitives + refactor framework components

Remove three-way branching from all DOM helpers. Rewrite framework components that use imperative patterns to use compiled JSX. Single code path that works because `domEffect()` does the right thing. Hydration claim logic remains as an additive path.

**Changes — DOM primitives:**
- `packages/ui/src/dom/conditional.ts`: Delete `ssrConditional()`, merge CSR path as the universal path. `hydrateConditional` stays but only for hydration claim.
- `packages/ui/src/dom/element.ts`: Remove `unwrapSignal()` from `__insert`, `__child`, `__text`. Remove leftover `console.log` debug statement.
- `packages/ui/src/dom/attributes.ts`: Remove any SSR guards in `__attr`
- `packages/ui/src/dom/list.ts`: Verify `__list` works with universal effects, remove SSR-specific logic if any
- Delete `isSSR()` / `isInSSRContext()` imports from DOM primitive files

**Changes — framework components (eat your own dog food):**
- `packages/ui/src/router/router-view.ts`: Rewrite as compiled JSX component. Replace `watch()` + `innerHTML` + `appendChild()` with reactive JSX ternary (`router.current.value ? ... : fallback`). The compiler generates `__conditional` + `domEffect()` automatically.
- `packages/ui/src/router/link.ts`: Rewrite as compiled JSX component. Replace `document.createElement('a')` + `effect()` + `classList.add/remove` with `<a class={isActive ? activeClass : className} href={href}>{children}</a>`.
- `packages/ui/src/css/theme-provider.ts`: Rewrite as compiled JSX component. Replace `document.createElement('div')` + VNode SSR branch with `<div data-theme={theme}>{children}</div>`.
- Delete `watch()` implementation from `lifecycle.ts` and all associated tests.

**Acceptance criteria:**
- All existing SSR tests pass (rewritten to test the same behaviors through the universal pipeline)
- All existing CSR tests pass unchanged
- All existing hydration tests pass unchanged — hydration `claimComment()` path verified
- No `isSSR()` / `isInSSRContext()` calls remain in `packages/ui/src/dom/`
- `ThemeProvider` renders correctly in both CSR and SSR as compiled JSX (no VNode path, no imperative DOM)
- `RouterView` renders correct page via compiled JSX conditional (no `watch()`, no `innerHTML`)
- `Link` renders with reactive `activeClass` via compiled JSX class attribute (no `effect()`, no `classList.add/remove`)
- `watch()` is deleted — no references remain in production code (grep confirmation)
- No `console.log` debug statements remain in `dom/element.ts`
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

### 2. `watch()` — keep or remove?

**Assessment:** Resolved.

**Decision:** Remove entirely. The only production caller (`RouterView`) should be rewritten as a compiled JSX component that uses the framework's own reactive primitives (`__conditional` + `domEffect()`). Once `RouterView` is refactored, `watch()` has zero callers and can be deleted. See "Framework components audit" section above for the full rationale.

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
Component props → JSX transform → __element/__text/__child calls → domEffect(fn) → DOM/SSR output
Signal<T>.value → domEffect callback → Node.textContent / setAttribute
```

The change is behavioral (domEffect runs vs no-ops), not structural (no new types). `domEffect()` and `lifecycleEffect()` have the same signature: `(fn: () => void) => DisposeFn`.

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
