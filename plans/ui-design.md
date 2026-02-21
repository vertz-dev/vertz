# @vertz/ui — Design Plan

> A compiler-driven UI library. Plain TypeScript. Zero ceremony. Fine-grained reactivity.

**North star:** Write plain TypeScript/JSX. The compiler makes it reactive. If it builds, it renders.

---

## 1. Core Philosophy

| Principle | How @vertz/ui delivers |
|-----------|----------------------|
| "Type Safety Wins" | Files are valid `.tsx` — not `.svelte`, not `.vue`. Full IDE support, `tsc` validates, types flow end-to-end from backend schemas to UI components |
| "One Way to Do Things" | State = `let`. Derived = `const`. Data loading = loaders + `query()`. Forms = native `FormData` + schema validation. No alternatives |
| "If your code builds, it runs" | Code works with plain `tsc` (just not reactive). The compiler is an enhancement, not a requirement for valid syntax |
| "Explicit over implicit" | No virtual DOM, no hidden re-renders, no dependency arrays. Compiler generates targeted subscriptions visible in devtools |
| "My LLM nailed it on the first try" | No framework-specific syntax to learn. It is just TypeScript functions with `let` and JSX |

### What we learned from the competition

| Framework | Key lesson for Vertz UI |
|-----------|------------------------|
| **Svelte 5** | Compiler-driven reactivity works. But `.svelte` files aren't valid TypeScript — we fix that with plain `.tsx` |
| **SolidJS** | Fine-grained DOM updates without VDOM are fast and simple. JSX → direct DOM calls is the right compilation target |
| **Qwik** | Resumability and per-component lazy loading reduce JS shipped. Atomic hydration with serialized state is the path |
| **Marko** | Streaming SSR with out-of-order chunks is production-proven. Auto-detecting which components need hydration is ideal |
| **HTMX** | Native HTML forms manage their own state. Progressive enhancement matters. Don't fight the browser |
| **Million.js** | Compile-time edit maps can turn O(n) reconciliation into O(1) updates for static-structure templates |

---

## Manifesto Alignment

Each major API decision in `@vertz/ui` maps to a principle from the [Vertz Manifesto](../MANIFESTO.md):

| API Decision | Manifesto Principle | How It Aligns |
|---|---|---|
| `let` = signal, `const` = computed | **"Type Safety Wins"** + **"One Way to Do Things"** | No new APIs for reactivity. The compiler uses TypeScript's existing `let`/`const` semantics. One mental model, zero new concepts. Types flow naturally because the code is valid TypeScript. |
| Compiler-driven reactivity (no runtime API) | **"Compile-time over runtime"** | Reactive transforms happen at build time. If code compiles, reactivity works. No runtime discovery of broken dependency arrays or missing hooks. |
| Props as proxy objects (no destructuring) | **"Explicit over implicit"** | `props.name` makes the data source visible. Destructuring hides where values come from and breaks fine-grained tracking. The explicit form is also easier for LLMs to reason about. |
| `form(sdkMethod)` — SDK-aware forms | **"Production-ready by default"** + **"The Backend Is Just the First Step"** | Validation, endpoint, and types flow from backend schema to form automatically. No manual DTO mapping. Types flow from database to API to form — one language. |
| Atomic hydration (auto-detected from `let`/`const`) | **"Predictability over convenience"** | Less `let` = less JavaScript shipped. The principle is deterministic: the compiler knows exactly which components need hydration. No developer annotations needed. |
| Plain `.tsx` files (no custom file formats) | **"My LLM nailed it on the first try"** | LLMs are trained on millions of TypeScript files. No custom syntax to learn, no framework-specific DSL to hallucinate. An LLM that knows TypeScript knows `@vertz/ui`. |
| Streaming SSR with out-of-order chunks | **"Production-ready by default"** | SSR is not a plugin or afterthought. Streaming is the default rendering mode. Sites are fast out of the box. |

**Tradeoffs accepted:**
- **Explicit over implicit**: Props must use `props.x` access (slightly more verbose) in exchange for guaranteed fine-grained reactivity.
- **Convention over configuration**: There is exactly one way to define state (`let`), derived values (`const`), and side effects (`watch`/`onMount`). No escape hatches, no alternatives.
- **Compile-time over runtime**: The compiler is a hard requirement for reactivity. Code works without the compiler (it is valid TypeScript) but is not reactive. This is a deliberate trade — we catch errors at build time, not in production.

**Alternatives rejected:**
- **Runtime signals API** (like Solid's `createSignal`): Rejected because it adds API surface and makes the framework harder for LLMs. `let` is universally understood.
- **Virtual DOM** (like React): Rejected because fine-grained updates are faster and simpler. No reconciliation overhead, no hidden re-renders.
- **Custom file format** (like Svelte's `.svelte`): Rejected because it breaks TypeScript tooling and LLM familiarity. `.tsx` is the standard.

---

## Non-Goals

The following are explicitly **not** goals of `@vertz/ui` v1. This prevents scope creep and sets clear boundaries for implementation.

| Non-Goal | Rationale |
|----------|-----------|
| **Virtual DOM** | Fine-grained signal subscriptions update the DOM directly. A virtual DOM adds overhead with no benefit in this architecture. |
| **Class-based components** | Components are plain functions. Class syntax adds complexity (lifecycle methods, `this` binding, inheritance) without benefit. No exceptions. |
| **CSS-in-JS runtime** | `@vertz/ui` uses compile-time CSS extraction (zero-runtime). No `styled-components` or `emotion`-style runtime style injection. |
| **Backwards compatibility with React/Vue component APIs** | Clean break. No `useState`, no `useEffect`, no Options API, no Composition API. One reactivity system. |
| **Server Components (RSC-style)** | Server rendering is handled via streaming SSR + atomic hydration. There is no React Server Components-style model where components execute exclusively on the server with client/server boundaries. |
| **Mobile/native rendering** | `@vertz/ui` targets web browsers only. React Native-style cross-platform rendering is out of scope. |
| **Entity-level caching** (like Relay/Apollo normalized cache) | `query()` uses query-level caching keyed by operation + parameters. Normalized entity caches add significant complexity. Deferred to a future version if needed. |
| **Animation framework** | Deferred to v1.1. v1 provides the lifecycle hooks (`onMount`, `onCleanup`) needed for third-party animation libraries. |
| **Feature flags / gradual rollouts** | Deferred to v1.2. See the [roadmap exploration](../../backstage/research/explorations/ui-animations-flags-rollouts.md). |

---

## Unknowns

Open questions and risks that must be resolved before or during implementation.

### Discussion-resolvable

1. **`onCleanup` ordering guarantees**: When multiple `onCleanup` handlers are registered in a single `watch()` or `onMount()`, do they execute in registration order or reverse order? **Resolution strategy**: Team discussion. Recommend LIFO (reverse order) to match `try/finally` semantics and Go's `defer`.

2. **`query()` stale-while-revalidate behavior**: Should `query()` return stale data while refetching by default, or should it show a loading state? **Resolution strategy**: Team discussion. Recommend stale-while-revalidate as default with opt-out via `{ keepPreviousData: false }`.

### Needs POC

3. **Compiler taint analysis with closures, HOCs, re-exports, and dynamic components**: Can the two-pass taint analysis correctly handle all edge cases listed in the compiler edge cases section? Closures capturing reactive variables across function boundaries, higher-order components that wrap other components, and re-exported signals are non-trivial for static analysis. **Resolution strategy**: Build a POC that tests the compiler against a suite of edge case components.

4. **Signal memory management and disposal model**: How does the ownership model work when signals are passed between component scopes (e.g., a parent creates a signal and passes it as a prop to a child — who owns it)? What happens when a child component unmounts but the parent still references the signal? **Resolution strategy**: Build a POC with deeply nested component trees and measure memory with/without disposal.

5. **`query()` auto-tracking mechanism**: The tracking scope approach works for synchronous signal reads, but does it handle signals read inside `async` functions or callbacks passed to the query function? **Resolution strategy**: POC with async query functions that read signals at different points in their execution.

6. **CSP compatibility for streaming SSR inline scripts**: Does nonce forwarding work correctly with all major CDN/proxy configurations (Cloudflare, Vercel, AWS CloudFront)? Some proxies modify or strip nonce attributes. **Resolution strategy**: POC deploying a streaming SSR app behind each major CDN and verifying CSP nonce preservation.

7. **Compiler performance at scale**: What are the performance characteristics of the two-pass taint analysis on projects with 1000+ components? Is ts-morph fast enough, or do we need to optimize the analysis pass? **Resolution strategy**: POC with a generated project of 1000+ components measuring compile time.

---

## POC Results

No POCs have been conducted yet. The following POCs are recommended before implementation begins:

| POC | Question to Answer | Priority |
|-----|-------------------|----------|
| **Compiler taint analysis edge cases** | Can the two-pass taint analysis handle closures that capture reactive variables, HOCs, re-exports, and dynamic components? | **P0** — blocks Phase 1 |
| **Signal disposal/ownership model** | Does the component-scoped ownership model correctly dispose signals when components unmount? What about shared signals? | **P0** — blocks Phase 1 |
| **Streaming SSR with CSP-compatible nonce forwarding** | Do inline `<script>` tags with nonce attributes survive CDN proxying (Cloudflare, Vercel, AWS)? | **P1** — blocks Phase 5 |
| **Atomic hydration with large component trees** | Does flat, non-hierarchical hydration scale to pages with 100+ interactive components? What are the memory and performance characteristics? | **P1** — blocks Phase 5 |
| **Compiler performance at scale** | Does two-pass taint analysis complete in < 1s for a project with 1000+ components? | **P2** — nice to validate before Phase 1 |

POC findings will be written back into this design doc, referencing the closed POC PRs, per the [design doc standards](../../.claude/rules/design-docs.md).

---

## E2E Acceptance Test

The following end-to-end test validates the entire `@vertz/ui` feature set works as designed. This test is the final gate before the feature is considered complete.

**Scenario:** A TodoMVC application with authentication, routing, streaming SSR, and atomic hydration.

```typescript
import { createTestApp } from '@vertz/testing';
import { renderE2E } from '@vertz/ui/test';
import { routes } from './app/routes';
import { appConfig } from './app/config';

test('e2e: TodoMVC with auth, routing, SSR, and hydration', async () => {
  const app = await createTestApp(appConfig);
  const {
    findByText,
    queryByText,
    fillForm,
    submitForm,
    click,
    navigate,
    getHTML,
    waitFor,
  } = renderE2E(routes, { baseUrl: app.url });

  // --- 1. SSR: initial page renders server-side ---
  await navigate('/');
  const initialHTML = getHTML();
  // SSR output contains the static shell without requiring JS execution
  expect(initialHTML).toContain('<h1>Todos</h1>');
  // Non-interactive components have NO hydration markers (static HTML only)
  expect(initialHTML).not.toContain('data-v-id="components/Header"');

  // --- 2. Auth: redirect to login when not authenticated ---
  await navigate('/todos');
  expect(findByText('Sign in')).toBeTruthy();

  // --- 3. Login form: schema validation + SDK submission ---
  await fillForm('form', { email: 'alice@test.com', password: 'password123' });
  await submitForm('form');
  await waitFor(() => findByText('My Todos'));

  // --- 4. Create a todo: form submission with validation ---
  await fillForm('[data-testid="new-todo-form"]', { title: 'Buy groceries' });
  await submitForm('[data-testid="new-todo-form"]');
  expect(findByText('Buy groceries')).toBeTruthy();

  // --- 5. Reactivity: toggle todo completion ---
  await click(findByText('Buy groceries'));
  await waitFor(() => {
    const todo = findByText('Buy groceries');
    expect(todo?.closest('[data-completed]')).toBeTruthy();
  });

  // --- 6. Routing: navigate between routes ---
  await navigate('/todos/completed');
  expect(findByText('Buy groceries')).toBeTruthy(); // appears in completed list

  await navigate('/todos/active');
  expect(queryByText('Buy groceries')).toBeNull(); // not in active list

  // --- 7. Hydration: only interactive components hydrate ---
  await navigate('/todos');
  const todosHTML = getHTML();
  // The todo list component has a hydration marker (it has let state + event handlers)
  expect(todosHTML).toContain('data-v-id="components/TodoList"');
  // The footer is static (no let variables) — no hydration marker
  expect(todosHTML).not.toContain('data-v-id="components/Footer"');

  // --- 8. Cleanup: signals disposed on unmount ---
  await navigate('/');
  // Navigate away from /todos — the TodoList component unmounts.
  // No memory leaks: all signals created by TodoList are disposed.
  // (Verified by checking that no stale subscriptions fire after unmount.)

  // --- 9. Type safety: compiler rejects invalid usage ---
  // @ts-expect-error — cannot pass number where string is expected
  // <TodoItem title={42} />
  //
  // @ts-expect-error — cannot use unknown route
  // navigate('/nonexistent');

  await app.close();
});
```

This test validates: streaming SSR output, atomic hydration boundaries, authentication flow, form validation and submission, fine-grained reactivity, client-side routing with nested layouts, signal cleanup on unmount, and type safety at the compiler level.

---

## 2. Package Structure

| Package | Purpose | Ships to browser? |
|---------|---------|-------------------|
| `@vertz/ui` | JSX runtime, reactivity runtime (signals), router, `query()`, `form()`, hydration client, `ErrorBoundary`, context | Yes |
| `@vertz/ui-server` | Streaming HTML renderer, atomic hydration emitter, `<Head>` management, asset pipeline | No (Node.js only) |
| `@vertz/ui-compiler` | Vite plugin — `let` → signal transform, JSX → DOM calls, component registration for hydration, route type extraction from backend IR | No (build only) |
| `@vertz/codegen` | Reads compiler IR, generates typed SDK client (`sdk.ts`), route types, and re-exported schemas. See [Section 20](#20-dependencies-on-vertzcodegen-and-vertzfetch) for full dependency analysis. | No (build only) |

Dependency graph:

```
@vertz/schema ← shared validation (server + client)
     ↓
@vertz/core → @vertz/compiler → IR
                                  ↓
                            @vertz/codegen → .vertz/generated/
                                                ├── route-types.ts
                                                ├── sdk.ts          (typed SDK client)
                                                └── schemas.ts
                                                      ↓
@vertz/ui-compiler (Vite plugin) → reads generated types + SDK
     ↓
@vertz/ui (browser)  ←  @vertz/ui-server (SSR)
```

---

## 3. Reactivity: Plain `let` Becomes Reactive

### The developer writes:

```tsx
function Counter() {
  let count = 0;

  return (
    <div>
      <p>Count: {count}</p>
      <button onClick={() => count++}>+</button>
    </div>
  );
}
```

### The compiler outputs:

```tsx
import { signal as __signal } from "@vertz/ui/runtime";
import { text as __text, element as __element, on as __on } from "@vertz/ui/dom";

function Counter() {
  const __count = __signal(0);

  const __root = __element("div");
  const __p = __element("p");
  const __t = __text(() => "Count: " + __count.get());
  __p.append(__t);
  const __btn = __element("button");
  __btn.textContent = "+";
  __on(__btn, "click", () => __count.update(v => v + 1));
  __root.append(__p, __btn);
  return __root;
}
```

### The `let`/`const` reactivity principle

JavaScript's `let` and `const` already carry semantic meaning every developer internalizes:

- **`const`** — this value will not change. Fixed. Static.
- **`let`** — this value may change. Mutable. Reactive.

The compiler takes this seriously. `let` = reactive, `const` = static. This one rule drives everything: state, derived values, props optimization, DOM binding optimization, and component-level hydration decisions. No new APIs for the core reactivity model — just the keywords you already know.

> "JavaScript's `let` and `const` already tell you whether something changes. We just taught the compiler to listen."

### How the compiler decides what is reactive

A `let` variable is reactive if it is referenced in JSX (directly or transitively through a `const`). The compiler uses two-pass taint analysis:

1. **Pass 1**: Collect all `let` declarations inside component functions (functions returning JSX).
2. **Pass 2**: Check if any reference site is inside a `JsxExpression`, `JsxAttribute`, or a `const` that is itself referenced in JSX.

Non-reactive `let` variables are left completely untransformed.

### Computed values

```tsx
function PriceDisplay(props: { price: number }) {
  let quantity = 1;
  const total = props.price * quantity;           // compiler → computed(() => props.price * __quantity.get())
  const formatted = `$${total.toFixed(2)}`; // compiler → computed(() => `$${__total.get().toFixed(2)}`)

  return <p>Total: {formatted}</p>;
}
```

The compiler detects that `total` depends on reactive `quantity`, so `const total = ...` becomes `const __total = computed(...)`. The chain is transitive — `formatted` depends on `total`, so it also becomes a computed.

### Arrays and objects — reassignment triggers reactivity

```tsx
let todos: Todo[] = [];

const addTodo = (title: string) => {
  todos = [...todos, { id: crypto.randomUUID(), title, done: false }];
};
```

Arrays and objects are wrapped in a single signal. Reactivity is triggered by **reassignment only** (`todos = [...]`). The compiler does NOT proxy arrays or intercept in-place mutations — explicit over implicit.

### Destructuring — `let` tracks, `const` snapshots

Destructuring follows the same `let`/`const` principle:

```tsx
let user = { name: "Alice", age: 30 };

// let destructuring → reactive. name and age track user.name and user.age.
let { name, age } = user;
// Compiler → const __name = computed(() => __user.get().name)
//            const __age = computed(() => __user.get().age)

// If user is reassigned, name and age update:
user = { name: "Bob", age: 25 };
// name is now "Bob", age is now 25 — DOM updates automatically.

// const destructuring → snapshot. Fixed values, never update.
const { name: initialName } = user;
// initialName is "Alice" forever, even if user changes later.
```

If a developer reassigns a `let`-destructured binding independently, it disconnects from the source and becomes its own signal:

```tsx
let { name } = user;     // tracks user.name
name = "Charlie";         // disconnected — name is now its own signal
// user.name changes won't affect name anymore
```

This follows JavaScript intuition: the developer explicitly took control of the value with `=`.

### What the compiler catches (mutation diagnostics)

Reactivity requires **reassignment** (`=`). In-place mutations (`.push()`, property assignment, `delete`) do NOT trigger DOM updates. The compiler detects these patterns and emits actionable diagnostics.

**Array mutation methods:**

```
error[non-reactive-mutation]: Calling .push() on reactive variable 'todos' will not trigger DOM updates.

  12 |   todos.push(newItem);
     |          ^^^^ in-place mutation — reactivity requires reassignment

  fix: todos = [...todos, newItem];
  why: Reactive variables track reassignment (=), not in-place mutation.
```

This applies to all mutating array methods: `.push()`, `.pop()`, `.shift()`, `.unshift()`, `.splice()`, `.sort()`, `.reverse()`, `.fill()`, `.copyWithin()`.

**Object property assignment:**

```
error[non-reactive-mutation]: Property assignment on reactive variable 'user' will not trigger DOM updates.

  8 |   user.name = "Bob";
    |   ^^^^^^^^^ property mutation — reactivity requires reassignment

  fix: user = { ...user, name: "Bob" };
  why: Reactive variables track reassignment (=), not property mutation.
```

**Nested property mutation:**

```
error[non-reactive-mutation]: Nested property assignment on reactive variable 'user' will not trigger DOM updates.

  8 |   user.address.city = "NYC";
    |   ^^^^^^^^^^^^^ nested mutation — reactivity requires reassignment

  fix: user = { ...user, address: { ...user.address, city: "NYC" } };
  why: Reactive variables track reassignment (=), not nested property mutation.
```

**Delete expression:**

```
error[non-reactive-mutation]: 'delete' on reactive variable 'config' will not trigger DOM updates.

  8 |   delete config.debug;
    |   ^^^^^^ property deletion — reactivity requires reassignment

  fix: const { debug, ...rest } = config; config = rest;
  why: Reactive variables track reassignment (=), not property deletion.
```

**Index assignment:**

```
error[non-reactive-mutation]: Index assignment on reactive variable 'items' will not trigger DOM updates.

  8 |   items[2] = newValue;
    |   ^^^^^^^^ index mutation — reactivity requires reassignment

  fix: items = items.map((v, i) => i === 2 ? newValue : v);
  why: Reactive variables track reassignment (=), not index mutation.
```

**`Object.assign()`:**

```
error[non-reactive-mutation]: Object.assign() on reactive variable 'user' will not trigger DOM updates.

  8 |   Object.assign(user, { name: "Bob" });
    |                 ^^^^ in-place mutation — reactivity requires reassignment

  fix: user = { ...user, name: "Bob" };
  why: Reactive variables track reassignment (=), not Object.assign().
```

**Scope:** The compiler only emits mutation diagnostics when the variable is **referenced in JSX** (directly or transitively through a computed). If a `let` array is used purely for internal bookkeeping and never affects the DOM, mutations are fine and no diagnostic is emitted.

All diagnostics are designed to be actionable for both humans and LLMs — the fix is copy-pasteable, the explanation is one sentence. The Biome linter also catches these patterns before the compiler runs, providing two layers of defense.

### The seven compiler rules

The entire reactivity model reduces to seven deterministic rules. No heuristics, no runtime analysis, no cross-file inference:

1. `let` in a component body + referenced in JSX → **signal**
2. `const` whose initializer references a signal (directly or transitively) → **computed**
3. `let { a, b } = reactiveExpr` → **computed** per binding (tracks the source)
4. JSX expression referencing a signal or computed → **subscription code** (fine-grained DOM update)
5. JSX expression referencing only plain values → **static code** (no subscriptions, no tracking)
6. Prop expression referencing a signal or computed → **getter wrapper**
7. Prop expression referencing only plain values → **plain value** (zero overhead)

One taint analysis pass, seven applications. The compiler stays simple and every transform is deterministic.

### Signal batching

Multiple synchronous signal writes are batched into a single update cycle. This is critical for performance — without batching, updating two signals would trigger two separate DOM update passes.

```tsx
import { batch } from '@vertz/ui';

function ResetForm() {
  let name = '';
  let email = '';

  const reset = () => {
    batch(() => {
      name = '';
      email = '';
    });
    // One DOM update, not two
  };

  return (
    <form>
      <input value={name} onInput={(e) => name = e.currentTarget.value} />
      <input value={email} onInput={(e) => email = e.currentTarget.value} />
      <button type="button" onClick={reset}>Reset</button>
    </form>
  );
}
```

The compiler automatically wraps event handlers in `batch()` when they write to multiple signals. Explicit `batch()` is available for imperative code outside event handlers (e.g., async callbacks, timers).

### Signal memory management and disposal

Signals are owned by their component scope. When a component unmounts, all signals created within it are automatically disposed — their subscriptions are removed and their memory is released. This is the default behavior and requires no developer action.

**Component-scoped signals (automatic cleanup):**

```tsx
function Counter() {
  let count = 0; // signal owned by this component scope
  // When Counter unmounts, __count signal is disposed automatically
  return <p>{count}</p>;
}
```

**Global signals (manual disposal):**

Signals created outside a component scope (e.g., at module level for shared state) are not automatically disposed. For these, manual disposal is available:

```tsx
import { signal } from '@vertz/ui/runtime';

// Module-level signal — lives until manually disposed
const globalCount = signal(0);

// When no longer needed:
globalCount.dispose();
```

**Cleanup mechanism:** `onCleanup()` is the mechanism for component-scoped cleanup. It runs synchronously during component teardown, **before** the DOM is removed. This ordering matters for animation cleanup — teardown code can read DOM measurements before removal.

```tsx
function Animated() {
  let visible = true;

  onMount(() => {
    const animation = startAnimation();
    onCleanup(() => {
      // Runs synchronously during teardown, before DOM removal.
      // Can still read DOM measurements here.
      animation.cancel();
    });
  });

  return <div class="animated">{visible && <p>Hello</p>}</div>;
}
```

---

## 4. No useEffect — Ever

### DOM subscriptions are automatic

Every JSX expression that reads a reactive variable gets a compiler-generated micro-effect:

```tsx
<p>Count: {count}</p>
// becomes: __text(() => "Count: " + __count.get())
// The runtime subscribes to __count and updates the text node directly
```

The developer never writes effects for DOM updates. The compiler writes them all.

### Side effects use `watch()` and `onMount()`

For actual side effects, there are two explicit primitives — each with one purpose:

- **`watch(() => dep, callback)`** — watches a reactive dependency and runs the callback when it changes
- **`onMount(() => { ... })`** — runs setup code once when the component mounts

`watch()` always takes two arguments: a dependency accessor and a callback. For code that should run once on mount without watching a dependency, use `onMount()`.

```tsx
import { watch, onCleanup } from "@vertz/ui";

function UserProfile(props: { userId: string }) {
  let user: User | null = null;

  watch(() => props.userId, async (id) => {
    const controller = new AbortController();
    onCleanup(() => controller.abort());

    user = await fetchUser(id, { signal: controller.signal });
  });

  return <div>{user?.name}</div>;
}
```

### The complete side-effect API

| Need | API | When it runs |
|------|-----|-------------|
| DOM updates | Automatic (compiler-generated) | Whenever the bound signal changes |
| React to state change | `watch(() => dep, callback)` | **Once on mount** with current value, then **again whenever `dep` changes** |
| Run on mount only | `onMount(() => { ... })` | **Once on mount only** — never re-runs |
| Cleanup | `onCleanup(fn)` inside `watch` or `onMount` | Before re-run (watch) or on unmount (both) |
| Derived state | `const x = expr` (compiler makes it computed) | Recalculates when dependencies change |

**Execution timing clarified:**

- **`onMount(callback)`**: Runs the callback **once on mount**. This is the equivalent of "run setup code when the component first renders." It never re-executes. Supports `onCleanup` inside it for teardown on unmount. Use this for one-time setup like initializing third-party libraries, measuring DOM elements, or starting animations.
- **`watch(() => dep, callback)`**: Runs the callback **immediately on first call** with the current value of `dep` (like a computed with side effects), then **re-runs whenever `dep` changes**. Before each re-run, any `onCleanup` registered in the previous run executes first. Use this when you need to react to changing data — fetching, logging, syncing external state.

**Key distinction:** `watch()` is NOT "run once on mount then watch." It runs the callback **immediately** (synchronously on first call) and then re-runs on changes. If you need code that runs exactly once with no reactive dependency tracking, use `onMount()`. This is the fundamental difference:

```tsx
// watch() — runs immediately, then re-runs when userId changes
watch(() => props.userId, (id) => {
  console.log("Fetching user", id); // logs immediately AND on every change
});

// onMount() — runs once after mount, never again
onMount(() => {
  console.log("Component mounted"); // logs exactly once
  analytics.track("page_view");
});
```

The single-callback form of `watch()` (i.e. `watch(() => { ... })` with no dependency) is **not supported**. If a developer writes it, the compiler emits an actionable diagnostic suggesting `onMount()` instead. This ensures "one way to do things" — setup = `onMount`, react = `watch`, cleanup = `onCleanup`.

That is the entire list. No `useEffect`, `useMemo`, `useCallback`, `useLayoutEffect`.

---

## 5. Component Model

### Components execute once

Functions run one time, create DOM nodes, set up subscriptions, return the root. They never re-execute. When state changes, only the specific text nodes, attributes, or DOM fragments that depend on that state update.

```tsx
function Greeting(props: { name: string }) {
  return <h1>Hello, {props.name}!</h1>;
}
```

### Props passing — `let`/`const` optimized

When a parent passes a reactive value (`let`) to a child, the compiler wraps it as a getter. When it passes a static value (`const`), it passes a plain value — zero overhead:

```tsx
function Parent() {
  let count = 0;
  const label = "Count";

  return <Child value={count} label={label} />;
}

// Compiled:
// Child({ get value() { return __count.get() }, label: "Count" })
```

The `count` prop is wrapped in a getter because `count` is `let` (reactive). The `label` prop is passed as a plain string because `label` is `const`. This is invisible to the developer — the `let`/`const` distinction in the parent tells the compiler everything it needs.

The child never re-executes. Only the specific DOM node reading `props.value` updates.

**Important: do not destructure props.** Destructuring in the function signature breaks reactivity because it captures values at call time:

```tsx
// BAD — name and age are static snapshots, won't update:
function UserCard({ name, age }: Props) {
  return <div>{name}</div>;
}

// GOOD — reactive getter access through props object:
function UserCard(props: Props) {
  return <div>{props.name}</div>;
}
```

The compiler emits a diagnostic when it detects props destructuring in a component function signature.

### Lifecycle

Two events only:

```tsx
import { onMount, onCleanup } from "@vertz/ui";

function Timer() {
  let seconds = 0;

  onMount(() => {
    const interval = setInterval(() => seconds++, 1000);
    onCleanup(() => clearInterval(interval));
  });

  return <p>{seconds}s</p>;
}
```

No `componentDidUpdate`, no `shouldComponentUpdate`. Fine-grained reactivity eliminates update lifecycle hooks.

### Context (subtree state sharing)

```tsx
import { createContext, useContext } from "@vertz/ui";

const ThemeContext = createContext<{ theme: string; toggle: () => void }>();

function ThemeProvider(props: { children: any }) {
  let theme = "light";
  const toggle = () => theme = theme === "light" ? "dark" : "light";
  return <ThemeContext.Provider value={{ theme, toggle }}>{props.children}</ThemeContext.Provider>;
}

function ThemedButton() {
  const ctx = useContext(ThemeContext);
  // Access context via proxy — do not destructure, same rule as props.
  // Destructuring would snapshot the values and break reactivity.
  return <button class={`btn-${ctx.theme}`} onClick={ctx.toggle}>Toggle</button>;
}
```

### Refs (escape hatch for raw DOM)

```tsx
import { ref, onMount } from "@vertz/ui";

function Canvas() {
  const canvasRef = ref<HTMLCanvasElement>();

  // onMount runs once — at mount time, canvasRef.current is available because the DOM has been created.
  onMount(() => {
    const ctx = canvasRef.current?.getContext("2d");
    // imperative canvas drawing — runs once after the component mounts
  });

  return <canvas ref={canvasRef} width={800} height={400} />;
}
```

---

## 6. End-to-End Type Flow

Types flow from schema definition through backend routes to frontend components — zero manual DTOs.

### The chain

```
@vertz/schema definition
    ↓
@vertz/core route config (body, response, query schemas)
    ↓
@vertz/compiler → IR (intermediate representation)
    ↓
@vertz/codegen → .vertz/generated/
                    ├── route-types.ts    (type definitions)
                    ├── sdk.ts            (typed SDK client)
                    └── schemas.ts        (re-exported schemas)
    ↓
@vertz/ui imports SDK: api.users.list(), api.users.create()
    ↓
Component receives fully typed data
```

### SDK generation from compiler IR

The `@vertz/compiler` produces an IR that describes every module, operation, schema, and endpoint in the backend. `@vertz/codegen` reads this IR and generates a typed SDK client — similar to how Stripe, Resend, or OpenAI generate their client libraries.

The generated SDK:

- **Mirrors the backend module structure**: backend module `users` becomes `api.users`, module `billing.invoices` becomes `api.billing.invoices`.
- **Uses operation IDs as method names**: a route with `operationId: 'list'` in the `users` module becomes `api.users.list()`.
- **Carries full type information**: input schemas (body, query, params) and response types flow from the backend definition. No manual DTOs.
- **Embeds schema references**: each SDK method knows its associated `@vertz/schema` object, enabling `form()` and `query()` to auto-extract validation schemas and cache keys.
- **Generates deterministic cache keys**: each operation gets a stable key based on module path + operation ID + parameters, used by `query()` for caching.

```typescript
// .vertz/generated/sdk.ts (auto-generated — DO NOT EDIT)
import type { User, CreateUserBody } from './route-types';

export interface VertzSDK {
  users: {
    list(opts?: { query?: { page?: number; limit?: number } }): Promise<SDKResult<User[]>>;
    get(opts: { params: { id: string } }): Promise<SDKResult<User>>;
    create(opts: { body: CreateUserBody }): Promise<SDKResult<User>>;
    delete(opts: { params: { id: string } }): Promise<SDKResult<void>>;
    counts(): Promise<SDKResult<{ total: number; byRole: Record<string, number> }>>;
  };
}

// Each SDK method carries a .meta property with operation metadata:
api.users.create.meta
// → { operationId: 'create', method: 'POST', path: '/api/v1/users', bodySchema: createUserBodySchema }
//
// This enables form() and query() to auto-extract endpoint, schema, and cache key
// information from the SDK method itself — no separate imports needed.
```

### Generated route types

```typescript
// .vertz/generated/route-types.ts (auto-generated)
export interface User {
  id: string;
  name: string;
  email: string;
  role: 'admin' | 'user';
  createdAt: string;
}

export interface CreateUserBody {
  name: string;
  email: string;
  role?: 'admin' | 'user';
}
```

### Typed SDK client in components

```typescript
import { api } from '.vertz/generated/sdk';

// In a component:
const result = await api.users.list({ query: { page: 1 } });
// result.data is typed as User[]
```

The SDK call reads like natural language: `api.users.list()` instead of memorizing `GET /users`. If the backend renames an operation or changes a schema, `bun run typecheck` on the frontend catches the mismatch immediately — there is no string path to get wrong.

### Shared validation (automatic via SDK)

Each SDK method embeds a reference to its `@vertz/schema` object. This means `form()` and `query()` can extract the schema automatically:

```typescript
// The SDK method api.users.create internally knows:
//   - endpoint: POST /users
//   - body schema: createUserBody (from @vertz/schema)
//   - response type: User

// So form() can derive everything from the SDK method:
const userForm = form(api.users.create);
// No separate schema import needed — the SDK method IS the schema reference
```

---

## 7. Atomic Hydration

### The problem with traditional hydration

React hydration re-executes the entire component tree on the client to attach event handlers. This is wasteful — most of the page is static HTML that doesn't need JavaScript.

### Vertz UI approach: hydrate only what's interactive

The compiler detects which components are interactive (contain `let` state, event handlers that mutate state, `query()` calls). Non-interactive components render as static HTML with zero client JS.

This is **automatic partial hydration**, derived from the `let`/`const` principle. A component with no `let` variables and no event handlers is static by definition — the compiler already knows this from its taint analysis. No developer annotation needed (unlike Astro's `client:*` directives or Qwik's `$` boundaries).

The implication: **the less `let` you use, the less JavaScript ships.** Good coding practices (using `const` for things that don't change) directly translate to smaller bundles and faster hydration.

### HTML output

```html
<!-- Static: no JS needed -->
<header><h1>Users</h1></header>

<!-- Interactive component: hydration boundary -->
<div data-v-id="components/SearchBar" data-v-key="search-1">
  <script type="application/json">{"placeholder":"Search users..."}</script>
  <div>
    <input type="text" placeholder="Search users..." value="" />
  </div>
</div>

<!-- Static: no JS needed -->
<footer>&copy; 2026</footer>
```

### How it works

1. `data-v-id` — Maps to a code-split chunk containing the component code.
2. `<script type="application/json">` — Serialized props. Browser doesn't execute it; hydration runtime reads it.
3. The inner HTML — Server-rendered output. Visible immediately, interactive after hydration.

### Client hydration entry

```typescript
// entry-client.ts (auto-scaffolded by @vertz/ui-compiler)
import { hydrate } from '@vertz/ui/hydrate';

hydrate({
  'components/SearchBar': () => import('./components/SearchBar'),
  'components/LikeButton': () => import('./components/LikeButton'),
});
```

### Hydration strategies

The `hydrate` prop is type-safe:

```typescript
type HydrationStrategy = 'lazy' | 'eager' | 'visible' | 'media' | 'idle' | 'interaction';
```

```tsx
<SearchBar placeholder="..." hydrate="eager" />      // Above the fold: hydrate immediately
<LikeButton postId={id} />                            // Default: hydrate when visible (IntersectionObserver)
<SortableTable data={data} hydrate="interaction" />   // Hydrate on first user interaction
<Analytics hydrate="idle" />                           // Hydrate when browser is idle (requestIdleCallback)
<VideoPlayer hydrate="media" media="(min-width: 768px)" /> // Hydrate when media query matches
```

| Strategy | When it hydrates | Use case |
|----------|-----------------|----------|
| `eager` | Immediately on page load | Above-the-fold interactive content |
| `lazy` / `visible` | When the element enters the viewport (IntersectionObserver) | Default. Below-the-fold content |
| `interaction` | On first user interaction (click, focus, mouseover) | Heavy components that don't need immediate interactivity |
| `idle` | When browser is idle (requestIdleCallback) | Analytics, non-critical widgets |
| `media` | When a CSS media query matches | Responsive components |

### Nested boundaries

Hydration boundaries don't nest hierarchically. Each `data-v-id` is flat and self-contained. Parent and child interactive components hydrate independently.

---

## 8. Streaming SSR

### How it works

`renderToStream` returns a `ReadableStream` of HTML chunks:

```typescript
import { renderToStream } from '@vertz/ui-server';

const stream = renderToStream(<App url={ctx.raw.url} />);
return new Response(stream, {
  headers: { 'content-type': 'text/html; charset=utf-8' },
});
```

### Out-of-order streaming

When an async loader is inside a `<Suspense>` boundary, the renderer:
1. Emits a placeholder with a slot ID.
2. Continues streaming the rest of the page.
3. When the data arrives, emits an out-of-order chunk:

```html
<!-- Placeholder (streamed first) -->
<div id="v-slot-1"><div class="skeleton">Loading...</div></div>

<!-- Later: replacement chunk (streamed when data arrives) -->
<template id="v-tmpl-1">
  <div data-v-id="components/UserProfile" data-v-key="user-1">
    <script type="application/json">{"user":{"id":"abc","name":"Alice"}}</script>
    <div class="profile"><h2>Alice</h2></div>
  </div>
</template>
<script>
  document.getElementById('v-slot-1').replaceWith(
    document.getElementById('v-tmpl-1').content
  );
</script>
```

### Chunking strategy

Chunking is per-`<Suspense>` boundary, not per-component:

```tsx
<Header />                          {/* Chunk 1: immediate */}
<Suspense fallback={<Skeleton />}>
  <UserProfile userId="abc" />      {/* Chunk 2: streams when data arrives */}
</Suspense>
<Sidebar />                         {/* Chunk 3: immediate */}
<Footer />                          {/* Chunk 4: immediate */}
```

Static content never blocks. Slow data doesn't hold up fast content.

### CSP nonce support for streaming chunks

Inline `<script>` tags used for out-of-order streaming chunk replacement must support Content Security Policy (CSP) nonce forwarding. Without this, sites with strict CSP policies would block the replacement scripts.

`renderToStream` accepts a `nonce` parameter that is applied to all inline `<script>` tags emitted during streaming:

```typescript
import { renderToStream } from '@vertz/ui-server';

const nonce = crypto.randomUUID();

const stream = renderToStream(<App url={ctx.raw.url} />, {
  nonce, // Applied to all inline <script> tags
});

return new Response(stream, {
  headers: {
    'content-type': 'text/html; charset=utf-8',
    'content-security-policy': `script-src 'nonce-${nonce}'`,
  },
});
```

The emitted replacement chunks include the nonce:

```html
<script nonce="<generated-nonce>">
  document.getElementById('v-slot-1').replaceWith(
    document.getElementById('v-tmpl-1').content
  );
</script>
```

---

## 9. Forms — Native First

### The principle

HTML forms already manage state. An `<input name="email">` holds its value in the DOM. `FormData` extracts it. We don't re-implement form state in JavaScript.

### The `form()` function — SDK-aware

`form()` accepts an SDK method directly. Because the SDK method already knows its endpoint, HTTP method, body schema, and response type, there is no need to separately import the schema or specify the action URL.

All configuration — schema, callbacks, initial values — lives in the `form()` options. Per-field signal states (error, dirty, touched) are accessed directly via property chains. The compiler auto-unwraps signal properties in JSX at both 2-level (`userForm.submitting`) and 3-level (`userForm.name.error`) depths.

> **Full design:** See [form-attrs-api-improvement.md](./form-attrs-api-improvement.md)
> and [#527](https://github.com/vertz-dev/vertz/issues/527).

```tsx
import { form } from '@vertz/ui';
import { api } from '.vertz/generated/sdk';

function CreateUser() {
  const userForm = form(api.users.create, {
    schema: createUserSchema, // required until SDK .meta lands
    onSuccess: (user) => router.navigate(`/users/${user.id}`),
    resetOnSuccess: true,
  });

  return (
    <form action={userForm.action} method={userForm.method} onSubmit={userForm.onSubmit}>
      <label for="name">Name</label>
      <input name="name" id="name" required />
      {userForm.name.error && <span class="error">{userForm.name.error}</span>}

      <label for="email">Email</label>
      <input name="email" id="email" type="email" required />
      {userForm.email.error && <span class="error">{userForm.email.error}</span>}

      <label for="role">Role</label>
      <select name="role" id="role">
        <option value="user">User</option>
        <option value="admin">Admin</option>
      </select>

      <button type="submit" disabled={userForm.submitting}>
        {userForm.submitting ? 'Creating...' : 'Create User'}
      </button>
    </form>
  );
}
```

**Zero `effect()`. Zero `addEventListener`. Zero bridge variables.**

`action` and `method` are direct properties on the form object — derived from the SDK method's endpoint. `onSubmit` handles preventDefault, validation, SDK submission, and form reset automatically.

### What `form(sdkMethod)` gives you

| Capability | How |
|-----------|-----|
| **Body schema** | Extracted from the SDK method. Used for client-side validation via `@vertz/schema` |
| **Endpoint + method** | Derived from the SDK method's route. Direct `action` and `method` properties |
| **Response typing** | `onSuccess` callback receives the typed response (e.g., `User`) |
| **Per-field signals** | `userForm.name.error`, `userForm.name.dirty`, `userForm.name.touched` |
| **Form-level signals** | `userForm.submitting`, `userForm.dirty`, `userForm.valid` |
| **No imports** | No separate schema import, no endpoint strings to get wrong |

### How `onSubmit` works

1. `event.preventDefault()` — Stops native submission.
2. `new FormData(form)` — Reads all values from the DOM.
3. `formDataToObject(formData)` — Converts to `{ name: "Alice", email: "..." }`.
4. `schema.safeParse(raw)` — Validates with the schema embedded in the SDK method. Coercion handles string→number/boolean.
5. On success: calls the SDK method with typed data, then calls `onSuccess` with the response. If `resetOnSuccess: true`, calls `formElement.reset()`.
6. On validation failure: populates per-field error signals (e.g., `userForm.name.error`). Calls `onError` if provided.

### Explicit schema override

Until the SDK embeds `.meta` with `bodySchema`, the schema must still be provided explicitly:

```tsx
const editForm = form(api.users.update, {
  schema: updateUserBody,
  onSuccess: (user) => navigate(`/users/${user.id}`),
});
```

This is explicitly temporary. The `schema` option will become optional once SDK methods carry their schemas.

### Data loading and forms — separate concerns

Data loading (`query()`) and form mutation (`form()`) are separate APIs. Each handles one concern:

```tsx
// Edit form: query loads data, form handles mutation
const taskQuery = query(() => fetchTask(id));
const task = taskQuery.data.value;

// Create form when data is available
if (task) {
  const taskForm = form(taskApi.update, {
    schema,
    initial: { title: task.title, description: task.description }, // static object
    onSuccess: (task) => navigate(`/tasks/${task.id}`),
  });
}
```

This avoids compounding states. `taskQuery.loading` is unambiguous (data fetch). `taskForm.submitting` is unambiguous (submission). `taskForm.title.error` is unambiguous (field validation).

### Progressive enhancement

Without JavaScript, the form submits normally to the `action` URL (derived from the SDK method). The backend validates with the same schema and redirects on success or re-renders with errors. With JavaScript, `onSubmit` intercepts for a SPA experience. The form works either way — the SDK method ensures both paths use identical endpoint and schema information.

### `form()` v1 scope

| Feature | Status | Notes |
|---------|--------|-------|
| Single-step form with schema validation | **v1** | Core `form(sdkMethod, opts)` API |
| Per-field signal states (error, dirty, touched, value) | **v1** | `userForm.name.error`, `userForm.name.dirty` |
| Form-level signals (submitting, dirty, valid) | **v1** | `userForm.submitting`, `userForm.dirty` |
| Direct property access (no `attrs()`) | **v1** | `userForm.action`, `userForm.method`, `userForm.onSubmit` |
| Form reset | **v1** | `userForm.reset()` or `resetOnSuccess: true` |
| Reserved name enforcement | **v1** | TypeScript type error on schema fields conflicting with form properties |
| Server-side error mapping | **v1** | `userForm.setFieldError('email', 'Already taken')` |
| Programmatic submit | **v1** | `userForm.submit(formData?)` — same callbacks as `onSubmit` |
| Initial values (static) | **v1** | `initial: { name: '' }` — static objects only |
| Reactive initial values | **Deferred** | `initial: query.data` — deferred due to edge cases |
| Multi-step / wizard forms | **Deferred** | Requires form state persistence across steps |
| File uploads | **Deferred** | Requires multipart handling and progress tracking |
| Dynamic field arrays (add/remove fields) | **Deferred** | Requires array-aware schema validation |
| Nested object schemas | **Deferred** | v1 schemas must be flat (each key is a leaf field) |
| Controlled inputs | **Deferred** | v1 uses uncontrolled (native DOM state) exclusively |

---

## 10. Router

### Route definition

```typescript
import { defineRoutes } from '@vertz/ui/router';
import { s } from '@vertz/schema';
import { api } from '.vertz/generated/sdk';

export const routes = defineRoutes({
  '/': {
    component: () => import('./pages/Home'),
  },
  '/users': {
    component: () => import('./pages/users/Layout'),
    loader: async () => {
      const counts = await api.users.counts();
      return { counts };
    },
    children: {
      '/': {
        component: () => import('./pages/users/UserList'),
        loader: async ({ search }) => {
          return await api.users.list({ query: search });
        },
        searchParams: s.object({
          page: s.coerce.number().default(1),
          role: s.enum(['admin', 'user', 'all'] as const).default('all'),
        }),
      },
      '/:id': {
        component: () => import('./pages/users/UserDetail'),
        loader: async ({ params }) => {
          return await api.users.get({ params: { id: params.id } });
        },
      },
    },
  },
});
```

### Typed params and search params

Route params are inferred from the pattern string via template literal types:
- `'/:id'` → `params: { id: string }`
- `'/:userId/posts/:postId'` → `params: { userId: string; postId: string }`

Search params are typed via the `searchParams` schema:

```tsx
const [search, setSearch] = useSearchParams();
// search.page is number, search.role is 'admin' | 'user' | 'all'
```

### Layouts and nested routes

Layouts receive `children`. Nested route components render inside the layout. When navigating between children, the layout persists and its loader doesn't re-run.

### Loaders run in parallel

Navigating to `/users/123` fires both the `/users` layout loader and the `/:id` detail loader simultaneously.

---

## 11. Data Fetching — One Way

### The rule

| When | Use |
|------|-----|
| Page-level data (needed to render the page) | **Loaders** in route definitions |
| Client-side reactive re-fetching (search, filters, pagination) | **`query()`** inside components |

There is no `await` in component bodies for data fetching. Data comes from loader props or `query()`.

### `query()` for reactive fetching — SDK-aware with auto-generated keys

When `query()` receives an SDK method call, it automatically generates a deterministic cache key from the operation's module path, operation ID, and parameters. No manual key management.

```tsx
import { api } from '.vertz/generated/sdk';

function UserList(props: { users: User[] }) {
  let search = '';

  const results = query(
    () => api.users.list({ query: { q: search } }),
    { initialData: props.users, debounce: 300, enabled: () => search.length > 0 }
  );
  // Auto-generated cache key: ["users", "list", { q: search }]
  // Key updates reactively when `search` changes → triggers refetch

  return (
    <div>
      <input onInput={(e) => search = e.currentTarget.value} />
      {results.loading && <div class="loading-bar" />}
      <ul>
        {(results.data ?? props.users).map(u => <li key={u.id}>{u.name}</li>)}
      </ul>
    </div>
  );
}
```

`query()` auto-tracks reactive dependencies, refetches when they change, and exposes `{ data, error, loading, refetch }`.

### How `query()` auto-tracking works

`query()` runs the query function inside a **tracking scope** — the same mechanism used by `computed()` and `watch()`. Any signal read during execution of the query function is recorded as a dependency. When those signals change, the query re-executes.

The mechanism:
1. `query()` calls the query function (the first argument) inside a reactive tracking context.
2. During execution, any signal `.get()` calls are intercepted and recorded as dependencies.
3. When any tracked signal changes, `query()` schedules a re-execution of the query function.
4. The re-execution produces new arguments for the SDK call, which generates a new cache key and triggers a refetch.

This is the same dependency tracking that powers `computed()` — no special-casing. The query function is effectively a computed that produces a `Promise` instead of a synchronous value.

```tsx
let search = '';
let page = 1;

const results = query(() => api.users.list({ query: { q: search, page } }));
// Tracks: __search signal + __page signal
// Changing either search or page triggers re-execution → new cache key → refetch
```

### Auto-generated cache keys

The SDK generates deterministic keys based on `[modulePath, operationId, ...params]`:

| SDK call | Generated key |
|---------|--------------|
| `api.users.list()` | `["users", "list"]` |
| `api.users.list({ query: { page: 2 } })` | `["users", "list", { page: 2 }]` |
| `api.users.get({ params: { id: "abc" } })` | `["users", "get", { id: "abc" }]` |
| `api.billing.invoices.list()` | `["billing.invoices", "list"]` |

To override the key (e.g., for cross-component cache sharing or custom invalidation patterns):

```tsx
const results = query(
  () => api.users.list({ query: { q: search } }),
  { key: ['my-custom-key', search] }
);
```

### Revalidation after mutations

```typescript
import { revalidate } from '@vertz/ui/router';
import { api } from '.vertz/generated/sdk';

async function handleDelete(userId: string) {
  await api.users.delete({ params: { id: userId } });
  revalidate('/users'); // Re-runs the /users loader
}
```

---

## 12. Error Handling

### Route-level error components

```typescript
'/users/:id': {
  component: () => import('./pages/UserDetail'),
  error: () => import('./pages/UserError'),
  loader: async ({ params }) => api.users.get({ params: { id: params.id } }),
}
```

### Component-level error boundaries

```tsx
import { ErrorBoundary } from '@vertz/ui';

<ErrorBoundary fallback={(error, retry) => (
  <p>{error.message} <button onClick={retry}>Retry</button></p>
)}>
  <ActivityChart />
</ErrorBoundary>
```

### SDK client returns discriminated unions

```typescript
const result = await api.users.create({ body: data });
if (result.ok) {
  // result.data is typed as User
} else {
  // result.error has { code, message, details }
}
```

---

## 13. Testing — First-Class Citizen

Testing is not an afterthought. Every API in `@vertz/ui` is designed with the question "How would you test this?" answered first. The goal: it should be possible to build an entire UI application using TDD, with fast feedback loops at every level.

### Design principles for testability

1. **Components are pure functions** — they take props, return DOM. No hidden global state to mock.
2. **MSW for network-level mocking** — generated typed handler factories intercept HTTP calls. The real SDK runs, testing the actual integration path.
3. **Router is data-driven** — route definitions are plain objects. `createTestRouter` renders them in isolation.
4. **No browser required for unit tests** — the reactivity runtime and DOM helpers work with any DOM implementation (happy-dom, jsdom).
5. **Progressive test granularity** — unit tests for components, integration tests for pages, e2e tests for full flows.

### Component tests

```typescript
import { renderTest } from '@vertz/ui/test';

test('renders user name from props', () => {
  const { findByText } = renderTest(<UserCard user={{ id: '1', name: 'Alice', email: 'alice@test.com' }} />);
  expect(findByText('Alice')).toBeTruthy();
});

test('updates count when button is clicked', async () => {
  const { findByText, click } = renderTest(<Counter />);
  expect(findByText('Count: 0')).toBeTruthy();
  await click(findByText('+'));
  expect(findByText('Count: 1')).toBeTruthy();
});
```

### Form tests with MSW (Mock Service Worker)

Testing uses MSW to intercept HTTP requests at the network level. The real SDK runs — URL construction, serialization, and error handling all get exercised. Codegen generates typed handler factories so mock setup is type-safe.

```typescript
import { renderTest, fillForm, submitForm } from '@vertz/ui/test';
import { mockHandlers } from '.vertz/generated/test-handlers';
import { setupServer } from 'msw/node';

const server = setupServer();
beforeAll(() => server.listen());
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

test('validates required fields before submission', async () => {
  // No handler needed — form validates client-side before making HTTP call
  const { container, findByText } = renderTest(<CreateUser />);

  await submitForm(container.querySelector('form'));

  expect(findByText('Name is required')).toBeTruthy();
});

test('submits valid data through SDK method', async () => {
  // Typed handler factory — request/response types checked at compile time
  server.use(
    mockHandlers.users.create(({ request }) => {
      // request.body is typed as CreateUserBody
      return { id: '1', ...request.body, role: 'user', createdAt: '2026-01-01' };
    })
  );

  const { container, findByText } = renderTest(<CreateUser />);
  await fillForm(container.querySelector('form'), { name: 'Alice', email: 'alice@test.com' });
  await submitForm(container.querySelector('form'));

  // Assert on the rendered result — the real SDK made a real (intercepted) HTTP call
  expect(findByText('User created')).toBeTruthy();
});
```

### Router tests

```typescript
import { createTestRouter } from '@vertz/ui/test';
import { mockHandlers } from '.vertz/generated/test-handlers';

test('navigates from user list to user detail', async () => {
  server.use(
    mockHandlers.users.list(() => [{ id: '1', name: 'Alice', email: 'alice@test.com', role: 'user', createdAt: '2026-01-01' }]),
    mockHandlers.users.get(({ params }) => ({ id: params.id, name: 'Alice', email: 'alice@test.com', role: 'user', createdAt: '2026-01-01' })),
  );

  const router = createTestRouter(routes, { initialPath: '/users' });
  const { findByText, click } = renderTest(router.component);

  await click(findByText('Alice'));
  expect(router.currentPath).toBe('/users/1');
  expect(findByText('alice@test.com')).toBeTruthy();
});

test('loader errors render error component', async () => {
  server.use(
    mockHandlers.users.get(() => {
      throw mockHandlers.error(404, { code: 'NOT_FOUND', message: 'User not found' });
    }),
  );

  const router = createTestRouter(routes, { initialPath: '/users/999' });
  const { findByText } = renderTest(router.component);
  expect(findByText('User not found')).toBeTruthy();
});
```

### query() tests

```typescript
test('query() refetches when reactive dependency changes', async () => {
  let callCount = 0;
  server.use(
    mockHandlers.users.list(({ request }) => {
      callCount++;
      const url = new URL(request.url);
      const q = url.searchParams.get('q');
      if (q === 'Bob') return [{ id: '2', name: 'Bob', email: 'bob@test.com', role: 'user', createdAt: '2026-01-01' }];
      return [{ id: '1', name: 'Alice', email: 'alice@test.com', role: 'user', createdAt: '2026-01-01' }];
    }),
  );

  const { findByText, type } = renderTest(<UserSearch />);

  expect(findByText('Alice')).toBeTruthy();

  await type('input', 'Bob');
  expect(findByText('Bob')).toBeTruthy();
  expect(callCount).toBe(2);
});
```

### E2E tests with `@vertz/testing`

Full-stack tests using `createTestApp` from `@vertz/testing`, where the real backend runs and the UI renders against it:

```typescript
import { createTestApp } from '@vertz/testing';
import { renderE2E } from '@vertz/ui/test';

test('full flow: create user and see it in the list', async () => {
  const app = await createTestApp(appConfig);
  const { findByText, fillForm, submitForm, navigate } = renderE2E(routes, { baseUrl: app.url });

  await navigate('/users/new');
  await fillForm('form', { name: 'Alice', email: 'alice@test.com' });
  await submitForm('form');

  // Should redirect to user detail
  expect(findByText('Alice')).toBeTruthy();
  expect(findByText('alice@test.com')).toBeTruthy();

  await navigate('/users');
  expect(findByText('Alice')).toBeTruthy(); // appears in the list

  await app.close();
});
```

### TDD workflow example

Building a `UserCard` component from scratch using TDD:

```typescript
// Step 1 — RED: Write the first test
test('renders user name', () => {
  const { findByText } = renderTest(<UserCard user={{ id: '1', name: 'Alice', email: 'alice@test.com' }} />);
  expect(findByText('Alice')).toBeTruthy();
});
// Run → FAILS (UserCard doesn't exist)

// Step 2 — GREEN: Minimal implementation
function UserCard(props: { user: User }) {
  return <div>{props.user.name}</div>;
}
// Run → PASSES

// Step 3 — RED: Next behavior
test('renders user email', () => {
  const { findByText } = renderTest(<UserCard user={{ id: '1', name: 'Alice', email: 'alice@test.com' }} />);
  expect(findByText('alice@test.com')).toBeTruthy();
});
// Run → FAILS

// Step 4 — GREEN: Add email
function UserCard(props: { user: User }) {
  return <div><h3>{props.user.name}</h3><p>{props.user.email}</p></div>;
}
// Run → PASSES

// Step 5 — RED: Interactive behavior
test('shows delete confirmation on button click', async () => {
  const { findByText, click, queryByText } = renderTest(<UserCard user={mockUser} />);
  expect(queryByText('Are you sure?')).toBeNull();
  await click(findByText('Delete'));
  expect(findByText('Are you sure?')).toBeTruthy();
});
// Run → FAILS — no delete button yet

// Step 6 — GREEN: Add the interaction
function UserCard(props: { user: User }) {
  let confirming = false;
  return (
    <div>
      <h3>{props.user.name}</h3>
      <p>{props.user.email}</p>
      <button onClick={() => confirming = true}>Delete</button>
      {confirming && <p>Are you sure?</p>}
    </div>
  );
}
// Run → PASSES. Refactor, continue.
```

Every component, form, and route can follow this same Red-Green-Refactor cycle. The key enablers: components are pure functions, MSW intercepts SDK HTTP calls at the network level, and the DOM is synchronously inspectable after reactive updates.

---

## 14. Compiler Pipeline

### Architecture

```
@vertz/ui-compiler (Vite plugin)
  ├── analyzers/
  │   ├── component-analyzer.ts      -- identifies component functions
  │   ├── reactivity-analyzer.ts     -- detects reactive let variables
  │   └── jsx-analyzer.ts            -- maps JSX usage to reactive deps
  ├── transformers/
  │   ├── signal-transformer.ts      -- let → signal
  │   ├── jsx-transformer.ts         -- JSX → DOM API calls
  │   ├── computed-transformer.ts    -- const deps → computed()
  │   └── prop-transformer.ts        -- reactive prop getter wrapping
  ├── runtime/                       -- ships to browser (< 5KB gzip, hard CI gate)
  │   ├── signal.ts                  -- signal(), computed(), effect()
  │   ├── dom.ts                     -- __text, __element, __attr, __on, __list, __conditional
  │   └── lifecycle.ts               -- onMount, onCleanup, watch
  └── vite-plugin.ts                 -- Vite integration
```

### How it runs

1. **Analysis** (ts-morph): Parse `.tsx`, identify components, classify variables as reactive or inert, build dependency graph.
2. **Transform** (MagicString): Surgical string replacements with source map preservation. Same approach as Svelte and Vue compilers.
3. **Output**: Modified `.tsx` with signal imports, signal declarations, DOM API calls. Sourcemaps map back to original code for devtools.

### Conditional and list compilation

```tsx
// Ternary → __conditional()
{editing ? <input /> : <span>{text}</span>}

// .map() in JSX → __list() with keyed reconciliation
{todos.map(todo => <li key={todo.id}>{todo.title}</li>)}
```

### Compiler edge cases

The taint analysis must handle several non-trivial patterns that go beyond simple `let` declarations in component bodies:

**Closures that capture reactive variables:**

The compiler tracks reactive references through closure boundaries. If a callback captures a `let` variable, the compiler wraps the closure to read from the signal:

```tsx
function SearchForm() {
  let query = '';
  const handleSearch = () => {
    // Closure captures `query` — compiler tracks through the closure boundary
    api.search({ q: query }); // compiled: api.search({ q: __query.get() })
  };
  return <button onClick={handleSearch}>Search</button>;
}
```

**Higher-order components (HOCs):**

HOCs are treated as opaque boundaries. The compiler does not attempt to trace reactivity through a wrapping function. Props passed to wrapped components remain proxied, ensuring reactivity is preserved at the call site:

```tsx
function withAuth(Component: ComponentType) {
  // Opaque boundary — compiler does not analyze what Component does internally.
  // Props are passed as a proxy object, maintaining getter-based reactivity.
  return (props: any) => <Component {...props} />;
}
```

**Re-exports:**

Reactive references are tracked at the module level. Re-exported signals maintain their reactivity — the compiler follows import/export chains within the project:

```tsx
// signals.ts
export let count = 0; // signal at module level

// component.tsx
import { count } from './signals';
// Compiler recognizes `count` as a signal via module-level tracking
```

**Dynamic components:**

When a component is resolved at runtime (e.g., `const Comp = condition ? A : B`), the compiler emits a generic reactive wrapper that handles any component. The wrapper ensures props are proxied regardless of which component is rendered:

```tsx
let activeTab = 'settings';
const TabComponent = activeTab === 'settings' ? SettingsTab : ProfileTab;
// Compiler emits: __conditional(() => __activeTab.get() === 'settings', SettingsTab, ProfileTab)
// with reactive prop forwarding for whichever component renders
```

---

## 15. JSX Differences from React

| React | Vertz UI |
|-------|----------|
| `className` | `class` |
| `htmlFor` | `for` |
| `onChange` on input | `onInput` (native) |
| `value` for controlled inputs | Not needed — native form state |
| Virtual DOM diffing | Direct DOM mutations via signals |
| Components re-render | Components execute once |

---

## 16. What We're NOT Building

| Anti-pattern | Why not |
|-------------|---------|
| Virtual DOM | Fine-grained signal subscriptions update DOM directly. No diffing needed |
| `useEffect` | Compiler generates DOM subscriptions. `watch()` for explicit side effects |
| `useState` / `createSignal` | `let` is the API. Compiler transforms it |
| `useMemo` / `useCallback` | `const` expressions auto-become computed. No manual memoization |
| Dependency arrays | Auto-tracked by the reactive runtime |
| Class components / controllers | Functional only. State is `let`. No exceptions |
| `.svelte` / `.vue` custom files | Standard `.tsx` files. Valid TypeScript |
| Full-page hydration | Atomic per-component hydration. Most HTML stays static |
| React compatibility layer | Clean break. One reactivity system |

---

## 17. Stress Testing the Design

These questions challenge the design against real-world requirements beyond typical CRUD apps. Each answer explains how the architecture holds up — or where it needs extension.

### Can we deploy and stream a single component to production?

**Yes.** The atomic hydration model (section 7) already treats each interactive component as an independent unit with its own `data-v-id`, serialized props, and code-split chunk. Extending this to single-component deployment:

- **Server-side**: A standalone endpoint renders one component via `renderToStream(<MyWidget props={...} />)`. This returns a self-contained HTML fragment with its hydration boundary, serialized state, and a `<script>` tag pointing to the component's chunk.
- **Streaming**: The same out-of-order streaming mechanism works for single components. If the component has async data (wrapped in `<Suspense>`), it streams the placeholder first, then the resolved content.
- **Embedding**: The fragment can be embedded in any page — even non-Vertz pages. The hydration runtime (< 5 KB) bootstraps the component independently.
- **Use cases**: Micro-frontends, embeddable widgets, email preview components, Slack/Discord unfurl cards.

```typescript
// Server endpoint that streams a single component
app.get('/widgets/user-card/:id', async (ctx) => {
  const user = await getUser(ctx.params.id);
  const stream = renderToStream(<UserCard user={user} />);
  return new Response(stream, {
    headers: { 'content-type': 'text/html; charset=utf-8' },
  });
});
```

The key enabler: components have no implicit dependency on a parent tree. They are self-contained functions that produce DOM, with explicit props and explicit data loading.

### How easy is it for an AI to navigate and modify an app built with this?

**Very easy — this is a core design goal.** The "My LLM nailed it on the first try" principle directly addresses AI navigability:

- **Plain TypeScript files**: No `.svelte`, `.vue`, or custom DSLs. AI models are trained on millions of TypeScript files. Every file in a Vertz UI app is valid `.tsx` that any TypeScript-trained model understands.
- **One way to do things**: State is always `let`. Derived values are always `const`. Data loading is always `query()` or loaders. Forms are always `form(sdkMethod)`. An AI never has to decide between competing patterns.
- **SDK-style API calls**: `api.users.create({ body: data })` is self-documenting. An AI can infer the operation from the method name without looking up endpoint strings.
- **No hidden magic**: No dependency arrays to get wrong, no hook ordering rules, no implicit re-renders. The code does what it says.
- **Flat, predictable file structure**: Components are functions in `.tsx` files. Routes are a single `defineRoutes()` call. An AI can grep for any pattern and find it.
- **Compiler diagnostics**: If an AI writes `todos.push(item)` instead of `todos = [...todos, item]`, the compiler warns immediately — fast feedback even for non-human authors.
- **Generated SDK as documentation**: The SDK is auto-generated with full types. An AI can inspect `api.users` to discover all available operations without reading backend code.

### How easy is it to build integration and e2e tests?

**Testing is designed in, not bolted on.** (See section 13 for detailed examples.)

- **Unit tests**: `renderTest()` creates a component in isolation with a lightweight DOM. No browser needed. Sub-millisecond per test.
- **Integration tests**: `createTestRouter()` renders a full route tree with MSW intercepting SDK calls. Tests navigation, loaders, error handling, and layout nesting without a running server.
- **E2E tests**: `renderE2E()` combined with `createTestApp()` from `@vertz/testing` runs the real backend and renders the UI against it. True full-stack validation.
- **Typed MSW handlers**: Codegen generates `mockHandlers` with typed request/response — e.g., `mockHandlers.users.create(handler)` where the handler receives typed body and must return a typed response. No manual route matching or untyped JSON.
- **Form testing**: `fillForm()` and `submitForm()` simulate real user interaction with native form elements. Tests validate the same schema the server uses.
- **No flaky selectors**: Components produce stable DOM structures (no virtual DOM reconciliation artifacts). Test selectors match what the user sees.

The test pyramid is clear:

```
        ┌─────────┐
        │  E2E    │  Few — full-stack, real server, real SDK
        ├─────────┤
        │ Integr. │  Some — route trees, mocked SDK, real reactivity
        ├─────────┤
        │  Unit   │  Many — individual components, pure functions
        └─────────┘
```

### Is it accessible?

**Accessibility is a constraint, not a feature.** The design makes accessible patterns the default and inaccessible patterns harder to write:

- **Native HTML elements**: Forms use real `<form>`, `<input>`, `<label>`, `<select>`, `<button>` elements. Screen readers, keyboard navigation, and autocomplete work out of the box. There is no synthetic event system fighting the browser.
- **`for` attribute, not `htmlFor`**: We use native HTML attribute names. `<label for="email">` works without React's rename.
- **Progressive enhancement**: Forms work without JavaScript. This is inherently the most accessible pattern — it works with any assistive technology, any browser, any connection speed.
- **No div-soup from VDOM**: Components produce exactly the DOM the developer writes. No extra wrapper `<div>`s from fragments or portals. The resulting HTML is what you see in the JSX.
- **Compiler diagnostics for a11y** (planned): The compiler can warn about missing `alt` attributes on `<img>`, missing `for` on `<label>`, click handlers on non-interactive elements, and other common a11y violations. These are compile-time checks, not runtime warnings.
- **ARIA support**: Standard ARIA attributes work as expected in JSX. Reactive ARIA attributes (e.g., `aria-expanded={isOpen}`) are auto-tracked and updated by the compiler, just like any other attribute.

```tsx
// Accessible by default — no special effort needed
function SearchForm() {
  const searchForm = form(api.search.query);

  return (
    <form {...searchForm.attrs()} role="search">
      <label for="q">Search</label>
      <input name="q" id="q" type="search" aria-label="Search users" />
      <button type="submit">Search</button>
    </form>
  );
}
```

The north star: if a developer writes semantic HTML with Vertz UI, the result is accessible. The framework should never make accessibility harder than plain HTML.

---

## 18. Implementation Phases

> **Note:** The authoritative phase breakdown is in the [UI Implementation Plan](./ui-implementation.md). The v1.0 implementation has 8 phases. The table below is a high-level summary that maps to those phases.

| Phase | Scope | Depends on |
|-------|-------|-----------|
| 1 | Reactivity & Compiler Foundation — `signal()`, `computed()`, `effect()`, DOM helpers, `let` → signal transform, JSX → DOM calls, computed detection, component model (props, children, context, lifecycle, refs, `watch()`) | — |
| 2 | CSS Framework — `css()`, `variants()`, `defineTheme()`, compiler-integrated zero-runtime extraction | Phase 1 |
| 3 | Forms — `form()`, SDK-aware submission, `FormData` → typed object, schema validation | Phase 1, `@vertz/codegen` (available) |
| 4 | Data Fetching — `query()`, reactive data fetching, auto-generated keys, debounce, refetch, initialData | Phase 1, `@vertz/codegen` (available) |
| 5 | SSR & Hydration — `renderToStream`, streaming, out-of-order Suspense chunks, atomic hydration (`data-v-id` markers, client bootstrap, lazy/eager/interaction strategies) | Phase 1 |
| 6 | Router — `defineRoutes`, loaders, nested layouts, typed params/search | Phase 1 |
| 7 | Headless Components — `@vertz/primitives`, WAI-ARIA compliant Button, Dialog, Select, Menu, Tabs | Phase 1 |
| 8 | Testing & DX — `renderTest`, `createTestRouter`, `fillForm`, typed MSW handler factories, Vite plugin integration, HMR, `@vertz/testing` integration | Phase 3-6 |

---

## 19. Runtime Size Budget

**Hard budget: 5 KB gzip for core runtime.** CI fails if this threshold is exceeded.

| Module | Estimated gzip size |
|--------|-------------------|
| Signal core (`signal`, `computed`, `effect`, `batch`) | ~1.5 KB |
| DOM helpers (`__text`, `__element`, `__attr`, `__on`, `__conditional`, `__list`) | ~2 KB |
| Lifecycle (`onMount`, `onCleanup`, `watch`, context) | ~0.5 KB |
| Suspense + ErrorBoundary | ~0.5 KB |
| **Total core runtime** | **< 5 KB** |
| Router + query() + form() | ~3 KB (loaded separately) |

For comparison: React is ~45 KB, Preact is ~4 KB, Solid is ~7 KB, Svelte runtime is ~2 KB.

---

## 20. Dependencies on `@vertz/codegen` and `@vertz/fetch`

This section documents how `@vertz/ui` relates to the `@vertz/codegen` and `@vertz/fetch` packages, clarifying hard dependencies, shared patterns, and coordination points.

### 20.1 Dependency Map

```
@vertz/compiler
  │
  └─ produces AppIR
       │
       ├─── @vertz/codegen (IR Adapter → CodegenIR → generators)
       │      │
       │      ├─ generates: .vertz/generated/sdk.ts     ← @vertz/ui imports this
       │      ├─ generates: .vertz/generated/route-types.ts  ← @vertz/ui imports this
       │      ├─ generates: .vertz/generated/schemas.ts  ← @vertz/ui imports this (form validation)
       │      └─ generated SDK uses: @vertz/fetch        ← runtime HTTP client
       │
       └─── @vertz/ui-compiler (Vite plugin)
              │
              ├─ reads: .vertz/generated/* (types, SDK, schemas)
              ├─ transforms: .tsx → reactive DOM code
              └─ outputs: @vertz/ui browser runtime + @vertz/ui-server SSR runtime
```

### 20.2 Hard Dependencies

These are non-optional dependencies — `@vertz/ui` cannot function without them.

| Dependency | What `@vertz/ui` Needs | Why It's Hard |
|---|---|---|
| **Generated SDK** (`sdk.ts`) | `form(api.users.create)`, `query(() => api.users.list(...))`, router loaders | The SDK is the typed API surface. `form()` extracts body schemas, endpoints, and response types from SDK methods. `query()` auto-generates cache keys from SDK operation metadata. Router loaders call SDK methods for data fetching. |
| **Generated Route Types** (`route-types.ts`) | Component props typing, loader return types | Components receive typed data from loaders. The types flow from the backend schema definitions through codegen into the UI component layer. |
| **Generated Schemas** (`schemas.ts`) | `form()` client-side validation | `form(sdkMethod)` extracts the `@vertz/schema` object from the SDK method for client-side validation. The schemas are re-exported from codegen output so the UI can validate form data before submission. |
| **`@vertz/fetch`** (transitive, via SDK) | HTTP calls from SDK methods | The generated SDK delegates all HTTP operations to `@vertz/fetch`. Every `api.users.list()` call flows through `FetchClient.request()`. This is a transitive runtime dependency — the UI doesn't import `@vertz/fetch` directly, but it's loaded in the browser as part of the SDK. |

### 20.3 `@vertz/fetch` — Shared HTTP Client

The generated SDK uses `@vertz/fetch` for all HTTP operations. This means `@vertz/fetch` is the HTTP client that powers the UI's data layer, even though the UI never imports it directly.

**What this means for the UI:**

- **Auth**: The SDK's `createClient({ token: ... })` configures auth at the `@vertz/fetch` level. The UI's `query()` and `form()` calls inherit this auth configuration transparently. There is no separate auth setup for the UI — it flows through the SDK client.
- **Retries**: `@vertz/fetch` handles retries (429, 5xx) with configurable backoff. The UI's `query()` benefits from this automatically — failed data fetches are retried without the UI needing retry logic.
- **Streaming**: For real-time features, the SDK exposes `AsyncGenerator` methods backed by `@vertz/fetch`'s SSE/NDJSON parsers. The UI can consume these directly: `for await (const event of api.events.stream()) { ... }`.
- **Error handling**: `@vertz/fetch` throws typed errors (`BadRequestError`, `NotFoundError`, etc.). The SDK wraps these into `SDKResult` discriminated unions (`{ ok: true, data } | { ok: false, error }`). The UI's `ErrorBoundary` and route-level error components handle these.

**The UI does NOT need its own HTTP client.** The `@vertz/fetch` → SDK → UI chain provides typed, authenticated, retry-aware HTTP calls. Building a separate HTTP layer for the UI would duplicate functionality and break the single-source-of-truth principle.

**Exception**: SSR data fetching in `@vertz/ui-server` may need to call the backend directly (server-to-server, no browser). In this case, `@vertz/ui-server` should use the same generated SDK with a server-side `FetchClient` configuration (e.g., `baseURL: 'http://localhost:3000'`, no CORS). This is still `@vertz/fetch` — just configured differently for the server environment.

### 20.4 Shared Consumption of `AppIR`

Both `@vertz/codegen` and `@vertz/ui-compiler` consume the `AppIR` produced by `@vertz/compiler`, but they consume different slices for different purposes.

| Consumer | What It Reads from `AppIR` | What It Produces |
|---|---|---|
| **`@vertz/codegen`** (IR Adapter) | Modules, routes, schemas, auth config | `CodegenIR` → generated SDK, types, schemas |
| **`@vertz/ui-compiler`** (Vite plugin) | Generated output from codegen (not AppIR directly) | Reactive component transforms, hydration markers |

**Important distinction**: `@vertz/ui-compiler` does NOT read `AppIR` directly. It reads the **output** of `@vertz/codegen` — the generated `.vertz/generated/` files. The IR adapter in codegen is responsible for the `AppIR → CodegenIR` transformation. The UI compiler operates downstream of that transformation.

This creates a clean dependency chain:

```
AppIR → @vertz/codegen → .vertz/generated/ → @vertz/ui-compiler → browser/server builds
```

The UI compiler never needs to understand `AppIR` internals — it only needs the generated TypeScript files that codegen produces. This is intentional: it means the UI compiler is decoupled from compiler internals and only depends on codegen's **output format**, which is stable TypeScript.

### 20.5 Watch Mode Coordination (`vertz dev`)

During development, both codegen and the UI compiler need incremental updates when backend code changes. The coordination works as a pipeline:

```
Source file change (e.g., edit a route handler)
  │
  ├─ 1. @vertz/compiler detects change, produces new AppIR        (~50ms)
  ├─ 2. @vertz/codegen computes changeset, regenerates affected files  (~50ms)
  │       └─ Only changed modules: modules/{name}.ts + types/{name}.ts
  └─ 3. @vertz/ui-compiler (Vite) detects generated file change, triggers HMR  (~100ms)
        └─ Vite's file watcher picks up the new .vertz/generated/* files
        └─ Components that import from the SDK get hot-reloaded
```

**Key design point**: The UI compiler (Vite plugin) does not need custom coordination logic with codegen. It relies on **filesystem watching** — Vite already watches `node_modules` and configured directories for changes. When codegen writes new files to `.vertz/generated/`, Vite's HMR pipeline picks them up naturally.

**What `@vertz/codegen`'s incremental regeneration enables for the UI**:

Codegen splits output into per-module files (see codegen design, Section 17). This matters for UI HMR because:

- Editing a route in the `users` module only regenerates `modules/users.ts` and `types/users.ts`
- Vite's HMR only invalidates UI components that import from those specific files
- Components using `api.billing.*` are unaffected — no unnecessary re-renders
- The `client.ts` entry point only changes when modules are added or removed

Without per-module file splitting, every backend change would regenerate the entire SDK, invalidating all UI components that use any SDK method. The per-module split keeps the HMR blast radius proportional to the change.

### 20.6 Patterns That Could Be Shared (But Are Not Required)

These are codegen infrastructure patterns that the UI compiler **could** reuse but does not **need** to. Sharing is an optimization, not a requirement.

#### Template System (Tagged Template Functions)

Codegen uses tagged template functions (`ts\`...\``) for code generation with IDE syntax highlighting. The UI compiler uses `MagicString` for surgical string replacements (same approach as Svelte and Vue compilers).

**Verdict**: No sharing needed. The tools solve different problems — codegen generates new files from data, the UI compiler transforms existing source files. `MagicString` is the right tool for source-to-source transforms; tagged templates are the right tool for data-to-source generation.

#### `FileFragment` / `Import` Pattern

Codegen uses `FileFragment { content, imports }` and `mergeImports()` to assemble generated files with deduplicated imports. The UI compiler adds imports to existing files (e.g., injecting `import { signal } from "@vertz/ui/runtime"` into transformed components).

**Verdict**: Could share `Import` type and `mergeImports()` utility. The UI compiler needs to add imports to transformed files, and codegen's import deduplication logic would be useful. However, this is a small utility (~50 lines) — copying the pattern is equally valid. **Not a hard dependency.**

#### Naming Utilities

Codegen has `toPascalCase()`, `toCamelCase()`, `toKebabCase()` in `utils/naming.ts`. The UI compiler may need similar naming transforms (e.g., converting component file names to hydration IDs).

**Verdict**: These are trivial utilities. If both packages need them, extract to a shared `@vertz/utils` package or duplicate the few lines. **Not a hard dependency.**

### 20.7 What the UI Does NOT Depend On

To prevent unnecessary coupling, these codegen internals are explicitly **not dependencies** of the UI:

| Codegen Internal | Why the UI Doesn't Need It |
|---|---|
| **IR Adapter** (`adaptIR()`) | The UI consumes codegen's output (TypeScript files), not its intermediate `CodegenIR` |
| **`CodegenIR` types** | The UI never sees the `CodegenIR` data structure — only the generated TypeScript types |
| **JSON Schema converter** | The UI uses the generated TypeScript types, not raw JSON Schema |
| **Generator interface** | The UI is not a code generator — it's a compiler/transformer |
| **`CodegenChangeset` / diffing logic** | The UI relies on filesystem watching (Vite HMR), not codegen's internal diff |
| **`@vertz/cli-runtime`** | Completely separate concern — CLI runtime for generated CLIs |

### 20.8 Route-to-Loader Type Bindings

The `@vertz/ui-compiler` (Vite plugin) can read the generated route types to provide type-safe loader return types. When a route's loader calls an SDK method, the component's props are automatically typed to match the loader's return value:

```typescript
// Route definition — loader return type is inferred
'/users/:id': {
  component: () => import('./pages/UserDetail'),
  loader: async ({ params }) => {
    const user = await api.users.get({ params: { id: params.id } });
    return { user };  // return type: { user: SDKResult<User> }
  },
}

// Component — props typed from loader return, zero manual typing
function UserDetail(props: LoaderData<'/users/:id'>) {
  // props.user is typed as SDKResult<User> — inferred from the loader
  return <h1>{props.user.data.name}</h1>;
}
```

`LoaderData<Route>` is a type utility that extracts the return type of a route's loader function. This creates a type-safe bridge between route definitions and components with near-zero implementation cost — it's purely a type-level feature that leverages TypeScript's `ReturnType` and `Awaited` utilities against the generated route types.

### 20.9 Implementation Phase Dependencies

Cross-referencing with the [implementation plan](./ui-implementation.md) (8 phases for v1.0):

| UI Phase | Depends on Codegen Phase | Why |
|---|---|---|
| Phase 3 (Forms — `form()`) | Codegen: SDK Client + Schemas (delivered, PR #130) | `form(sdkMethod)` requires a generated SDK method with endpoint, body schema, and response type metadata |
| Phase 4 (Data Fetching — `query()`) | Codegen: SDK Client (delivered, PR #130) | `query(() => api.users.list(...))` requires the SDK for auto-generated cache keys |
| Phase 8 (Testing & DX) | Phase 3-4, `@vertz/codegen` | Typed MSW handler factories, `LoaderData<Route>` type utility, and Vite plugin watch mode coordination with codegen |

**Note**: SDK generation is delivered by `@vertz/codegen` (PR #130). Phase 8 includes the codegen-UI integration layer: typed MSW test handlers, route-to-loader type bindings, and Vite plugin HMR. This phase bridges the gap between what codegen generates and what the UI runtime needs to auto-extract metadata.
