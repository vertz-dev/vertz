# @vertz/ui Implementation Plan

> Compiler-driven UI library with fine-grained reactivity for TypeScript. 15 phases, TDD-first, type-safe end-to-end.

**Prerequisite reading:** `plans/ui-design.md` (design spec), `plans/ui-competitive-analysis.md` (research), `.claude/rules/tdd.md` (process).

---

## Table of Contents

- [Phase 1: Signal Runtime](#phase-1-signal-runtime)
- [Phase 2: DOM Helpers](#phase-2-dom-helpers)
- [Phase 3: Lifecycle & Watch](#phase-3-lifecycle--watch)
- [Phase 4: Compiler -- Reactivity Transform](#phase-4-compiler--reactivity-transform)
- [Phase 5: Compiler -- JSX Transform](#phase-5-compiler--jsx-transform)
- [Phase 6: Compiler -- Props Transform](#phase-6-compiler--props-transform)
- [Phase 7: Component Model Integration](#phase-7-component-model-integration)
- [Phase 8: Router](#phase-8-router)
- [Phase 9: SDK Generation](#phase-9-sdk-generation)
- [Phase 10: Forms](#phase-10-forms)
- [Phase 11: query()](#phase-11-query)
- [Phase 12: SSR](#phase-12-ssr)
- [Phase 13: Atomic Hydration](#phase-13-atomic-hydration)
- [Phase 14: Testing Utilities](#phase-14-testing-utilities)
- [Phase 15: Vite Plugin](#phase-15-vite-plugin)

---

## Phase 1: Signal Runtime

### Goal

Deliver the core reactivity primitives: `signal()`, `computed()`, `effect()`, and `batch()`. This is the foundation that every other phase depends on. Must be glitch-free (no intermediate/stale values observed during propagation), handle diamond dependency graphs correctly, and fit within a 433B gzip budget for the signal core (1.5 KB total for the module including computed and effect).

### Package(s)

`@vertz/ui` -- subpath export `@vertz/ui/runtime`

### Files to create

| File | Description |
|------|-------------|
| `packages/ui/package.json` | Package manifest with subpath exports for `/runtime`, `/dom`, `/lifecycle`, etc. |
| `packages/ui/tsconfig.json` | TypeScript config extending root, JSX preserved for compiler |
| `packages/ui/tsconfig.typecheck.json` | Typecheck-only config (no emit) |
| `packages/ui/src/runtime/signal.ts` | `signal()` -- creates a reactive value container with `.get()` and `.set()` |
| `packages/ui/src/runtime/computed.ts` | `computed()` -- lazy derived value that caches until dependencies change |
| `packages/ui/src/runtime/effect.ts` | `effect()` -- side-effect that re-runs when tracked dependencies change |
| `packages/ui/src/runtime/batch.ts` | `batch()` -- defers notifications until the batch callback completes |
| `packages/ui/src/runtime/tracking.ts` | Internal dependency tracking context (current listener stack, subscription sets) |
| `packages/ui/src/runtime/index.ts` | Public barrel: exports `signal`, `computed`, `effect`, `batch` |
| `packages/ui/src/runtime/__tests__/signal.test.ts` | Signal unit tests |
| `packages/ui/src/runtime/__tests__/computed.test.ts` | Computed unit tests |
| `packages/ui/src/runtime/__tests__/effect.test.ts` | Effect unit tests |
| `packages/ui/src/runtime/__tests__/batch.test.ts` | Batch unit tests |
| `packages/ui/src/runtime/__tests__/glitch-free.test.ts` | Diamond dependency and glitch-free propagation tests |

### Public API

```typescript
// packages/ui/src/runtime/signal.ts
interface Signal<T> {
  get(): T;
  set(value: T): void;
  update(fn: (current: T) => T): void;
  peek(): T; // read without tracking
}

function signal<T>(initialValue: T): Signal<T>;

// packages/ui/src/runtime/computed.ts
interface Computed<T> {
  get(): T;
  peek(): T;
}

function computed<T>(fn: () => T): Computed<T>;

// packages/ui/src/runtime/effect.ts
type CleanupFn = () => void;
type EffectFn = () => void | CleanupFn;
type DisposeEffect = () => void;

function effect(fn: EffectFn): DisposeEffect;

// packages/ui/src/runtime/batch.ts
function batch<T>(fn: () => T): T;
```

### Behaviors to TDD

Ordered simplest to complex. Each line is one test (one Red-Green cycle).

**signal()**

1. Create a signal with an initial value and read it via `.get()`
2. Set a new value via `.set()` and read the updated value
3. Update value via `.update(fn)` where fn receives the current value
4. Read value via `.peek()` without registering a dependency (verify no tracking occurs)
5. Setting the same value (by reference equality) does not notify subscribers
6. Signal accepts `undefined` as a valid value
7. Signal accepts `null` as a valid value
8. Signal accepts object values (reference equality for change detection)
9. Signal accepts array values (reference equality for change detection)

**computed()**

10. Create a computed that derives from a single signal
11. Computed returns the derived value on `.get()`
12. Computed updates when the source signal changes
13. Computed is lazy -- the function does not execute until first `.get()`
14. Computed caches its value -- calling `.get()` twice without changes runs fn once
15. Computed tracks multiple signal dependencies
16. Computed chains: computed depending on another computed
17. Computed `.peek()` reads without tracking
18. Computed recalculates only when a dependency actually changes value

**effect()**

19. Effect runs synchronously on creation
20. Effect re-runs when a tracked signal changes
21. Effect tracks dependencies automatically (reads inside effect body)
22. Effect returns a dispose function that stops future re-runs
23. Effect cleanup function (returned from effect fn) runs before re-execution
24. Effect cleanup function runs when effect is disposed
25. Effect does not track signals read inside cleanup function
26. Effect does not track signals read after an async boundary (only synchronous reads)
27. Effect with multiple dependencies re-runs when any one changes

**batch()**

28. Batch returns the value returned by the callback
29. Batch defers effect re-runs until the batch completes
30. Effects run only once after a batch that changes multiple signals they depend on
31. Computed values inside a batch see intermediate values when read
32. Nested batches: inner batch does not trigger effects until outermost batch completes

**Glitch-free / Diamond dependencies**

33. Diamond dependency: A -> B, A -> C, B+C -> D. Changing A updates D exactly once
34. Diamond dependency: D sees consistent values of B and C (not one stale, one fresh)
35. Long chain: A -> B -> C -> D -> effect. Changing A runs effect exactly once
36. Multiple signals feeding one computed -- changing both in a batch triggers one recomputation

### Type-level tests

```typescript
// Signal must be typed
const s = signal(42);
s.get(); // number
// @ts-expect-error -- set requires matching type
s.set("not a number");

// Computed infers return type
const c = computed(() => "hello");
const v: string = c.get();
// @ts-expect-error -- computed is read-only, no .set()
c.set("world");

// Effect return type is DisposeEffect
const dispose: DisposeEffect = effect(() => {});
// @ts-expect-error -- dispose takes no arguments
dispose("arg");
```

### Dependencies

None -- this is the foundation phase.

### Acceptance criteria

- All 36 unit tests pass
- `bunx biome check --write` passes on all source files
- `bun run typecheck` passes
- Type-level tests compile correctly
- Bundle size of `signal.ts` + `tracking.ts` is under 500B gzip (measured via `bun build --minify | gzip -c | wc -c`)
- Total bundle of `runtime/index.ts` is under 1.5 KB gzip
- **Integration test:** Create a signal, derive a computed, attach an effect, change the signal, and verify the effect ran with the correct computed value -- all in one test exercising the full runtime together.

### Estimated test count

~40 (36 behaviors + 3 type-level + 1 integration)

### Key decisions / tradeoffs

- **`.get()` / `.set()` API** (not getter/setter functions like Solid's `count()` / `setCount()`). Reason: the compiler rewrites `let count = 0` to `const __count = signal(0)` and references to `count` become `__count.get()`. A method-based API is clearer in generated code and avoids the Solid pitfall where `const x = count` captures a value instead of maintaining reactivity.
- **Synchronous effect execution on creation.** Matches Solid's `createEffect` behavior. The effect runs immediately so that DOM subscriptions are established during component setup.
- **Reference equality for change detection** (not deep equality). Immutable replacement pattern (`todos = [...todos, item]`) is the contract. Deep equality is expensive and implicit -- explicit over implicit.
- **No `untrack()` utility in Phase 1.** `peek()` on individual signals covers the common case. `untrack()` can be added in a later phase if needed.
- **Topological sorting for glitch-free propagation.** Effects and computeds are scheduled in dependency order, not notification order. This ensures diamond dependencies never see stale intermediate values.

---

## Phase 2: DOM Helpers

### Goal

Deliver the low-level DOM creation and binding functions that the compiler's JSX transform will target. These are internal APIs (prefixed with `__`) that are never called directly by developers. They must be minimal, fast, and composable.

### Package(s)

`@vertz/ui` -- subpath export `@vertz/ui/dom`

### Files to create

| File | Description |
|------|-------------|
| `packages/ui/src/dom/element.ts` | `__element(tag)` -- creates a DOM element |
| `packages/ui/src/dom/text.ts` | `__text(accessor)` -- creates a reactive text node |
| `packages/ui/src/dom/attr.ts` | `__attr(el, name, accessor)` -- binds a reactive attribute |
| `packages/ui/src/dom/event.ts` | `__on(el, event, handler)` -- attaches event listener with cleanup |
| `packages/ui/src/dom/conditional.ts` | `__conditional(accessor, trueBranch, falseBranch?)` -- lazy branch rendering with cleanup |
| `packages/ui/src/dom/list.ts` | `__list(accessor, keyFn, mapFn)` -- keyed list reconciliation |
| `packages/ui/src/dom/index.ts` | Barrel export |
| `packages/ui/src/dom/__tests__/element.test.ts` | Element creation tests |
| `packages/ui/src/dom/__tests__/text.test.ts` | Reactive text node tests |
| `packages/ui/src/dom/__tests__/attr.test.ts` | Reactive attribute tests |
| `packages/ui/src/dom/__tests__/event.test.ts` | Event binding tests |
| `packages/ui/src/dom/__tests__/conditional.test.ts` | Conditional rendering tests |
| `packages/ui/src/dom/__tests__/list.test.ts` | Keyed list reconciliation tests |

### Public API

```typescript
// packages/ui/src/dom/element.ts
function __element(tag: string): HTMLElement;

// packages/ui/src/dom/text.ts
function __text(accessor: () => string): Text;

// packages/ui/src/dom/attr.ts
function __attr(el: HTMLElement, name: string, accessor: () => unknown): void;

// packages/ui/src/dom/event.ts
function __on(el: HTMLElement, event: string, handler: EventListener): void;

// packages/ui/src/dom/conditional.ts
function __conditional(
  accessor: () => boolean,
  trueBranch: () => Node,
  falseBranch?: () => Node
): Node; // returns a marker/anchor node

// packages/ui/src/dom/list.ts
function __list<T>(
  accessor: () => T[],
  keyFn: (item: T) => string | number,
  mapFn: (item: T, index: () => number) => Node
): Node; // returns a marker/anchor node
```

### Behaviors to TDD

**__element()**

1. Create a `div` element and verify it is an `HTMLDivElement`
2. Create a `span` element and verify the tag name
3. Create a `button` element and verify it is an `HTMLButtonElement`

**__text()**

4. Create a text node with a static accessor and verify `textContent`
5. Create a text node with a signal-backed accessor; changing the signal updates `textContent`
6. Text node accessor returning a number coerces to string

**__attr()**

7. Set a static attribute value on an element
8. Set a reactive attribute backed by a signal; changing the signal updates the attribute
9. Setting an attribute to `null` removes the attribute from the element
10. Setting an attribute to `undefined` removes the attribute from the element
11. Setting an attribute to `false` removes the attribute (boolean attribute behavior)
12. Setting an attribute to `true` sets the attribute to empty string (boolean attribute)
13. `class` attribute binding works correctly
14. `style` attribute binding works with string values

**__on()**

15. Attach a click event handler and verify it fires on click
16. Attach an input event handler and verify it receives the event object
17. Event handler is not called after the element is removed (no memory leak verification pattern)

**__conditional()**

18. Render the true branch when accessor returns `true`
19. Render the false branch when accessor returns `false`
20. Switch from true to false branch when signal changes: true branch removed, false branch inserted
21. Switch from false to true branch: false branch removed, true branch inserted
22. With no false branch: render nothing when accessor is `false`
23. Cleanup: effects inside the removed branch are disposed
24. Lazy evaluation: branch factory functions are not called until needed
25. Rapid toggling: does not leave orphan nodes

**__list()**

26. Render a list of items from a signal-backed array
27. Appending an item to the array adds a new DOM node at the end
28. Removing an item from the array removes the corresponding DOM node
29. Reordering items moves DOM nodes without recreating them (keyed reconciliation)
30. Replacing the entire array re-renders only changed items (key-based diffing)
31. Empty array renders no items
32. Transitioning from empty to non-empty array renders all items
33. Transitioning from non-empty to empty array removes all items
34. Index accessor updates when items are reordered
35. Cleanup: effects inside removed list items are disposed

### Type-level tests

```typescript
// __element returns HTMLElement
const el: HTMLElement = __element("div");
// @ts-expect-error -- tag must be a string
__element(123);

// __text accessor must return string
// @ts-expect-error -- accessor returning void is not valid
__text(() => {});

// __on handler must be EventListener
// @ts-expect-error -- handler must be a function
__on(el, "click", "not a function");

// __list keyFn must return string or number
// @ts-expect-error -- keyFn returning object is invalid
__list(() => [{ id: 1 }], (item) => ({ bad: true }), (item) => document.createElement("div"));
```

### Dependencies

- Phase 1 (Signal Runtime) -- `__text`, `__attr`, `__conditional`, `__list` all use `effect()` internally for reactive subscriptions.

### Acceptance criteria

- All 35 behavioral tests pass
- Type-level tests compile correctly
- `bunx biome check --write` passes
- `bun run typecheck` passes
- Bundle size of `dom/index.ts` under 2 KB gzip
- Tests use `happy-dom` (not a real browser)
- **Integration test:** Build a mini "todo list" using only `__element`, `__text`, `__on`, `__list`, and `signal`. Verify adding/removing items updates the DOM correctly.
- **Integration test:** Build a conditional toggle using `__conditional` + `signal`. Verify cleanup of nested effects when the branch changes.

### Estimated test count

~42 (35 behaviors + 4 type-level + 2 integration + 1 setup verification)

### Key decisions / tradeoffs

- **Anchor/marker nodes for `__conditional` and `__list`.** Both return a `Comment` node as an anchor. DOM mutations happen relative to this anchor. This avoids requiring a wrapper element.
- **Keyed reconciliation, not VDOM diffing.** `__list` uses a keyed diff algorithm (similar to Solid's `<For>` or Svelte's `{#each ... (key)}`). Items are tracked by key, and the algorithm minimizes DOM moves.
- **No event delegation in Phase 2.** Per-element `addEventListener` is simpler and sufficient. Event delegation (like Solid's) can be added as an optimization later if profiling shows it matters.
- **No `__fragment()` helper.** Fragments are handled by the compiler by appending multiple children. The DOM API's `DocumentFragment` is used directly where needed.
- **`happy-dom` for testing, not `jsdom`.** happy-dom is 2-3x faster and sufficient for DOM creation/manipulation tests.

---

## Phase 3: Lifecycle & Watch

### Goal

Deliver the component lifecycle system: `onMount()`, `onCleanup()`, `watch()` (both forms), the scope/ownership system for automatic cleanup, and the context API (`createContext`, `useContext`). This phase makes components fully featured -- they can run setup code, react to changes, clean up resources, and share state through the tree.

### Package(s)

`@vertz/ui` -- subpath export `@vertz/ui/lifecycle`

### Files to create

| File | Description |
|------|-------------|
| `packages/ui/src/lifecycle/scope.ts` | Ownership/scope system: `createScope()`, `getActiveScope()`, `runInScope()`, `disposeScope()` |
| `packages/ui/src/lifecycle/mount.ts` | `onMount(fn)` -- registers a callback to run after component DOM is created |
| `packages/ui/src/lifecycle/cleanup.ts` | `onCleanup(fn)` -- registers a callback to run when the current scope is disposed |
| `packages/ui/src/lifecycle/watch.ts` | `watch()` -- both single-callback and dependency+callback forms |
| `packages/ui/src/lifecycle/context.ts` | `createContext()`, `useContext()`, `Context.Provider` |
| `packages/ui/src/lifecycle/ref.ts` | `ref()` -- creates a mutable reference container |
| `packages/ui/src/lifecycle/index.ts` | Barrel export |
| `packages/ui/src/lifecycle/__tests__/scope.test.ts` | Scope tests |
| `packages/ui/src/lifecycle/__tests__/mount.test.ts` | onMount tests |
| `packages/ui/src/lifecycle/__tests__/cleanup.test.ts` | onCleanup tests |
| `packages/ui/src/lifecycle/__tests__/watch.test.ts` | watch tests |
| `packages/ui/src/lifecycle/__tests__/context.test.ts` | Context tests |
| `packages/ui/src/lifecycle/__tests__/ref.test.ts` | Ref tests |

### Public API

```typescript
// packages/ui/src/lifecycle/scope.ts
interface Scope {
  readonly id: number;
  dispose(): void;
}

function createScope(parentScope?: Scope): Scope;
function getActiveScope(): Scope | undefined;
function runInScope<T>(scope: Scope, fn: () => T): T;

// packages/ui/src/lifecycle/mount.ts
function onMount(fn: () => void | (() => void)): void;

// packages/ui/src/lifecycle/cleanup.ts
function onCleanup(fn: () => void): void;

// packages/ui/src/lifecycle/watch.ts
// Form 1: run once on mount (no dependencies)
function watch(fn: () => void | (() => void)): void;

// Form 2: dependency + callback -- runs on mount and when dependency changes
function watch<T>(dep: () => T, fn: (value: T, prev: T | undefined) => void | (() => void)): void;

// packages/ui/src/lifecycle/context.ts
interface Context<T> {
  readonly id: symbol;
  readonly Provider: (props: { value: T; children: Node | Node[] }) => Node;
  readonly defaultValue?: T;
}

function createContext<T>(defaultValue?: T): Context<T>;
function useContext<T>(context: Context<T>): T;

// packages/ui/src/lifecycle/ref.ts
interface Ref<T> {
  current: T | undefined;
}

function ref<T>(initialValue?: T): Ref<T>;
```

### Behaviors to TDD

**Scope system**

1. Create a scope and verify it has a unique id
2. `getActiveScope()` returns `undefined` when no scope is active
3. `runInScope()` sets the active scope during callback execution
4. After `runInScope()` completes, the previous active scope is restored
5. Nested scopes: inner scope is active during inner `runInScope()`
6. `scope.dispose()` calls all cleanup functions registered in that scope
7. Disposing a parent scope also disposes child scopes
8. Disposing a scope disposes all effects created within it

**onMount()**

9. `onMount()` callback runs when called inside an active scope (deferred to end of setup)
10. `onMount()` throws if called outside a scope
11. `onMount()` callbacks run in registration order
12. `onMount()` callback returning a function registers it as cleanup

**onCleanup()**

13. `onCleanup()` callback runs when the owning scope is disposed
14. `onCleanup()` inside an effect runs before the effect re-executes
15. `onCleanup()` inside an effect runs when the effect is disposed
16. Multiple `onCleanup()` callbacks run in registration order
17. `onCleanup()` throws if called outside a scope or effect

**watch() -- single callback form**

18. `watch(() => { ... })` runs once when the scope flushes mounts
19. `watch(() => { ... })` does not re-run (no dependency tracking)
20. `watch(() => { return cleanup })` registers the returned function as cleanup
21. Cleanup from single-callback watch runs when scope is disposed

**watch() -- dependency + callback form**

22. `watch(() => dep, callback)` runs callback once on mount with current value of dep
23. `watch(() => dep, callback)` re-runs callback when dep changes
24. Callback receives `(newValue, previousValue)` arguments
25. On first call, `previousValue` is `undefined`
26. `onCleanup()` inside callback runs before next callback execution
27. `onCleanup()` inside callback runs when scope is disposed
28. watch does not re-run callback if dep value is the same (reference equality)
29. watch with a computed dependency re-runs when the underlying signal changes

**Max iteration guard**

30. watch that causes its own dependency to change is caught with max iteration error (100 re-runs)

**Context**

31. `createContext()` returns a Context object with a unique id
32. `createContext(defaultValue)` stores the default value
33. `useContext()` returns the value from the nearest Provider ancestor
34. `useContext()` returns the default value when no Provider exists
35. `useContext()` throws when no Provider exists and no default was given
36. Nested Providers: inner Provider overrides outer Provider for its subtree
37. Provider value can be reactive (signal-backed) -- context consumers track reactivity

**ref()**

38. `ref()` creates an object with `.current` property initially `undefined`
39. `ref(initialValue)` sets `.current` to the initial value
40. `.current` is mutable -- can be assigned directly

### Type-level tests

```typescript
// watch overloads
// @ts-expect-error -- watch with 3 arguments is invalid
watch(() => 1, (v: number) => {}, "extra");

// Context type safety
const NumCtx = createContext<number>();
const val: number = useContext(NumCtx);
// @ts-expect-error -- wrong type for Provider value
NumCtx.Provider({ value: "string", children: document.createElement("div") });

// Ref type
const r = ref<HTMLDivElement>();
// @ts-expect-error -- wrong type assignment
r.current = "not an element";
```

### Dependencies

- Phase 1 (Signal Runtime) -- watch uses effect internally, scope system integrates with effect disposal.
- Phase 2 (DOM Helpers) -- Context.Provider uses `__element` and `__conditional` internally.

### Acceptance criteria

- All 40 behavioral tests pass
- Type-level tests compile correctly
- `bunx biome check --write` passes
- `bun run typecheck` passes
- Bundle size of `lifecycle/index.ts` under 0.5 KB gzip
- **Integration test:** Create a component-like function that uses `createScope`, `onMount`, `watch`, `onCleanup`, and `ref`. Verify the full lifecycle: mount callbacks fire, watch tracks changes, cleanup runs on dispose.
- **Integration test:** Nested scopes with context. Parent provides a value, child reads it. Disposing the parent scope disposes the child and all its effects.

### Estimated test count

~46 (40 behaviors + 3 type-level + 2 integration + 1 setup)

### Key decisions / tradeoffs

- **Scope/ownership tree** (not flat). Each scope knows its parent. Disposing a parent cascades to children. This is how Solid, Svelte, and Marko handle cleanup for conditional branches and list items.
- **watch runs on mount** (not deferred to next microtask). The design spec says `watch(() => dep, cb)` runs once on mount, then on changes. This matches SolidJS's `createEffect` behavior.
- **Max iteration guard at 100.** This prevents infinite loops when a watch callback sets its own dependency. The error message should include the watch's source location (from the compiler in later phases).
- **Context via scope tree, not DOM tree.** Context is resolved by walking the scope ownership chain, not by traversing the DOM. This is faster and works correctly with portals and detached components.
- **`onMount` separate from `watch`.** `onMount` is purely for "run after DOM is created" code. `watch` with no deps also runs once but is semantically for side-effect setup. Keeping them distinct follows the design spec and avoids overloading one API.

---

## Phase 4: Compiler -- Reactivity Transform

### Goal

Build the core compiler transform that converts plain `let` declarations into signal-based reactive code. This is the heart of the @vertz/ui developer experience: developers write plain TypeScript, the compiler makes it reactive. Uses ts-morph for AST analysis and MagicString for surgical string replacements with sourcemap preservation.

### Package(s)

`@vertz/ui-compiler` -- new package

### Files to create

| File | Description |
|------|-------------|
| `packages/ui-compiler/package.json` | Package manifest |
| `packages/ui-compiler/tsconfig.json` | TypeScript config |
| `packages/ui-compiler/tsconfig.typecheck.json` | Typecheck config |
| `packages/ui-compiler/src/index.ts` | Package entry -- exports the transform function |
| `packages/ui-compiler/src/transform.ts` | Main `transformFile(code, filename)` function orchestrating all transforms |
| `packages/ui-compiler/src/analyzers/component-analyzer.ts` | Detects component functions (functions returning JSX) |
| `packages/ui-compiler/src/analyzers/reactivity-analyzer.ts` | Two-pass taint analysis: identifies reactive `let` variables |
| `packages/ui-compiler/src/analyzers/dependency-graph.ts` | Builds dependency graph between variables (which `const` depends on which `let`) |
| `packages/ui-compiler/src/transformers/signal-transformer.ts` | Rewrites `let x = val` to `const __x = __signal(val)` and all references |
| `packages/ui-compiler/src/transformers/computed-transformer.ts` | Rewrites `const x = expr` to `const __x = computed(() => expr)` when expr depends on reactive vars |
| `packages/ui-compiler/src/transformers/mutation-transformer.ts` | Rewrites `x++`, `x = val`, `x += val` to signal `.set()` / `.update()` calls |
| `packages/ui-compiler/src/utils/magic-string-helpers.ts` | Helpers for safe MagicString replacements with offset tracking |
| `packages/ui-compiler/src/utils/import-manager.ts` | Tracks and deduplicates runtime imports to inject |
| `packages/ui-compiler/src/__tests__/component-analyzer.test.ts` | Component detection tests |
| `packages/ui-compiler/src/__tests__/reactivity-analyzer.test.ts` | Taint analysis tests |
| `packages/ui-compiler/src/__tests__/signal-transformer.test.ts` | Signal rewriting tests |
| `packages/ui-compiler/src/__tests__/computed-transformer.test.ts` | Computed rewriting tests |
| `packages/ui-compiler/src/__tests__/mutation-transformer.test.ts` | Mutation rewriting tests |
| `packages/ui-compiler/src/__tests__/transform.test.ts` | Integration tests for the full transform pipeline |

### Public API

```typescript
// packages/ui-compiler/src/transform.ts
interface TransformResult {
  code: string;
  map: SourceMap | null;
  diagnostics: CompilerDiagnostic[];
}

interface TransformOptions {
  filename: string;
  sourceMap?: boolean;
}

function transformFile(source: string, options: TransformOptions): TransformResult;

// packages/ui-compiler/src/analyzers/component-analyzer.ts
interface ComponentInfo {
  name: string;
  functionNode: FunctionDeclaration | ArrowFunction | FunctionExpression;
  returnsJSX: boolean;
  startPos: number;
  endPos: number;
}

function analyzeComponents(sourceFile: SourceFile): ComponentInfo[];

// packages/ui-compiler/src/analyzers/reactivity-analyzer.ts
interface ReactiveVariable {
  name: string;
  declarationNode: VariableDeclaration;
  kind: 'signal' | 'computed' | 'inert';
  dependsOn: string[];
}

function analyzeReactivity(component: ComponentInfo, sourceFile: SourceFile): ReactiveVariable[];
```

### Behaviors to TDD

**Component analyzer**

1. Detect a named function declaration returning JSX as a component
2. Detect an arrow function assigned to a const returning JSX as a component
3. Detect a function expression assigned to a const returning JSX as a component
4. Ignore functions that do not return JSX
5. Ignore functions nested inside other functions (only top-level components)
6. Detect exported function components (`export function Counter()`)
7. Detect default exported function components (`export default function()`)

**Reactivity analyzer -- Pass 1: Collect let declarations**

8. Collect `let` declarations inside a component function body
9. Ignore `let` declarations outside component functions
10. Ignore `const` declarations (Pass 1 only collects `let`)
11. Ignore `let` inside nested non-component functions within the component

**Reactivity analyzer -- Pass 2: Taint analysis**

12. Mark a `let` as reactive when referenced directly in a JSX expression (`{count}`)
13. Mark a `let` as reactive when referenced in a JSX attribute (`class={name}`)
14. Mark a `let` as inert when it is never referenced in JSX
15. Mark a `const` as computed when it depends on a reactive `let` and is used in JSX
16. Mark a `const` as computed when it depends on another computed `const` (transitive taint)
17. Mark a `const` as inert when it depends only on non-reactive variables
18. Detect reactive `let` used inside a callback passed to JSX event handler (`onClick={() => count++}`)
19. Detect reactive `let` used inside a closure that is called from JSX

**Signal transformer**

20. Rewrite `let count = 0` to `const __count = __signal(0)` for reactive variables
21. Rewrite read references: `count` to `__count.get()` in JSX expressions
22. Rewrite read references: `count` to `__count.get()` in computed expressions
23. Do not rewrite read references in event handler callbacks (they should use `.get()` only in reactive contexts)
24. Add `import { signal as __signal } from "@vertz/ui/runtime"` when signals are used
25. Do not transform non-reactive `let` variables
26. Handle multiple reactive variables in the same component

**Computed transformer**

27. Rewrite `const total = price * quantity` to `const __total = computed(() => __price.get() * __quantity.get())` when both are reactive
28. Rewrite references inside computed body to use `.get()` (AST-based, not regex)
29. Handle chained computeds: `const a = x + 1; const b = a * 2;` where x is reactive
30. Add `import { computed } from "@vertz/ui/runtime"` when computeds are used
31. Handle template literals in computed expressions: `` const msg = `Count: ${count}` ``
32. Handle method calls on reactive values: `const upper = name.toUpperCase()`

**Mutation transformer**

33. Rewrite `count++` to `__count.update(v => v + 1)`
34. Rewrite `count--` to `__count.update(v => v - 1)`
35. Rewrite `count = 5` to `__count.set(5)`
36. Rewrite `count += 1` to `__count.update(v => v + 1)`
37. Rewrite `count -= 1` to `__count.update(v => v - 1)`
38. Rewrite `count *= 2` to `__count.update(v => v * 2)`
39. Rewrite array reassignment: `todos = [...todos, item]` to `__todos.set([...__todos.get(), item])`
40. Rewrite object reassignment: `user = { ...user, name: "new" }` to `__user.set({ ...__user.get(), name: "new" })`

**Diagnostics**

41. Emit a diagnostic warning for `let { a, b } = reactive` destructuring pattern
42. Emit a diagnostic warning for `reactiveArray.push(item)` mutation pattern

**Sourcemaps**

43. Generated sourcemap maps transformed signal declaration back to original `let` line
44. Generated sourcemap maps `.get()` calls back to original variable reference

### Type-level tests

```typescript
// TransformResult must have code and map
const result: TransformResult = transformFile("let x = 0;", { filename: "test.tsx" });
const code: string = result.code;
// @ts-expect-error -- diagnostics is required on result
const missing: TransformResult = { code: "", map: null };
```

### Dependencies

- Phase 1 (Signal Runtime) -- the generated code imports from `@vertz/ui/runtime`
- `ts-morph` -- AST parsing and analysis
- `magic-string` -- surgical string replacement with sourcemaps

### Acceptance criteria

- All 44 behavioral tests pass
- Type-level tests compile correctly
- `bunx biome check --write` passes
- `bun run typecheck` passes
- AST-based rewriting handles identifier name collisions (e.g., `x` inside `xMax` is not rewritten)
- **Integration test:** Transform a complete Counter component (`let count = 0`, JSX with `{count}`, button with `onClick={() => count++}`) and verify the output is valid executable code that, when run with the real runtime, produces correct DOM and reactive updates.
- **Integration test:** Transform a component with computed chain (`let x = 0; const doubled = x * 2; const message = "Value: " + doubled;`) and verify all three transforms (signal, computed chain, mutation) produce correct output.

### Estimated test count

~50 (44 behaviors + 2 type-level + 2 integration + 2 setup/helper)

### Key decisions / tradeoffs

- **ts-morph for analysis, MagicString for transforms.** ts-morph gives us full TypeScript AST with type information. MagicString does surgical string replacements that preserve sourcemaps. This is the same approach used by Svelte 5 and Vue 3 compilers.
- **AST-based rewriting, NOT regex.** The POC validation notes explicitly call this out. Regex `count` replacement breaks `accountBalance`, `discount`, etc. The transformer must walk the AST and only replace identifier nodes that resolve to the target variable.
- **`__` prefix convention for generated variables.** Avoids collision with user code. The double underscore signals "compiler-generated, do not touch."
- **No type erasure.** The transform operates on `.tsx` source that is already valid TypeScript. The output is also valid TypeScript (just with signal wrapping). `tsc` can still type-check the output.
- **Two-pass taint analysis.** Pass 1 collects all `let` declarations. Pass 2 checks JSX references and propagates taint transitively through `const` expressions. A variable is only made reactive if it (or a chain of `const` dependencies) reaches JSX.

---

## Phase 5: Compiler -- JSX Transform

### Goal

Transform JSX syntax into direct DOM API calls (`__element`, `__text`, `__attr`, `__on`, `__conditional`, `__list`). The output calls the Phase 2 DOM helpers directly -- no virtual DOM, no React runtime. Handles static optimization (static content does not get reactive wrappers), event bindings, conditional rendering (`? :`), and list rendering (`.map()`).

### Package(s)

`@vertz/ui-compiler` (extends Phase 4)

### Files to create

| File | Description |
|------|-------------|
| `packages/ui-compiler/src/analyzers/jsx-analyzer.ts` | Classifies JSX expressions as static or dynamic, identifies conditionals and lists |
| `packages/ui-compiler/src/transformers/jsx-transformer.ts` | JSX -> DOM API calls transform |
| `packages/ui-compiler/src/transformers/children-transformer.ts` | Handles JSX children (text, expressions, nested elements, fragments) |
| `packages/ui-compiler/src/__tests__/jsx-analyzer.test.ts` | JSX analysis tests |
| `packages/ui-compiler/src/__tests__/jsx-transformer.test.ts` | JSX to DOM transform tests |
| `packages/ui-compiler/src/__tests__/children-transformer.test.ts` | Children handling tests |

### Public API

```typescript
// packages/ui-compiler/src/analyzers/jsx-analyzer.ts
type JsxExpressionKind = 'static' | 'dynamic' | 'conditional' | 'list' | 'component';

interface JsxExpressionInfo {
  kind: JsxExpressionKind;
  node: JsxExpression;
  dependsOnReactive: boolean;
}

function analyzeJsxExpressions(component: ComponentInfo, reactiveVars: ReactiveVariable[]): JsxExpressionInfo[];

// packages/ui-compiler/src/transformers/jsx-transformer.ts
// (internal, called by transformFile)
function transformJsx(component: ComponentInfo, reactiveVars: ReactiveVariable[], ms: MagicString): void;
```

### Behaviors to TDD

**JSX analyzer**

1. Classify a JSX text literal as static
2. Classify a JSX expression with a reactive variable as dynamic
3. Classify a JSX expression with a non-reactive variable as static
4. Classify a ternary expression (`{cond ? <A/> : <B/>}`) as conditional
5. Classify a `.map()` call in JSX as list rendering
6. Classify a JSX element referencing a user component (capitalized) as component invocation

**JSX element transform**

7. Transform `<div></div>` to `const __el = __element("div")`
8. Transform `<span></span>` to element creation with correct tag
9. Transform nested elements: `<div><p></p></div>` generates parent.append(child)
10. Transform multiple children: `<div><p/><span/></div>` appends both children

**JSX text transform**

11. Transform static text content `<p>Hello</p>` to `__p.textContent = "Hello"`
12. Transform reactive text expression `<p>{count}</p>` to `__text(() => __count.get())`
13. Transform mixed text and expressions `<p>Count: {count}</p>` to `__text(() => "Count: " + __count.get())`
14. Transform template literal in JSX expression

**JSX attribute transform**

15. Transform static attribute `<div class="foo">` to `__el.setAttribute("class", "foo")`
16. Transform reactive attribute `<div class={className}>` to `__attr(__el, "class", () => __className.get())`
17. Transform `class` (not `className`) -- Vertz UI uses native HTML attribute names
18. Transform `for` (not `htmlFor`)
19. Transform boolean attribute `<input disabled />` to `__el.setAttribute("disabled", "")`

**JSX event transform**

20. Transform `onClick={handler}` to `__on(__el, "click", handler)`
21. Transform `onInput={handler}` to `__on(__el, "input", handler)`
22. Transform inline arrow: `onClick={() => count++}` -- the arrow body contains a mutation transform
23. Transform `on:custom={handler}` (custom events) to `__on(__el, "custom", handler)`

**Conditional transform**

24. Transform `{show ? <A/> : <B/>}` to `__conditional(() => __show.get(), () => <A-dom>, () => <B-dom>)`
25. Transform `{show && <A/>}` to `__conditional(() => __show.get(), () => <A-dom>)` (no false branch)
26. Transform `{show ? <A/> : null}` to conditional with no false branch
27. Nested conditionals: conditional inside a conditional branch

**List transform**

28. Transform `{items.map(item => <li>{item.name}</li>)}` to `__list(() => __items.get(), ...)`
29. Detect `key` prop in mapped JSX and use it as keyFn: `{items.map(item => <li key={item.id}>...</li>)}`
30. Handle index parameter: `{items.map((item, i) => <li>{i}: {item.name}</li>)}`

**Fragment transform**

31. Transform `<>{...}</>` (fragment) to a `DocumentFragment` with children appended
32. Transform fragment with mixed static and dynamic children

**Component invocation transform**

33. Transform `<MyComponent />` to `MyComponent({})` function call
34. Transform `<MyComponent prop={val} />` to `MyComponent({ prop: val })` with reactive getter wrapping (Phase 6 details, but basic form here)
35. Transform `<MyComponent>children</MyComponent>` passing children

**Import injection**

36. Add `import { __element, __text, __attr, __on } from "@vertz/ui/dom"` based on which helpers are used
37. Do not add unused imports

### Type-level tests

```typescript
// JsxExpressionKind must be one of the defined kinds
const kind: JsxExpressionKind = 'static';
// @ts-expect-error -- 'invalid' is not a valid kind
const bad: JsxExpressionKind = 'invalid';
```

### Dependencies

- Phase 4 (Reactivity Transform) -- JSX transform builds on the reactivity analysis and signal transformer output
- Phase 2 (DOM Helpers) -- generated code targets Phase 2 APIs

### Acceptance criteria

- All 37 behavioral tests pass
- `bunx biome check --write` passes
- `bun run typecheck` passes
- Generated code is valid TypeScript
- **Integration test:** Transform a full component with div, p, button, reactive text, event handler, and conditional. Execute the output with the Phase 1+2 runtime and verify correct DOM structure and reactivity.
- **Integration test:** Transform a component with `.map()` list rendering. Execute and verify list DOM creation and keyed updates.
- Static elements with no reactive bindings produce no `effect()` calls (zero overhead for static content).

### Estimated test count

~42 (37 behaviors + 1 type-level + 2 integration + 2 setup)

### Key decisions / tradeoffs

- **Ternary -> `__conditional()`, .map() -> `__list()`.** These are the two patterns the compiler recognizes for control flow. We do NOT support `if/else` or `for` loops in JSX (same as every JSX framework). The compiler emits diagnostics for unsupported patterns.
- **Static text optimization.** `<p>Hello World</p>` where "Hello World" has no reactive dependencies compiles to `__p.textContent = "Hello World"` (a simple assignment), not `__text(() => "Hello World")` (which would create an unnecessary effect).
- **Native attribute names.** `class` not `className`, `for` not `htmlFor`. This is a design spec requirement and matches the web platform.
- **Component calls are plain function calls.** `<Counter count={val} />` becomes `Counter({ count: val })`. The compiler handles getter wrapping for reactive props in Phase 6. In this phase, basic component invocation structure is established.

---

## Phase 6: Compiler -- Props Transform

### Goal

Handle the compiler's transformation of component props to support reactive getter wrapping. When a parent passes a reactive value to a child component, the compiler wraps it as a property getter so the child can read it reactively without re-executing. Also handles spread props, static vs dynamic optimization, and `Object.defineProperties` pattern for the props object.

### Package(s)

`@vertz/ui-compiler` (extends Phases 4-5)

### Files to create

| File | Description |
|------|-------------|
| `packages/ui-compiler/src/analyzers/prop-analyzer.ts` | Classifies each prop as static or reactive |
| `packages/ui-compiler/src/transformers/prop-transformer.ts` | Generates `Object.defineProperties` for reactive props, plain object for static |
| `packages/ui-compiler/src/__tests__/prop-analyzer.test.ts` | Prop classification tests |
| `packages/ui-compiler/src/__tests__/prop-transformer.test.ts` | Prop transform output tests |

### Public API

```typescript
// packages/ui-compiler/src/analyzers/prop-analyzer.ts
interface PropInfo {
  name: string;
  isReactive: boolean;
  isSpread: boolean;
  valueExpression: string;
}

function analyzeProps(jsxElement: JsxElement, reactiveVars: ReactiveVariable[]): PropInfo[];

// packages/ui-compiler/src/transformers/prop-transformer.ts
// (internal, called by jsx-transformer)
function transformProps(props: PropInfo[], ms: MagicString, insertPos: number): void;
```

### Behaviors to TDD

**Prop analyzer**

1. Classify a static literal prop (`name="hello"`) as non-reactive
2. Classify a static number prop (`count={42}`) as non-reactive
3. Classify a prop backed by a reactive signal (`count={count}`) as reactive
4. Classify a prop backed by a computed (`total={total}`) as reactive
5. Classify a prop backed by an inert variable (`label={CONSTANT}`) as non-reactive
6. Classify a spread prop (`{...rest}`) as spread
7. Classify a callback prop (`onClick={handler}`) as non-reactive (functions are not reactive)

**Prop transformer -- static props**

8. All-static props: generate a plain object `{ name: "hello", count: 42 }`
9. Static props with a function: include function reference directly

**Prop transformer -- reactive props**

10. Single reactive prop: generate `Object.defineProperties(Object.create(null), { count: { get() { return __count.get() } } })`
11. Mixed static and reactive props: static props use `value`, reactive props use `get`
12. Multiple reactive props: each gets its own getter
13. Reactive prop from a computed: getter calls `__computed.get()`

**Prop transformer -- spread props**

14. Single spread with no other props: pass the spread object directly
15. Spread combined with static props: merge using `Object.assign`
16. Spread combined with reactive props: use `Object.defineProperties` with spread merged

**Prop transformer -- children**

17. Children as a static text node: include in props as `children` property
18. Children as a single dynamic element: include as `children`
19. Multiple children: include as array in `children`

**Optimization**

20. Component with all static props: no `Object.defineProperties`, just a plain object literal
21. Component with no props: pass empty object `{}`

### Type-level tests

```typescript
// PropInfo shape validation
const prop: PropInfo = { name: "count", isReactive: true, isSpread: false, valueExpression: "count" };
// @ts-expect-error -- missing required field
const badProp: PropInfo = { name: "count", isReactive: true };
```

### Dependencies

- Phase 4 (Reactivity Transform) -- uses `ReactiveVariable` classification
- Phase 5 (JSX Transform) -- props transform is called from within JSX transform

### Acceptance criteria

- All 21 behavioral tests pass
- `bunx biome check --write` passes
- `bun run typecheck` passes
- **Integration test:** Transform a parent-child component pair where the parent passes a reactive prop. Execute the output and verify that changing the parent's signal updates the child's DOM without re-executing the child function.
- **Integration test:** Transform a component with spread props and verify the output correctly merges static and reactive properties.
- Generated `Object.defineProperties` output is valid TypeScript and produces correct prop objects at runtime.

### Estimated test count

~27 (21 behaviors + 1 type-level + 2 integration + 3 setup)

### Key decisions / tradeoffs

- **`Object.defineProperties(Object.create(null), ...)` pattern.** The POC notes specify this. `Object.create(null)` avoids prototype pollution. `Object.defineProperties` enables getter-based reactivity for individual props.
- **Static props skip `Object.defineProperties`.** When all props are static, there is no need for getters. A plain object literal is faster and generates less code.
- **Functions are never reactive props.** Even if a callback closes over a reactive variable, the function reference itself does not change. Event handlers are stable references.
- **Spread props are complex but necessary.** The compiler must handle `<Component {...base} override={val} />` correctly, merging in the right order. This is a common pattern.

---

## Phase 7: Component Model Integration

### Goal

Wire together signals, DOM helpers, lifecycle, and the compiler transforms into a complete component model. This phase validates that components execute once, props flow reactively, children render correctly, `ref()` works, `ErrorBoundary` catches errors, and the full lifecycle (mount -> update -> cleanup) functions end-to-end.

### Package(s)

`@vertz/ui` (additions to the main package)

### Files to create

| File | Description |
|------|-------------|
| `packages/ui/src/components/error-boundary.ts` | `ErrorBoundary` component |
| `packages/ui/src/components/suspense.ts` | `Suspense` component (placeholder for SSR phase, basic version here) |
| `packages/ui/src/components/index.ts` | Barrel export for built-in components |
| `packages/ui/src/index.ts` | Main package entry -- re-exports all public APIs |
| `packages/ui/src/components/__tests__/error-boundary.test.ts` | ErrorBoundary tests |
| `packages/ui/src/components/__tests__/suspense.test.ts` | Basic Suspense tests |
| `packages/ui/src/__tests__/integration/component-lifecycle.test.ts` | Full component lifecycle integration |
| `packages/ui/src/__tests__/integration/parent-child.test.ts` | Parent-child prop flow integration |
| `packages/ui/src/__tests__/integration/context-tree.test.ts` | Context through component tree integration |

### Public API

```typescript
// packages/ui/src/components/error-boundary.ts
interface ErrorBoundaryProps {
  fallback: (error: Error, retry: () => void) => Node;
  children: Node | Node[];
}

function ErrorBoundary(props: ErrorBoundaryProps): Node;

// packages/ui/src/components/suspense.ts
interface SuspenseProps {
  fallback: () => Node;
  children: Node | Node[];
}

function Suspense(props: SuspenseProps): Node;

// packages/ui/src/index.ts -- re-exports
export { signal, computed, effect, batch } from './runtime';
export { onMount, onCleanup, watch, createContext, useContext, ref } from './lifecycle';
export { ErrorBoundary, Suspense } from './components';
```

### Behaviors to TDD

**Component execution model**

1. A component function executes exactly once (track call count)
2. State changes within a component update DOM without re-executing the component function
3. Multiple instances of the same component have independent state

**Props flow**

4. Static props are accessible in the child component
5. Reactive props update the child's DOM when the parent's signal changes
6. Callback props (event handlers) are callable from the child
7. Children render in the correct position within the parent's DOM
8. Children can be text, elements, or mixed
9. Conditional children (ternary in JSX) work correctly

**ref()**

10. `ref()` attached to a JSX element via `ref={myRef}` populates `.current` after mount
11. `ref.current` is available inside `onMount` callback
12. `ref.current` is the actual DOM element

**ErrorBoundary**

13. ErrorBoundary renders children normally when no error occurs
14. ErrorBoundary catches synchronous errors thrown during child component execution
15. ErrorBoundary renders the fallback with the error object when a child throws
16. ErrorBoundary retry function re-renders the children
17. ErrorBoundary catches errors in nested components
18. ErrorBoundary does not catch errors outside its children

**Suspense (basic)**

19. Suspense renders children immediately when they are synchronous
20. Suspense renders fallback when children contain a pending promise (basic async support)

**Full lifecycle integration**

21. Mount -> onMount fires -> watch starts tracking -> signal change -> DOM updates -> dispose -> onCleanup fires
22. Nested components: parent mount fires before child mount
23. Nested components: child cleanup fires before parent cleanup
24. Context flows through multiple levels of nesting
25. Disposing a parent component disposes all child components and their effects

### Type-level tests

```typescript
// ErrorBoundary props type
// @ts-expect-error -- fallback must be a function
ErrorBoundary({ fallback: "not a function", children: document.createElement("div") });

// @ts-expect-error -- children required
ErrorBoundary({ fallback: (err: Error, retry: () => void) => document.createElement("div") });
```

### Dependencies

- Phase 1 (Signal Runtime)
- Phase 2 (DOM Helpers)
- Phase 3 (Lifecycle & Watch)
- Phase 4-6 (Compiler) -- for end-to-end tests with compiled components

### Acceptance criteria

- All 25 behavioral tests pass
- Type-level tests compile correctly
- `bunx biome check --write` passes
- `bun run typecheck` passes
- **Integration test:** A full "Todo App" component: input field, add button, list of items with delete buttons, item count display. All built with the compiler transform and runtime. Verify add, delete, and count update work correctly.
- **Integration test:** Error boundary wrapping a component that conditionally throws. Verify fallback rendering and retry.
- Bundle size of the full `@vertz/ui` runtime (signal + dom + lifecycle + components) under 4.5 KB gzip.

### Estimated test count

~32 (25 behaviors + 2 type-level + 2 integration + 3 setup)

### Key decisions / tradeoffs

- **ErrorBoundary uses try/catch around child component execution.** Since components execute once (not re-render), the boundary catches errors during initial setup. For runtime errors in effects, the boundary wraps the effect execution.
- **Suspense is minimal in this phase.** Full streaming Suspense is Phase 12 (SSR). Here we provide a basic client-side Suspense that shows a fallback while async children resolve.
- **No `forwardRef`.** Since components are plain functions and `ref` is a prop like any other, there is no need for a special forwarding mechanism. Components that want to expose their root element simply accept a `ref` prop.
- **Bundle size gate.** The 4.5 KB gzip budget for the full client runtime is a hard constraint. If we exceed it, we must optimize before proceeding.

---

## Phase 8: Router

### Goal

Build a client-side router with type-safe route definitions, template literal types for params extraction, parallel loaders, nested layouts, typed search params with schema validation, and code splitting via dynamic imports. The router is data-driven (routes are plain objects) and designed to be testable.

### Package(s)

`@vertz/ui` -- subpath export `@vertz/ui/router`

### Files to create

| File | Description |
|------|-------------|
| `packages/ui/src/router/define-routes.ts` | `defineRoutes()` -- typed route definition builder |
| `packages/ui/src/router/types.ts` | Route types: `RouteConfig`, `RouteMatch`, `LoaderContext`, `NavigateOptions` |
| `packages/ui/src/router/param-types.ts` | Template literal type for extracting params from route patterns |
| `packages/ui/src/router/matcher.ts` | Route matching algorithm (path -> route config + params) |
| `packages/ui/src/router/loader.ts` | Parallel loader execution and caching |
| `packages/ui/src/router/navigator.ts` | `navigate()`, `back()`, history API integration |
| `packages/ui/src/router/search-params.ts` | `useSearchParams()` -- typed search param access with schema validation |
| `packages/ui/src/router/outlet.ts` | Route outlet component -- renders matched route's component |
| `packages/ui/src/router/link.ts` | `Link` component -- accessible client-side navigation |
| `packages/ui/src/router/revalidate.ts` | `revalidate()` -- re-runs loaders for specified routes |
| `packages/ui/src/router/index.ts` | Barrel export |
| `packages/ui/src/router/__tests__/param-types.test.ts` | Template literal type tests |
| `packages/ui/src/router/__tests__/matcher.test.ts` | Route matching tests |
| `packages/ui/src/router/__tests__/loader.test.ts` | Loader execution tests |
| `packages/ui/src/router/__tests__/search-params.test.ts` | Search params tests |
| `packages/ui/src/router/__tests__/navigator.test.ts` | Navigation tests |
| `packages/ui/src/router/__tests__/integration.test.ts` | Full router integration tests |

### Public API

```typescript
// packages/ui/src/router/param-types.ts
type ExtractParams<Path extends string> =
  Path extends `${string}:${infer Param}/${infer Rest}`
    ? { [K in Param | keyof ExtractParams<`/${Rest}`>]: string }
    : Path extends `${string}:${infer Param}`
      ? { [K in Param]: string }
      : Record<string, never>;

// packages/ui/src/router/types.ts
interface RouteConfig<Path extends string = string> {
  component: () => Promise<{ default: (props: any) => Node }>;
  loader?: (ctx: LoaderContext<Path>) => Promise<unknown>;
  error?: () => Promise<{ default: (props: { error: Error; retry: () => void }) => Node }>;
  searchParams?: SchemaAny;
  children?: Record<string, RouteConfig>;
}

interface LoaderContext<Path extends string> {
  params: ExtractParams<Path>;
  search: Record<string, string>;
  request: Request;
}

interface NavigateOptions {
  replace?: boolean;
  state?: unknown;
}

// packages/ui/src/router/define-routes.ts
function defineRoutes<T extends Record<string, RouteConfig>>(routes: T): T;

// packages/ui/src/router/navigator.ts
function navigate(path: string, options?: NavigateOptions): void;
function back(): void;

// packages/ui/src/router/search-params.ts
function useSearchParams<T>(): [T, (updates: Partial<T>) => void];

// packages/ui/src/router/revalidate.ts
function revalidate(path: string): Promise<void>;

// packages/ui/src/router/link.ts
interface LinkProps {
  href: string;
  children: Node | Node[];
  replace?: boolean;
  class?: string;
  activeClass?: string;
}
function Link(props: LinkProps): HTMLAnchorElement;
```

### Behaviors to TDD

**Route matching**

1. Match a static root path `/` to the root route config
2. Match a static path `/users` to the users route config
3. Match a dynamic param path `/users/:id` and extract `{ id: "123" }` from `/users/123`
4. Match multiple dynamic params `/users/:userId/posts/:postId`
5. Match nested route `/users` with child `/` (index route)
6. Match nested route `/users` with child `/:id`
7. Return null for unmatched paths
8. Prefer exact matches over parameterized matches
9. Match catch-all/wildcard routes (`/*`)

**Param type extraction**

10. `ExtractParams<"/users/:id">` yields `{ id: string }`
11. `ExtractParams<"/users/:userId/posts/:postId">` yields `{ userId: string; postId: string }`
12. `ExtractParams<"/users">` yields `Record<string, never>` (no params)

**Loaders**

13. Loader function receives params extracted from the URL
14. Loader function receives search params as an object
15. Nested route loaders run in parallel (parent and child loaders fire simultaneously)
16. Loader results are passed to the route component as props
17. Loader error is caught and passed to the error component
18. Navigation aborts pending loaders from previous navigation

**Search params**

19. `useSearchParams()` returns the current parsed search params
20. `setSearchParams()` updates the URL search string
21. Search params are validated against schema when `searchParams` is defined
22. Invalid search params fall back to schema defaults

**Navigation**

23. `navigate("/path")` pushes a new history entry
24. `navigate("/path", { replace: true })` replaces the current history entry
25. `back()` navigates to the previous history entry
26. Navigation triggers route matching and loader execution
27. Navigation during a pending load cancels the previous load

**Link component**

28. Link renders an `<a>` tag with the correct `href`
29. Clicking a Link calls `navigate()` and prevents default
30. Link with `replace` prop uses replace navigation
31. Link adds `activeClass` when the current path matches

**Revalidation**

32. `revalidate("/users")` re-runs the `/users` route loader
33. Revalidation updates the component with fresh loader data

**Layout persistence**

34. Navigating between child routes does not re-execute the layout component
35. Layout loader does not re-run when navigating between children

### Type-level tests

```typescript
// Param extraction
type Params1 = ExtractParams<"/users/:id">;
const p1: Params1 = { id: "123" };
// @ts-expect-error -- wrong param name
const p1bad: Params1 = { userId: "123" };

type Params2 = ExtractParams<"/users/:userId/posts/:postId">;
const p2: Params2 = { userId: "1", postId: "2" };
// @ts-expect-error -- missing postId
const p2bad: Params2 = { userId: "1" };

type Params3 = ExtractParams<"/static">;
// @ts-expect-error -- no params expected
const p3bad: Params3 = { id: "1" };

// LoaderContext types params correctly
const loader = async (ctx: LoaderContext<"/users/:id">) => {
  const id: string = ctx.params.id;
  // @ts-expect-error -- unknown param
  const bad = ctx.params.name;
};
```

### Dependencies

- Phase 1-3 (Runtime, DOM, Lifecycle) -- router renders components using the full runtime
- Phase 7 (Component Model) -- components follow the execute-once model
- `@vertz/schema` -- for search params validation

### Acceptance criteria

- All 35 behavioral tests pass
- Type-level tests compile correctly
- `bunx biome check --write` passes
- `bun run typecheck` passes
- Bundle size of `router/index.ts` under 2 KB gzip
- **Integration test:** Define routes with nested layouts, navigate between them, verify layout persistence, parallel loader execution, and correct component rendering.
- **Integration test:** Define routes with typed params and search params. Navigate to a URL with params and search string. Verify params are extracted and search params are validated.
- **Integration test:** Navigate away from a page with a slow loader, verify the previous load is cancelled.

### Estimated test count

~45 (35 behaviors + 4 type-level + 3 integration + 3 setup)

### Key decisions / tradeoffs

- **Template literal types for params.** This gives compile-time safety: `ctx.params.id` is typed as `string`, `ctx.params.foo` is a type error. The tradeoff is that complex patterns (optional params, regex) require more type gymnastics.
- **Parallel loaders.** When navigating to `/users/123`, both the `/users` layout loader and the `/:id` detail loader fire simultaneously. This is faster than waterfall loading and matches the design spec.
- **Code splitting via dynamic imports.** Route `component` is `() => import(...)` by convention. The router calls this when the route matches, enabling Vite/bundler code splitting.
- **Layout persistence.** Layout components are NOT re-executed when navigating between their children. This is critical for performance and UX (no layout flicker).
- **`@vertz/schema` for search params** validation and coercion. String search params (`?page=2`) get coerced to the correct types via the schema.

---

## Phase 9: SDK Generation

### Goal

Build `@vertz/codegen` that reads the `@vertz/compiler` IR (the `AppIR` produced by the backend compiler) and generates typed frontend artifacts: `route-types.ts` (TypeScript interfaces), `sdk.ts` (typed HTTP client), and `schemas.ts` (re-exported validation schemas). These generated files are the bridge between backend and frontend type safety.

### Package(s)

`@vertz/codegen` -- new package

### Files to create

| File | Description |
|------|-------------|
| `packages/codegen/package.json` | Package manifest |
| `packages/codegen/tsconfig.json` | TypeScript config |
| `packages/codegen/tsconfig.typecheck.json` | Typecheck config |
| `packages/codegen/src/index.ts` | Package entry |
| `packages/codegen/src/codegen.ts` | Main `generate(ir: AppIR, outputDir: string)` orchestrator |
| `packages/codegen/src/generators/route-types-generator.ts` | Generates `route-types.ts` from IR schema definitions |
| `packages/codegen/src/generators/sdk-generator.ts` | Generates `sdk.ts` -- typed HTTP client mirroring module structure |
| `packages/codegen/src/generators/schema-generator.ts` | Generates `schemas.ts` -- re-exports `@vertz/schema` objects for client use |
| `packages/codegen/src/utils/type-emitter.ts` | Converts JSON Schema from IR into TypeScript type declarations |
| `packages/codegen/src/utils/sdk-method-builder.ts` | Builds SDK method signatures from route IR |
| `packages/codegen/src/utils/cache-key-generator.ts` | Generates deterministic cache keys from module path + operationId + params |
| `packages/codegen/src/__tests__/route-types-generator.test.ts` | Route type generation tests |
| `packages/codegen/src/__tests__/sdk-generator.test.ts` | SDK generation tests |
| `packages/codegen/src/__tests__/schema-generator.test.ts` | Schema re-export tests |
| `packages/codegen/src/__tests__/cache-key-generator.test.ts` | Cache key tests |
| `packages/codegen/src/__tests__/codegen.test.ts` | Integration tests |

### Public API

```typescript
// packages/codegen/src/codegen.ts
interface CodegenOptions {
  outputDir: string;
  baseUrl?: string;
}

interface CodegenResult {
  files: GeneratedFile[];
  diagnostics: CodegenDiagnostic[];
}

interface GeneratedFile {
  path: string;
  content: string;
}

function generate(ir: AppIR, options: CodegenOptions): CodegenResult;

// packages/codegen/src/utils/cache-key-generator.ts
function generateCacheKey(modulePath: string, operationId: string, params?: Record<string, unknown>): unknown[];
```

### Behaviors to TDD

**Route types generator**

1. Generate a TypeScript interface from an IR schema with string properties
2. Generate an interface with number properties
3. Generate an interface with optional properties
4. Generate an interface with enum (union) properties
5. Generate an interface with nested object properties
6. Generate an interface with array properties
7. Generate interfaces for all schemas in the IR (not just one)
8. Name interfaces using the schema's `namingConvention` parts

**SDK generator**

9. Generate an SDK interface with one module and one operation
10. Generate an SDK interface mirroring nested module paths (`billing.invoices` -> `sdk.billing.invoices`)
11. Generate method signatures with typed `body` parameter from body schema
12. Generate method signatures with typed `params` parameter from path params
13. Generate method signatures with typed `query` parameter from query schema
14. Generate method signatures with typed return type (`Promise<SDKResult<T>>`) from response schema
15. Generate implementation that calls `fetch` with correct method and URL
16. Generate implementation that serializes body as JSON
17. Generate implementation that appends query params to URL
18. Generate implementation that replaces path params in URL template
19. Each SDK method embeds a `__schema` reference for `form()` integration
20. Each SDK method embeds a `__cacheKey` function for `query()` integration

**Schema generator**

21. Re-export schema objects referenced by SDK methods
22. Generate import statements for `@vertz/schema` constructors
23. Generate schema reconstruction code from JSON schema definitions

**Cache key generator**

24. Generate key `["users", "list"]` for `api.users.list()`
25. Generate key `["users", "list", { page: 2 }]` for `api.users.list({ query: { page: 2 } })`
26. Generate key `["users", "get", { id: "abc" }]` for `api.users.get({ params: { id: "abc" } })`
27. Keys are deterministic: same input always produces same output
28. Parameter order does not affect key (keys are normalized)

**Codegen orchestrator**

29. Generate all three files when given a valid IR
30. Write files to the specified output directory
31. Generated files include a "DO NOT EDIT" header comment
32. Emit diagnostic when IR has missing schema references

### Type-level tests

```typescript
// Generated SDK types should be valid
interface TestSDK {
  users: {
    list(opts?: { query?: { page?: number } }): Promise<SDKResult<User[]>>;
    get(opts: { params: { id: string } }): Promise<SDKResult<User>>;
    create(opts: { body: CreateUserBody }): Promise<SDKResult<User>>;
  };
}

// SDKResult discriminated union
type SDKResult<T> = { ok: true; data: T } | { ok: false; error: SDKError };

// @ts-expect-error -- create requires body
const bad: Promise<SDKResult<User>> = sdk.users.create({});

// @ts-expect-error -- get requires params
const bad2: Promise<SDKResult<User>> = sdk.users.get({});
```

### Dependencies

- `@vertz/compiler` -- reads `AppIR` type definitions (specifically `ModuleIR`, `RouteIR`, `SchemaIR`)
- `@vertz/schema` -- schemas are referenced in generated code

### Acceptance criteria

- All 32 behavioral tests pass
- Type-level tests compile correctly
- `bunx biome check --write` passes
- `bun run typecheck` passes
- Generated `route-types.ts` compiles with `tsc`
- Generated `sdk.ts` compiles with `tsc` and all methods have correct types
- **Integration test:** Feed a real-world-like IR (users module with CRUD operations) through the codegen. Compile the output with `tsc`. Verify that the generated SDK methods have the correct type signatures by writing type-level assertions against them.
- **Integration test:** Generate SDK from IR, then use the SDK methods in a mock test to verify runtime behavior (fetch is called with correct URL, method, headers).

### Estimated test count

~40 (32 behaviors + 3 type-level + 2 integration + 3 setup)

### Key decisions / tradeoffs

- **Generates plain TypeScript, not `.d.ts`.** The SDK includes both type information and runtime implementation (fetch calls). This means the output is usable directly, not just for type checking.
- **Deterministic output.** The generated code is deterministic for the same IR input. This means code review diffs are meaningful and Git can track changes sensibly.
- **`__schema` and `__cacheKey` metadata on methods.** SDK methods carry metadata that `form()` and `query()` can introspect. This is the mechanism that makes `form(api.users.create)` work without separate schema imports.
- **JSON Schema -> TypeScript type conversion.** This is a well-solved problem (json-schema-to-typescript). We implement a minimal version focused on the subset of JSON Schema that `@vertz/schema` produces.

---

## Phase 10: Forms

### Goal

Build the `form()` function that accepts an SDK method and returns a form controller with typed validation, submission, error handling, and progressive enhancement. Forms use native HTML form elements (`<form>`, `<input>`, `FormData`) and validate against the schema embedded in the SDK method.

### Package(s)

`@vertz/ui` -- subpath export `@vertz/ui/form`

### Files to create

| File | Description |
|------|-------------|
| `packages/ui/src/form/form.ts` | `form(sdkMethod, options?)` -- creates a form controller |
| `packages/ui/src/form/form-data-converter.ts` | `formDataToObject(formData, schema)` -- converts FormData to typed object with coercion |
| `packages/ui/src/form/types.ts` | Form types: `FormController`, `FormOptions`, `FieldError` |
| `packages/ui/src/form/index.ts` | Barrel export |
| `packages/ui/src/form/__tests__/form.test.ts` | Form controller tests |
| `packages/ui/src/form/__tests__/form-data-converter.test.ts` | FormData conversion tests |
| `packages/ui/src/form/__tests__/integration.test.ts` | End-to-end form submission tests |

### Public API

```typescript
// packages/ui/src/form/types.ts
interface FormController<TBody, TResponse> {
  attrs(): { action: string; method: string };
  handleSubmit(options: {
    onSuccess?: (data: TResponse) => void;
    onError?: (error: SDKError) => void;
  }): (event: SubmitEvent) => void;
  error(field: keyof TBody): string | undefined;
  errors: Partial<Record<keyof TBody, string>>;
  submitting: boolean;
  reset(): void;
}

interface FormOptions<TBody> {
  schema?: SchemaAny; // Override the SDK method's embedded schema
  initialValues?: Partial<TBody>;
}

// packages/ui/src/form/form.ts
function form<TBody, TResponse>(
  sdkMethod: SDKMethod<TBody, TResponse>,
  options?: FormOptions<TBody>
): FormController<TBody, TResponse>;

// packages/ui/src/form/form-data-converter.ts
function formDataToObject<T>(formData: FormData, schema: SchemaAny): T;
```

### Behaviors to TDD

**formDataToObject()**

1. Convert FormData with a single string field to an object
2. Convert FormData with multiple fields to an object
3. Coerce string "42" to number 42 when schema expects number
4. Coerce string "true" to boolean true when schema expects boolean
5. Handle missing optional fields (not present in FormData)
6. Handle array fields (multiple values with same name)
7. Return object matching the schema shape

**form() -- attrs**

8. `form(sdkMethod).attrs()` returns `{ action, method }` derived from the SDK method's endpoint
9. POST SDK method produces `method: "POST"`
10. PUT SDK method produces `method: "PUT"`

**form() -- validation**

11. Submitting with empty required fields populates field errors
12. `error("fieldName")` returns the validation error message for that field
13. `errors` object contains all current field errors
14. Errors are cleared when `reset()` is called
15. Errors are reactive (backed by signals) -- changes update DOM bindings

**form() -- handleSubmit**

16. `handleSubmit` returns an event handler function
17. The event handler calls `event.preventDefault()`
18. The event handler reads FormData from the form element
19. The event handler validates FormData against the schema
20. On valid data, the event handler calls the SDK method with the typed body
21. On successful SDK response, `onSuccess` is called with the response data
22. On SDK error response, `onError` is called with the error
23. On validation failure, field errors are populated and SDK method is NOT called

**form() -- submitting state**

24. `submitting` is `false` initially
25. `submitting` is `true` while the SDK method call is in flight
26. `submitting` returns to `false` after the SDK method resolves
27. `submitting` is reactive (signal-backed)

**form() -- schema override**

28. `form(sdkMethod, { schema: customSchema })` uses the custom schema for validation instead of the embedded one

**form() -- progressive enhancement**

29. `attrs()` produces valid HTML form attributes that work without JavaScript

### Type-level tests

```typescript
// form() infers types from SDK method
interface CreateUserBody { name: string; email: string; }
interface User { id: string; name: string; email: string; }

declare const sdkCreate: SDKMethod<CreateUserBody, User>;
const f = form(sdkCreate);

// error() accepts valid field names
f.error("name"); // ok
f.error("email"); // ok
// @ts-expect-error -- "invalid" is not a key of CreateUserBody
f.error("invalid");

// handleSubmit onSuccess receives typed response
f.handleSubmit({
  onSuccess: (user) => {
    const id: string = user.id; // ok
    // @ts-expect-error -- User has no 'age' field
    const age: number = user.age;
  },
});

// @ts-expect-error -- submitting is boolean, not string
const s: string = f.submitting;
```

### Dependencies

- Phase 1 (Signal Runtime) -- `errors`, `submitting` are backed by signals
- Phase 9 (SDK Generation) -- `form()` reads `__schema` and endpoint info from SDK methods
- `@vertz/schema` -- validation via `safeParse()`

### Acceptance criteria

- All 29 behavioral tests pass
- Type-level tests compile correctly
- `bunx biome check --write` passes
- `bun run typecheck` passes
- **Integration test:** Create a form with `form(api.users.create)`, render it in a DOM, fill fields, submit. Verify validation runs, SDK method is called with correct typed data, and `onSuccess` fires with the response.
- **Integration test:** Submit a form with invalid data. Verify field errors appear in the DOM and the SDK method is not called.
- **Integration test:** Verify `submitting` state is reactive by asserting a button's `disabled` attribute toggles during submission.

### Estimated test count

~38 (29 behaviors + 4 type-level + 3 integration + 2 setup)

### Key decisions / tradeoffs

- **FormData-first, not controlled inputs.** The form's source of truth is the DOM (native form elements), not JavaScript state. This enables progressive enhancement and matches the design spec.
- **Schema from SDK method by default.** `form(api.users.create)` automatically gets the body schema. This is the zero-config path. Explicit schema override exists for edge cases (partial updates, subsets).
- **Reactive errors and submitting.** These are signal-backed so that JSX bindings like `{form.error("name")}` and `disabled={form.submitting}` update automatically.
- **No `onChange` tracking.** We do NOT track individual field changes in JavaScript. Validation happens on submit. Per-field validation (e.g., on blur) can be added as an enhancement later.

---

## Phase 11: query()

### Goal

Build the `query()` function for reactive data fetching inside components. It auto-tracks reactive dependencies, manages cache keys (auto-generated from SDK methods or manual), supports debounce, initial data, enabled/disabled states, and exposes `.data`, `.loading`, `.error`, `.refetch()`.

### Package(s)

`@vertz/ui` -- subpath export `@vertz/ui/query`

### Files to create

| File | Description |
|------|-------------|
| `packages/ui/src/query/query.ts` | `query()` -- main reactive data fetching function |
| `packages/ui/src/query/cache.ts` | In-memory query cache with key-based lookup |
| `packages/ui/src/query/types.ts` | Query types: `QueryResult`, `QueryOptions` |
| `packages/ui/src/query/index.ts` | Barrel export |
| `packages/ui/src/query/__tests__/query.test.ts` | Query function tests |
| `packages/ui/src/query/__tests__/cache.test.ts` | Cache tests |
| `packages/ui/src/query/__tests__/integration.test.ts` | Integration tests |

### Public API

```typescript
// packages/ui/src/query/types.ts
interface QueryResult<T> {
  data: T | undefined;
  loading: boolean;
  error: Error | undefined;
  refetch(): Promise<void>;
}

interface QueryOptions<T> {
  key?: unknown[];           // Override auto-generated cache key
  initialData?: T;           // Pre-fetched data (from loader)
  debounce?: number;         // Debounce re-fetches in ms
  enabled?: () => boolean;   // Reactive condition to enable/disable the query
  staleTime?: number;        // Time in ms before cached data is considered stale
}

// packages/ui/src/query/query.ts
function query<T>(
  fetcher: () => Promise<SDKResult<T>>,
  options?: QueryOptions<T>
): QueryResult<T>;
```

### Behaviors to TDD

**Basic query**

1. `query()` calls the fetcher function on mount
2. `loading` is `true` while the fetcher is in flight
3. `data` is populated with the response data when fetcher resolves
4. `loading` is `false` after the fetcher resolves
5. `error` is populated when the fetcher rejects
6. `error` is populated when the SDK result is `{ ok: false }`

**Reactive re-fetching**

7. Query re-fetches when a tracked reactive dependency changes
8. Previous in-flight request is cancelled (via AbortController) when a new fetch starts
9. `data` retains the previous value while a re-fetch is loading (stale-while-revalidate)
10. `loading` is `true` during re-fetch

**Cache keys**

11. Auto-generated cache key from SDK method metadata (`__cacheKey`)
12. Custom cache key via `options.key`
13. Cache hit: returns cached data immediately without fetching
14. Cache miss: fetches and stores in cache
15. Stale cache: re-fetches after `staleTime` expires

**Debounce**

16. With `debounce: 300`, rapid dependency changes only trigger one fetch after 300ms
17. Debounce timer resets on each dependency change

**Initial data**

18. `initialData` is used as `data` before the first fetch completes
19. After fetch completes, `data` is updated to the fresh response

**Enabled/disabled**

20. `enabled: () => false` prevents the initial fetch
21. `enabled` transitioning from false to true triggers a fetch
22. `enabled` transitioning from true to false does not cancel an in-flight request but prevents new ones

**Refetch**

23. `refetch()` triggers a new fetch regardless of cache state
24. `refetch()` returns a promise that resolves when the fetch completes

**Cleanup**

25. Disposing the owning scope cancels any in-flight fetch
26. Disposed query does not update state after disposal

### Type-level tests

```typescript
declare const api: { users: { list: SDKMethod<void, User[]> } };

const result = query(() => api.users.list());
const data: User[] | undefined = result.data;
const loading: boolean = result.loading;
const error: Error | undefined = result.error;

// @ts-expect-error -- data could be undefined, not guaranteed
const users: User[] = result.data;

// @ts-expect-error -- refetch returns Promise<void>, not data
const d: User[] = result.refetch();
```

### Dependencies

- Phase 1 (Signal Runtime) -- `data`, `loading`, `error` are signal-backed
- Phase 3 (Lifecycle) -- query integrates with scope for cleanup
- Phase 9 (SDK Generation) -- auto cache keys from SDK method metadata

### Acceptance criteria

- All 26 behavioral tests pass
- Type-level tests compile correctly
- `bunx biome check --write` passes
- `bun run typecheck` passes
- **Integration test:** Create a component with `query(() => api.users.list({ query: { q: search } }))` where `search` is a reactive signal. Change `search`, verify debounced re-fetch, stale-while-revalidate behavior, and final DOM update with fresh data.
- **Integration test:** Create two components sharing the same cache key. First component fetches, second component gets cache hit.

### Estimated test count

~34 (26 behaviors + 3 type-level + 2 integration + 3 setup)

### Key decisions / tradeoffs

- **SDK result unwrapping.** `query()` expects the fetcher to return `Promise<SDKResult<T>>`. It unwraps the discriminated union: `ok: true` -> data, `ok: false` -> error. This keeps the API simple.
- **Stale-while-revalidate by default.** Previous data remains visible while a re-fetch is loading. This prevents content flickering on re-fetches.
- **AbortController for cancellation.** Every fetch gets its own AbortController. When a new fetch starts or the scope is disposed, the previous controller is aborted. This prevents race conditions.
- **In-memory cache only.** No persistence across page loads. Cache is scoped to the current session. Persistent caching can be added later.
- **Debounce is optional.** Not all queries need debouncing. It is opt-in via `options.debounce`.

---

## Phase 12: SSR

### Goal

Build `@vertz/ui-server` for streaming server-side rendering. Implements `renderToStream()` that returns a `ReadableStream` of HTML chunks, supports `<Suspense>` boundaries with out-of-order streaming, and generates atomic hydration boundaries (`data-v-id` markers with serialized props) for interactive components.

### Package(s)

`@vertz/ui-server` -- new package (Node.js only, never ships to browser)

### Files to create

| File | Description |
|------|-------------|
| `packages/ui-server/package.json` | Package manifest |
| `packages/ui-server/tsconfig.json` | TypeScript config |
| `packages/ui-server/tsconfig.typecheck.json` | Typecheck config |
| `packages/ui-server/src/index.ts` | Package entry |
| `packages/ui-server/src/render-to-stream.ts` | `renderToStream()` -- main SSR entry point |
| `packages/ui-server/src/render-to-string.ts` | `renderToString()` -- synchronous SSR for simple cases |
| `packages/ui-server/src/html-writer.ts` | Writes DOM tree to HTML string chunks |
| `packages/ui-server/src/suspense-handler.ts` | Handles Suspense boundaries: placeholder emission, out-of-order chunk streaming |
| `packages/ui-server/src/hydration-boundary.ts` | Generates `data-v-id`, `data-v-key`, and `<script type="application/json">` for interactive components |
| `packages/ui-server/src/head-manager.ts` | `<Head>` component for managing `<title>`, `<meta>`, `<link>` tags |
| `packages/ui-server/src/types.ts` | SSR types |
| `packages/ui-server/src/__tests__/render-to-string.test.ts` | Synchronous render tests |
| `packages/ui-server/src/__tests__/render-to-stream.test.ts` | Streaming render tests |
| `packages/ui-server/src/__tests__/suspense.test.ts` | Suspense streaming tests |
| `packages/ui-server/src/__tests__/hydration-boundary.test.ts` | Hydration boundary tests |
| `packages/ui-server/src/__tests__/head-manager.test.ts` | Head management tests |
| `packages/ui-server/src/__tests__/integration.test.ts` | Full SSR integration tests |

### Public API

```typescript
// packages/ui-server/src/render-to-stream.ts
interface RenderToStreamOptions {
  onHead?: (head: HeadData) => void;
  bootstrapScripts?: string[];
}

function renderToStream(node: Node, options?: RenderToStreamOptions): ReadableStream<string>;

// packages/ui-server/src/render-to-string.ts
function renderToString(node: Node): string;

// packages/ui-server/src/head-manager.ts
interface HeadData {
  title?: string;
  meta: Array<Record<string, string>>;
  links: Array<Record<string, string>>;
}

function Head(props: { title?: string; children?: Node | Node[] }): void; // server-only, side-effect component
```

### Behaviors to TDD

**renderToString()**

1. Render a single `<div>` element to `<div></div>`
2. Render an element with text content: `<p>Hello</p>`
3. Render an element with attributes: `<div class="foo" id="bar">`
4. Render nested elements: `<div><p>inner</p></div>`
5. Render boolean attributes: `<input disabled />`
6. Render self-closing elements: `<br />`, `<img />`
7. Escape HTML entities in text content
8. Escape HTML entities in attribute values

**renderToStream()**

9. Stream a simple element as a single chunk
10. Stream nested elements as a single chunk (synchronous content)
11. Stream returns a ReadableStream that can be consumed via a Response

**Suspense streaming**

12. Suspense with synchronous children: stream children directly (no placeholder)
13. Suspense with async children: emit placeholder first, stream resolved content later
14. Placeholder includes a slot ID: `<div id="v-slot-{id}">fallback content</div>`
15. Resolved content streams as out-of-order chunk: `<template id="v-tmpl-{id}">resolved</template><script>...</script>`
16. The replacement script swaps the template content into the placeholder
17. Multiple Suspense boundaries stream independently
18. Static content before/after Suspense streams immediately (not blocked by async)

**Hydration boundaries**

19. Interactive component (has state) gets `data-v-id` attribute with component path
20. Interactive component gets `data-v-key` attribute with unique key
21. Interactive component's props are serialized as `<script type="application/json">`
22. Static component (no state, no events) renders plain HTML with no hydration boundary
23. Serialized props handle strings, numbers, booleans, arrays, objects
24. Serialized props escape HTML special characters in JSON

**Head management**

25. `<Head>` sets the page title
26. Multiple `<Head>` components: last one wins for title
27. `<Head>` adds `<meta>` tags
28. `<Head>` adds `<link>` tags
29. Head data is collected during render and provided via `onHead` callback

### Type-level tests

```typescript
// renderToStream returns ReadableStream
const stream: ReadableStream<string> = renderToStream(document.createElement("div"));
// @ts-expect-error -- not a Promise
const bad: Promise<string> = renderToStream(document.createElement("div"));

// renderToString returns string
const html: string = renderToString(document.createElement("div"));
// @ts-expect-error -- not a stream
const badStr: ReadableStream = renderToString(document.createElement("div"));
```

### Dependencies

- Phase 1-3 (Runtime, DOM, Lifecycle) -- SSR executes components using the runtime
- Phase 7 (Component Model) -- components must be SSR-compatible

### Acceptance criteria

- All 29 behavioral tests pass
- Type-level tests compile correctly
- `bunx biome check --write` passes
- `bun run typecheck` passes
- **Integration test:** SSR a page with a layout, a static header, a Suspense boundary with an async data loader, and a footer. Verify: header and footer stream immediately, Suspense placeholder appears, then resolved content streams as out-of-order chunk.
- **Integration test:** SSR a page with interactive and static components. Verify interactive components have hydration boundaries and static components do not.
- renderToStream works with `new Response(stream)` for web-standard server integration.

### Estimated test count

~36 (29 behaviors + 2 type-level + 2 integration + 3 setup)

### Key decisions / tradeoffs

- **renderToStream uses Web Streams API** (ReadableStream), not Node.js streams. This ensures compatibility with Bun, Deno, Cloudflare Workers, and any runtime that supports the web platform.
- **Out-of-order streaming uses `<template>` + `<script>` replacement.** This is the same technique used by Marko and React 18's streaming SSR. It works in all browsers.
- **Static component detection at SSR time.** The compiler annotates components as static or interactive. SSR uses this annotation to decide whether to emit hydration boundaries.
- **No client JS in SSR output by default.** The streaming renderer only emits HTML. Client JS links are injected via `bootstrapScripts` option or the Vite plugin.

---

## Phase 13: Atomic Hydration

### Goal

Build the client-side hydration runtime that reads `data-v-id` markers from SSR output, loads the corresponding component chunks, deserializes props, and attaches event handlers. Supports three hydration strategies: eager (immediate), visible (IntersectionObserver), and interaction (hydrate on first user event).

### Package(s)

`@vertz/ui` -- subpath export `@vertz/ui/hydrate`

### Files to create

| File | Description |
|------|-------------|
| `packages/ui/src/hydrate/hydrate.ts` | `hydrate(componentMap)` -- main client entry point |
| `packages/ui/src/hydrate/scanner.ts` | Scans DOM for `data-v-id` elements and collects hydration targets |
| `packages/ui/src/hydrate/deserializer.ts` | Reads `<script type="application/json">` and deserializes props |
| `packages/ui/src/hydrate/strategies.ts` | Eager, visible, interaction hydration strategies |
| `packages/ui/src/hydrate/types.ts` | Hydration types |
| `packages/ui/src/hydrate/index.ts` | Barrel export |
| `packages/ui/src/hydrate/__tests__/scanner.test.ts` | DOM scanner tests |
| `packages/ui/src/hydrate/__tests__/deserializer.test.ts` | Props deserialization tests |
| `packages/ui/src/hydrate/__tests__/strategies.test.ts` | Hydration strategy tests |
| `packages/ui/src/hydrate/__tests__/hydrate.test.ts` | Integration tests |

### Public API

```typescript
// packages/ui/src/hydrate/types.ts
type HydrationStrategy = 'eager' | 'visible' | 'interaction';

type ComponentLoader = () => Promise<{ default: (props: any) => Node }>;

type ComponentMap = Record<string, ComponentLoader>;

// packages/ui/src/hydrate/hydrate.ts
function hydrate(components: ComponentMap): void;
```

### Behaviors to TDD

**DOM scanner**

1. Find all elements with `data-v-id` attribute in the document
2. Extract component path from `data-v-id`
3. Extract unique key from `data-v-key`
4. Extract hydration strategy from `data-v-hydrate` (default: "visible")
5. Return empty array when no `data-v-id` elements exist

**Props deserializer**

6. Deserialize string props from `<script type="application/json">`
7. Deserialize number props
8. Deserialize boolean props
9. Deserialize array props
10. Deserialize nested object props
11. Handle missing script element (no props -> empty object)
12. Handle malformed JSON gracefully (log error, use empty object)

**Hydration strategies**

13. Eager strategy: loads and hydrates the component immediately
14. Visible strategy: hydrates when the element enters the viewport (IntersectionObserver)
15. Visible strategy: does not hydrate elements below the fold until scrolled
16. Interaction strategy: hydrates on first user interaction (click, focus, input, mouseover)
17. Interaction strategy: replays the triggering event after hydration completes

**hydrate() orchestrator**

18. Scans DOM and matches `data-v-id` to component map
19. Calls the component loader (dynamic import) for matched components
20. Creates a scope for the hydrated component
21. Renders the component with deserialized props
22. Replaces the server-rendered content with the hydrated component
23. Hydration preserves existing DOM structure (does not cause visual flash)
24. Components not in the component map are ignored (logged as warning)
25. Hydration runs only once per element (not re-triggered on DOM changes)

### Type-level tests

```typescript
// ComponentMap values must be functions returning dynamic imports
const map: ComponentMap = {
  'components/Counter': () => import('./Counter'),
};
// @ts-expect-error -- value must be a function
const badMap: ComponentMap = {
  'components/Counter': import('./Counter'),
};

// HydrationStrategy must be one of the defined values
const strategy: HydrationStrategy = 'eager';
// @ts-expect-error -- 'lazy' is not valid
const badStrategy: HydrationStrategy = 'lazy';
```

### Dependencies

- Phase 1-3 (Runtime, DOM, Lifecycle) -- hydrated components use the full runtime
- Phase 12 (SSR) -- hydration reads markers produced by SSR

### Acceptance criteria

- All 25 behavioral tests pass
- Type-level tests compile correctly
- `bunx biome check --write` passes
- `bun run typecheck` passes
- **Integration test:** SSR a page with two interactive components (one eager, one visible). Parse the HTML into a DOM, call `hydrate()`. Verify the eager component is hydrated immediately and the visible component is hydrated when observed.
- **Integration test:** SSR a page with an interaction-strategy component. Simulate a click on it. Verify the component is hydrated and the click event is replayed.
- Hydration runtime bundle under 1 KB gzip.

### Estimated test count

~32 (25 behaviors + 2 type-level + 2 integration + 3 setup)

### Key decisions / tradeoffs

- **Default strategy is "visible"** (IntersectionObserver). Most components below the fold do not need JavaScript until the user scrolls to them. This optimizes initial page load.
- **Event replay for interaction strategy.** When a user clicks a button that triggers hydration, the click must be replayed after hydration completes. Otherwise the user's first interaction is silently lost.
- **No DOM morphing.** Hydration does not try to reuse server-rendered DOM nodes (unlike React hydration or Svelte's `hydrate` mode). It replaces the inner content. This is simpler and avoids hydration mismatch issues. The visual flash is prevented by keeping the same layout.
- **Component map is explicit.** The entry-client.ts file explicitly maps component paths to dynamic imports. This is generated by the Vite plugin in Phase 15.

---

## Phase 14: Testing Utilities

### Goal

Build first-class testing utilities that make it easy to test @vertz/ui components, routes, forms, and queries. These utilities are what developers use daily -- they must be ergonomic, fast, and complete.

### Package(s)

`@vertz/ui` -- subpath export `@vertz/ui/test`

### Files to create

| File | Description |
|------|-------------|
| `packages/ui/src/test/render-test.ts` | `renderTest()` -- renders a component in an isolated DOM with query helpers |
| `packages/ui/src/test/test-router.ts` | `createTestRouter()` -- renders a route tree with mocked dependencies |
| `packages/ui/src/test/form-helpers.ts` | `fillForm()`, `submitForm()` -- simulate form interaction |
| `packages/ui/src/test/mock-sdk.ts` | `createMockSDK()` -- generates a mock SDK from the generated SDK types |
| `packages/ui/src/test/query-helpers.ts` | Query helpers: `findByText`, `findByRole`, `queryByText`, `click`, `type` |
| `packages/ui/src/test/types.ts` | Test utility types |
| `packages/ui/src/test/index.ts` | Barrel export |
| `packages/ui/src/test/__tests__/render-test.test.ts` | renderTest tests |
| `packages/ui/src/test/__tests__/test-router.test.ts` | createTestRouter tests |
| `packages/ui/src/test/__tests__/form-helpers.test.ts` | Form helper tests |
| `packages/ui/src/test/__tests__/mock-sdk.test.ts` | Mock SDK tests |
| `packages/ui/src/test/__tests__/query-helpers.test.ts` | Query helper tests |

### Public API

```typescript
// packages/ui/src/test/render-test.ts
interface RenderResult {
  container: HTMLElement;
  findByText(text: string): HTMLElement;
  findByRole(role: string, options?: { name?: string }): HTMLElement;
  queryByText(text: string): HTMLElement | null;
  click(element: HTMLElement): Promise<void>;
  type(selector: string, text: string): Promise<void>;
  unmount(): void;
}

function renderTest(component: Node): RenderResult;

// packages/ui/src/test/test-router.ts
interface TestRouterOptions {
  initialPath: string;
  sdk?: unknown;
}

interface TestRouter {
  component: Node;
  currentPath: string;
  navigate(path: string): Promise<void>;
}

function createTestRouter(routes: Record<string, RouteConfig>, options: TestRouterOptions): TestRouter;

// packages/ui/src/test/form-helpers.ts
function fillForm(form: HTMLFormElement, values: Record<string, string | number | boolean>): Promise<void>;
function submitForm(form: HTMLFormElement): Promise<void>;

// packages/ui/src/test/mock-sdk.ts
function createMockSDK<T extends Record<string, unknown>>(sdkShape?: T): MockSDK<T>;
```

### Behaviors to TDD

**renderTest()**

1. Render a component and return its container element
2. `findByText("text")` finds an element containing the text
3. `findByText("text")` throws if no element found
4. `queryByText("text")` returns null if no element found
5. `findByRole("button")` finds an element with the matching role
6. `findByRole("button", { name: "Submit" })` matches by accessible name
7. `click(element)` dispatches a click event and flushes reactive updates
8. `type(selector, text)` simulates keyboard input on an input element
9. `unmount()` disposes the component scope and removes DOM

**createTestRouter()**

10. Renders the component matching the initial path
11. Executes loaders for the matched route
12. `navigate(path)` changes the rendered component
13. `currentPath` reflects the current location
14. Passes mock SDK to loaders when provided

**fillForm()**

15. Sets values on named input fields
16. Handles text inputs
17. Handles number inputs (converts number to string for input.value)
18. Handles select elements
19. Handles checkbox inputs (boolean -> checked property)

**submitForm()**

20. Dispatches a submit event on the form
21. Waits for async submission to complete before resolving

**createMockSDK()**

22. Creates a mock SDK where every method is a spy/mock function
23. Mock methods return `{ ok: true, data: undefined }` by default
24. Mock methods can be configured with `mockResolvedValue`
25. Mock methods track call count and arguments

### Type-level tests

```typescript
// renderTest returns RenderResult
const result: RenderResult = renderTest(document.createElement("div"));
const el: HTMLElement = result.findByText("hello");
// @ts-expect-error -- findByText does not return string
const bad: string = result.findByText("hello");

// createTestRouter returns TestRouter
const router: TestRouter = createTestRouter({}, { initialPath: "/" });
// @ts-expect-error -- navigate returns Promise<void>, not string
const path: string = router.navigate("/users");
```

### Dependencies

- Phase 1-3 (Runtime, DOM, Lifecycle)
- Phase 7 (Component Model)
- Phase 8 (Router)
- Phase 9 (SDK Generation) -- for mock SDK shape
- Phase 10 (Forms) -- for form testing utilities
- `happy-dom` -- lightweight DOM implementation for tests

### Acceptance criteria

- All 25 behavioral tests pass
- Type-level tests compile correctly
- `bunx biome check --write` passes
- `bun run typecheck` passes
- **Integration test:** Use `renderTest` to test a Counter component. Click the increment button 3 times. Verify the count display updates to 3.
- **Integration test:** Use `createTestRouter` with a mock SDK to test navigation between a list page and a detail page. Verify loaders are called and components render.
- **Integration test:** Use `fillForm` and `submitForm` to test a form component. Verify validation errors display and submission calls the mock SDK.

### Estimated test count

~34 (25 behaviors + 2 type-level + 3 integration + 4 setup)

### Key decisions / tradeoffs

- **happy-dom, not jsdom.** happy-dom is faster and lighter. Since we are not testing browser-specific APIs (just DOM creation and events), happy-dom is sufficient.
- **Synchronous query helpers.** `findByText`, `findByRole` are synchronous -- they search the current DOM state. For async updates, the test calls `await click(...)` which flushes reactive updates before returning.
- **`createMockSDK` generates from the SDK type shape.** It uses Proxy to create mock methods for any property access pattern, matching the nested SDK structure (`api.users.list`).
- **No real HTTP in tests.** All data fetching is mocked via `createMockSDK`. Integration tests that need real HTTP use `@vertz/testing` with `createTestApp` (from the backend testing package).

---

## Phase 15: Vite Plugin

### Goal

Build the Vite plugin that integrates the @vertz/ui-compiler into the development workflow. Handles file transformation (Phases 4-6), HMR (Hot Module Replacement) for signal-based components, production build optimization, and auto-triggering codegen (Phase 9) when backend files change.

### Package(s)

`@vertz/ui-compiler` (additions to Phase 4's package) -- the Vite plugin is the primary distribution mechanism for the compiler

### Files to create

| File | Description |
|------|-------------|
| `packages/ui-compiler/src/vite-plugin.ts` | Main Vite plugin: `vertzUI()` factory function |
| `packages/ui-compiler/src/vite/transform-hook.ts` | `transform` hook: invokes `transformFile` on `.tsx` files |
| `packages/ui-compiler/src/vite/hmr-handler.ts` | HMR handler: signal-aware hot updates |
| `packages/ui-compiler/src/vite/codegen-watcher.ts` | Watches backend files, triggers codegen on change |
| `packages/ui-compiler/src/vite/config-hook.ts` | `config` hook: configures JSX, aliases, optimizeDeps |
| `packages/ui-compiler/src/vite/build-hook.ts` | Production build optimizations: code splitting, tree shaking config |
| `packages/ui-compiler/src/vite/types.ts` | Plugin configuration types |
| `packages/ui-compiler/src/__tests__/vite-plugin.test.ts` | Plugin initialization tests |
| `packages/ui-compiler/src/__tests__/transform-hook.test.ts` | Transform hook tests |
| `packages/ui-compiler/src/__tests__/hmr-handler.test.ts` | HMR tests |
| `packages/ui-compiler/src/__tests__/codegen-watcher.test.ts` | Codegen watcher tests |

### Public API

```typescript
// packages/ui-compiler/src/vite-plugin.ts
interface VertzUIPluginOptions {
  include?: string[];     // Glob patterns for files to transform (default: ["**/*.tsx"])
  exclude?: string[];     // Glob patterns to exclude
  codegen?: {
    backendDir?: string;  // Directory to watch for backend changes (default: "src/server")
    outputDir?: string;   // Where to write generated files (default: ".vertz/generated")
    autoRun?: boolean;    // Auto-run codegen on backend changes (default: true)
  };
  ssr?: boolean;          // Enable SSR mode
}

function vertzUI(options?: VertzUIPluginOptions): VitePlugin;

// The plugin also extends Vite's Module interface for HMR:
interface VertzHMRPayload {
  type: 'vertz:signal-update';
  componentId: string;
  signalUpdates: Array<{ name: string; value: unknown }>;
}
```

### Behaviors to TDD

**Plugin initialization**

1. `vertzUI()` returns a valid Vite plugin object with the correct name
2. Plugin has `transform`, `config`, `configResolved`, and `handleHotUpdate` hooks
3. Default options are applied when none provided

**Config hook**

4. Config hook adds JSX factory configuration for Vertz UI
5. Config hook adds alias for `@vertz/ui/runtime` to resolve correctly
6. Config hook configures `optimizeDeps.include` for runtime packages

**Transform hook**

7. Transform processes `.tsx` files (invokes `transformFile` from Phase 4)
8. Transform skips non-`.tsx` files
9. Transform skips files matching `exclude` patterns
10. Transform returns the transformed code with sourcemap
11. Transform returns null for files that need no transformation (no components detected)

**HMR**

12. File change triggers HMR update for the changed module
13. Signal state is preserved across HMR updates (not reset to initial values)
14. Component function is re-executed on HMR to pick up new DOM structure
15. Effects are re-created on HMR (old effects disposed, new ones established)
16. HMR falls back to full reload when component boundaries change (structural change)

**Codegen watcher**

17. Watcher detects new/changed files in the backend directory
18. File change triggers codegen (`generate()` from Phase 9)
19. Codegen output is written to the configured output directory
20. Watcher debounces rapid file changes (single codegen run)
21. Watcher can be disabled via `codegen.autoRun: false`

**Production build**

22. Production build applies all transforms
23. Production build enables tree-shaking of unused runtime exports
24. Production build generates sourcemaps when configured

### Type-level tests

```typescript
// Plugin options are optional
const plugin1 = vertzUI();
const plugin2 = vertzUI({});
const plugin3 = vertzUI({ include: ["src/**/*.tsx"] });

// @ts-expect-error -- unknown option
const badPlugin = vertzUI({ unknownOption: true });
```

### Dependencies

- Phase 4-6 (Compiler) -- transform pipeline
- Phase 9 (SDK Generation) -- codegen triggered by watcher
- `vite` -- Vite plugin API

### Acceptance criteria

- All 23 behavioral tests pass
- Type-level tests compile correctly
- `bunx biome check --write` passes
- `bun run typecheck` passes
- **Integration test:** Set up a minimal Vite project with the plugin. Write a Counter component. Run `vite build` and verify the output contains transformed signal code, correct imports, and working DOM helpers.
- **Integration test:** Start the Vite dev server, modify a component file, verify HMR updates the component without losing signal state.
- **Integration test:** Modify a backend file, verify codegen runs automatically and the generated SDK is updated.

### Estimated test count

~30 (23 behaviors + 1 type-level + 3 integration + 3 setup)

### Key decisions / tradeoffs

- **Signal-preserving HMR.** This is the hardest part of the plugin. When a file changes, we want to keep existing signal values (so a counter doesn't reset to 0). The strategy: the HMR handler replaces the component function but reuses existing signal instances by matching them by position/name. If the signal structure changes, fall back to full reload.
- **Codegen on backend changes.** The Vite plugin watches the backend source directory and re-runs codegen when routes or schemas change. This keeps the frontend SDK in sync during development without manual steps.
- **Include/exclude patterns.** By default, all `.tsx` files are transformed. Exclude patterns let developers opt out specific files (e.g., third-party components that should not be transformed).
- **SSR mode.** When `ssr: true`, the plugin adjusts the transform to emit server-compatible code (string concatenation instead of DOM operations). This is used by the `@vertz/ui-server` package.

---

## Cross-Phase Concerns

### Bundle Size Budget

| Module | Phase | Budget (gzip) |
|--------|-------|---------------|
| Signal core (signal, computed, effect, batch) | 1 | 1.5 KB |
| DOM helpers (__element, __text, __attr, __on, __conditional, __list) | 2 | 2 KB |
| Lifecycle (onMount, onCleanup, watch, context) | 3 | 0.5 KB |
| Suspense + ErrorBoundary | 7 | 0.5 KB |
| **Total core runtime** | **1-7** | **4.5 KB** |
| Router | 8 | 2 KB |
| query() | 11 | 0.5 KB |
| form() | 10 | 0.5 KB |
| Hydration client | 13 | 1 KB |
| **Total with features** | **all** | **~8.5 KB** |

These budgets are hard gates. If a phase exceeds its budget, optimize before proceeding.

### Testing Strategy

All phases follow strict TDD per `.claude/rules/tdd.md`:

- **Red**: One failing test
- **Green**: Minimum code to pass
- **Quality Gates**: `bunx biome check --write <files>` + `bun run typecheck`
- **Refactor**: Clean up under green

Test runner: **Vitest** (consistent with existing packages)
DOM environment: **happy-dom** (for phases 2, 3, 7, 8, 10-14)
Assertions: `expect()` from Vitest

### Dependency Graph Between Phases

```
Phase 1: Signal Runtime
    |
    v
Phase 2: DOM Helpers
    |
    v
Phase 3: Lifecycle & Watch
    |
    +------+-------+------ ... ------+
    |      |       |                 |
    v      v       v                 v
Phase 4  Phase 7  Phase 8      Phase 12: SSR
Compiler  Component Router           |
Reactivity Model                     v
    |                           Phase 13: Atomic
    v                           Hydration
Phase 5
Compiler
JSX
    |
    v
Phase 6               Phase 9: SDK Generation
Compiler               (depends on @vertz/compiler)
Props                      |
    |           +----------+----------+
    v           |          |          |
Phase 15    Phase 10   Phase 11   Phase 14
Vite Plugin  Forms     query()    Testing
```

### File Naming Conventions

Following existing monorepo patterns:

- **Source files**: `packages/<pkg>/src/<module>/<name>.ts`
- **Test files**: `packages/<pkg>/src/<module>/__tests__/<name>.test.ts`
- **Package entry**: `packages/<pkg>/src/index.ts`
- **Subpath entry**: `packages/<pkg>/src/<subpath>/index.ts`
- **Build output**: `packages/<pkg>/dist/`
- **TypeScript config**: `packages/<pkg>/tsconfig.json` + `tsconfig.typecheck.json`

### Quality Gate Commands

```bash
# Lint and format
bunx biome check --write packages/ui/src/runtime/

# Typecheck
bun run typecheck

# Run tests
vitest run packages/ui/src/runtime/

# Measure bundle size
bun build packages/ui/src/runtime/index.ts --minify | gzip -c | wc -c
```

---

## Summary

This plan defines 15 phases that build @vertz/ui from the ground up:

1. **Phases 1-3**: Runtime foundation (signals, DOM, lifecycle)
2. **Phases 4-6**: Compiler transforms (reactivity, JSX, props)
3. **Phase 7**: Component model integration
4. **Phases 8-11**: Application features (router, SDK, forms, queries)
5. **Phases 12-13**: Server rendering and hydration
6. **Phase 14**: Testing utilities
7. **Phase 15**: Development tooling (Vite plugin)

Total estimated tests: **~466** across all phases. Every test follows strict TDD. Every phase has measurable acceptance criteria. Every public API has TypeScript signatures. A developer can pick up any phase and implement it without asking questions.
