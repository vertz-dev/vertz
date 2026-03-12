# Design Doc: Islands Architecture

**Issue:** #1185
**Status:** Rev 4 (all reviewers addressed)
**Author:** Claude (Tech Lead)

---

## Problem

Every Vertz page ships ~45KB of client JS (UI runtime + hydration system) even when most components on the page are static. The client entry imports the full app tree — static components like `Hero`, `TheStack`, `Founders` are bundled and shipped even though they have no interactivity.

### Current Behavior

1. `entry-client.ts` calls `mount(App)` which renders the **full component tree** on the client
2. The `hydrate()` function only activates components with `data-v-id` (those with `let` declarations)
3. But ALL component code ships in the bundle — including static components that will never run on the client
4. There's no way to say "only ship JS for these specific interactive components"

### What We Want

Ship only the JavaScript that specific interactive components need. Static content stays as server-rendered HTML. The page still works — interactive parts hydrate, static parts are just HTML.

---

## API Surface

### `<Island>` Component

Wraps an interactive component to create a hydration boundary:

```tsx
// pages/home.tsx
import { Island } from '@vertz/ui';

export function HomePage() {
  return (
    <div>
      {/* Static — rendered on server, zero JS shipped */}
      <Hero />
      <Features />

      {/* Interactive island — only this component's JS ships */}
      <Island
        id="NewsletterForm"
        component={() => import('../components/newsletter-form')}
        props={{ placeholder: 'Enter your email' }}
      />

      {/* Static again */}
      <Footer />
    </div>
  );
}
```

### `hydrateIslands()` Client Entry

Replaces `mount(App)` for island-mode pages:

```ts
// entry-client.ts (island mode)
import { hydrateIslands } from '@vertz/ui';

hydrateIslands({
  NewsletterForm: () => import('./components/newsletter-form'),
  CopyButton: () => import('./components/copy-button'),
});
```

This is the entire client entry. No `mount()`, no full app render, no theme setup. Just targeted hydration of island boundaries.

### Coexistence with Full Hydration

**Islands don't replace full hydration.** They're an alternative mode:

| Mode | Client Entry | Use Case |
|------|-------------|----------|
| **Full hydration** (current) | `mount(App, { theme })` | Dashboards, apps with lots of interactivity |
| **Island hydration** (new) | `hydrateIslands(registry)` | Landing pages, content sites, marketing pages |
| **Zero JS** (future) | No client entry | Fully static pages (no interactive components) |

A route uses one mode. The developer chooses by what they put in `entry-client.ts`. Full-hydration apps are completely unaffected — zero changes to the existing system.

### Landing Page Example

```tsx
// sites/landing/src/app.tsx (unchanged — server-side rendering)
export function App() {
  return (
    <div>
      <Nav />           {/* Static HTML — links are <a> tags */}
      <main>
        <Hero />        {/* Static HTML */}
        <Island
          id="CopyButton"
          component={() => import('./components/copy-button')}
          props={{ text: 'bun create vertz my-app' }}
        />
        <SchemaFlow />  {/* Static HTML */}
        <TheStack />    {/* Static HTML */}
        <WhyVertz />    {/* Static HTML */}
        <Founders />    {/* Static HTML */}
        <GetStarted />  {/* Static HTML */}
      </main>
      <Footer />        {/* Static HTML */}
    </div>
  );
}

// sites/landing/src/entry-client.ts (changed)
import { hydrateIslands } from '@vertz/ui';

hydrateIslands({
  CopyButton: () => import('./components/copy-button'),
});
```

**Result:** Client JS = CopyButton code + minimal island hydration runtime. No signal runtime, no router, no full app tree. ~3-5KB instead of ~45KB.

**Navigation trade-off:** `<Link>` is replaced with plain `<a>` tags on the landing page. Navigation between `/` and `/manifesto` becomes a full page load. Both pages are pre-rendered and edge-cached, so this is fast (~50ms). The SPA transition is sacrificed for a ~40KB JS reduction.

---

## Architecture

### Server-Side: `<Island>` Rendering

The `<Island>` component renders on the server during SSR:

1. Resolves the lazy component import (the SSR two-pass system already handles this — Pass 1 discovers lazy imports, Pass 2 renders with resolved modules)
2. Renders the component with provided props
3. Wraps the output in a container with `data-v-island` marker
4. Serializes props into a `<script type="application/json">` child

**Server output:**
```html
<div data-v-island="CopyButton">
  <script type="application/json">{"text":"bun create vertz my-app"}</script>
  <!-- SSR-rendered CopyButton HTML -->
  <button class="copy-btn">
    <span>bun create vertz my-app</span>
    <svg><!-- copy icon --></svg>
  </button>
</div>
```

### Client-Side: `hydrateIslands()`

The client entry is minimal:

1. Find all `[data-v-island]` elements in the DOM
2. For each, look up the component loader in the registry by ID
3. Deserialize island props from the direct child `<script data-v-island-props type="application/json">`
4. Use `IntersectionObserver` (existing `autoStrategy`) for lazy hydration
5. When visible: import the component module, set up disposal scope, hydrate the island subtree

**Hydration sequence per island (serialized — one at a time):**
```ts
async function hydrateIsland(el, loader, props) {
  const mod = await loader();           // 1. async import
  const scope = pushScope();            // 2. disposal scope for reactive cleanup
  startHydration(el);                   // 3. cursor-based DOM walker on island subtree
  const result = mod.default(props);    // 4. compiled component claims SSR DOM nodes
  endHydration();                       // 5. finalize cursor
  popScope(scope);                      // 6. capture disposal scope
  el.setAttribute('data-v-hydrated', ''); // 7. prevent double hydration
}
```

**Why cursor-based hydration (not imperative attachment):** Compiled Vertz components use `__element()`, `__text()`, `__child()` which check `getIsHydrating()` to decide whether to claim existing DOM nodes or create new ones. The cursor system is what compiled components expect. `startHydration(el)` sets the cursor to `el.firstChild`, so per-island hydration works naturally on the subtree.

**Concurrency guard:** Islands are hydrated sequentially — the `autoStrategy` IO callback queues each island into a hydration queue. The queue processes one island at a time because `startHydration` uses module-level `isHydrating` state that throws if called while already active. The queue ensures `endHydration()` completes before the next island's `startHydration()` begins.

**This reuses existing hydration infrastructure:**
- `autoStrategy` from `packages/ui/src/hydrate/strategies.ts` — same IntersectionObserver with 200px rootMargin
- `startHydration`/`endHydration` from `packages/ui/src/hydrate/hydration-context.ts` — cursor-based DOM walker
- `pushScope`/`popScope` from `packages/ui/src/component/` — disposal scopes for reactive cleanup (same as `mount()` uses)
- The cursor walker operates on a subtree (`startHydration(el)` sets cursor to `el.firstChild`)

**Props deserialization:** Uses direct child selection (`el.querySelector(':scope > script[data-v-island-props]')`) instead of general `querySelector('script[type="application/json"]')` to avoid conflicts with nested `<script type="application/json">` tags that may exist within the island's own SSR output (e.g., from `data-v-id` hydration markers).

**Registry mismatch error:** If a `data-v-island="X"` element exists in the DOM but no matching key `X` exists in the registry, `hydrateIslands()` logs a console error: `[vertz] Island "X" not found in registry. Available: [Y, Z]`. This surfaces the most common mistake (ID mismatch between `<Island id>` and registry key).

### Build Pipeline: No Changes in Phase 1

The existing build pipeline works as-is:

1. **Client build** — `Bun.build()` with the island client entry. Tree-shaking ensures only imported island components are bundled. Static components (not imported in `entry-client.ts`) are excluded automatically.
2. **Server build** — unchanged, renders the full app including Islands
3. **Pre-rendering** — unchanged, SSR output includes island markers and serialized props
4. **Template injection** — unchanged, scripts and CSS injected as before

The JS reduction comes from the client entry importing fewer components, not from build pipeline changes. Bun's tree-shaking does the work.

---

## `<Island>` Component Implementation

```tsx
// packages/ui/src/island/island.ts

interface IslandProps {
  /** Unique identifier matching the client-side registry key */
  id: string;
  /** Lazy component loader */
  component: () => Promise<{ default: (...args: unknown[]) => unknown }>;
  /** Props to pass to the component (must be JSON-serializable) */
  props?: Record<string, unknown>;
}
```

**Server behavior:**
- Calls `component()` to resolve the module. On the server (Bun), dynamic `import()` resolves synchronously for already-bundled modules. For the SSR build, all island component modules are included in the server bundle (they're part of the app tree), so `await component()` resolves immediately.
- Renders `module.default(props)` to get the component's VNode tree
- Wraps in `<div data-v-island={id}>` with serialized props in `<script data-v-island-props type="application/json">`

**Client behavior (when imported in a full-hydration app):**
- Same as server — renders the component normally
- The `data-v-island` marker is inert in full-hydration mode (hydrated via normal `data-v-id` path)
- This means `<Island>` can be used in full-hydration apps without breaking anything

---

## Constraints

### Props Must Be JSON-Serializable

Island props cross the server→client boundary via JSON serialization. This means:
- Strings, numbers, booleans, arrays, plain objects: OK
- Functions, Signals, class instances, Dates: NOT OK
- Callbacks (`onClick`, `onSubmit`): NOT OK as props — define them inside the island component

```tsx
// WRONG — function props can't be serialized
<Island
  id="Form"
  component={() => import('./form')}
  props={{ onSubmit: handleSubmit }}  // Error: functions not serializable
/>

// RIGHT — event handlers defined inside the island component
// form.tsx
export default function Form({ action }: { action: string }) {
  const handleSubmit = () => { /* ... */ };
  return <form onSubmit={handleSubmit}>...</form>;
}
```

### Islands Are Self-Contained

Islands don't have access to parent context (no `RouterContext`, no `ThemeContext`, etc.). Context is a client-side concept that requires the full component tree to be mounted.

If an island needs theme data, pass it as serializable props:
```tsx
<Island
  id="ThemedButton"
  component={() => import('./themed-button')}
  props={{ theme: 'dark', accent: '#6366f1' }}
/>
```

### No Nested Islands

Islands cannot contain other Islands. Each island is a flat, self-contained hydration unit. This keeps the implementation simple and avoids complex boundary nesting.

### Wrapper Element

The `<div data-v-island>` wrapper adds an extra DOM element around each island. This can affect CSS layouts (e.g., flex/grid children count changes). For Phase 1, this is an accepted limitation — choose island placement where a wrapper `<div>` won't break layout. Can be optimized in a future iteration to use the component's root element directly.

### Mutually Exclusive Modes

Never call both `mount()`/`hydrate()` and `hydrateIslands()` on the same page. They use shared module-level hydration state that would conflict. A page is either full-hydration or island-hydration, chosen in `entry-client.ts`.

### CSS Ships Fully

Island-mode pages still load the full CSS bundle (`vertz.css`). CSS for static-only components is included. This is acceptable — CSS is smaller than JS, doesn't block interactivity, and is cached. Per-island CSS optimization is a future concern.

---

## Manifesto Alignment

- **Principle 2 (Compiler-first):** Islands leverage the existing compiler output — no new compiler transforms needed. The compiler already generates hydration-compatible code.
- **Principle 3 (One way to do things):** Two clear modes: `mount()` for apps, `hydrateIslands()` for content. No ambiguity about which to use.
- **Principle 7 (Performance by default):** Island-mode pages ship dramatically less JS. The framework makes the fast path easy.

---

## Non-Goals

- **Automatic island detection** — the developer explicitly wraps components in `<Island>`. No compiler magic to auto-detect boundaries.
- **Context serialization across island boundaries** — islands are self-contained. No context propagation from server to client.
- **`'use client'` directive** — unnecessary. `<Island>` is the explicit boundary.
- **Router-aware islands** — islands don't participate in client-side routing. If a page needs client-side navigation, use full hydration.
- **Per-island CSS** — CSS continues to work as today (extracted at build time, shipped as `vertz.css`). Island-mode pages still get all CSS.
- **Streaming islands** — islands hydrate on the client; they don't stream from the server.

---

## Resolved Decisions

1. **Island hydration timing:** Reuse `autoStrategy` — above-fold islands hydrate immediately, below-fold islands hydrate on scroll. Same behavior as current component hydration.

2. **Dev mode:** Phase 1 does not support HMR for islands. Use conditional entry:
   ```ts
   // entry-client.ts
   if (import.meta.env.DEV) {
     const { mount } = await import('@vertz/ui');
     const { App } = await import('./app');
     const { landingTheme } = await import('./styles/theme');
     mount(App, { theme: landingTheme, styles: [globalStyles] });
   } else {
     const { hydrateIslands } = await import('@vertz/ui');
     hydrateIslands({
       CopyButton: () => import('./components/copy-button'),
     });
   }
   ```
   This gives full HMR in dev, minimal JS in production. Island-aware HMR is future work.

3. **Island wrapper element:** Accepted for Phase 1. Documented in Constraints.

4. **Hydration model:** Cursor-based (same as `mount()`), not imperative attachment. Compiled Vertz components expect `__element()` to call `claimElement()` during hydration. Each island gets `startHydration(el)` / `endHydration()` + `pushScope()` / `popScope()`.

5. **Concurrency:** Islands hydrate sequentially via a queue. `autoStrategy` callbacks enqueue; the queue processes one island at a time to avoid `startHydration` conflicts.

6. **Props deserialization:** Direct child selection via `data-v-island-props` attribute to avoid conflicts with nested JSON scripts.

---

## Type Flow Map

```
<Island id="X" component={loader} props={p} />
  → Server: await loader() → module.default(p) → VNode → HTML with data-v-island="X"
  → Client: hydrateIslands({ X: loader })
    → querySelectorAll('[data-v-island]')
      → el.querySelector(':scope > script[data-v-island-props]') → p
        → autoStrategy(el, () => enqueueHydration(el, loader, p))
          → queue processes sequentially:
            → await loader() → mod
            → pushScope()
            → startHydration(el)
            → mod.default(p)     // compiled component claims SSR DOM via cursor
            → endHydration()
            → popScope()
```

No new generics. `IslandProps` has three fields: `id: string`, `component: ComponentLoader`, `props?: Record<string, unknown>`.

---

## E2E Acceptance Test

```ts
describe('Feature: Islands architecture', () => {
  describe('Given a page with one Island component', () => {
    describe('When the page is pre-rendered', () => {
      it('Then the HTML contains data-v-island marker', () => {});
      it('Then the HTML contains serialized props in script tag', () => {});
      it('Then the SSR output renders the island component', () => {});
    });

    describe('When the page loads in the browser', () => {
      it('Then the island hydrates and becomes interactive', () => {});
      it('Then static components outside the island have no JS behavior', () => {});
      it('Then the client bundle is smaller than full-hydration mode', () => {});
    });
  });

  describe('Given a page using hydrateIslands() instead of mount()', () => {
    describe('When the page loads', () => {
      it('Then only island components are hydrated', () => {});
      it('Then non-island content is static HTML', () => {});
      it('Then no full app tree is rendered on the client', () => {});
    });
  });

  describe('Given Island props that are not JSON-serializable', () => {
    describe('When the Island renders on the server', () => {
      it('Then a clear error is thrown with the prop name and island ID', () => {});
    });
  });

  describe('Given an existing app using mount() (full hydration)', () => {
    describe('When no changes are made', () => {
      it('Then all existing behavior is preserved (no regression)', () => {});
      it('Then all existing E2E tests pass', () => {});
      it('Then all examples work correctly', () => {});
    });
  });

  // Type errors
  // @ts-expect-error — Island requires an id prop
  <Island component={() => import('./foo')} />
  // @ts-expect-error — Island requires a component prop
  <Island id="Foo" />
  // @ts-expect-error — props must be a plain object
  <Island id="Foo" component={() => import('./foo')} props="invalid" />
});
```

---

## Implementation Plan

### Phase 1: Island Foundation (2-3 days)

**Goal:** `<Island>` component works in SSR, `hydrateIslands()` works on the client, existing apps unaffected.

1. **`<Island>` server component** (`packages/ui/src/island/island.ts`)
   - Renders component with props during SSR
   - Wraps output in `<div data-v-island={id}>`
   - Serializes props to `<script type="application/json">`
   - Validates props are JSON-serializable (throw clear error if not)

2. **`hydrateIslands()` function** (`packages/ui/src/hydrate/island-hydrate.ts`)
   - Accepts `IslandRegistry` (same shape as existing `ComponentRegistry`)
   - Scans DOM for `[data-v-island]` elements
   - Deserializes props (reuse `deserializeProps`)
   - Hydrates via `autoStrategy` (reuse existing IntersectionObserver logic)
   - Per-island hydration context: `startHydration(el)` → mount → `endHydration()`

3. **Exports** — add to `@vertz/ui` public API:
   - `export { Island } from './island/island'`
   - `export { hydrateIslands } from './hydrate/island-hydrate'`

4. **Unit tests:**
   - `<Island>` SSR output: correct markers, serialized props, rendered content
   - `hydrateIslands()`: finds islands, deserializes props, calls component
   - Serialization validation: throws on non-serializable props
   - Regression: `mount()` and `hydrate()` still work unchanged

**Acceptance criteria:**
```ts
describe('Phase 1: Island Foundation', () => {
  describe('Given <Island id="Counter" component={lazy} props={{ start: 0 }}>', () => {
    describe('When SSR renders the page', () => {
      it('Then output contains <div data-v-island="Counter">', () => {});
      it('Then output contains <script type="application/json">{"start":0}</script>', () => {});
      it('Then the Counter component HTML is rendered inside the wrapper', () => {});
    });
  });

  describe('Given hydrateIslands({ Counter: () => import("./counter") })', () => {
    describe('When the client entry runs', () => {
      it('Then the Counter island hydrates and responds to clicks', () => {});
      it('Then non-island DOM elements are untouched', () => {});
    });
  });

  describe('Given an existing app using mount(App)', () => {
    describe('When running all existing tests', () => {
      it('Then all tests pass (zero regressions)', () => {});
    });
  });

  describe('Given a hydrateIslands-only client entry with one island', () => {
    describe('When the client bundle is built', () => {
      it('Then the bundle size (excluding island component) is < 5KB before gzip', () => {});
    });
  });
});
```

### Phase 2: Landing Page Migration (1-2 days)

**Goal:** Landing page uses Islands, ships minimal JS.

**Migration steps:**
1. **Extract `CopyButton`** from `hero.tsx` (currently a local function at line ~105) to `components/copy-button.tsx`:
   - Add `export default function CopyButton(...)`
   - Move the relevant `css()` styles (`s.copyButton`, `s.copyPrefix`, `s.dollarSign`, etc.) to the new file
   - Replace inline `<CopyButton />` in `Hero` with `<Island id="CopyButton" component={...} props={...} />`
2. **Replace `<Link>` with `<a>`** in `nav.tsx` (lines 25, 29) — remove `@vertz/ui/router` import
3. **Update `entry-client.ts`** to use conditional dev/prod pattern (see Resolved Decisions #2)
4. **Remove unused imports** — `mount`, `ThemeProvider`, `createRouter`, etc. are no longer needed in prod client entry

**Verify:**
- Landing page renders correctly (SSR)
- CopyButton works (hydrates, copies text)
- Navigation works (full page loads between pre-rendered pages)
- Client JS size is dramatically reduced

**Performance benchmarks:**
- Measure JS bundle size before/after
- Measure Time to Interactive before/after
- Measure Lighthouse score before/after

**Acceptance criteria:**
```ts
describe('Phase 2: Landing Page Migration', () => {
  describe('Given the landing page built with Islands', () => {
    it('Then client JS is < 10KB (down from ~45KB)', () => {});
    it('Then CopyButton copies text to clipboard on click', () => {});
    it('Then navigation between / and /manifesto works', () => {});
    it('Then all visual content renders correctly', () => {});
  });
});
```

### Phase 3: Static Route Script Stripping (0.5 day)

**Goal:** Routes with zero islands AND zero `data-v-id` markers ship zero JS.

1. In `prerenderRoutes()`, after generating HTML for each route:
   - Check for `data-v-island` or `data-v-id` in the rendered HTML
   - If neither found, strip `<script>` tags and `modulepreload` links
   - Log the route classification

2. **Applies to:** `/manifesto` on the landing page (no interactive components)

**Acceptance criteria:**
```ts
describe('Phase 3: Script Stripping', () => {
  describe('Given /manifesto has no islands and no data-v-id', () => {
    it('Then the pre-rendered HTML contains zero <script> tags', () => {});
    it('Then the page renders correctly as static HTML', () => {});
  });
});
```

---

## Testing Strategy

The user requires zero regressions. Testing plan:

### Unit Tests (per phase)
- `<Island>` SSR rendering
- `hydrateIslands()` client behavior
- Props serialization/deserialization
- Regression: `mount()`, `hydrate()`, existing component rendering

### Integration Tests
- Build a test route with islands, verify HTML output
- Build an existing route (full hydration), verify no changes
- Pre-render with islands, verify markers and props in output

### E2E Tests (Playwright)
- Run ALL existing E2E tests (entity-todo app, landing page)
- New E2E tests for island hydration
- Visual regression: screenshots of landing page before/after

### Example Apps
- `examples/component-catalog` — must work unchanged (full hydration)
- `examples/entity-todo` — must work unchanged (full hydration + E2E tests)
- `examples/ssr-cloudflare` — must work unchanged (SSR)
- `sites/landing` — migrated to islands in Phase 2

### Benchmarks
- Run the benchmark app to verify no performance regression
- Compare bundle sizes before/after

### Quality Gates (every phase)
- `bun test` — all packages
- `bun run typecheck` — all packages
- `bun run lint` — all changed files

---

## Future Work (Separate Design Docs)

### Island-Aware HMR
Dev mode support for `hydrateIslands()` — currently requires `mount()` for HMR. Would need island-scoped Fast Refresh.

### Automatic Island Registry
Build-time extraction of `<Island>` usage to auto-generate the client registry. Eliminates manual `hydrateIslands({ ... })` configuration.

### Context-Aware Islands
Serialization of context values across the server→client boundary. Would allow islands to receive `RouterContext`, `ThemeContext`, etc. from the server-rendered tree.

### Router Islands
A special island type that manages client-side navigation. Would enable SPA transitions on island-mode pages without full hydration.

---

## Review History

### Rev 1 → Rev 2
Three reviewers (DX, Product/Scope, Technical) requested changes:
- Landing page isn't truly static (Link, CopyButton need JS)
- Cross-file analysis contradicts per-file compiler
- Phase 1 was over-engineered
- Islands should be separate from script stripping

### Rev 2 → Rev 3
User requested Islands direction over simple script stripping:
- "We cannot swap [Link for a] because then we have other side effects"
- "I think the difference is that we can only ship the JavaScript that is supposed to be used in that component"
- "What about this island idea?"

Rev 3 redesigns around Islands as the primary feature, with script stripping as a small Phase 3 add-on. Key design decisions:
- Islands reuse existing hydration infrastructure (autoStrategy, deserializeProps, cursor-based DOM walker)
- No compiler changes — Islands are explicit (`<Island>` component)
- No build pipeline changes in Phase 1 — tree-shaking handles bundle reduction
- Full hydration is completely unaffected — Islands are additive

### Rev 3 → Rev 4
Three reviewers signed off (DX: Approved, Product: Approved, Technical: Changes Requested). Technical review identified implementation gaps. All addressed in Rev 4:

1. **Hydration model clarified** — cursor-based (`startHydration`/`endHydration`), not imperative attachment. This is what compiled Vertz components expect.
2. **Disposal scopes added** — each island gets `pushScope()`/`popScope()` for reactive cleanup, same as `mount()`.
3. **Props deserialization nesting fix** — use `data-v-island-props` attribute on direct child `<script>` to avoid conflicts with nested JSON scripts.
4. **SSR lazy resolution explained** — Bun's `import()` resolves synchronously for bundled modules. Island components are in the server bundle.
5. **Concurrency guard** — hydration queue processes islands sequentially. `autoStrategy` callbacks enqueue; queue ensures one `startHydration`/`endHydration` pair at a time.
6. **Mutually exclusive modes** — explicitly documented: never call both `mount()` and `hydrateIslands()` on the same page.
7. **Dev mode pattern** — concrete `import.meta.env.DEV` conditional shown.
8. **CopyButton extraction steps** — detailed migration checklist for Phase 2.
9. **Registry mismatch error** — clear console error when island ID doesn't match registry.
10. **Bundle size threshold** — acceptance criterion: `hydrateIslands` core < 5KB before gzip.
11. **Wrapper element caveat** — documented in Constraints.
12. **CSS ships fully** — documented as accepted limitation.
