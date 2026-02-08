# @vertz/ui Competitive Analysis: Modern UI Frameworks

A deep research document covering the state-of-the-art in compiler-driven, signal-based, and server-rendered UI frameworks. This analysis informs the design of `@vertz/ui` -- a compiler-driven UI library that replaces React and integrates natively into the Vertz TypeScript backend framework.

---

## Table of Contents

1. [Svelte 5 (Runes)](#1-svelte-5-runes)
2. [SolidJS](#2-solidjs)
3. [Qwik](#3-qwik)
4. [Marko](#4-marko)
5. [HTMX / Server-Driven UI Patterns](#5-htmx--server-driven-ui-patterns)
6. [Million.js / Compiler Optimization Patterns](#6-millionjs--compiler-optimization-patterns)
7. [Cross-Cutting Comparison Tables](#7-cross-cutting-comparison-tables)
8. [Lessons for @vertz/ui](#8-lessons-for-vertzui)

---

## 1. Svelte 5 (Runes)

### Overview

Svelte 5 introduced "runes" -- special compiler-recognized primitives prefixed with `$` that enable fine-grained reactivity. This was a complete rewrite of Svelte's underlying reactivity system, moving from a compile-only approach (Svelte 4's `$:` reactive declarations) to a compile-enhanced runtime signal system.

Sources: [Svelte Blog: Introducing Runes](https://svelte.dev/blog/runes), [Svelte Docs: $state](https://svelte.dev/docs/svelte/$state)

### How `$state`, `$derived`, `$effect` Work

**`$state` -- Reactive State**

`$state` declares a reactive variable. When used with objects or arrays, the result is a deeply reactive proxy that enables granular updates:

```svelte
<script>
  let count = $state(0);
  let todos = $state([
    { text: 'Learn Svelte', done: false }
  ]);

  function addTodo(text) {
    // Array mutations are tracked via proxy
    todos.push({ text, done: false });
  }
</script>

<button onclick={() => count++}>
  Clicks: {count}
</button>
```

**`$derived` -- Computed Values**

`$derived` creates memoized values that automatically update when dependencies change. No dependency array required -- dependencies are tracked automatically:

```svelte
<script>
  let items = $state([1, 2, 3, 4, 5]);
  let threshold = $state(3);

  // Simple expression
  let filtered = $derived(items.filter(i => i > threshold));

  // Complex derivation with $derived.by
  let stats = $derived.by(() => {
    const sum = items.reduce((a, b) => a + b, 0);
    return {
      sum,
      avg: sum / items.length,
      count: items.length
    };
  });
</script>

<p>Items above {threshold}: {filtered.length}</p>
<p>Average: {stats.avg}</p>
```

**`$effect` -- Side Effects**

`$effect` runs code after DOM updates whenever its automatically-tracked dependencies change. It eliminates React's `useEffect` dependency array footgun:

```svelte
<script>
  let count = $state(0);
  let message = $state('');

  // Automatically tracks `count` -- no dependency array needed
  $effect(() => {
    document.title = `Count: ${count}`;
  });

  // Cleanup via return value (like React useEffect)
  $effect(() => {
    const interval = setInterval(() => count++, 1000);
    return () => clearInterval(interval);
  });
</script>
```

Sources: [Svelte Docs: $derived](https://svelte.dev/docs/svelte/$derived), [Svelte Docs: $effect](https://svelte.dev/docs/svelte/$effect), [Understanding Runes: $derived vs $effect](https://www.htmlallthethings.com/blog-posts/understanding-svelte-5-runes-derived-vs-effect)

### How the Compiler Transforms Plain JS into Reactive Code

The Svelte 5 compiler converts rune declarations into signal-based runtime code. The compiler no longer tries to determine which values are reactive at compile time -- that responsibility is delegated to signals at runtime. The compiler's job is to set up the signal infrastructure and wire DOM updates.

**Before (what you write):**

```svelte
<script>
  let count = $state(0);
  let doubled = $derived(count * 2);

  function increment() {
    count += 1;
  }
</script>

<p>{count} x 2 = {doubled}</p>
<button onclick={increment}>+1</button>
```

**After (what the compiler generates):**

```javascript
import { state, derived, template_effect, set_text, child, append } from 'svelte/internal';

function App($$anchor) {
  // $state(0) becomes a signal
  let count = state(0);

  // $derived(count * 2) becomes a computed signal
  let doubled = derived(() => get(count) * 2);

  function increment() {
    set(count, get(count) + 1);
  }

  // Static HTML is extracted into a template
  var fragment = from_html(`<p> </p> <button>+1</button>`);
  var p = child(fragment);
  var p_text = child(p, true);
  var button = sibling(p, 2);

  // DOM updates are wired via template_effect
  template_effect(() => {
    set_text(p_text, `${get(count)} x 2 = ${get(doubled)}`);
  });

  button.addEventListener('click', increment);
  append($$anchor, fragment);
}
```

Key transformation details:
- `let count = $state(0)` becomes `let count = state(0)` (a signal)
- `count++` becomes `set(count, get(count) + 1)` (signal mutation)
- Reading `count` in templates becomes `get(count)` (signal subscription)
- Static HTML is extracted into templates, cloned at runtime
- Only dynamic parts are wrapped in `template_effect` for reactive updates

Sources: [Svelte Compiler Docs](https://svelte.dev/docs/svelte/svelte-compiler), [How the Svelte Compiler Works](https://bepyan.me/en/post/svelte-compiler-operation/), [Svelte Compiler: How It Works (daily.dev)](https://daily.dev/blog/svelte-compiler-how-it-works)

### How Svelte Eliminates `useEffect`-Style Footguns

Svelte 5's `$effect` solves three major React `useEffect` problems:

1. **No dependency arrays**: Dependencies are automatically tracked by reading reactive values synchronously inside the effect body. You cannot forget a dependency or add a stale one.

2. **No stale closure problem**: Because `$effect` re-reads signals on every run, closures always see current values.

3. **Clear separation**: `$derived` handles synchronous computations (replacing most React `useMemo` + `useEffect` patterns), while `$effect` is reserved for actual side effects (DOM manipulation, subscriptions, logging).

```svelte
<script>
  // React pain: useEffect with missing dependencies
  // useEffect(() => { fetchData(userId) }, []) // BUG: missing userId

  // Svelte: automatic tracking -- impossible to forget
  let userId = $state(1);

  $effect(() => {
    // userId is automatically tracked
    fetch(`/api/users/${userId}`).then(/* ... */);
  });
</script>
```

**Limitation**: Values read asynchronously (after `await` or inside `setTimeout`) are not tracked. This is a known tradeoff.

Sources: [Svelte Docs: $effect](https://svelte.dev/docs/svelte/$effect), [What's New in Svelte 5 (Vercel)](https://vercel.com/blog/whats-new-in-svelte-5)

### SvelteKit's Streaming SSR and Hydration Model

SvelteKit supports streaming SSR with progressive hydration:

- Pages are server-rendered by default
- Data from `load` functions is transmitted alongside the server-rendered HTML
- Components initialize on the client with pre-fetched data (no duplicate API calls)
- Svelte 5 introduced experimental async SSR (`experimental.async: true`) for streaming non-essential content
- Non-pending content is sent immediately; async content streams in after initial response
- Hydration adds JavaScript back to server-rendered HTML to make it interactive
- `csr = false` page option disables JavaScript entirely for specific pages

```typescript
// +page.server.ts
export async function load({ params }) {
  const user = await db.getUser(params.id);
  // This data is serialized and sent with the HTML
  return { user };
}
```

Sources: [SvelteKit Loading Data Docs](https://svelte.dev/docs/kit/load), [SvelteKit Page Options](https://kit.svelte.dev/docs/page-options), [SvelteKit at Scale (Medium)](https://medium.com/@Nexumo_/sveltekit-at-scale-ssr-islands-cache-hydration-9bfa2fdc85a8)

### Form Handling Approach

SvelteKit has first-class form actions with progressive enhancement:

```svelte
<!-- +page.svelte -->
<form method="POST" use:enhance>
  <input name="title" required />
  <input name="email" type="email" />
  <button>Submit</button>
</form>

<script>
  import { enhance } from '$app/forms';
</script>
```

```typescript
// +page.server.ts
import type { Actions } from './$types';

export const actions = {
  default: async ({ request }) => {
    const data = await request.formData();
    const title = data.get('title');

    if (!title) {
      return { status: 400, errors: { title: 'Required' } };
    }

    await db.createTodo({ title });
    return { success: true };
  }
} satisfies Actions;
```

Key features:
- `use:enhance` progressively enhances native `<form>` behavior (works without JS)
- Form actions live in `+page.server.ts` alongside load functions
- Server returns validation errors that SvelteKit makes available via `$page.form`
- Automatic page invalidation on successful submission
- Custom `use:enhance` callbacks for pending states, optimistic UI

Sources: [SvelteKit Form Actions Docs](https://svelte.dev/docs/kit/form-actions), [Forms in SvelteKit (DEV Community)](https://dev.to/a1guy/forms-in-sveltekit-actions-validation-progressive-enhancement-3leh), [Progressive Form Enhancement with SvelteKit](https://joyofcode.xyz/sveltekit-progressive-enhancement)

### What Developers Love and Hate

**Love:**
- Runes make reactivity explicit and portable (works in `.svelte.js` files too)
- Fine-grained reactivity is more efficient than Svelte 4's whole-component invalidation
- Components are now plain JavaScript functions -- better optimized by JS engines
- No virtual DOM overhead
- Small bundle sizes (~1.6 KB runtime)
- `$effect` automatic dependency tracking eliminates `useEffect` bugs

**Hate:**
- Increased boilerplate compared to Svelte 4, especially for props (`$props()` syntax involves repeated property names)
- `.svelte` files are not valid TypeScript -- require custom tooling, `svelte-check`, and IDE plugins
- Ecosystem compatibility issues during the 4-to-5 migration
- Runes feel "more like React" to some developers who preferred Svelte 4's implicit reactivity
- Runes only work in `.svelte` and `.svelte.ts` files (unlike Vue/Solid where reactivity works in any `.js` file)
- Type checking is not integrated into compilation -- requires separate `svelte-check` step

Sources: [Svelte 5 Runes Debate (BigGo)](https://biggo.com/news/202503181123_Svelte_5_Runes_Debate), [Svelte's Growing Pains (DEV Community)](https://dev.to/daniacu/sveltes-growing-pains-runes-stores-and-the-quest-for-standards-3j98), [Svelte 5 Runes Impressions](https://kylenazario.com/blog/svelte-5-runes-impressions), [Scalable Path Review](https://www.scalablepath.com/javascript/svelte-5-review)

---

## 2. SolidJS

### Overview

SolidJS is a declarative, fine-grained reactive library that compiles JSX to direct DOM operations without a virtual DOM. Created by Ryan Carniato, it combines React-like JSX syntax with a fundamentally different execution model: components run once, and only signal-dependent DOM nodes update.

Sources: [SolidJS GitHub](https://github.com/solidjs/solid), [Fine-Grained Reactivity Docs](https://docs.solidjs.com/advanced-concepts/fine-grained-reactivity)

### Fine-Grained Reactivity Without Virtual DOM

In SolidJS, the component function executes exactly once. There is no re-rendering. Instead, signals track dependencies at a granular level, and only the specific DOM nodes that depend on a signal update when that signal changes.

```tsx
import { createSignal } from 'solid-js';

function Counter() {
  const [count, setCount] = createSignal(0);
  const doubled = () => count() * 2;

  // This console.log runs ONCE -- components don't re-execute
  console.log('Component mounted');

  return (
    <div>
      {/* Only this text node updates when count changes */}
      <p>Count: {count()}</p>
      <p>Doubled: {doubled()}</p>
      <button onClick={() => setCount(c => c + 1)}>+1</button>
    </div>
  );
}
```

Sources: [Intro to Reactivity (Solid Docs)](https://docs.solidjs.com/concepts/intro-to-reactivity), [SolidJS for React Developers (Marmelab)](https://marmelab.com/blog/2025/05/28/solidjs-for-react-developper.html)

### `createSignal`, `createMemo`, `createEffect` Patterns

**`createSignal` -- Reactive Primitive**

```tsx
import { createSignal } from 'solid-js';

const [name, setName] = createSignal('World');

// Reading: call the getter function
console.log(name()); // 'World'

// Writing: call the setter
setName('Solid');
console.log(name()); // 'Solid'

// Setter with updater function
setName(prev => prev.toUpperCase());
```

Inside `createSignal`, the initial value is stored and a `Set` tracks subscriber functions. The getter checks if there is an active tracking context and registers the subscriber. The setter compares old and new values, notifying subscribers only when the value actually changes.

**`createMemo` -- Memoized Derivation**

```tsx
import { createSignal, createMemo } from 'solid-js';

const [items, setItems] = createSignal([1, 2, 3, 4, 5]);
const [threshold, setThreshold] = createSignal(3);

// Only recomputes when items or threshold change
const filtered = createMemo(() => items().filter(i => i > threshold()));
const count = createMemo(() => filtered().length);

// Use in JSX -- fine-grained updates
<p>Found {count()} items above {threshold()}</p>
```

`createMemo` receives the previous value as an argument, enabling incremental computations.

**`createEffect` -- Side Effects**

```tsx
import { createSignal, createEffect } from 'solid-js';

const [userId, setUserId] = createSignal(1);
const [user, setUser] = createSignal(null);

// Automatic dependency tracking -- no dependency array
createEffect(async () => {
  const id = userId(); // tracked
  const response = await fetch(`/api/users/${id}`);
  setUser(await response.json());
});
```

Unlike React's `useEffect`, `createEffect` has no dependencies array. Dependencies are tracked automatically by reading signals inside the effect body.

**`createResource` -- Async Data**

```tsx
import { createSignal, createResource } from 'solid-js';

const [userId, setUserId] = createSignal(1);

const [user] = createResource(userId, async (id) => {
  const res = await fetch(`/api/users/${id}`);
  return res.json();
});

// user() is the data, user.loading and user.error are available
<Show when={!user.loading} fallback={<Spinner />}>
  <h1>{user().name}</h1>
</Show>
```

Sources: [createEffect Docs](https://docs.solidjs.com/reference/basic-reactivity/create-effect), [createMemo Docs](https://docs.solidjs.com/reference/basic-reactivity/create-memo), [SolidJS Building Blocks](https://www.raresportan.com/solidjs-building-blocks/)

### How JSX Compiles to Direct DOM Operations

Solid's compiler transforms JSX into template creation and fine-grained DOM patching. Static HTML is extracted into templates, cloned at runtime, and dynamic expressions are wired directly to specific DOM nodes.

**Before (what you write):**

```tsx
function Counter() {
  const [count, setCount] = createSignal(0);

  return (
    <button onClick={() => setCount(c => c + 1)}>
      Clicks: {count()}
    </button>
  );
}
```

**After (what the compiler generates):**

```javascript
import { template, delegateEvents, insert } from 'solid-js/web';

// Static HTML extracted into a template
const _tmpl$ = template(`<button>Clicks: </button>`);

function Counter() {
  const [count, setCount] = createSignal(0);

  // Clone the template -- real DOM node
  const _el$ = _tmpl$();

  // Delegate click event (event delegation at document level)
  _el$.$$click = () => setCount(c => c + 1);

  // Insert dynamic content -- only this expression re-evaluates
  insert(_el$, count, null);

  return _el$;
}

delegateEvents(['click']);
```

Key points:
- `template()` creates a static DOM template from an HTML string
- `_tmpl$()` clones the template (not recreated each render)
- `insert()` wires a reactive expression to a specific DOM position
- `$$click` uses event delegation (one listener at document level)
- The component function runs once -- only `insert()` expressions re-evaluate
- No virtual DOM diffing anywhere in the pipeline

Sources: [Understanding JSX (Solid Docs)](https://docs.solidjs.com/concepts/understanding-jsx), [SolidJS Rendering Guide](https://www.solidjs.com/guides/rendering), [Virtual DOM vs No VDOM (Leapcell)](https://leapcell.io/blog/understanding-virtual-dom-and-why-svelte-solidjs-opt-out)

### Server-Side Rendering with Streaming (SolidStart)

SolidStart supports multiple rendering modes:
- **CSR** (Client-Side Rendering)
- **SSR** (Synchronous, Async, and Streaming)
- **SSG** (Static Site Generation)

Streaming SSR sends initial HTML immediately and streams async content as it resolves:

```tsx
// routes/users/[id].tsx
import { createAsync } from '@solidjs/router';

export default function UserPage() {
  const user = createAsync(() => getUser(params.id));

  return (
    <Suspense fallback={<UserSkeleton />}>
      <h1>{user()?.name}</h1>
      <p>{user()?.email}</p>
    </Suspense>
  );
}
```

SolidStart's code is isomorphic -- the same code runs correctly on both server and client. The framework handles the server/client boundary automatically.

Sources: [SolidStart Docs](https://docs.solidjs.com/solid-start), [Angular vs Qwik vs SolidJS 2025](https://metadesignsolutions.com/angular-vs-qwik-vs-solidjs-in-2025-the-speed-dx-comparison-resumability-ssr-hydration-techniques/)

### Islands Architecture / Partial Hydration

Solid has been exploring islands architecture through SolidStart:

- "Islands" or manually defined hydrated zones mark interactive regions
- Code outside islands is assumed server-only and not sent to the browser
- Solid 1.6 backfilled island-related features into the core library
- SolidStart supports hybrid routing patterns where some routes are server-rendered and others are client-rendered
- Solid 2.0 aims to further reduce hydration costs with compiler-driven optimizations

Sources: [Islands & Server Components (DEV Community)](https://dev.to/this-is-learning/islands-server-components-resumability-oh-my-319d), [Partial Hydration Issue](https://github.com/solidjs/solid/issues/264), [Future Architecture Issue](https://github.com/solidjs/solid-start/issues/400)

### What Developers Love and Hate

**Love:**
- Fastest runtime performance among major frameworks (98 Lighthouse score)
- True fine-grained reactivity -- no unnecessary re-renders
- React-like JSX syntax with a better mental model
- Components run once (no re-rendering surprises)
- Extremely small bundle sizes
- Clean reactive primitives (`createSignal`, `createMemo`, `createEffect`)
- Almost every notable framework (except React) has adopted Solid's reactivity patterns
- Solid 2.0 compiler delivers 40% smaller bundles

**Hate:**
- Steep learning curve -- looks like React but behaves differently
- Cannot destructure props (breaks reactivity tracking)
- Cannot use standard `if`/ternary/`.map()` in JSX -- must use `<Show>`, `<For>`, `<Switch>` control-flow components
- HMR is fundamentally difficult because preserving state in a reactive graph is complex
- `splitProps`/`mergeProps` utilities add cognitive overhead
- Smaller ecosystem and fewer third-party libraries than React
- Code that looks correct (based on React experience) silently breaks reactivity

Sources: [5 Places SolidJS is Not the Best (DEV Community)](https://dev.to/this-is-learning/5-places-solidjs-is-not-the-best-5019), [A Decade of SolidJS (DEV Community)](https://dev.to/this-is-learning/a-decade-of-solidjs-32f4), [SolidJS for React Developers (Marmelab)](https://marmelab.com/blog/2025/05/28/solidjs-for-react-developper.html)

---

## 3. Qwik

### Overview

Qwik, created by Misko Hevery (Angular creator) at Builder.io, introduces "resumability" -- an alternative to hydration that allows applications to start on the server and resume on the client without replaying any JavaScript. The framework is designed for instant interactivity regardless of application size.

Sources: [Qwik Resumable Docs](https://qwik.dev/docs/concepts/resumable/), [Resumability vs Hydration (Builder.io)](https://www.builder.io/blog/resumability-vs-hydration)

### Resumability vs. Hydration -- How It Works

**Traditional Hydration (React, Vue, Svelte, Solid):**
1. Server renders HTML
2. Client downloads all component JavaScript
3. JavaScript executes to rebuild the component tree in memory
4. Event handlers are attached to DOM elements
5. Application becomes interactive

This process adds 200-500ms to first interaction on average (Web Almanac 2024).

**Qwik's Resumability:**
1. Server renders HTML + serializes component state into HTML attributes
2. Client loads a tiny (~1KB) event listener (Qwikloader)
3. Qwikloader sets up a single global event listener
4. On user interaction, the specific handler code is lazy-loaded and executed
5. No component tree replay needed

```html
<!-- Server-rendered HTML with serialized state -->
<button
  on:click="./chunk-abc.js#handler_onClick"
  q:id="0"
>
  Count: 0
</button>

<!-- State serialized in a script tag -->
<script type="qwik/json">
  {"objs":["0"],"subs":[["0","0","count"]]}
</script>
```

The critical difference: **Hydration must execute before the app becomes interactive. Resumability makes the app interactive before any JavaScript executes.** A button is clickable immediately -- the handler code loads only when clicked.

Sources: [Qwik Resumable Docs](https://qwik.dev/docs/concepts/resumable/), [Resumability vs Hydration (Builder.io)](https://www.builder.io/blog/resumability-vs-hydration), [Unraveling Qwik's Resumability (Leapcell)](https://leapcell.io/blog/unraveling-qwik-s-resumability-to-eliminate-hydration-overhead)

### Lazy Loading at Component/Event Handler Level

Qwik's `$` suffix marks lazy-loading boundaries. The optimizer splits code at these boundaries into separate chunks:

```tsx
import { component$ } from '@builder.io/qwik';

// component$ -- the component body is lazy-loadable
export default component$(() => {
  // onClick$ -- the handler is lazy-loaded on first click
  return (
    <button onClick$={() => {
      console.log('This code loads only when clicked');
    }}>
      Click me
    </button>
  );
});
```

The `$` is not just naming convention -- it is a compiler directive that tells the optimizer where to split code. Each `$` boundary becomes a separate chunk that can be loaded independently.

Sources: [Qwik FAQ](https://qwik.dev/docs/faq/), [Think Qwik](https://qwik.dev/docs/concepts/think-qwik/)

### `useSignal`, `useComputed$`, `useTask$` Patterns

**`useSignal` -- Reactive Primitive**

```tsx
import { component$, useSignal } from '@builder.io/qwik';

export default component$(() => {
  const count = useSignal(0);
  const name = useSignal('Qwik');

  return (
    <div>
      <p>{count.value} - {name.value}</p>
      <button onClick$={() => count.value++}>+1</button>
    </div>
  );
});
```

`useSignal` is heavily optimized -- it can skip re-rendering parent components even when the signal is defined in the parent. It works with primitives and flat objects. For complex nested objects, use `useStore` instead.

**`useComputed$` -- Synchronous Derived State**

```tsx
import { component$, useSignal, useComputed$ } from '@builder.io/qwik';

export default component$(() => {
  const name = useSignal('Qwik');

  // Automatically recomputes when name changes
  const upperName = useComputed$(() => {
    return name.value.toUpperCase();
  });

  return <p>Hello, {upperName.value}!</p>;
});
```

Because `useComputed$` is synchronous, it does not need explicit dependency tracking -- dependencies are detected automatically.

**`useTask$` -- Side Effects with Lifecycle**

```tsx
import { component$, useSignal, useTask$ } from '@builder.io/qwik';

export default component$(() => {
  const text = useSignal('Initial');
  const delayedText = useSignal('');

  useTask$(({ track }) => {
    // Explicitly track dependencies
    const newText = track(() => text.value);

    // Can differentiate server vs browser
    const timer = setTimeout(() => {
      delayedText.value = newText;
    }, 500);

    // Cleanup function
    return () => clearTimeout(timer);
  });

  return (
    <div>
      <input bind:value={text} />
      <p>Delayed: {delayedText.value}</p>
    </div>
  );
});
```

`useTask$` uses explicit `track()` calls for dependency subscription (unlike Svelte/Solid's automatic tracking). The subscription resets on each execution, so you must always re-track dependencies.

Sources: [Qwik State Docs](https://qwik.dev/docs/core/state/), [Qwik Tasks Docs](https://qwik.dev/docs/core/tasks/), [Qwik: useSignal, useStore, useComputed$ (Medium)](https://libertkhe.medium.com/qwik-usesignal-usestore-usecomputed-14afb8bbebe0)

### Streaming SSR Approach

Qwik serializes component state directly into HTML, achieving zero-JS initial loads with sub-100ms response times:

```tsx
import { component$, useResource$, Resource } from '@builder.io/qwik';

export default component$(() => {
  const postData = useResource$(async () => {
    const response = await fetch('https://api.example.com/posts');
    return response.json();
  });

  return (
    <Resource
      value={postData}
      onPending={() => <p>Loading posts...</p>}
      onResolved={(posts) => (
        <ul>
          {posts.map(post => (
            <li key={post.id}>{post.title}</li>
          ))}
        </ul>
      )}
      onRejected={(error) => <p>Error: {error.message}</p>}
    />
  );
});
```

During SSR, `<Resource>` pauses rendering until the resource resolves -- the loading indicator is never sent to the client. The resolved content is streamed directly as HTML.

Sources: [Learn Qwik: Streaming](https://www.learn-qwik.com/learn/dashboard-app/streaming/), [Qwik Server Functions (Builder.io)](https://www.builder.io/blog/qwik-city-server-functions)

### How Qwik Serializes/Deserializes Component State

Qwik's serialization system goes beyond standard JSON:

**What gets serialized:**
- All reactive state (`useSignal`, `useStore` values)
- Event handler references (as URLs to code chunks)
- Component boundaries and their relationships
- Subscription graphs (which signals affect which DOM nodes)

**Extended serialization capabilities:**
- Circular references are properly handled
- DOM references can be serialized and restored
- `Date`, `URL`, `Map`, `Set` are natively supported
- Closures are serialized via `useLexicalScope()` -- the optimizer transforms closures to capture their lexical scope

**What cannot be serialized:**
- Functions (must use `$` boundaries)
- Classes (use plain objects instead)
- Symbols
- DOM nodes directly (use references)

```html
<!-- Serialized state embedded in HTML -->
<script type="qwik/json">
{
  "ctx": {
    "0": { "count": 5, "name": "Hello" }
  },
  "objs": [...],
  "subs": [["0", "count", "el#btn"]]
}
</script>

<!-- Event handlers as URL references -->
<button on:click="./chunk-a1b2.js#s_onClick_1" q:id="btn">
  Count: 5
</button>
```

When the button is clicked, Qwikloader intercepts the event, downloads `chunk-a1b2.js`, retrieves the `s_onClick_1` symbol, restores the lexical scope from the serialized state, and executes the handler.

Sources: [Qwik Serialization Docs](https://qwik.dev/docs/guides/serialization/), [Qwik Optimizer Tutorial](https://qwik.dev/tutorial/qrl/optimizer/)

### What Developers Love and Hate

**Love:**
- Near-instant time-to-interactive regardless of app size
- Zero JavaScript on initial load for static content
- Fine-grained lazy loading at the event handler level
- Excellent Lighthouse scores out of the box
- Server functions (`server$()`) for seamless server/client RPC
- Growing ecosystem with Qwik City (meta-framework)

**Hate:**
- Resumability mental model is fundamentally alien to most frontend developers
- The `$` boundary system is confusing -- not all code can cross `$` boundaries
- Serialization constraints limit what data types you can use
- Smaller ecosystem than React/Vue/Svelte
- Documentation gaps compared to more established frameworks
- Runtime performance in high-frequency update scenarios is slower than Solid
- Feels like "writing for the compiler" rather than writing natural JavaScript
- Qwik 2.0 is coming with significant API changes, creating migration uncertainty

Sources: [Qwik in 2025 (Learn Qwik)](https://www.learn-qwik.com/blog/qwik-2025/), [Modern Frontend Fantasy (DEV Community)](https://dev.to/structax/the-modern-frontend-fantasy-is-falling-apart-astro-qwik-and-solid-arent-the-future-1o98), [Next.js vs Qwik 2025 (DEV Community)](https://dev.to/hamzakhan/nextjs-vs-qwik-who-wins-the-performance-race-in-2025-21m9), [Towards Qwik 2.0](https://qwik.dev/blog/qwik-2-coming-soon/)

---

## 4. Marko

### Overview

Created by eBay in 2014, Marko is the original streaming SSR framework. It pioneered features like out-of-order rendering, automatic partial hydration, and compiler-driven fine-grained reactivity. Ryan Carniato (SolidJS creator) joined the Marko core team, bringing fine-grained reactivity expertise.

Sources: [Marko Homepage](https://markojs.com/), [A First Look at MarkoJS (DEV Community)](https://dev.to/ryansolid/a-first-look-at-markojs-3h78)

### Tags API and Its Compiler-Driven Reactivity

The Tags API (Marko 6) replaces the older Class API with a declarative, tag-based approach to state and effects:

```marko
<!-- Counter.marko -->
<let/count=0 />

<div>
  <p>${count}</p>
  <button onClick() { count++ }>
    Increment
  </button>
</div>
```

**Core Tags:**

- `<let/>` -- Declares reactive state:
```marko
<let/name="World" />
<let/items=[] />
<let/user={ name: "Alice", age: 30 } />
```

- `<const>` -- Declares derived (computed) values that update when dependencies change:
```marko
<let/items=[1, 2, 3, 4, 5] />
<let/threshold=3 />

<const/filtered=items.filter(i => i > threshold) />

<p>Found ${filtered.length} items</p>
```

- `<effect>` -- Side effects (equivalent to `$effect` in Svelte):
```marko
<let/count=0 />

<effect() {
  document.title = `Count: ${count}`;
} />
```

The compiler automatically detects dependency variables to ensure templates stay up to date. No manual dependency tracking or subscription management.

Sources: [Marko Tags API Reference (HackMD)](https://hackmd.io/@markojs/S1gXsc1v3), [Introducing the Marko Tags API Preview (DEV Community)](https://dev.to/ryansolid/introducing-the-marko-tags-api-preview-37o4)

### Streaming SSR (The Original Streaming Framework)

Marko pioneered streaming SSR with out-of-order rendering at eBay:

```marko
<!-- Async data renders as it becomes available -->
<await(fetchUser(userId))>
  <@then|user|>
    <h1>${user.name}</h1>
  </@then>
  <@placeholder>
    <div class="skeleton">Loading...</div>
  </@placeholder>
</await>
```

**How out-of-order rendering works:**

1. Server starts sending HTML immediately
2. When an async fragment is ready, it is flushed to the output stream
3. If an async fragment completes out of order, the rendered HTML is buffered
4. Marko injects minimal JavaScript to rearrange DOM elements into their correct positions on the client
5. Placeholders are shown until async content arrives

By default, Marko flushes at the beginning of each `<async-fragment>` block (sending everything already completed) and again when each async fragment resolves. This enables progressive page loading with excellent perceived performance.

Sources: [Marko HTML Streaming Docs](https://markojs.com/docs/explanation/streaming), [Async Fragments: Rediscovering Progressive HTML Rendering (eBay Tech)](https://tech.ebayinc.com/engineering/async-fragments-rediscovering-progressive-html-rendering-with-marko/)

### Partial Hydration / Islands

Marko's compiler performs automatic partial hydration:

- The compiler analyzes each component to determine if it has state or client-side logic
- Only components that are interactive are sent to the browser
- Static components are rendered as HTML and never hydrated
- The compiler creates separate, optimized builds for server (fast string concatenation) and browser (DOM operations)

This is "automatic islands" -- the developer does not manually mark which components are islands. The compiler figures it out:

```marko
<!-- StaticHeader.marko -- compiler detects no state, not sent to browser -->
<header>
  <h1>My App</h1>
  <nav>
    <a href="/">Home</a>
    <a href="/about">About</a>
  </nav>
</header>

<!-- Counter.marko -- compiler detects state, sent to browser -->
<let/count=0 />
<button onClick() { count++ }>
  ${count}
</button>
```

Marko can hydrate along reactive boundaries rather than component boundaries -- it can split a single component's template and ship only the interactive parts to the browser.

Sources: [What Has the Marko Team Been Doing (DEV Community)](https://dev.to/ryansolid/what-has-the-marko-team-been-doing-all-these-years-1cf6), [Marko: Compiling Fine-Grained Reactivity (DEV Community)](https://dev.to/ryansolid/marko-compiling-fine-grained-reactivity-4lk4)

### How Marko Compiles Templates

Marko's compiler generates two entirely different outputs from the same source:

**Server output**: Uses fast string concatenation for maximum SSR throughput:
```javascript
// Server-generated code (conceptual)
function renderToString(input) {
  let out = '<div>';
  out += '<p>' + escapeHtml(input.count) + '</p>';
  out += '<button>Increment</button>';
  out += '</div>';
  return out;
}
```

**Browser output**: Uses fine-grained DOM operations:
```javascript
// Browser-generated code (conceptual)
function mount(input) {
  const p = document.createElement('p');
  const text = document.createTextNode(input.count);
  p.appendChild(text);

  // Only update the text node when count changes
  subscribe(input, 'count', (newVal) => {
    text.nodeValue = newVal;
  });
}
```

The key insight: **Marko's compiler not only compiles away the reactivity, it compiles away the components themselves.** Components have no runtime overhead -- they are purely a compile-time organizational construct.

Sources: [FLUURT: Re-inventing Marko (DEV Community)](https://dev.to/ryansolid/fluurt-re-inventing-marko-3o1o), [Marko: Compiling Fine-Grained Reactivity (DEV Community)](https://dev.to/ryansolid/marko-compiling-fine-grained-reactivity-4lk4)

### What Developers Love and Hate

**Love:**
- Pioneering streaming SSR -- battle-tested at eBay scale
- Automatic partial hydration (no manual island marking)
- Any valid HTML is valid Marko (low learning curve for HTML)
- Fine-grained reactivity with zero runtime component overhead
- Server-optimized builds with fast string concatenation
- Tags API is clean and intuitive
- The compiler does the hard work, not the developer

**Hate:**
- Very small community and ecosystem (eBay is effectively the only major user)
- Fewer third-party libraries and tooling options
- `.marko` files require specialized tooling (similar to `.svelte`)
- Historical instability -- core team shrank, evangelism stopped
- Marko 6 (Tags API) has been in preview for a long time
- The templating language has two versions of `if` and `for` (JS and Marko syntax)
- Limited job market -- few companies use it outside eBay

Sources: [Marko vs React (GeeksforGeeks)](https://geeksforgeeks.org/marko-vs-react), [Why Marko? (Marko Docs)](https://markojs.com/docs/introduction/why-marko), [Marko: A Return to the Good Days (DEV Community)](https://dev.to/khauri/marko-a-return-to-the-good-ol-days-of-web-development-o10)

---

## 5. HTMX / Server-Driven UI Patterns

### Overview

HTMX is a 14KB JavaScript library that extends HTML with attributes for dynamic interactions. Instead of building a client-side application that fetches JSON, HTMX sends HTML fragments from the server and swaps them into the page. It represents a return to server-driven architecture with modern enhancements.

Sources: [HTMX Documentation](https://htmx.org/docs/), [HTMX vs React 2025](https://dualite.dev/blog/htmx-vs-react)

### How HTMX Leverages Native HTML

HTMX extends standard HTML elements with attributes that define AJAX behavior:

```html
<!-- GET request, replace target's innerHTML -->
<button hx-get="/api/users" hx-target="#user-list" hx-swap="innerHTML">
  Load Users
</button>
<div id="user-list"></div>

<!-- POST request with form data -->
<form hx-post="/api/users" hx-target="#result" hx-swap="outerHTML">
  <input name="name" type="text" required />
  <input name="email" type="email" required />
  <button type="submit">Create User</button>
</form>
<div id="result"></div>

<!-- Inline validation on blur -->
<input
  name="email"
  type="email"
  hx-post="/api/validate/email"
  hx-trigger="blur changed"
  hx-target="next .error"
/>
<span class="error"></span>
```

Key HTMX attributes:
- `hx-get`, `hx-post`, `hx-put`, `hx-delete` -- HTTP method and URL
- `hx-target` -- CSS selector for where to put the response
- `hx-swap` -- How to insert content (`innerHTML`, `outerHTML`, `afterbegin`, `beforeend`, etc.)
- `hx-trigger` -- What event triggers the request (`click`, `submit`, `blur changed`, etc.)
- `hx-boost` -- Progressively enhance links and forms to use AJAX

Sources: [HTMX hx-get](https://htmx.org/attributes/hx-get/), [HTMX hx-post](https://htmx.org/attributes/hx-post/), [HTMX hx-swap](https://htmx.org/attributes/hx-swap/)

### Form Handling with Native Browser Features

HTMX form handling relies on the browser's native form capabilities:

```html
<!-- Server returns HTML, not JSON -->
<form hx-post="/contacts" hx-target="#contact-list" hx-swap="beforeend">
  <label>
    Name
    <input name="name" type="text" required />
  </label>
  <label>
    Email
    <input name="email" type="email" required />
  </label>
  <button type="submit">Add Contact</button>
</form>

<ul id="contact-list">
  <!-- Server returns: <li>New contact: Alice (alice@example.com)</li> -->
</ul>
```

**Out-of-band updates** allow one action to update multiple unrelated parts of the page:

```html
<!-- Server response can update multiple targets -->
<li>New contact added</li>

<!-- This element swaps into #notification-count regardless of hx-target -->
<span id="notification-count" hx-swap-oob="true">3</span>

<!-- This updates the sidebar -->
<div id="contact-count" hx-swap-oob="true">42 contacts</div>
```

Sources: [HTMX Examples: Updating Other Content](https://htmx.org/examples/update-other-content/), [HTMX Examples: Inline Validation](https://htmx.org/examples/inline-validation/)

### Progressive Enhancement Philosophy

HTMX's `hx-boost` attribute upgrades standard links and forms to use AJAX while maintaining full functionality without JavaScript:

```html
<!-- Without JS: normal page navigation -->
<!-- With JS: AJAX request, content swap, URL update -->
<a href="/about" hx-boost="true">About</a>

<!-- Without JS: normal form submission with page reload -->
<!-- With JS: AJAX submission, partial page update -->
<form action="/search" method="GET" hx-boost="true">
  <input name="q" type="search" />
  <button>Search</button>
</form>
```

Key philosophy: **The server returns UI, not data.** The server is responsible for rendering HTML, validation, and business logic. The client is a thin presentation layer.

Performance claims from controlled experiments: 68% lower infrastructure costs, 4.2x faster time-to-interactive, 91% fewer production incidents compared to SPA architectures.

Sources: [Progressive Enhancement with HTMX](https://oliverjam.es/articles/progressive-enhancement-htmx), [The Case for HTMX (Medium)](https://medium.com/@paulhoke/the-case-for-htmx-rethinking-modern-web-architecture-1e6772cf0c74), [HTML-First Approach](https://www.danieleteti.it/post/html-first-frameworks-htmx-revolution-en/)

### What Vertz UI Can Learn About Browser-Native Approaches

1. **Form handling should leverage native `<form>` behavior** -- `name` attributes, `FormData`, browser validation, submit events
2. **Progressive enhancement is achievable** -- `hx-boost` shows that the same HTML can work with or without JavaScript
3. **Server-returned HTML eliminates client-side state management** for many use cases
4. **Out-of-band updates** are a powerful pattern for updating multiple page regions from a single response
5. **Event delegation at the document level** (HTMX uses one listener) is simpler and more efficient than per-element listeners
6. **HTML attributes as behavior declarations** is more readable than imperative JavaScript for simple interactions

---

## 6. Million.js / Compiler Optimization Patterns

### Overview

Million.js is an optimizing compiler for React that replaces React's virtual DOM reconciliation with a faster "block" virtual DOM approach. It turns React's O(n) reconciliation into O(1) operations by diffing data instead of DOM trees.

Sources: [Million.js GitHub](https://github.com/aidenybai/million), [Million.js Academic Paper](https://arxiv.org/pdf/2202.08409)

### How Million.js Uses a Compiler to Optimize React

Million.js operates at compile time (via a Babel plugin or Vite plugin) to transform React components:

```tsx
// You write standard React
function Counter({ initialCount }) {
  const [count, setCount] = useState(initialCount);

  return (
    <div>
      <p>Count: {count}</p>
      <button onClick={() => setCount(c => c + 1)}>+1</button>
    </div>
  );
}

// Million.js wraps it in a block() HOC
import { block } from 'million/react';

const Counter = block(function Counter({ initialCount }) {
  const [count, setCount] = useState(initialCount);

  return (
    <div>
      <p>Count: {count}</p>
      <button onClick={() => setCount(c => c + 1)}>+1</button>
    </div>
  );
});
```

The compiler can automatically wrap components without manual `block()` calls.

### Block Virtual DOM Concept

The block virtual DOM works by:

1. **Static Analysis**: At compile time (or first render), Million.js identifies which parts of the JSX are static and which are dynamic
2. **Edit Map Creation**: An "Edit Map" is generated that maps dynamic expressions to their DOM positions
3. **Data Diffing**: On updates, Million.js diffs only the data values (props, state), not the DOM tree
4. **Direct DOM Patching**: When a value changes, the Edit Map tells Million.js exactly which DOM node to update

```javascript
// Conceptual compiled output
const editMap = {
  count: { node: 'p', attribute: 'textContent', path: [0, 0] }
};

function update(prevData, nextData) {
  // O(1) -- only check changed values, not the entire tree
  if (nextData.count !== prevData.count) {
    editMap.count.node.textContent = `Count: ${nextData.count}`;
  }
}
```

This eliminates the virtual DOM diff entirely for components that Million.js can analyze. React's reconciliation goes from O(n) where n is the tree size to O(d) where d is the number of dynamic values.

Sources: [Virtual DOM: Back in Block (Million.js)](https://million.dev/blog/virtual-dom.en-US), [Compile-Time Enhancements (Leapcell)](https://leapcell.io/blog/compile-time-enhancements-how-million-js-augments-react-for-peak-performance), [Breaking the Boundaries of React (Medium)](https://neobazinga.medium.com/breaking-the-boundaries-of-react-million-js-unveils-a-new-performance-paradigm-97b5e8d61e75)

### What Compiler-Driven Optimizations Are Possible

Million.js demonstrates several compiler optimization patterns applicable to any framework:

1. **Static/Dynamic Separation**: Compiler identifies which parts of templates never change and excludes them from the update path
2. **Edit Maps**: Pre-computed mappings from data to DOM positions eliminate tree walking
3. **Dirty Checking**: Simple value comparisons (`!==`) replace structural diffing
4. **Template Cloning**: Static DOM structures are created once and cloned (like Solid's templates)
5. **Compute Batching**: Multiple state updates are batched into a single DOM update pass
6. **Scheduling**: Updates are scheduled via `requestAnimationFrame` or `requestIdleCallback` for optimal paint timing

Performance results: 133% to 300% faster rendering in JS Framework Benchmark, 2347% faster load time than standard React in Chrome DevTools benchmarks.

Sources: [Unleashing Million.js v2.0.0 (DEV Community)](https://dev.to/aidenybai/unleashing-millionjs-v200-2f96), [Make React Lightning-Fast (Medium)](https://medium.com/@sanketdhokchaule59/make-react-lightning-fast-with-million-js-the-drop-in-performance-booster-1d39f4fd7c7e)

---

## 7. Cross-Cutting Comparison Tables

### Reactivity Model

| Framework | Model | Dependency Tracking | Granularity | Runtime Required |
|-----------|-------|-------------------|-------------|-----------------|
| **Svelte 5** | Runes (compiler-enhanced signals) | Automatic (runtime signals) | Per-expression | Yes (~1.6 KB) |
| **SolidJS** | Signals (runtime) | Automatic (getter calls) | Per-DOM-node | Yes (~7 KB) |
| **Qwik** | Signals (serializable) | Explicit (`track()` in tasks) / Auto in computed | Per-signal | Yes (~1 KB loader + lazy) |
| **Marko** | Compiler-driven fine-grained | Automatic (compiler analysis) | Per-reactive-boundary | Minimal (compiled away) |
| **React** | Virtual DOM diffing | Manual (`deps` arrays) | Per-component | Yes (~42 KB) |
| **HTMX** | None (server-driven) | N/A | Per-HTML-fragment | Yes (~14 KB) |
| **Million.js** | Block VDOM (over React) | Compiler edit maps | Per-dynamic-value | Yes (React + ~4 KB) |

### SSR Approach

| Framework | SSR Type | Streaming | Hydration Model | Time-to-Interactive |
|-----------|----------|-----------|-----------------|-------------------|
| **Svelte 5 / SvelteKit** | Full SSR | Experimental async streaming | Full hydration | Moderate |
| **SolidJS / SolidStart** | Full SSR | Streaming via Suspense | Progressive hydration + islands | Fast |
| **Qwik** | Full SSR | Streaming via Resource | Resumability (no hydration) | Instant |
| **Marko** | Full SSR | Out-of-order streaming (pioneered it) | Automatic partial hydration | Fast |
| **HTMX** | Server-rendered HTML | N/A (returns fragments) | No hydration needed | Instant (no JS) |
| **Million.js** | Via React | Via React | Via React | Same as React |

### Bundle Size and Runtime Overhead

| Framework | Runtime Size (min+gzip) | Hello World Bundle | Tree-Shakeable |
|-----------|------------------------|-------------------|----------------|
| **Svelte 5** | ~1.6 KB | ~2 KB | Yes (compile-time) |
| **SolidJS** | ~7 KB | ~3 KB | Yes |
| **Qwik** | ~1 KB (loader) | ~0 KB (lazy) | Yes (extreme) |
| **Marko** | Minimal (compiled) | ~2 KB | Yes (compile-time) |
| **React** | ~42 KB | ~45 KB | Partial |
| **HTMX** | ~14 KB | ~14 KB | No |
| **Million.js** | ~4 KB + React | ~46 KB | Partial |

### Form Handling

| Framework | Form Approach | Validation | Progressive Enhancement |
|-----------|--------------|------------|------------------------|
| **Svelte 5 / SvelteKit** | Form actions + `use:enhance` | Server-side, returned as page data | Yes (works without JS) |
| **SolidJS** | Standard controlled inputs | Client-side libraries | No native support |
| **Qwik** | Signal-bound inputs + `server$()` | Client or server functions | Partial |
| **Marko** | Server-rendered forms | Server-side | Yes (HTML-first) |
| **HTMX** | Native `<form>` + `hx-post` | Server-side, inline validation | Yes (core philosophy) |

### TypeScript Support Depth

| Framework | TS in Components | Type Checking | IDE Support | Valid TS Files |
|-----------|-----------------|---------------|-------------|---------------|
| **Svelte 5** | `<script lang="ts">` | Separate `svelte-check` step | VS Code extension | No (`.svelte`) |
| **SolidJS** | Full JSX/TSX | Standard `tsc` | Standard TS tooling | Yes (`.tsx`) |
| **Qwik** | Full JSX/TSX | Standard `tsc` | Standard TS tooling | Yes (`.tsx`) |
| **Marko** | TypeScript support | Custom checker | VS Code extension | No (`.marko`) |
| **HTMX** | N/A (HTML attributes) | N/A | None | N/A |
| **Million.js** | Via React TSX | Standard `tsc` | Standard TS tooling | Yes (`.tsx`) |

### Compiler Role and Output

| Framework | Compiler Role | Input | Output | Build Required |
|-----------|-------------|-------|--------|---------------|
| **Svelte 5** | Transforms runes to signals, extracts templates | `.svelte` | JS + CSS | Yes |
| **SolidJS** | Transforms JSX to template/insert calls | `.tsx` | JS (DOM operations) | Yes |
| **Qwik** | Splits code at `$` boundaries, generates chunks | `.tsx` | JS chunks + serialized state | Yes |
| **Marko** | Generates server + browser builds, strips static code | `.marko` | Dual JS outputs | Yes |
| **HTMX** | None | HTML | HTML | No |
| **Million.js** | Wraps components in blocks, generates edit maps | `.tsx` | Optimized React components | Yes |

---

## 8. Lessons for @vertz/ui

### Recommendation 1: Adopt Svelte's `let` -> Reactive Transformation Model (with Valid TypeScript)

**Learn from**: Svelte 5 compiler
**What they do**: `let count = $state(0)` becomes signal infrastructure under the hood
**What we should do**: Go further -- make plain `let` declarations reactive without any rune prefix

```tsx
// Vertz UI -- plain let is reactive (no $state needed)
function Counter() {
  let count = 0;  // compiler transforms this into a signal

  return (
    <div>
      <p>{count}</p>
      <button onClick={() => count++}>+1</button>
    </div>
  );
}
```

The compiler should transform this into something like:

```tsx
function Counter() {
  const [__count, __setCount] = __signal(0);

  return (
    <div>
      <p>{__count()}</p>
      <button onClick={() => __setCount(v => v + 1)}>+1</button>
    </div>
  );
}
```

**Critical difference from Svelte**: Vertz UI files are valid `.tsx` files. The compiler operates as a TypeScript transformer (Vite plugin / Bun plugin), not as a custom language compiler. This means standard `tsc`, standard IDE tooling, and standard TypeScript type checking all work without custom extensions.

### Recommendation 2: Eliminate `useEffect` by Learning from Svelte and Solid

**Learn from**: Svelte 5's `$derived` + `$effect`, Solid's `createMemo` + `createEffect`
**What they do**: Automatic dependency tracking eliminates manual dependency arrays
**What we should do**: Derive values automatically from expressions and provide a minimal effect primitive

```tsx
function TodoList() {
  let todos = [];
  let filter = 'all';

  // Derived value -- compiler detects this depends on `todos` and `filter`
  // and wraps it in a memo automatically
  const filtered = todos.filter(t =>
    filter === 'all' || t.status === filter
  );

  // Side effect -- only when truly needed (DOM manipulation, subscriptions)
  // The compiler tracks dependencies automatically
  useEffect(() => {
    document.title = `${filtered.length} todos`;
  });

  return <ul>{filtered.map(t => <li>{t.title}</li>)}</ul>;
}
```

Most "effects" in React codebases are actually derived state or event handlers in disguise. The Vertz UI compiler should detect:
- **Derived values**: Expressions that read reactive variables and produce new values -> auto-memo
- **Event handlers**: Functions assigned to `onClick` etc. -> no tracking needed
- **True side effects**: Only `useEffect` calls, with automatic dependency tracking

### Recommendation 3: Implement Streaming + Atomic Hydration (Learn from Qwik and Marko)

**Learn from**: Qwik's resumability, Marko's streaming SSR and automatic partial hydration
**What they do**: Qwik serializes state into HTML and resumes without re-executing. Marko streams async fragments out-of-order and hydrates only interactive parts.
**What we should do**: A hybrid approach

1. **Streaming SSR**: Like Marko, stream HTML as async data resolves. Non-blocking content arrives progressively.
2. **Automatic partial hydration**: Like Marko, the compiler should analyze components to determine which need client-side JavaScript. Static components should never be hydrated.
3. **Targeted rather than full resumability**: Qwik's full resumability is elegant but adds serialization constraints that hurt DX. Instead, serialize only the state needed for interactive components.

```tsx
// Vertz UI -- compiler determines this is server-only
function Header() {
  return <header><h1>My App</h1></header>;
  // No state, no events -> zero JS shipped for this component
}

// Vertz UI -- compiler determines this needs client JS
function Counter() {
  let count = 0;
  return <button onClick={() => count++}>{count}</button>;
  // State + event handler -> JS shipped, hydrated
}

// Vertz UI -- streaming async content
async function UserProfile({ userId }) {
  const user = await fetchUser(userId);
  // Streamed as HTML when fetchUser resolves
  // No loading state management needed at this level
  return <h1>{user.name}</h1>;
}
```

### Recommendation 4: Leverage Native Browser Features (Learn from HTMX)

**Learn from**: HTMX's form handling and progressive enhancement
**What they do**: Use native `<form>` elements, `FormData`, browser validation, and `name` attributes
**What we should do**: Forms should be the primary integration point between `@vertz/ui` and `@vertz/server`

```tsx
// Vertz UI -- forms use native browser features
function CreateTodo() {
  const form = useForm(createTodoSchema);

  return (
    <form {...form.props} action="/api/todos" method="POST">
      {/* name attributes auto-connect to form state */}
      <input name="title" required />
      <input name="priority" type="number" min={1} max={5} />

      {/* Browser validation works without JS */}
      {/* With JS, schema validation enhances it */}
      {form.errors.title && <span>{form.errors.title}</span>}

      <button disabled={!form.valid}>Create</button>
    </form>
  );
}
```

Key principles:
- Forms work without JavaScript (progressive enhancement)
- Schema validation enhances but doesn't replace browser validation
- `FormData` is the serialization format (not `JSON.stringify`)
- Server returns HTML fragments for HTMX-style partial updates when appropriate

### Recommendation 5: Keep Valid TypeScript (What Svelte Gets Wrong)

**Learn from**: Svelte's `.svelte` file problem, Solid's `.tsx` success
**What Svelte gets wrong**: `.svelte` files are not valid TypeScript. They require:
- A custom language server (`svelte-check`)
- A dedicated VS Code extension
- Custom compilation that `tsc` cannot verify
- Type checking happens separately from compilation, not as part of the standard toolchain

**What we should do**: All Vertz UI source files must be valid `.tsx` files

```tsx
// This IS valid TypeScript -- tsc can check it
// The Vertz compiler adds reactivity as a TypeScript transformer
function UserCard({ user }: { user: User }) {
  let isExpanded = false;

  const fullName = `${user.firstName} ${user.lastName}`;

  return (
    <div>
      <h2>{fullName}</h2>
      <button onClick={() => isExpanded = !isExpanded}>
        {isExpanded ? 'Less' : 'More'}
      </button>
      {isExpanded && <p>{user.bio}</p>}
    </div>
  );
}
```

This means:
- Standard `tsc --noEmit` catches type errors (integrates with Vertz backend compiler)
- Standard IDE tooling (VS Code TypeScript, IntelliJ) works without plugins
- Standard formatters (Biome, Prettier) work without custom parsers
- Standard linters (Biome, ESLint) work without custom rules
- `import`/`export` follows TypeScript module resolution exactly

### Recommendation 6: Fine-Grained DOM Updates Without VDOM (Learn from Solid)

**Learn from**: SolidJS's template cloning and `insert()` pattern
**What they do**: Extract static HTML into templates, clone them, wire reactive expressions directly to DOM nodes
**What we should do**: The same approach, but with compiler-driven `let` reactivity

```tsx
// What the developer writes
function Greeting({ name }: { name: string }) {
  let greeting = 'Hello';

  return (
    <div>
      <p>{greeting}, {name}!</p>
      <button onClick={() => greeting = 'Hi'}>
        Change greeting
      </button>
    </div>
  );
}

// What the compiler generates (Solid-style)
const _tmpl$ = template('<div><p> </p><button>Change greeting</button></div>');

function Greeting(props) {
  const [__greeting, __setGreeting] = __signal('Hello');

  const _el$ = _tmpl$();
  const _p$ = _el$.firstChild;

  // Fine-grained: only this text node updates
  __effect(() => {
    _p$.textContent = `${__greeting()}, ${props.name}!`;
  });

  _el$.querySelector('button').addEventListener('click', () => {
    __setGreeting('Hi');
  });

  return _el$;
}
```

Key optimization opportunities:
- Static HTML is extracted and cloned (no createElement chains)
- Event delegation for common events (click, input, submit)
- Template caching across component instances
- Only dynamic expressions get reactive wiring
- No virtual DOM comparison at any point in the update cycle

### Recommendation 7: Compiler-Driven Server/Browser Code Splitting (Learn from Marko)

**Learn from**: Marko's automatic dual-build output
**What they do**: One source file generates optimized server code (string concatenation) and optimized browser code (DOM operations), automatically
**What we should do**: The Vertz compiler already builds an IR. Extend it to generate server and browser builds

```
Source (.tsx)
    |
    v
Vertz Compiler (IR)
    |
    ├── Server Build: String concatenation for SSR
    │   - No signals, no DOM operations
    │   - Pure HTML string generation
    │   - Static components completely eliminated
    │
    └── Browser Build: Fine-grained DOM operations
        - Only interactive components included
        - Signals wired to specific DOM nodes
        - Minimal JS payload
```

This ties directly into the Vertz backend compiler's existing IR. The backend IR already has route definitions, schemas, and middleware chains. The UI compiler can consume this same IR to generate type-safe server function calls, form schemas, and API types.

### Recommendation 8: Adopt Qwik's Granular Lazy Loading Concept (Without the `$` Syntax)

**Learn from**: Qwik's per-handler lazy loading
**What they do**: Event handlers are separate chunks, loaded only on interaction
**What we should do**: The compiler should automatically identify lazy-loading boundaries without requiring explicit `$` markers

```tsx
// The developer writes normal code
function Dashboard() {
  let showSettings = false;

  return (
    <div>
      <h1>Dashboard</h1>
      {/* Compiler detects: onClick handler and Settings component
          can be lazy-loaded since they're behind an interaction */}
      <button onClick={() => showSettings = true}>
        Open Settings
      </button>
      {showSettings && <Settings onClose={() => showSettings = false} />}
    </div>
  );
}
```

The compiler should analyze the component tree and automatically split code at:
- Event handlers that trigger conditional rendering
- Components behind `Suspense` boundaries
- Route-level code splitting (already standard)
- Components that are only rendered conditionally

### Recommendation 9: Build an "Edit Map" for O(1) Updates (Learn from Million.js)

**Learn from**: Million.js's block virtual DOM and edit maps
**What they do**: Pre-compute a mapping from data to DOM positions so updates are O(1) instead of O(n)
**What we should do**: The compiler should generate edit maps as part of the template compilation

```tsx
// Compiler input
function Card({ title, description, count }: CardProps) {
  return (
    <div class="card">
      <h2>{title}</h2>
      <p>{description}</p>
      <span class="badge">{count}</span>
    </div>
  );
}

// Compiler output (conceptual)
const _tmpl$ = template('<div class="card"><h2></h2><p></p><span class="badge"></span></div>');

// Edit map: prop name -> DOM path
const _editMap$ = {
  title:       { node: [0],    attr: 'textContent' },
  description: { node: [1],    attr: 'textContent' },
  count:       { node: [2, 0], attr: 'textContent' },
};

function Card(props) {
  const _el$ = _tmpl$();
  // O(1) updates per prop change -- no diffing
  __bindEditMap(_el$, _editMap$, props);
  return _el$;
}
```

This is especially powerful for list rendering where the same template is repeated hundreds of times.

### Recommendation 10: Provide a `useForm` That Bridges Native HTML and Vertz Schemas

**Learn from**: SvelteKit's form actions, HTMX's native form approach, the legacy `@vertz/ui` design
**What they do**: SvelteKit makes forms work with and without JS. HTMX uses native HTML form capabilities.
**What we should do**: Forms should be the killer feature of the Vertz fullstack story

```tsx
import { createTodoSchema } from '@vertz/shared/schemas';

function CreateTodo() {
  // Schema from the Vertz backend compiler output
  const form = useForm(createTodoSchema, {
    // When used with @vertz/server, action URL is generated
    action: server.todos.create,
    // Progressive enhancement: works as native form without JS
    progressive: true,
  });

  return (
    <form {...form.props}>
      {/* Auto-connected via name attribute */}
      <input name="title" />
      {form.errors.title && <span>{form.errors.title}</span>}

      <input name="priority" type="number" />

      {/* Type-safe: form.data is typed from schema */}
      <p>Preview: {form.data.title}</p>

      <button disabled={!form.valid}>Create</button>
    </form>
  );
}
```

The fullstack integration flow:
1. Backend defines schemas via `@vertz/schema`
2. Backend compiler generates IR with schema JSON
3. UI compiler consumes the same schemas
4. `useForm` uses the schema for client-side validation
5. Server action receives pre-validated `FormData`
6. If JS is disabled, native form submission hits the same endpoint

### Recommendation 11: Make Components Plain Functions, Not Special Constructs

**Learn from**: Svelte 5's "components are functions" approach, Solid's single-execution model
**What they do**: Svelte 5 components compile to plain JavaScript functions. Solid components execute once.
**What we should do**: Components should be plain functions that return JSX. No class components, no special lifecycle hooks beyond `useEffect`.

```tsx
// A component IS a function. Nothing special.
function UserCard({ user }: { user: User }) {
  let isFollowing = false;

  // Derived -- compiler auto-detects
  const buttonText = isFollowing ? 'Unfollow' : 'Follow';

  // Effect -- compiler auto-tracks dependencies
  useEffect(() => {
    analytics.track('viewed_user', { userId: user.id });
  });

  return (
    <div>
      <h2>{user.name}</h2>
      <button onClick={() => isFollowing = !isFollowing}>
        {buttonText}
      </button>
    </div>
  );
}
```

Benefits:
- JavaScript engines optimize functions effectively (inlining, dead code elimination)
- Standard TypeScript function types work for component props
- No class boilerplate, no constructor, no `this` binding
- Testing is trivial -- call the function, assert on the output

### Recommendation 12: Design the Compiler as an IR Extension of the Backend Compiler

**Learn from**: The Vertz backend compiler's IR-first architecture
**What we should do**: The UI compiler should extend the existing `AppIR` rather than being a separate system

```
┌─────────────────────────────────────────────┐
│              Vertz Compiler IR              │
│                                             │
│  AppIR (backend)                            │
│  ├── modules, routes, schemas, middleware   │
│  │                                          │
│  └── UIComponentIR (frontend extension)     │
│      ├── components (reactive analysis)     │
│      ├── pages (route-matched)              │
│      ├── forms (schema-matched)             │
│      └── client bundles (code-split)        │
│                                             │
│  Shared:                                    │
│  ├── SchemaIR (validation, forms, API)      │
│  ├── RouteIR (server routes = page routes)  │
│  └── Diagnostics (unified error reporting)  │
└─────────────────────────────────────────────┘
```

This enables:
- Route definitions on the backend automatically generate page scaffolds
- Schema changes propagate to forms instantly
- The manifest includes both server and client topology
- One diagnostic system covers both backend and frontend issues
- Type safety flows from database to API to UI to form submission

---

## Summary: The Vertz UI Design North Star

Based on this competitive analysis, the key design principles for `@vertz/ui` are:

1. **Valid TypeScript** -- All source files are `.tsx`. No custom file extensions. Standard tooling works.
2. **Plain `let` reactivity** -- No runes, no hooks, no explicit signals. The compiler makes `let` reactive.
3. **No virtual DOM** -- Compile JSX to template cloning + fine-grained DOM updates (Solid's approach).
4. **Automatic dependency tracking** -- No dependency arrays. Effects and derived values track dependencies at runtime.
5. **Streaming SSR + automatic partial hydration** -- Only interactive components ship JS (Marko's approach).
6. **Native form handling** -- Forms work without JS. Schemas bridge backend and frontend.
7. **Compiler-driven code splitting** -- The compiler identifies lazy-loading boundaries automatically.
8. **IR-first architecture** -- The UI compiler extends the backend IR for fullstack type safety.
9. **One way to do things** -- Consistent with the Vertz manifesto. No class components, no multiple state management patterns.
10. **LLM-native** -- Predictable patterns that an LLM can generate correctly on the first try.

The fundamental competitive advantage of Vertz UI is **fullstack type safety from a single compiler IR** combined with **the simplest possible developer API** (plain `let` variables, plain functions, plain `.tsx` files).
