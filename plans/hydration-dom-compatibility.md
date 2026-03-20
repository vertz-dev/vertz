# Hydration DOM Compatibility

**Status:** Draft v2 — all review findings addressed, awaiting human sign-off

## Problem

Vertz's hydration uses a cursor-based DOM walker that claims SSR nodes. This creates two issues that limit compatibility with external JavaScript libraries:

1. **onMount runs during hydration.** The compiler injects `__flushMountFrame()` inside the component function, which executes between `startHydration()` and `endHydration()`. If a child component's `onMount` inserts a DOM node, the cursor — still walking siblings — may claim that node instead of the next SSR element. This makes DOM manipulation in `onMount` unsafe during hydration.

   ```
   mount(App)
     ├─ startHydration(root)
     ├─ app()
     │   ├─ ChildA renders → __flushMountFrame() → onMount runs  ← cursor still active
     │   ├─ ChildB renders → cursor may claim node inserted by ChildA's onMount
     │   └─ ...
     ├─ endHydration()
     └─ done
   ```

2. **No unmanaged subtree escape hatch.** There is no way to tell Vertz "don't manage this subtree." A developer who wants to mount a D3 chart, a React component, or any "black box" library inside a Vertz app has no supported pattern. The hydration walker will try to claim children inside the container, and reactive effects will overwrite attribute changes made by external code.

Together, these issues mean developers cannot safely integrate third-party JavaScript libraries that manipulate the DOM. Without this, entire application categories are blocked:

- **Charting**: Chart.js, D3, Plotly, ECharts
- **Code editors**: Monaco, CodeMirror
- **Maps**: Leaflet, Mapbox GL
- **Rich text**: TipTap, ProseMirror, Quill
- **Video/media**: Video.js, Plyr
- **Embeds**: Stripe Elements, Intercom, analytics widgets
- **Migration**: Incrementally adopting Vertz in an existing React/Vue app

## Proposed Direction

Two changes, layered. **Phase 1 is independently valuable** — it fixes a correctness bug even without `<Foreign>`. If Phase 2 is delayed, the framework is strictly better after Phase 1 alone.

### 1. Post-hydration onMount queue

During hydration, `__flushMountFrame()` defers callbacks to a post-hydration queue instead of executing them immediately. The queue flushes after `endHydration()` completes (including deferred reactive effects). This preserves child-before-parent execution order because depth-first JSX evaluation naturally pushes child callbacks before parent callbacks.

```
mount(App)
  ├─ startHydration(root)
  ├─ app()
  │   ├─ ChildA renders → __flushMountFrame() → callbacks QUEUED (not executed)
  │   ├─ ChildB renders → __flushMountFrame() → callbacks QUEUED
  │   └─ Parent renders → __flushMountFrame() → callbacks QUEUED
  ├─ endHydration()           ← all claiming done, deferred effects flushed
  ├─ flush post-hydration queue  ← onMount callbacks run (child → parent order)
  └─ done
```

After this change, `onMount` is safe for DOM manipulation: all claiming is complete, all reactive effects have established tracking, and the cursor is cleared.

#### Two deferral mechanisms — deferred effects vs deferred mounts

The hydration system now has two distinct deferral queues:

- **Deferred effects** (`deferredDomEffect` / `queueDeferredEffect`): Skip the first reactive effect run during hydration (SSR content is already correct); flush at `endHydration()` to establish reactive dependency tracking.
- **Deferred mounts** (`postHydrationQueue`): Delay `onMount` callbacks until after all hydration is complete; flush after `endHydration()` and after deferred effects.

Execution order: hydration walk → `endHydration()` flushes deferred effects → `flushDeferredMounts()` runs onMount callbacks.

### 2. `<Foreign>` component — unmanaged subtree

A component that renders a container element and opts out of hydration for its children. External code owns the container's children via an `onReady` callback that runs in post-hydration `onMount` timing.

```tsx
import { Foreign } from '@vertz/ui';

function SalesChart({ data }: { data: ChartData }) {
  return (
    <div>
      <h2>Revenue</h2>
      <Foreign
        tag="canvas"
        onReady={(el) => {
          const chart = new Chart(el, { data });
          return () => chart.destroy(); // cleanup on unmount
        }}
      />
    </div>
  );
}
```

#### Why the name "Foreign"

Borrowed from SVG's `<foreignObject>` concept — a boundary where "foreign" (non-native) content lives. Alternatives considered:
- `<Unmanaged>` — describes behavior but feels negative ("we won't help you here")
- `<Portal>` — overloaded (React portals render to a *different* DOM node)
- `<External>` / `<ExternalHost>` — too generic
- `<DomEscape>` — too clever

`<Foreign>` communicates "this subtree belongs to foreign code" in one word. It's concise, honest about the ownership boundary, and has SVG precedent.

## API Surface

### Post-hydration mount queue (internal API)

New functions in `packages/ui/src/component/lifecycle.ts`:

```ts
/**
 * Begin deferring mount callbacks. Called by mount() before startHydration().
 * While active, __flushMountFrame() queues callbacks instead of executing them.
 */
export function beginDeferringMounts(): void;

/**
 * Flush all deferred mount callbacks in FIFO order (child-before-parent).
 * All callbacks execute even if one throws — the first error is rethrown
 * after all have executed (matches __flushMountFrame semantics).
 * Called by mount() after endHydration().
 */
export function flushDeferredMounts(): void;

/**
 * Discard all queued mount callbacks without executing them.
 * Nulls the queue (does NOT run any callbacks).
 * Called in hydration error recovery before CSR fallback.
 */
export function discardDeferredMounts(): void;
```

`postHydrationQueue` is a module-level `let ... : Array<() => void> | null = null`. It is `null` by default (CSR fast-path). `beginDeferringMounts()` sets it to `[]`. `flushDeferredMounts()` and `discardDeferredMounts()` set it back to `null`. HMR re-evaluation of `lifecycle.ts` resets it to `null`, which is correct — HMR happens between renders, not during hydration.

Modified behavior of `__flushMountFrame()`:

```ts
export function __flushMountFrame(): void {
  const frame = mountFrames.pop();
  if (!frame) return;

  if (postHydrationQueue) {
    // During hydration — defer to post-hydration
    for (const cb of frame) {
      postHydrationQueue.push(cb);
    }
    return;
  }

  // Normal (CSR) execution — unchanged
  let firstError: unknown;
  for (const cb of frame) {
    try { cb(); } catch (e) { if (firstError === undefined) firstError = e; }
  }
  if (firstError !== undefined) throw firstError;
}
```

The `postHydrationQueue` null-check is the only overhead in CSR mode — a single falsy check on a module-level variable, branch-predicted away.

Modified `mount()` hydration path:

```ts
// packages/ui/src/mount.ts — hydration path
if (root.firstChild) {
  const scope = pushScope();
  try {
    beginDeferringMounts();
    startHydration(root);
    app();
    endHydration();
    flushDeferredMounts();   // onMount callbacks run here, AFTER hydration
    // INVARIANT: flushDeferredMounts() MUST run before popScope()
    // so that cleanup functions from onMount register in the mount scope.
    popScope();
    options?.onMount?.(root);
    const handle: MountHandle = { /* ... */ };
    mountedRoots.set(root, handle);
    return handle;
  } catch (e) {
    // Error recovery — discard queued mounts (do NOT run them),
    // discard deferred effects, end hydration, clean up scope.
    discardDeferredMounts();
    discardDeferredEffects();
    endHydration();
    popScope();
    runCleanups(scope);
    if (typeof process !== 'undefined' && process.env.NODE_ENV !== 'production') {
      console.warn('[mount] Hydration failed — re-rendering from scratch:', e);
    }
    // Fall through to CSR render
  }
}
```

#### Router mini-hydration windows

Both `Outlet` (lines 89-101) and `RouterView` (lines 140-152) call `startHydration(container)` / `endHydration()` independently for lazy route components resolved via Promise. These create secondary hydration windows **after** the main `mount()` hydration has completed and `postHydrationQueue` has been flushed back to `null`.

These mini-hydration windows have the same cursor corruption risk: a lazy component's `onMount` could insert DOM nodes while the mini-hydration cursor is still walking.

**Fix:** Both `Outlet` and `RouterView` must wrap their `startHydration(container)` / `endHydration()` pairs with `beginDeferringMounts()` / `flushDeferredMounts()`:

```ts
// In Outlet and RouterView's lazy resolution callback:
if (wasHydrating) {
  beginDeferringMounts();
  startHydration(container);
  try {
    RouterContext.Provider(router, () => {
      node = (mod as { default: () => Node }).default();
      __append(container, node);
    });
  } finally {
    endHydration();
    flushDeferredMounts();
  }
}
```

This is the same pattern as `mount()` — every `startHydration()`/`endHydration()` pair must be wrapped in `beginDeferringMounts()`/`flushDeferredMounts()`.

#### Edge cases: `__child()` and `__conditional` interaction

**`__child()` pauses hydration** (`pauseHydration()` sets `isHydrating = false`), but `postHydrationQueue` remains non-null. This means components rendered inside `__child()`'s `fn()` still defer their `onMount` callbacks — which is correct because `__child` content is CSR-rendered (fresh DOM), but the parent-level cursor walk is still active. The asymmetry (mount callbacks deferred, reactive effects immediate) is intentional: `__child` content needs effects to run immediately to populate fresh DOM, but `onMount` callbacks should still wait for the full hydration pass to complete.

**`__conditional` uses `domEffect`** (not `deferredDomEffect`), which runs synchronously. Branch functions may render child components whose `onMount` callbacks are deferred. This is correct — the deferred callbacks run after `endHydration()`, at which point the conditional's DOM restructuring (wrapper span creation) has already completed.

Both edge cases need explicit acceptance tests (see Phase 1 acceptance criteria).

### `<Foreign>` component (public API)

**`onReady` is the sole way to access the container element.** `<Foreign>` does not accept `children` and does not support `ref`. The `onReady` callback fires after hydration is complete (in post-hydration `onMount` timing), giving the user safe, unconditional DOM access.

```ts
// packages/ui/src/component/foreign.ts

export interface ForeignProps {
  /**
   * HTML tag for the container element.
   * @default 'div'
   */
  tag?: keyof HTMLElementTagNameMap | keyof SVGElementTagNameMap;

  /**
   * Called when the container is ready for external DOM manipulation.
   * Runs after hydration is complete (post-hydration onMount timing).
   * Return a cleanup function for unmount.
   *
   * This is the only way to access the container element.
   */
  onReady?: (container: HTMLElement) => (() => void) | void;

  /** Element id */
  id?: string;

  /** CSS class name */
  className?: string;

  /** Inline styles (camelCase object) */
  style?: Partial<CSSStyleDeclaration>;

  /**
   * Children are not supported. Foreign renders an empty container
   * whose children are managed by external code via onReady.
   */
  children?: never;
}
```

**Compiler transforms inside `onReady`:** The `onReady` callback runs via `onMount`, which executes inside `untrack()` (see `executeOnMount` in `lifecycle.ts`). The Vertz compiler's reactive transforms (signal `.value` access, getter-based props) still apply syntactically — the compiler doesn't distinguish `onReady` from any other callback. However, since `onMount` is untracked, signal reads inside `onReady` do not establish reactive dependencies. To react to signal changes, use `watch()` explicitly:

```tsx
// Reactive data bridge — watch() pushes updates to external library
function LiveChart({ data }: { data: number[] }) {
  return (
    <Foreign onReady={(el) => {
      const chart = new Chart(el, { data });

      // watch() establishes reactive tracking explicitly
      watch(() => data, (newData) => chart.update(newData));

      return () => chart.destroy();
    }} />
  );
}
```

Usage patterns:

```tsx
// D3 chart
<Foreign
  tag="svg"
  className="chart"
  onReady={(svg) => {
    const chart = d3.select(svg).append('g');
    return () => { d3.select(svg).selectAll('*').remove(); };
  }}
/>

// React island
import { createRoot } from 'react-dom/client';

<Foreign onReady={(el) => {
  const root = createRoot(el);
  root.render(<ReactApp />);
  return () => root.unmount();
}} />

// jQuery plugin
<Foreign
  tag="input"
  id="datepicker"
  className="datepicker"
  onReady={(el) => {
    $(el).datepicker({ format: 'yyyy-mm-dd' });
    return () => $(el).datepicker('destroy');
  }}
/>
```

### SSR behavior

- `<Foreign>` renders the container element with attributes but **no children** during SSR
- `onReady` does not run during SSR (follows `onMount` semantics)
- SSR output: `<div class="chart"></div>` — external library populates on the client

### Implementation detail: `<Foreign>` as a hand-written `.ts` component

`<Foreign>` is implemented in `foreign.ts` (not `.tsx`) because it uses the low-level `__element()` API directly — no JSX, no compiler transforms. This is deliberate: `<Foreign>` is a framework primitive like `__child()` or `__conditional()`.

Since the element is assigned synchronously from `__element()`, no `ref()` is needed — a local variable suffices:

```ts
// packages/ui/src/component/foreign.ts
import { __element } from '../dom/element';
import { onMount } from './lifecycle';

export function Foreign({
  tag = 'div',
  onReady,
  id,
  className,
  style,
}: ForeignProps): Element {
  const el = __element(tag);         // claims container, cursor advances PAST it
  // NO __enterChildren(el) — no children to walk

  if (id) el.id = id;
  if (className) el.className = className;
  if (style) Object.assign(el.style, style);

  if (onReady) {
    onMount(() => onReady(el));
  }

  return el;
}
```

During hydration, `__element(tag)` claims the container and advances the cursor past it. Since there's no `__enterChildren`, the hydration walker never enters the container's children. Any SSR content inside the container remains untouched until `onReady` runs.

**No special compiler handling is needed.** When users write `<Foreign tag="canvas" />`, the compiler emits `Foreign({ tag: "canvas" })` — a plain function call. Since `Foreign` has no JSX body, the compiler injects mount frames around the call site, but `Foreign` itself does no JSX processing.

**If a user passes JSX children to `<Foreign>`**, TypeScript rejects it at type-check time because `children?: never` in `ForeignProps`.

## Manifesto Alignment

- **No ceilings**: The current hydration design creates a ceiling — you can't use external JS libraries. `<Foreign>` removes this ceiling without compromising the framework's core model. Vertz is opinionated about how Vertz code works, but it doesn't lock you out of the rest of the ecosystem.
- **One way to do things**: There is exactly one way to integrate external DOM-manipulating code: `<Foreign>`. No need to learn about hydration internals, no `pauseHydration()` escape hatches, no manual cursor management.
- **AI agents are first-class users**: `<Foreign onReady={(el) => ...} />` is a simple, predictable pattern an LLM can generate correctly on the first try. No framework-specific knowledge beyond "wrap your external library in Foreign" is needed.
- **If it builds, it works**: The post-hydration `onMount` timing fix is a correctness improvement. Today, DOM manipulation in `onMount` *might* work (if the component has no unclaimed siblings) or *might* silently corrupt hydration (if it does). After this change, `onMount` is unconditionally safe — no subtle positional dependencies.
- **Performance is not optional**: The post-hydration queue adds zero overhead in CSR mode (the queue is `null`, fast-path is unchanged). During hydration, callbacks are pushed to an array and flushed once — same total work, different timing.

### What was rejected

- **`pauseHydration()` / `resumeHydration()` as public API**: These are internal primitives used by `__child()`. Exposing them would create a second, unsafe way to do the same thing. `<Foreign>` is the supported pattern.
- **Hydration markers / data attributes on Foreign containers**: Considered adding `data-vertz-foreign` to mark unmanaged containers. Rejected because it's unnecessary — the "no children" pattern is sufficient. Adding attributes would complicate SSR output for no gain.
- **Children prop on `<Foreign>` for SSR placeholders**: Considered allowing JSX children that render during SSR for progressive enhancement. Rejected for v1 — it requires the compiler to know that `<Foreign>` children should skip hydration, adding compiler complexity. Noted as a v2 enhancement in Future Work.

## Non-Goals

- **Bidirectional reactivity with external libraries**: `<Foreign>` is a one-way escape hatch. Vertz pushes data into the external library (via `watch()` in `onReady`); it does not observe or react to DOM changes made by the library. If two-way binding is needed, the developer wires it manually.
- **SSR for external library content**: `<Foreign>` renders an empty container during SSR. Server-side rendering of React/D3/jQuery content is out of scope — those libraries have their own SSR solutions.
- **Automatic cleanup of external DOM**: If `onReady` doesn't return a cleanup function, foreign DOM nodes are orphaned on unmount. The framework does not attempt to garbage-collect unmanaged subtrees.
- **Nested `<Foreign>`**: A `<Foreign>` inside another `<Foreign>` is not explicitly supported or prevented. It would work (each claims its own container), but it's not a designed use case.
- **Dynamic tag switching**: The `tag` prop is static. Changing it after mount is not supported. If you need a different element, re-mount the component.

## Unknowns

1. **HMR behavior with `<Foreign>`**: When the Vertz dev server hot-reloads a module containing `<Foreign>`, the external library's state inside the container is lost (the `onReady` callback re-runs on a fresh container). This is acceptable behavior — external libraries don't participate in Vertz's signal preservation — but should be documented. **Resolution: document in API reference, no code change needed.**

2. **Interaction with `<Presence>` animations**: If `<Foreign>` is wrapped in a `<Presence>` component for enter/exit animations, the exit animation may try to remove the container while the external library still has event listeners. The cleanup function in `onReady` handles this — it runs when the component unmounts, which `<Presence>` coordinates. **Resolution: verify in Phase 3 integration tests.**

## Future Work

- **`placeholder` prop for SSR loading states**: A `placeholder` prop that renders static HTML during SSR, replaced by `onReady` content on the client. This would require compiler awareness (skip hydration for placeholder children). Deferred to v2 — developers can work around this with a wrapper component that shows a skeleton until `onReady` fires and sets a signal.
- **`children` prop for progressive enhancement**: Allow SSR children that become unmanaged after hydration (e.g., a server-rendered table that a JS grid library enhances). Requires compiler support to skip child hydration. Deferred to v2.
- **`watch()` reactive bridge documentation**: First-class documentation section on pushing Vertz signal changes to external libraries and pulling external events back into Vertz signals via the `watch()` pattern.

## Migration Guidance

**For existing `onMount` DOM manipulation**: If you previously used `setTimeout`, `requestAnimationFrame`, or `queueMicrotask` inside `onMount` to avoid hydration interference, these workarounds are no longer needed. `onMount` now always runs after hydration is complete. You can safely remove the timing hacks.

**No breaking changes**: Existing `onMount` code continues to work. The only behavioral change is *when* the callback runs during hydration — after claiming is complete instead of during it. Since `onMount` was never documented as running during hydration, this is a bug fix, not a breaking change.

## Type Flow Map

```
ForeignProps { tag?, onReady?, id?, className?, style?, children?: never }
  → Foreign component (hand-written .ts, uses __element() directly)
    → __element(tag)           → HTMLElement (claimed during hydration, created during CSR)
    → el (local variable)      → same HTMLElement, no ref needed
    → onMount(() => onReady(el))
      → during hydration: pushed to postHydrationQueue (via __flushMountFrame deferral)
      → after endHydration(): callback executes, user receives HTMLElement
      → cleanup return value: registered with disposal scope → runs on unmount

No generics. No type flow beyond standard props → component → DOM element.

Scope ordering invariant:
  beginDeferringMounts() → startHydration() → app() → endHydration()
  → flushDeferredMounts() → popScope()
  ↑ must run before popScope() so cleanup functions register in the mount scope
```

## E2E Acceptance Test

```ts
describe('Feature: Post-hydration onMount timing', () => {
  describe('Given a component with onMount that appends a child', () => {
    describe('When hydrating SSR content', () => {
      it('Then the appended child does not corrupt sibling hydration', () => {
        // ChildA's onMount appends a <span> after its element
        // ChildB's element (a <p>) must still be correctly claimed
        // Before fix: cursor may claim the inserted <span> instead of <p>
        // After fix: onMount runs after all claiming is complete
      });
    });
  });

  describe('Given nested components with onMount callbacks', () => {
    describe('When hydrating SSR content', () => {
      it('Then child onMount runs before parent onMount', () => {
        // Execution order preserved: depth-first, child-before-parent
        const order: string[] = [];
        // Child: onMount(() => order.push('child'))
        // Parent: onMount(() => order.push('parent'))
        // expect(order).toEqual(['child', 'parent'])
      });

      it('Then all onMount callbacks run after hydration ends', () => {
        // Inside onMount, getIsHydrating() returns false
        // Reactive effects have already established tracking
      });
    });
  });

  describe('Given a component with onMount during CSR (no SSR content)', () => {
    describe('When mounting to an empty root', () => {
      it('Then onMount behavior is unchanged from current behavior', () => {
        // CSR path does not use the post-hydration queue
        // onMount runs synchronously during __flushMountFrame as before
      });
    });
  });

  describe('Given onMount that reads a reactive value', () => {
    describe('When hydrating SSR content', () => {
      it('Then the reactive value is available and tracking is established', () => {
        // Deferred effects flush before onMount queue
        // Signal reads in onMount see the correct initial values
      });
    });
  });

  describe('Given onMount inside a __child() callback during hydration', () => {
    describe('When the __child pauses hydration', () => {
      it('Then the onMount callback is still deferred to post-hydration queue', () => {
        // __child pauses hydration (isHydrating = false) but postHydrationQueue is non-null
        // Component inside __child's fn() still defers onMount
      });
    });
  });

  describe('Given onMount inside a __conditional branch during hydration', () => {
    describe('When the conditional renders a component', () => {
      it('Then the onMount callback runs after hydration with correct DOM structure', () => {
        // __conditional uses domEffect (synchronous) to render branches
        // Component's onMount is deferred → runs after endHydration()
        // Conditional wrapper span is already created when onMount fires
      });
    });
  });

  describe('Given a lazy route component resolved via Outlet during hydration', () => {
    describe('When the Promise resolves and mini-hydration runs', () => {
      it('Then onMount inside the lazy component is deferred past the mini-hydration', () => {
        // Outlet wraps startHydration/endHydration with beginDeferringMounts/flushDeferredMounts
        // Lazy component's onMount runs after the mini-hydration completes
      });
    });
  });
});

describe('Feature: <Foreign> component', () => {
  describe('Given a Foreign component with onReady', () => {
    describe('When hydrating SSR content', () => {
      it('Then claims the container element without entering its children', () => {
        // SSR: <div id="app"><div class="chart"></div><p>After</p></div>
        // Foreign claims <div class="chart">, cursor advances to <p>
        // Children of <div class="chart"> are NOT walked
        // <p> is correctly claimed
      });

      it('Then onReady receives the container element after hydration', () => {
        let receivedEl: HTMLElement | null = null;
        // <Foreign onReady={(el) => { receivedEl = el; }} />
        // After mount: receivedEl is the <div>, not null
        // receivedEl is the SSR-claimed element (same DOM node)
      });

      it('Then DOM manipulation in onReady does not affect Vertz', () => {
        // onReady: el.innerHTML = '<canvas>Chart</canvas>'
        // Vertz does not overwrite or observe this content
        // Sibling elements remain correctly bound
      });
    });
  });

  describe('Given a Foreign component during CSR', () => {
    describe('When mounting to an empty root', () => {
      it('Then creates the container element and calls onReady', () => {
        // CSR: createElement('div'), appendChild, onReady fires
      });
    });
  });

  describe('Given a Foreign component with a custom tag', () => {
    describe('When rendering', () => {
      it('Then creates an element with the specified tag', () => {
        // <Foreign tag="canvas" /> → <canvas></canvas>
        // <Foreign tag="svg" /> → <svg></svg>
      });
    });
  });

  describe('Given a Foreign component with onReady that returns cleanup', () => {
    describe('When the component unmounts', () => {
      it('Then the cleanup function is called', () => {
        let cleaned = false;
        // <Foreign onReady={() => { return () => { cleaned = true; }; }} />
        // handle.unmount() → cleaned === true
      });
    });
  });

  describe('Given a Foreign component with id, className and style', () => {
    describe('When rendering', () => {
      it('Then the container has the specified id, class and styles', () => {
        // <Foreign id="my-chart" className="chart" style={{ width: '100%' }} />
        // el.id === 'my-chart'
        // el.className === 'chart'
        // el.style.width === '100%'
      });
    });
  });

  describe('Given SSR output for Foreign', () => {
    describe('When server-rendering', () => {
      it('Then renders an empty container element with attributes', () => {
        // SSR output: <div class="chart"></div>
        // No children, no onReady execution
      });
    });
  });
});

// Type-level tests

// @ts-expect-error — onReady must receive HTMLElement, not arbitrary type
<Foreign onReady={(el: string) => {}} />

// @ts-expect-error — children not allowed on Foreign
<Foreign><div>Loading...</div></Foreign>

// Valid: all props optional
<Foreign />

// Valid: full usage
<Foreign tag="canvas" id="chart" className="chart" style={{ width: '100%' }} onReady={(el) => {
  // el is HTMLElement
  el.appendChild(document.createElement('div'));
  return () => {};
}} />
```

## Implementation Phases

### Phase 1: Post-hydration onMount queue

**This phase is independently valuable** — it fixes the hydration cursor corruption bug even without the `<Foreign>` component.

**Changes:**
- `packages/ui/src/component/lifecycle.ts`: Add `postHydrationQueue` array (`let ... : Array<() => void> | null = null`), `beginDeferringMounts()`, `flushDeferredMounts()` (all-callbacks-run-then-rethrow-first-error), `discardDeferredMounts()` (nulls queue without running callbacks). Modify `__flushMountFrame()` to push callbacks to the queue when active instead of executing them.
- `packages/ui/src/mount.ts`: Call `beginDeferringMounts()` before `startHydration()`, `flushDeferredMounts()` after `endHydration()` but before `popScope()`, `discardDeferredMounts()` in the error recovery path (before `discardDeferredEffects()`).
- `packages/ui/src/router/outlet.ts`: Wrap the lazy route `startHydration(container)` / `endHydration()` pair with `beginDeferringMounts()` / `flushDeferredMounts()`.
- `packages/ui/src/router/router-view.ts`: Same as Outlet — wrap mini-hydration pair.
- `packages/ui/src/index.ts`: Export `beginDeferringMounts`, `flushDeferredMounts`, `discardDeferredMounts` from internals (for router usage). No new public exports.

**Acceptance criteria:**
```ts
describe('Given onMount during hydration', () => {
  it('Then callbacks execute after endHydration()', () => {
    // onMount(() => { expect(getIsHydrating()).toBe(false); })
  });

  it('Then child onMount runs before parent onMount', () => {
    const order: string[] = [];
    // Child: onMount(() => order.push('child'))
    // Parent: onMount(() => order.push('parent'))
    // expect(order).toEqual(['child', 'parent'])
  });

  it('Then DOM manipulation in onMount does not corrupt sibling claiming', () => {
    // ChildA appends a <span> in onMount
    // ChildB (a <p>) is correctly claimed despite the inserted node
  });

  it('Then reactive effects have already run when onMount executes', () => {
    // __text effect has established tracking before onMount fires
  });

  it('Then onMount inside __child is still deferred', () => {
    // __child pauses hydration but postHydrationQueue is non-null
  });

  it('Then onMount inside __conditional branch is deferred with correct DOM', () => {
    // Conditional wrapper span exists when onMount fires
  });

  it('Then onMount inside lazy route (Outlet mini-hydration) is deferred', () => {
    // Outlet wraps mini-hydration with beginDeferringMounts/flushDeferredMounts
  });
});

describe('Given onMount during CSR (no hydration)', () => {
  it('Then behavior is unchanged — callbacks execute in __flushMountFrame', () => {
    // postHydrationQueue is null → fast path
  });
});

describe('Given hydration failure', () => {
  it('Then deferred mount callbacks are discarded without executing', () => {
    // discardDeferredMounts() nulls queue, callbacks never run
    // CSR fallback proceeds normally
  });
});
```

### Phase 2: `<Foreign>` component

**Changes:**
- `packages/ui/src/component/foreign.ts`: New file (`.ts`, not `.tsx`). Hand-written component using `__element()` directly. No `ref()` — local variable suffices. Includes `ForeignProps` interface with `children?: never`.
- `packages/ui/src/index.ts`: Export `Foreign` and `ForeignProps`.
- `packages/ui/src/component/__tests__/foreign.test.ts`: Unit tests for Foreign component (CSR, hydration, cleanup, props, children rejection).

**Acceptance criteria:**
```ts
describe('Given <Foreign> during CSR', () => {
  it('Then creates a div container and calls onReady', () => {});
  it('Then supports custom tag prop (including SVG tags)', () => {});
  it('Then applies id, className and style', () => {});
  it('Then cleanup runs on unmount', () => {});
});

describe('Given <Foreign> during hydration', () => {
  it('Then claims the container element from SSR DOM', () => {});
  it('Then does not walk into container children', () => {});
  it('Then onReady fires after hydration with the claimed element', () => {});
  it('Then sibling elements after Foreign are correctly claimed', () => {});
});

describe('Given <Foreign> during SSR', () => {
  it('Then renders empty container with attributes', () => {});
  it('Then onReady does not execute', () => {});
});

// Type test: <Foreign><div/></Foreign> rejected by TypeScript (children?: never)
```

### Phase 3: Integration tests and documentation

**Changes:**
- `packages/ui/src/__tests__/foreign-integration.test.ts`: Integration tests simulating third-party DOM manipulation patterns.
- `packages/ui/src/__tests__/mount-hydration.test.ts`: Add tests for post-hydration onMount timing with hydration scenarios.
- `packages/docs/`: Add documentation page for `<Foreign>` component with usage examples, reactive bridge pattern (`watch()` inside `onReady`), and migration guidance.

**Acceptance criteria:**
- Integration test: external code appending children to Foreign container after hydration
- Integration test: Foreign + reactive `watch()` bridge
- Integration test: Foreign cleanup on unmount
- Integration test: Foreign inside `<Presence>` animation (verify cleanup coordination)
- All existing hydration tests still pass
- Documentation page with:
  - Code examples for D3, React, jQuery, code editors, maps
  - Reactive bridge pattern with `watch()` (first-class section)
  - Migration guidance: remove `setTimeout`/`rAF` workarounds in `onMount`
  - Note on HMR behavior (external library state is not preserved)

## Review Sign-offs

### DX (josh) — APPROVED WITH SUGGESTIONS ✅
- [x] `onReady` callback pattern is familiar and well-named
- [x] LLM usability is strong — API is small, pattern is predictable
- [x] Phase structure delivers incremental value
- Suggestions incorporated: naming rationale added, `onReady` documented as sole access mechanism, compiler behavior inside `onReady` clarified, `id` prop added, SVG tag type fixed, `children?: never` added

### Product/Scope — APPROVED ✅
- [x] Roadmap fit is strong — prerequisite for production adoption
- [x] Scope is right — solves adoption barrier without overreaching
- [x] Non-goals are correct
- [x] Phase ordering delivers incremental value
- Suggestions incorporated: concrete library categories listed, migration guidance added, Phase 1 independence called out, loading state story noted in Future Work, `watch()` bridge elevated in docs plan

### Technical — APPROVED WITH CHANGES ✅
- [x] Post-hydration queue preserves execution order
- [x] No performance regression in CSR path
- [x] No breaking changes to existing onMount behavior
- [x] `<Foreign>` implementation requires no compiler changes
- Blockers resolved: router mini-hydration handled (Outlet + RouterView wrapped), error path complete with correct ordering
- Suggestions incorporated: `__child`/`__conditional` edge cases documented and tested, Foreign simplified (no ref, .ts file), `children?: never` added, scope ordering invariant documented, `flushDeferredMounts` error semantics specified, SVG tag type fixed, HMR note added
