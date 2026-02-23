# Plan: Universal Rendering Model — One Pipeline, Every Target

**Status:** Draft
**Priority:** P1
**Owner:** TBD
**GitHub Issues:** [#664](https://github.com/vertz-dev/vertz/issues/664) (universal rendering), [#660](https://github.com/vertz-dev/vertz/issues/660) (effect internal-only)

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
- **`__conditional`** has a 68-line SSR-specific branch that duplicates logic from the CSR path
- **`__insert`** has a `unwrapSignal` duck-typing hack that only exists because effects don't run during SSR
- **Signal values render as `[object Object]`** in SSR because the effect that would populate text content never fires

Every one of these bugs has the same root cause: code that assumes effects will populate the DOM, but effects are skipped during SSR.

## Proposal

### Universal render pipeline

Every component, everywhere, does the same thing:

1. **Synchronous render** — component function runs, produces a node tree, effects run once to populate initial state
2. **Output adapter** determines what happens next:

| Target | After render |
|--------|-------------|
| Browser (first load) | Serialize to HTML, hydrate, effects track reactivity |
| Browser (navigation) | Tree IS the live DOM, effects track reactivity |
| Server | Serialize to HTML string, discard tree |
| Tauri / Electron-Bun | Same as browser — real webview |
| Custom Bun native runtime | Node tree maps to native widgets, effects update them |

### Effect behavior change

| Environment | Callback runs? | Subscriptions tracked? |
|------------|---------------|----------------------|
| Browser | Yes | Yes (live DOM needs reactivity) |
| SSR | Yes (populates initial state) | No (tree is serialized and discarded) |
| Native app | Yes | Yes (native widgets need reactivity) |

During SSR, effects run their callback **synchronously once** to populate DOM content, but `setSubscriber()` is not called — no signal tracking, no wasted memory. This is simpler than the current no-op and produces correct output.

### Lifecycle API simplification ([#660](https://github.com/vertz-dev/vertz/issues/660))

This proposal includes a breaking simplification of the public reactivity/lifecycle API, aligning with issue #660.

#### `effect()` becomes internal-only

`effect()` is removed from `@vertz/ui` public exports. It stays as the internal primitive that powers `watch()`, `query()`, `__text()`, `__attr()`, etc. — but app developers never call it directly.

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

#### `onCleanup()` becomes internal-only

With `onMount` returning the cleanup, standalone `onCleanup()` is no longer needed in user code. It stays internal for `watch()` and framework DOM helpers.

**What's removed from public exports:**
- `effect` — internal-only
- `onCleanup` — internal-only (use `onMount` return value instead)
- `signal` — internal-only (users use `let`, compiler transforms it)

**What stays public:**
- `onMount(callback)` — runs once on client, returns cleanup. No-op during SSR.
- `computed(fn)` — derived state (users typically use `const`, compiler transforms it)
- `watch(dep, callback)` — react to signal changes. Internal-only or removed for now (see Unknowns).
- `query()` — async data fetching
- `form()` — form handling
- `batch()` — batch signal updates
- `untrack()` — escape reactivity tracking

#### `watch()` — keep, make internal, or remove?

`watch()` is currently used in framework code (`RouterView`) and recommended in `.claude/rules/ui-components.md` for reacting to external signal changes. However, most user-facing use cases are covered by:

- `const` declarations (compiler transforms to `computed()`) — for derived values
- `onMount` — for one-time side effects
- `query()` — for data fetching that reacts to signals

**Recommendation:** Make `watch()` internal-only for now. If users need it, promote it to public later. This follows the principle of starting constrained and expanding — not the reverse.

The only legitimate user-facing `watch()` use case is "do something when a signal changes" (e.g., log theme changes, sync to localStorage). These are rare enough that we can defer the public API decision.

#### Summary of public API changes

| API | Before | After |
|-----|--------|-------|
| `effect()` | Public | **Internal-only** |
| `signal()` | Public | **Internal-only** (use `let`) |
| `onCleanup()` | Public (standalone) | **Internal-only** (use `onMount` return) |
| `watch()` | Public | **Internal-only** (for now) |
| `onMount()` | Public, returns `void` | Public, **returns cleanup** |
| `computed()` | Public | Public (typically via compiler `const`) |
| `query()` | Public | Public |
| `form()` | Public | Public |
| `batch()` | Public | Public |
| `untrack()` | Public | Public |

### Automatic query field selection (VertzQL integration)

A critical reason for making `signal`, `effect`, and `watch` internal-only: **the compiler needs full control over data flow to enable automatic query field selection.**

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

#### Why internal-only APIs are required

If users call `signal()` or `effect()` directly, the compiler loses visibility into data flow:

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

By keeping `signal` and `effect` internal, every reactive data path goes through compiler-analyzed primitives. The compiler can trace from `query()` → `const` derivation → JSX expression → prop → child component — and produce the optimal field selection at build time.

#### Current status

- **`FieldAccessAnalyzer`**: Implemented, 18 test cases, handles direct access, nested access, `.map()`/`.filter()` chains, destructuring, opaque access detection
- **`CrossComponentAnalyzer`**: Implemented, handles prop flow graphs, backward aggregation, cycle detection
- **Not yet wired into codegen**: The analyzers produce field lists but don't yet compile to VertzQL queries. This is future work that depends on the universal rendering model being in place.

#### How the universal model helps

With the universal rendering model, the same component code runs on both server and client. The field analysis happens at compile time (not runtime), so it works regardless of rendering target. The compiled VertzQL query is the same whether the component renders on the server or in the browser — the compiler has already determined the minimal field set.

### What gets deleted

- `isSSR()` checks in all DOM primitives (`element.ts`, `conditional.ts`, `insert.ts`)
- SSR-specific branches in `__text`, `__child`, `__insert`, `__conditional`, `__attr`, `__list`
- `effect()` no-op guard in `signal.ts`
- `unwrapSignal` duck-typing in `element.ts` and `conditional.ts`
- VNode duck-typing (`isVNode`, `vnodeToDOM`) from PR #663
- `effect` from public exports (`@vertz/ui`)
- `signal` from public exports (users use `let`)
- `onCleanup` from public exports (use `onMount` return value)
- `watch` from public exports (internal-only for now)
- `DisposalScopeError` from public exports (no longer reachable from user code)

### What stays the same

- Component authoring model (unchanged for users — `let`, `const`, JSX)
- `onMount()`, `computed()`, `query()`, `form()` public APIs
- Compiler output (`__text`, `__child`, etc. — same calls, simpler implementation)
- Hydration (still needed for browser first-load)

### What changes for users

- `onMount()` now returns a cleanup function instead of `void`
- `onCleanup()` inside `onMount` still works (backward compatible) but the return pattern is preferred
- `effect()`, `signal()`, `watch()` imports will produce a TypeScript error (not exported)

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
// @vertz/ui — public exports
export { onMount } from './component/lifecycle';    // lifecycle: run once, return cleanup
export { computed } from './runtime/signal';          // derived state (usually via compiler const)
export { batch } from './runtime/scheduler';          // batch signal updates
export { untrack } from './runtime/tracking';         // escape tracking
export { query } from './query/query';                // async data fetching
export { form } from './form/form';                   // form handling

// Types
export type { Computed, ReadonlySignal, Signal, DisposeFn } from './runtime/signal-types';

// NOT exported (internal-only):
// - effect    — framework primitive for DOM reactivity
// - signal    — users use `let` declarations, compiler transforms to signal()
// - computed  — could also go internal since compiler transforms `const` (keep for advanced use)
// - watch     — deferred; internal-only for now
// - onCleanup — use onMount return value instead
```

### For framework internals: `effect()` signature unchanged, behavior unified

```ts
// Before (signal.ts)
export function effect(fn: () => void): DisposeFn {
  if (isSSR()) {
    return () => {};  // No-op — root cause of all SSR bugs
  }
  // ... run fn, track dependencies
}

// After (signal.ts)
export function effect(fn: () => void): DisposeFn {
  if (isSSR()) {
    fn();             // Run once, populate DOM content
    return () => {};  // No subscriptions, no tracking
  }
  // ... run fn, track dependencies (unchanged for CSR)
}
```

### For `__conditional`: one path instead of three

```ts
// Before: 68-line SSR branch + 72-line CSR branch + hydration branch
// After: single path that works everywhere

export function __conditional(
  condFn: () => boolean,
  trueFn: () => Node | null,
  falseFn: () => Node | null,
): DisposableNode {
  // One code path. effect() does the right thing per environment.
  const anchor = document.createComment('c');
  let currentBranch: Node | null = null;

  const dispose = effect(() => {
    const cond = condFn();
    const newBranch = cond ? trueFn() : falseFn();
    if (currentBranch) currentBranch.remove();
    if (newBranch) anchor.parentNode?.insertBefore(newBranch, anchor);
    currentBranch = newBranch;
  });

  return Object.assign(anchor, { dispose });
}
```

## Manifesto Alignment

### One way to do things (Principle 2)

Today there are three code paths for rendering. After this change there is one. This is the most direct application of "one way to do things" possible — we're literally reducing three paths to one.

### If it builds, it works (Principle 1)

The current SSR bugs happen because `effect()` no-ops silently produce incorrect output that TypeScript can't catch. With the universal model, the same code runs everywhere — if it works in the browser, it works on the server.

### AI agents are first-class users (Principle 3)

LLMs struggle with environment-dependent behavior. When `effect()` means "run this" in the browser but "do nothing" on the server, the mental model fractures. One behavior everywhere is easier to reason about, predict, and generate correct code for.

### Performance is not optional (Principle 7)

Running effects once during SSR adds minimal overhead — it's a single synchronous function call without tracking. The current approach creates overhead through multiple `isSSR()` guard checks, `unwrapSignal()` calls, and the separate JSX-to-VNode conversion pipeline. The universal model is simpler and has fewer allocations.

### No ceilings (Principle 8)

The universal model unlocks native rendering targets (Tauri, TUI, custom Bun runtimes) by formalizing the output adapter interface. The current SSR shim classes (`SSRElement`, `SSRTextNode`) become the prototype for a native adapter API. We stop being a browser-only framework.

### Compile-time over runtime — automatic query field selection

Making `signal`, `effect`, and `watch` internal-only isn't just API hygiene — it's a compile-time guarantee. When all reactive data flows through compiler-controlled primitives, the `FieldAccessAnalyzer` and `CrossComponentAnalyzer` can statically determine which fields every query needs. This compiles to VertzQL queries that fetch exactly the right data — no overfetching, no underfetching, no runtime introspection. GraphQL field selection, but automatic and at build time.

### Tradeoffs accepted

- **Explicit over implicit**: Effects running during SSR is more explicit than silently no-opping.
- **Convention over configuration**: SSR is the default rendering model, not an opt-in mode.
- **Compile-time over runtime**: The universal model + internal-only reactivity primitives enable the compiler to optimize data fetching at build time (automatic field selection). This is impossible if users can bypass the compiler with raw `signal()` and `effect()` calls.

## Non-Goals

### Phase 1 non-goals

- **SSR data loading threshold** — `query()` waiting for fast data during SSR is a follow-up (Phase 3)
- **Component streaming** — Progressive SSR rendering is a follow-up (Phase 4)
- **Live deploy streaming** — Component-level hot deployment is future work (Phase 6)
- **Output adapter interface** — Formalizing the native adapter API is a follow-up (Phase 5)
- **Replacing Vite** — The build tooling migration (Vite → Bun) is a separate effort (see "Future: Bun Migration Path" below)
- **Native compiler** — Porting transforms to Zig/Rust is a separate effort that builds on this work

### Permanent non-goals

- **Public `effect()` API** — `effect()` stays internal. Users use `watch()`, `onMount()`, `computed()`.
- **Environment-specific component code** — Components must not check `isSSR()` or branch on environment. If a component needs to, the framework has a gap.

## Implementation Phases

### Phase 1: Universal effect model

Remove the SSR no-op in `effect()`. Make effects run-once during SSR without signal tracking.

**Changes:**
- `packages/ui/src/runtime/signal.ts`: Replace `isSSR() → return () => {}` with `isSSR() → fn(); return () => {}`
- Verify `watch()` and `onMount()` remain no-ops during SSR (they should — effects for side effects don't need to populate DOM)

**Acceptance criteria:**
- Integration test: Component with `let count = 0` and `<span>{count}</span>` renders `<span>0</span>` in SSR (not `<span></span>` or `<span>[object Object]</span>`)
- Integration test: Component with `__conditional` renders correct branch in SSR without the SSR-specific code path
- Integration test: Signal subscriptions are NOT created during SSR (memory test — effect count stays at 0)

### Phase 2: Simplify DOM primitives

Remove three-way branching from all DOM helpers. Single code path that works because `effect()` does the right thing.

**Changes:**
- `packages/ui/src/dom/conditional.ts`: Delete SSR branch (lines 68-104), single `effect()` path
- `packages/ui/src/dom/element.ts`: Remove `unwrapSignal()` from `__insert`, `__child`, `__text`
- `packages/ui/src/dom/attributes.ts`: Remove any SSR guards in `__attr`
- `packages/ui/src/dom/list.ts`: Verify `__list` works with universal effects, remove SSR-specific logic if any
- Delete `isSSR()` imports from DOM primitive files

**Acceptance criteria:**
- All existing SSR tests pass (or are rewritten to test the same behaviors)
- All existing CSR tests pass unchanged
- All existing hydration tests pass unchanged
- No `isSSR()` calls remain in `packages/ui/src/dom/`
- Integration test: Full task-manager example renders correctly via SSR with simplified primitives

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

**Assessment:** Discussion-resolvable.

**Current thinking:** No. During SSR, effects run once to populate content, then the tree is serialized and discarded. Running cleanup functions adds overhead for zero benefit — there's nothing to clean up. `onCleanup()` callbacks should be no-ops during SSR.

**Resolution:** Confirm with a test — register `onCleanup` during SSR, verify it doesn't fire.

### 2. `watch()` — internal-only, or remove entirely?

**Assessment:** Discussion-resolvable.

`watch()` is currently used by `RouterView` (internal) and recommended for reacting to external signal changes. With `watch()` going internal-only, the question is whether to keep the implementation or remove it.

**Current thinking:** Keep the implementation, make it internal-only. `RouterView` and future framework code needs it. If user demand emerges, promote it back to public — expanding an API is easy, shrinking it is hard.

**SSR behavior:** Since `watch()` uses `effect()` internally, it would run once during SSR under the universal model. This is probably wrong — `watch()` is for ongoing side effects, not initial render population. We may need a separate `internalEffect()` (runs during SSR) vs `watch()` (skips during SSR) distinction.

**Resolution:** Decide during Phase 1 implementation when we see which internal callers need effects to run during SSR and which don't.

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

**Current thinking:** `createElement(tag)`, `createTextNode(text)`, `createComment(text)`, `createDocumentFragment()`, `setAttribute(el, name, value)`, `removeAttribute(el, name)`, `appendChild(parent, child)`, `insertBefore(parent, newNode, ref)`, `removeChild(parent, child)`, `addEventListener(el, event, handler)`. The SSR shim already implements most of this.

**Resolution:** Formalize during Phase 5 after Phases 1-2 reveal the actual minimal surface.

## Type Flow Map

The universal rendering model doesn't introduce new generic type parameters. The type flow is unchanged from the current architecture:

```
Component props → JSX transform → __element/__text/__child calls → effect(fn) → DOM/SSR output
Signal<T>.value → effect callback → Node.textContent / setAttribute
```

The change is behavioral (effect runs vs no-ops), not structural (no new types).

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

## Future: Bun Migration Path

The universal rendering model is Phase 1 of a larger migration from Vite to Bun's native tooling. This section captures the research and analysis for future phases. **None of this is in scope for the current work** — it's documented here because the architectural decisions in Phases 1-2 directly enable this path.

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

1. **Effect cleanup during SSR** — Run cleanup functions? (Probably not — tree is discarded. See Unknowns #1.)
2. **`watch()` during SSR** — No-op or run-once? (Probably no-op. See Unknowns #2.)
3. **Threshold default for SSR data loading** — 50ms? 100ms? Configurable per-query? (Phase 3, needs POC.)
4. **Streaming granularity** — Per-component or per-Suspense-boundary? (Phase 4.)
5. **Adapter interface minimal surface** — What must a native adapter implement? (Phase 5.)
6. **Bun migration timeline** — When does Bun's plugin ecosystem mature enough to replace Vite? (Track `onBeforeParse` adoption and `bunfig.toml` plugin support in CLI builds.)

## References

- [Issue #664](https://github.com/vertz-dev/vertz/issues/664): Universal rendering model proposal
- [Issue #660](https://github.com/vertz-dev/vertz/issues/660): Make effect() internal-only + SSR-safe
- PR #662: Fixed SSR artifacts in JSX runtime path
- PR #663: Fixed SSR artifacts in DOM compiler path
- [Bun bundler plugin docs](https://bun.sh/docs/bundler/plugins): `onBeforeParse` native plugin API
- [Bun HTML & static sites](https://bun.sh/docs/bundler/html): HTML entrypoint support, dev server
- [Bun.serve](https://bun.sh/docs/runtime/http/server): Full-stack server with HTML imports
- `plans/ssr-zero-config.md`: Previous SSR design (zero-config Vite SSR)
