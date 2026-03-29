# Virtualization with Auto-Measurement

**Status:** Draft — Rev 4
**Date:** 2026-03-29
**Author:** Vinicius Dacal

**Rev 4 changes:** Addressed all review findings from DX, Product/Scope, and Technical reviews.
- Key requirement upgraded from warning to compiler error (DX-S1, Principle 1 compliance)
- Priority/scope clarified: this is design exploration, not queued for implementation (Product-B1)
- Phase 3 (text measurement) separated as independent initiative (Product-S1)
- Phase 4 (headless layout) moved to Future Direction appendix only (Product-B2)
- Compiler naming constraint documented explicitly (Tech-B1)
- Mixed children constraint specified: exactly one `.map()` child (Tech-B2)
- `contain: strict` height requirement documented with dev warning (Tech-B3)
- Measurement batching specified: batch inserts then batch reads (Tech-S1)
- Scroll anchoring on prepend corrected: measure before adjusting (Tech-S2)
- `onCleanup` semantics resolved with migration caveat + state persistence pattern (all reviewers)
- SSR hydration contract specified precisely (Tech-S6, Product-S3)
- Image loading strategy added (Product-S4, Tech)
- Resize invalidation: stale-but-usable strategy (Tech-S5)
- Item pooling noted as Phase 2 optimization (Tech-S7)
- Invalid `@ts-expect-error` examples replaced with compiler diagnostic examples (Tech-S8)
- Transform example typo fixed (Tech-N3)
- `estimateHeight` default raised to 60px (DX-N1)
- Pretext fallback plan added (Product-S2)

---

## Problem

Vertz renders all list items to the DOM via `.map()` → `__list()` / `__listValue()`. This works for moderate lists (100–1000 items) but fails for feeds, chat logs, large tables, and dashboards with thousands of items. The DOM becomes the bottleneck — layout reflows, paint costs, and memory pressure all scale linearly with item count.

Virtualization (rendering only visible items) is the standard solution. The challenge is making it work with Vertz's composition pattern and compiler without introducing new patterns or requiring developers to specify item heights.

### Why Now

This is a **design exploration** — not queued for immediate implementation. The current priorities (runtime, test runner, primitives JSX migration) remain unchanged. However, virtualization intersects with core compiler design decisions (`.map()` transform, reactive scoping, component lifecycle). Getting the design right now ensures that ongoing compiler work doesn't paint us into a corner. The design is ready to implement when the priority window opens.

---

## API Surface

### The Core: `<VirtualScroll>` (zero config)

Developers write `.map()` exactly as they do today. Wrap it in `<VirtualScroll>`. Done.

```tsx
import { VirtualScroll } from '@vertz/ui/components';

// That's it. No itemHeight. No configuration.
<VirtualScroll>
  {tasks.map((task) => <TaskCard key={task.id} task={task} />)}
</VirtualScroll>
```

**Migration from a non-virtual list:**

```diff
- <div class="task-list">
+ <VirtualScroll class="task-list">
    {tasks.map((task) => <TaskCard key={task.id} task={task} />)}
- </div>
+ </VirtualScroll>
```

One-line change. The `.map()` callback is identical. The compiler handles all reactivity. No new patterns.

> **Migration caveat:** VirtualScroll creates and destroys items as they scroll in/out of view. `onCleanup` callbacks fire on scroll-out, not just on data removal. If your items register side effects (timers, connections), see the [Item Lifecycle](#item-lifecycle) section for the state persistence pattern.

### With Options

```tsx
// Infinite scroll
<VirtualScroll onReachEnd={() => tasks.fetchMore?.()} class="task-list">
  {tasks.map((task) => <TaskCard key={task.id} task={task} />)}
</VirtualScroll>

// Better initial scroll bar accuracy (optional hint)
<VirtualScroll estimateHeight={80}>
  {tasks.map((task) => <TaskCard key={task.id} task={task} />)}
</VirtualScroll>

// Scroll to a specific item
<VirtualScroll scrollToIndex={selectedIndex}>
  {tasks.map((task) => <TaskCard key={task.id} task={task} />)}
</VirtualScroll>

// Compose with loading/empty states (standard Vertz composition)
{tasks.loading && <Skeleton count={5} />}
{tasks.data.items.length === 0 && <EmptyState />}
{tasks.data.items.length > 0 && (
  <VirtualScroll onReachEnd={() => tasks.fetchMore?.()} ariaLabel="Task list">
    {tasks.data.items.map((task) => <TaskCard key={task.id} task={task} />)}
  </VirtualScroll>
)}
```

### Full Type Definitions

```ts
interface VirtualScrollProps {
  /**
   * Initial height estimate for unmeasured items (px).
   * Improves scroll bar accuracy on first render.
   * Default: 60.
   */
  estimateHeight?: number;

  /** Extra items to render above/below the viewport. Default: 3. */
  overscan?: number;

  /** Fired when the user scrolls within reachEndThreshold of the bottom. */
  onReachEnd?: () => void;

  /** Distance from bottom (px) to trigger onReachEnd. Default: 200. */
  reachEndThreshold?: number;

  /** Programmatic scroll-to-index. Reactive — scrolls when value changes. */
  scrollToIndex?: number;

  /** Scroll-to-index alignment. Default: 'start'. */
  scrollToAlignment?: 'start' | 'center' | 'end' | 'auto';

  /** CSS class for the outer scroll container. */
  class?: string;

  /** Accessible label for the list. Applied as aria-label on the scroll container. */
  ariaLabel?: string;
}
```

Note: **No `items` prop. No `itemHeight` prop. No `itemKey` prop. No `children` function prop.** The compiler extracts items, keys, and the render function from the `.map()` call inside children. The developer never sees these internal props.

**Height requirement:** VirtualScroll uses `contain: strict` for layout isolation, which means it does not auto-size from its content. The developer must provide a height via CSS (e.g., `height: 100%`, `flex: 1`, or an explicit pixel value). In dev mode, VirtualScroll emits a console warning if `offsetHeight === 0` after mount.

### Invalid Usage — Compiler Diagnostics

These produce **compiler errors**, not runtime surprises:

```tsx
// COMPILER ERROR: .map() inside VirtualScroll must have a key prop.
// Height caching requires stable identity.
<VirtualScroll>
  {tasks.map((task) => <TaskCard task={task} />)}
</VirtualScroll>

// COMPILER ERROR: VirtualScroll must contain exactly one .map() expression as children.
// No static children, no mixed content.
<VirtualScroll>
  <div class="header">Title</div>
  {tasks.map((task) => <TaskCard key={task.id} task={task} />)}
</VirtualScroll>

// COMPILER ERROR: VirtualScroll must contain exactly one .map() expression as children.
<VirtualScroll>
  <TaskCard />
</VirtualScroll>
```

TypeScript-level type errors:

```ts
// @ts-expect-error — estimateHeight must be a number
<VirtualScroll estimateHeight="auto">
  {tasks.map((task) => <TaskCard key={task.id} task={task} />)}
</VirtualScroll>
```

---

## Compiler Transform

### How It Works

The compiler already transforms `.map()` in JSX children:
- Inside intrinsic elements → `__list()` (statement, appends to parent)
- Inside component children → `__listValue()` (expression, returns DisposableNode)

For `<VirtualScroll>`, we add a third path:
- Inside `VirtualScroll` → extract items/key/render into `__createVirtualScroll()`

The compiler recognizes `VirtualScroll` by **name matching** — the same approach used by `signal-api-registry` for `query`, `form`, `useContext`, etc. This is a documented naming constraint: `VirtualScroll` is a reserved component name for the compiler. Import aliases (`import { VirtualScroll as VS }`) and user-defined components with the same name are NOT supported and will produce incorrect behavior. This is the same tradeoff the compiler already makes for signal APIs.

### Children Constraint

`<VirtualScroll>` must contain **exactly one child expression** that is a `.map()` call. The compiler enforces this:
- **0 `.map()` expressions:** Compiler error
- **2+ `.map()` expressions:** Compiler error
- **Mixed content (`.map()` + static children):** Compiler error
- **Exactly 1 `.map()` with a `key` prop:** Valid

This constraint exists because the scroll container owns all layout — static children mixed with virtual items would break scroll height calculation and item positioning.

### Transform Example

**Developer writes:**
```tsx
<VirtualScroll class="task-list" overscan={5}>
  {tasks.map((task) => <TaskCard key={task.id} task={task} />)}
</VirtualScroll>
```

**Compiler generates:**
```ts
__createVirtualScroll(
  // Props
  { class: 'task-list', overscan: 5 },
  // Items accessor (reactive — recomputes visible range when items change)
  () => tasks,
  // Key function (extracted from `key` prop on outermost JSX element)
  (task) => task.id,
  // Render function (same reactive scoping as __list()/__listValue())
  (task, index) => {
    // pushScope()/popScope() wrapping handled by __createVirtualScroll runtime
    // Getter-based props for reactive child components — same as .map() today
    return TaskCard({ task: () => task });
  }
)
```

### What Stays the Same

- **Reactive scoping:** `pushScope()` / `popScope()` around the render function, same as `__list()`
- **Getter-based props:** Component props are wrapped in getters for reactivity, same as `.map()`
- **Item signals:** Items are wrapped in signals with proxied property access, same as `__list()`
- **Key extraction:** `key` prop extracted from outermost JSX element in the `.map()` callback, same as `__listValue()`

### What's Different

- **The `.map()` does NOT eagerly render all items.** The items array, key function, and render function are extracted and passed to the VirtualScroll runtime, which calls the render function on demand (only for visible items).
- **Key is required.** The compiler emits an **error** (not warning) if `.map()` inside `VirtualScroll` lacks a `key` prop. Without stable keys, height caching, scroll anchoring, and reconciliation cannot work correctly. This enforces Principle 1: if it builds, it works.

### Compiler Changes Required

1. **JSX transformer** (`packages/ui-compiler/src/transformers/jsx-transformer.ts`):
   - In the component children processing path (around line 834), check `if (tagName === 'VirtualScroll')`
   - If yes, validate exactly one `.map()` child with a `key` prop
   - Extract items/key/render and generate `__createVirtualScroll()` call
   - Emit compiler error if constraints violated

2. **New runtime import:** `__createVirtualScroll` from `@vertz/ui/internals`

---

## Auto-Measurement

### The Zero-Config Promise

The developer does not specify item heights. The framework:
1. **Estimates** initial heights (using `estimateHeight` or default 60px)
2. **Renders** visible items + overscan into the DOM
3. **Measures** rendered items via batched `offsetHeight` reads
4. **Caches** heights by key in a `Map<string | number, number>`
5. **Corrects** spacer height, item positions, and scroll position
6. **Repeats** on scroll — new items are rendered, measured, cached

### Why Synchronous Measurement Works

The scroll container uses `contain: strict`, which creates a layout isolation boundary. Reading `offsetHeight` on items inside this boundary triggers a reflow scoped to the container — not the full page. This makes synchronous measurement practical and fast.

### Measurement Flow

**Critical: batch all DOM insertions first, then batch all measurements.** This allows the browser to do a single layout pass for all new items, instead of interleaving insert-measure cycles.

```
Mount
  ├─ Estimate all heights at `estimateHeight` (default: 60px)
  ├─ Build prefix sum array from estimates
  ├─ Calculate visible range from scrollTop=0
  ├─ Render items in [0, visibleCount + overscan]
  ├─ Batch insert: append all rendered items to content container
  ├─ Batch measure: for each rendered item, read offsetHeight (single layout pass)
  ├─ Cache measured heights (Map<key, height>)
  ├─ Rebuild prefix sums (measured items use real height, rest use average of measured)
  ├─ Update spacer height and translateY
  └─ Stable — no visual flash because initial estimate is close enough

Scroll
  ├─ Read scrollTop (passive scroll event, no forced reflow)
  ├─ Binary search prefix sums → first visible item index
  ├─ Calculate new visible range [first - overscan, first + visibleCount + overscan]
  ├─ Diff against current range
  │   ├─ Items exiting: runCleanups(scope) → remove DOM
  │   └─ Items entering: create scope → call renderFn
  ├─ Batch insert: append all new items to content container
  ├─ Batch measure: read offsetHeight for all new items (single layout pass)
  ├─ Cache heights, rebuild prefix sums if any new measurements
  ├─ Update spacer height and translateY
  └─ Stable — measurement happens once per item, cached thereafter

Resize (container width changes)
  ├─ ResizeObserver fires on scroll container
  ├─ If containerWidth unchanged → skip (height-only resize)
  ├─ Mark all cached heights as stale (keep old values as estimates)
  ├─ Re-measure all currently visible items (batch read)
  ├─ Rebuild prefix sums (re-measured use new heights, stale use old heights as better-than-average estimates)
  ├─ Apply scroll anchoring (preserve current visible item position)
  └─ As items scroll into view, measure fresh → gradually replace stale values
```

### Height Estimation Strategy

For unmeasured items (haven't scrolled into view yet):
- **Initial:** `estimateHeight` prop (default 60px)
- **After first batch:** Average of all measured heights
- **Progressive:** As more items are measured, the average converges → scroll bar becomes increasingly accurate

The scroll bar starts slightly inaccurate and progressively corrects. This is the same behavior as react-virtuoso, TanStack Virtual with `measureElement`, and every auto-measuring virtual list. Users rarely notice — the correction is smooth.

### Image Loading

Items with images that load asynchronously may have incorrect initial measurements. Strategy:

- **Phase 1:** Document that images should use fixed dimensions (`width`/`height` on `<img>`) for correct initial measurement. Items with dimension-less images will be re-measured on the next resize or scroll-through.
- **Phase 2:** Add a `ResizeObserver` per visible item to detect per-item height changes (image load, lazy content). When an item's height changes, update the cache and rebuild prefix sums with scroll anchoring. The ResizeObserver is only attached to visible items (bounded cost).

---

## Internal Architecture

### DOM Structure

```html
<div class="virtual-scroll" role="list" aria-label="..."
     style="overflow-y:auto; contain:strict; position:relative">
  <!--
    Spacer: sets full scroll height for correct scrollbar.
    No children — height only.
  -->
  <div class="virtual-spacer"
       style="height:{totalHeight}px; pointer-events:none"
       aria-hidden="true"></div>

  <!--
    Content: positioned at the offset of the first visible item.
    Items flow naturally (no per-item absolute positioning).
  -->
  <div class="virtual-content"
       style="position:absolute; top:0; left:0; right:0; transform:translateY({offsetY}px)">
    <div role="listitem" aria-setsize={totalCount} aria-posinset={1}>
      <!-- renderFn(item, 0) output -->
    </div>
    ...
  </div>
</div>
```

**Key decisions:**
- **Single `translateY` on content container** — items flow naturally inside, reducing layout complexity vs per-item absolute positioning
- **`contain: strict`** — layout isolation boundary. Item DOM changes don't reflow the page. Synchronous measurement is cheap. **Requires explicit height on the container** (CSS or parent flex layout). Dev-mode warning if `offsetHeight === 0` after mount.
- **`pointer-events: none`** on spacer — prevents click interception
- **Spacer is `aria-hidden`** — screen readers skip it

### Scroll Tracking

1. **Passive `scroll` event listener** on outer container (`{ passive: true }`)
2. Read `scrollTop` — no forced reflow because `contain: strict` isolates reads
3. **Binary search** prefix sum array → find first visible item: O(log n)
4. Compute visible range: `[firstVisible - overscan, firstVisible + visibleCount + overscan]`, clamped to `[0, items.length)`
5. If range changed, update DOM synchronously (scroll event fires once per frame in modern browsers)
6. Update content container `translateY`

### Prefix Sum Array

`Float64Array` of cumulative heights. `prefixSums[i]` = sum of heights for items `0..i-1`. Item `i`'s top position = `prefixSums[i]`. Total height = `prefixSums[items.length]`.

- O(n) to build. For 10K items: ~0.05ms. For 100K: ~0.5ms.
- O(log n) binary search for "which item is at scrollTop Y?"
- Rebuilt when items change, heights are measured, or container resizes
- For lists > 10K items: Fenwick tree optimization (O(log n) single-item update) should be added to keep rebuild cost under 0.5ms per frame. This is a Phase 2 optimization.
- `Float64Array` is correct — `Float32Array` loses precision above ~16M cumulative pixels (reachable with 100K items at 160px+ each)
- **Reallocation on grow:** When items grow (infinite scroll), the prefix sum array is reallocated with geometric growth (2×). Cost amortized over appends.

### Item Lifecycle

**Enter (scroll into visible range):**
1. `pushScope()` — create reactive scope
2. Call `renderFn(item, index)` — JSX rendered, reactive subscriptions created
3. `popScope()`
4. Append DOM node to content container (batched with other entering items)
5. Read `offsetHeight` → cache height by key (batched after all inserts)

**Exit (scroll out of visible range):**
1. `runCleanups(scope)` — fires `onCleanup` callbacks registered inside the children template
2. Remove DOM node from content container
3. Discard scope

**Update (same key, new data):**
- Update item signal → reactive bindings inside the component re-run (no DOM re-creation)
- Same behavior as existing `__list()` reconciliation

> **`onCleanup` fires on scroll-out.** This is a behavioral difference from non-virtual `.map()`, where `onCleanup` only fires on data removal or parent unmount. This is the same tradeoff that React virtual lists make — items are fully unmounted on scroll-out. This is documented and consistent with the item not existing in the DOM.
>
> **State persistence pattern:** For items that need persistent state across scroll-in/scroll-out, lift state outside the list item:
> ```tsx
> // State stored outside the list — survives scroll-out/scroll-in
> const draftMap = new Map<string, string>();
>
> <VirtualScroll>
>   {tasks.map((task) => (
>     <TaskEditor
>       key={task.id}
>       task={task}
>       draft={draftMap.get(task.id)}
>       onDraftChange={(v) => draftMap.set(task.id, v)}
>     />
>   ))}
> </VirtualScroll>
> ```
>
> **Future optimization (Phase 2):** Item pooling — instead of destroying scope + DOM on scroll-out, detach into a FIFO pool (bounded at `overscan × 2`). Reuse pooled nodes for new items by updating the item signal. This reduces GC pressure during fast scrolling.

### Reconciliation on Items Change

When the `items` array changes (reactive update from `query()`, optimistic update, etc.):

1. Build `Map<key, index>` from new items
2. For each currently rendered item:
   - Key exists at same index → keep (reactive signals handle data updates)
   - Key exists at different index → update position in prefix sums
   - Key gone → dispose scope, remove DOM
3. For new items in visible range: create scope, render, measure, insert (batched)
4. Rebuild prefix sums
5. Apply scroll anchoring if items were prepended

### Scroll Anchoring

**On prepend:** When items are prepended (detected by first item key change):
1. Identify anchor item (top of viewport before change)
2. Render prepended items that fall in the visible range into the DOM (batched)
3. Measure their actual heights (batched `offsetHeight` reads)
4. Calculate height delta from measured heights (not estimates)
5. Set `scrollTop += delta` synchronously before the browser paints
6. User sees no jump — same item stays at same viewport position

**On measurement correction:** When a measured height differs from the cached estimate:
1. Record the anchor item and its viewport-relative position
2. Rebuild prefix sums with corrected height
3. Adjust `scrollTop` to maintain anchor item position
4. Spacer height updated

### SSR Strategy

**Render first N items as static HTML during SSR. Upgrade to virtualized on hydration.**

During SSR:
- Compute N = `Math.ceil(estimatedViewportHeight / estimateHeight) + overscan`
- `estimatedViewportHeight` defaults to 800px. Configurable via SSR options: `ssrViewportHeight`.
- Render N items as plain `<div role="listitem">` elements
- Record N in a data attribute on the scroll container: `data-ssr-count="N"`
- Spacer height set to `items.length × estimateHeight`
- No `contain: strict` during SSR (added on hydration)

During hydration:
- Read `data-ssr-count` to know how many items to claim
- Claim those N DOM nodes — call `renderFn` to set up reactive scopes, matching existing SSR nodes
- Add `contain: strict`, set up scroll listener, ResizeObserver
- Measure claimed items → cache heights, rebuild prefix sums
- If client viewport is larger than SSR estimate: render additional items and append (additive, no flicker)
- If client viewport is smaller: leave extra items in DOM, they'll be recycled on first scroll event

### Resize Handling

VirtualScroll owns a `ResizeObserver` on its scroll container.

On resize:
1. Read new container dimensions from ResizeObserver entry
2. **Only invalidate if `containerWidth` changed** (track `previousWidth`). Height-only resizes don't affect text wrapping.
3. Mark all cached heights as **stale** (keep old values). Old heights are better estimates than the global average.
4. Re-measure all currently visible items (batched `offsetHeight` reads)
5. Rebuild prefix sums (re-measured use new heights, stale use old heights)
6. Apply scroll anchoring (preserve current visible item)
7. Re-calculate visible range (container height changed → different number of visible items)
8. As items scroll into view, they're measured fresh, gradually replacing stale values

### Font Loading

On mount, check `document.fonts.status`. If `'loading'`, register a one-time listener on `document.fonts.ready`:
1. Invalidate all cached heights (mark as stale)
2. Re-measure all visible items
3. Rebuild prefix sums
4. Apply scroll anchoring

### `onReachEnd` Deduplication

Fires when `scrollTop` crosses `totalHeight - viewportHeight - reachEndThreshold` from outside to inside.
- Fires once per crossing
- If `items.length` changes while still near bottom → fires again (developer needs to load more)
- `reachEndFired` flag resets when: (a) `items.length` changes, or (b) scroll moves above threshold

### Accessibility

- Outer container: `role="list"`, `aria-label` from prop
- Each visible item wrapper: `role="listitem"`, `aria-setsize={items.length}`, `aria-posinset={index + 1}`
- Keyboard navigation (Phase 2): Arrow keys move focus between items. When focus reaches edge of visible range, VirtualScroll scrolls to reveal next item and renders it before focus moves. `Home`/`End` jump to first/last item.
- Focus preservation (Phase 2): If a focused item scrolls out of view, focus moves to nearest visible item.

---

## Manifesto Alignment

### Principles Applied

| Principle | How |
|-----------|-----|
| **1. If it builds, it works** | Compiler enforces `.map()` with `key` inside VirtualScroll. Missing key is a compile **error**. Wrong children structure is a compile error. |
| **2. One way to do things** | One component (`<VirtualScroll>`). Developer writes `.map()` exactly as today. No alternative APIs, no render props, no hooks. |
| **3. AI agents first-class** | Zero config. LLM wraps `.map()` in `<VirtualScroll>` — done. No height calculation, no key extraction, no measurement callbacks. |
| **5. Composition over configuration** | Loading/empty states compose outside VirtualScroll. `.map()` callback is standard Vertz composition. No god-component owning all rendering. |
| **7. Performance** | Auto-measurement with `contain: strict` isolation. Batched reads. Prefix sum binary search O(log n). |
| **8. No ceilings** | Future headless layout engine (Taffy + Pretext) removes DOM as a ceiling. Enables canvas, native, and server-side rendering. |

### Tradeoffs Accepted

- **Auto-measurement requires DOM reads** — Batched synchronous `offsetHeight` reads inside `contain: strict`. Acceptable trade for zero-config DX.
- **Scroll bar starts inaccurate** — Unmeasured items use estimated heights. Scroll bar progressively corrects. Industry standard (react-virtuoso, TanStack Virtual).
- **`onCleanup` fires on scroll-out** — Items are created/destroyed on scroll. Behavioral difference from non-virtual lists. Documented with state persistence pattern. Same tradeoff React virtual lists make.
- **Key is required** — `.map()` inside VirtualScroll must have a `key` prop. Compiler error if missing. Acceptable constraint — keys are best practice anyway.
- **Explicit height required** — `contain: strict` means VirtualScroll doesn't auto-size. Developer provides height via CSS. Dev-mode warning if zero.
- **VirtualScroll is a reserved name** — Compiler matches by name (same as `query`, `form`, `useContext`). Import aliases not supported.

### Alternatives Rejected

- **Children-as-function** (`{(item) => <JSX />}`) — Breaks the compiler's reactivity model. Getter-based props aren't generated inside callback children. Creates a footgun pattern developers would try on their own components.
- **Mandatory `itemHeight` prop** — Forces developers to care about measurement. The framework should handle this automatically.
- **Render prop pattern** (`renderItem` prop) — Same compiler problem as children-as-function.
- **`virtual` attribute on any element** — Too implicit. Magic behavior on `<div virtual>` would be surprising.
- **Per-item absolute positioning** — More layout work. Single `translateY` on content container is simpler and faster.
- **`contain: layout paint` (without `size`)** — Would allow auto-sizing but widens reflow scope. `contain: strict` with documented height requirement is the right tradeoff for virtualization.

---

## Non-Goals

- **Horizontal virtualization** — Only vertical scrolling in scope.
- **VirtualGrid / Masonry** — Separate design doc when needed.
- **List animations (FLIP) during scroll** — FLIP requires knowing before/after positions. Items entering/exiting via scroll don't animate.
- **Sticky section headers** — Separate component or future extension.
- **Canvas rendering** — VirtualScroll renders to DOM. Canvas rendering is part of the headless layout vision.
- **Automatic height detection without DOM** — Phases 1-2 use auto-measurement. Headless layout is a future direction.

---

## Unknowns

### 1. Compiler Transform Complexity

**Question:** How much work is the `VirtualScroll` compiler transform?

**Resolution strategy:** POC the transform in an isolated branch before Phase 1. The transform is structurally similar to the existing `.map()` → `__listValue()` path — extracts the same three pieces (items, key, render). The difference is the output: `__createVirtualScroll()` instead of `__listValue()`.

### 2. Synchronous Measurement Accuracy

**Question:** Does batched `offsetHeight` inside `contain: strict` give accurate heights for all component types?

**Resolution strategy:** Build a test suite with various component types (text-only, with fixed-size images, with lazy content). Font loading handled by `document.fonts.ready` listener. Per-item ResizeObserver (Phase 2) handles async content like images.

### 3. Interaction with List Animations

**Question:** Can VirtualScroll work alongside `ListAnimationContext`?

**Resolution strategy:** Deferred. Scroll-in/scroll-out is not animated. Data-driven animations (item add/remove) could distinguish "data new" vs "scroll new" items. Separate design when needed.

---

## Type Flow Map

```
<VirtualScroll>
  │
  └─ {items.map((item) => <Component key={item.id} prop={item.field} />)}
       │         │              │                         │
       │         │              │                         └─ Compiler: getter-based prop
       │         │              │                            () => item.field
       │         │              │
       │         │              └─ Compiler extracts key function
       │         │                 (item) => item.id
       │         │
       │         └─ Compiler extracts render function
       │            (item, index) => Component({ prop: () => item.field })
       │
       └─ Compiler extracts items accessor
          () => items

Runtime __createVirtualScroll receives:
  ├─ props: VirtualScrollProps
  ├─ items: () => T[]              ← T inferred from array
  ├─ keyFn: (item: T) => string|number
  └─ renderFn: (item: T, index: number) => Node
       └─ item: T ← same T, reactive via item signal proxy

Height cache: Map<string|number, number>  ← keyed by keyFn output
Prefix sums: Float64Array[items.length+1] ← built from cached + estimated heights
```

**No dead generics.** `T` flows from the `.map()` source array through the compiler extraction to the runtime render function. The developer never sees or specifies `T`.

---

## E2E Acceptance Test

### Developer Walkthrough: Task List with Infinite Scroll

```tsx
// app/pages/tasks.tsx
import { VirtualScroll } from '@vertz/ui/components';
import { query } from '@vertz/ui';

function TaskListPage() {
  const tasks = query(() => fetch('/api/tasks').then(r => r.json()), { key: 'tasks' });

  return (
    <div class="task-list-page" style={{ height: '100vh', display: 'flex', flexDirection: 'column' }}>
      {tasks.loading && <Skeleton count={5} />}
      {tasks.error && <ErrorBanner error={tasks.error} />}
      {tasks.data && (
        <VirtualScroll
          onReachEnd={() => tasks.fetchMore?.()}
          ariaLabel="Task list"
          class="task-list"
        >
          {tasks.data.items.map((task) => (
            <div key={task.id} class="task-card">
              <h3>{task.title}</h3>
              <p>{task.description}</p>
              <span class="meta">{task.status} — {task.assignee}</span>
            </div>
          ))}
        </VirtualScroll>
      )}
    </div>
  );
}
```

**Expectations:**

1. 5,000 tasks render without lag — only ~20-30 items in the DOM at any time.
2. Smooth 60fps scrolling — no reflow-induced jank (contain: strict isolates measurement).
3. Scroll position stable — no jumps when items enter/leave the viewport.
4. Variable-length descriptions produce correctly sized cards (auto-measured).
5. Resizing the window re-measures items and repositions without visible shift.
6. Scrolling to the bottom triggers `onReachEnd` for loading more items.
7. Screen readers announce "Task list" and item position ("item 5 of 5000").
8. TypeScript: `task.nonexistent` in the `.map()` callback is a compile error.
9. The `.map()` callback is reactive — if a task's title changes, only that card updates.

### Integration Test Scenarios

```ts
describe('Feature: VirtualScroll auto-measurement', () => {
  describe('Given 5000 items in a 600px tall container', () => {
    describe('When VirtualScroll renders', () => {
      it('Then DOM contains only ~20-30 items (viewport + overscan)', () => {});
      it('Then outer container has contain:strict and role=list', () => {});
      it('Then items have role=listitem with correct aria-setsize and aria-posinset', () => {});
      it('Then spacer div has height based on estimated + measured heights', () => {});
      it('Then content container uses translateY for positioning', () => {});
    });
  });

  describe('Given VirtualScroll scrolled to position 5000px', () => {
    describe('When checking the DOM', () => {
      it('Then items around the calculated index are rendered', () => {});
      it('Then items at index 0 are not in the DOM', () => {});
      it('Then previously measured items have cached heights', () => {});
    });
  });

  describe('Given items with varying heights', () => {
    describe('When scrolling through the list', () => {
      it('Then each item measured height matches actual rendered height', () => {});
      it('Then scroll position remains stable (no jumps on correction)', () => {});
    });
  });

  describe('Given VirtualScroll with items array that changes', () => {
    describe('When an item in the visible range is updated (same key, new data)', () => {
      it('Then the item re-renders with new data (reactive update)', () => {});
      it('Then other visible items are unaffected', () => {});
    });
    describe('When 10 items are prepended', () => {
      it('Then scroll position is adjusted to keep the same item visible', () => {});
      it('Then no visual jump occurs', () => {});
    });
  });

  describe('Given VirtualScroll container resized from 600px to 400px wide', () => {
    describe('When resize completes', () => {
      it('Then visible items are re-measured', () => {});
      it('Then scroll position preserves the current visible item', () => {});
    });
  });

  describe('Given VirtualScroll with onReachEnd', () => {
    describe('When the user scrolls within 200px of the bottom', () => {
      it('Then onReachEnd fires once', () => {});
    });
    describe('When new items are appended while still near the bottom', () => {
      it('Then onReachEnd fires again (items.length changed)', () => {});
    });
  });

  describe('Given VirtualScroll with scrollToIndex=500', () => {
    describe('When the component mounts', () => {
      it('Then item 500 is visible in the viewport', () => {});
    });
  });

  describe('Given an item scrolls out of the visible range', () => {
    describe('When checking cleanup', () => {
      it('Then onCleanup callbacks registered inside the item fire', () => {});
      it('Then the item DOM node is removed from the content container', () => {});
    });
  });

  describe('Given VirtualScroll without explicit height', () => {
    describe('When mounted in dev mode', () => {
      it('Then a console warning is emitted about zero height', () => {});
    });
  });
});

describe('Feature: Compiler transform for VirtualScroll', () => {
  describe('Given .map() inside VirtualScroll with key prop', () => {
    it('Then compiler generates __createVirtualScroll with extracted items/key/render', () => {});
    it('Then renderFn receives reactive item proxy (same as __list)', () => {});
    it('Then getter-based props are generated for component children', () => {});
  });

  describe('Given .map() inside VirtualScroll WITHOUT key prop', () => {
    it('Then compiler emits an error diagnostic', () => {});
  });

  describe('Given VirtualScroll with mixed children (static + .map())', () => {
    it('Then compiler emits an error diagnostic', () => {});
  });

  describe('Given VirtualScroll with no .map() child', () => {
    it('Then compiler emits an error diagnostic', () => {});
  });
});
```

---

## Implementation Plan

### Phase 1: Compiler Transform + Core VirtualScroll

**Deliverable:** `<VirtualScroll>` component with auto-measurement. Compiler recognizes `VirtualScroll` and extracts `.map()` into `__createVirtualScroll()`. DOM structure, scroll tracking, auto-measurement, item lifecycle, keyed reconciliation, accessibility (role/aria), SSR initial render.

**Compiler work:**
- JSX transformer: detect `.map()` inside `VirtualScroll` → generate `__createVirtualScroll()`
- Compiler errors: missing key, wrong children structure
- Dev-mode warning: zero height container

**Runtime work:**
- `__createVirtualScroll()` function in `@vertz/ui/internals`
- Scroll container with `contain: strict`, spacer, content container
- Auto-measurement: batched insert → batched `offsetHeight` → cache → position
- Prefix sum array + binary search
- Passive scroll listener → visible range calculation → render/dispose items
- Reactive scoping (`pushScope`/`popScope`) for each item
- `role="list"`, `role="listitem"`, `aria-setsize`, `aria-posinset`

**Acceptance criteria:**
```ts
describe('Given 1000 items in a 500px container', () => {
  describe('When VirtualScroll renders', () => {
    it('Then DOM contains ~15-20 items (not 1000)', () => {});
    it('Then spacer height reflects estimated + measured heights', () => {});
    it('Then content uses translateY for positioning', () => {});
    it('Then outer container has contain:strict and role=list', () => {});
    it('Then items have role=listitem, aria-setsize=1000, aria-posinset', () => {});
  });
  describe('When scrolled halfway down', () => {
    it('Then items near the middle are in the DOM', () => {});
    it('Then items at the top are not in the DOM', () => {});
    it('Then items that scrolled through have cached heights', () => {});
  });
  describe('When an item scrolls out of view', () => {
    it('Then its onCleanup callbacks fire', () => {});
    it('Then its DOM node is removed', () => {});
  });
});
```

### Phase 2: Polish + Features

**Deliverable:** `onReachEnd`, `scrollToIndex`, `scrollToAlignment`. ResizeObserver on container → smart width-based invalidation. Scroll anchoring for prepends and measurement corrections. Per-item ResizeObserver for async content (images). Font loading handling. Item pooling for fast scroll GC reduction. Keyboard navigation.

**Acceptance criteria:**
```ts
describe('Given VirtualScroll with onReachEnd', () => {
  describe('When user scrolls within reachEndThreshold of bottom', () => {
    it('Then onReachEnd fires once', () => {});
  });
});

describe('Given container width changes from 600px to 400px', () => {
  describe('When resize completes', () => {
    it('Then visible items are re-measured', () => {});
    it('Then scroll position preserves the current visible item', () => {});
  });
});

describe('Given 10 items prepended to the array', () => {
  describe('When reconciliation completes', () => {
    it('Then scrollTop adjusts by measured (not estimated) heights', () => {});
    it('Then no visual jump occurs', () => {});
  });
});

describe('Given scrollToIndex=500', () => {
  describe('When scrollToIndex changes', () => {
    it('Then item 500 scrolls into view with specified alignment', () => {});
  });
});
```

---

## Dependencies

VirtualScroll (Phases 1-2) has **ZERO external dependencies**. Everything is built on existing Vertz primitives (compiler transforms, reactive scoping, DOM helpers).

---

## POC Requirements

### Before Phase 1
1. **Compiler transform POC:** Implement the `VirtualScroll` detection and `.map()` extraction in the JSX transformer on an isolated branch. Verify the generated output matches the expected `__createVirtualScroll()` call for 3 test cases (basic, with options, with complex JSX in the callback).

---

## Future Direction: Headless Layout Engine (Separate Design Doc)

> **This section is vision only — not planned work.** It documents the long-term direction and will get its own design doc, review cycle, and timeline when the time comes.

### The End Goal

Combine a **CSS layout engine** (Yoga or Taffy) with **text measurement** (Pretext) to calculate exact component heights without rendering to DOM. This enables:

1. **Perfect virtualization** — exact heights from frame 1, no scroll corrections
2. **Canvas rendering** — full component layout without a browser
3. **Native app rendering** — same layout engine, different render target
4. **Server-side layout** — SSR knows exact heights, can inline them

### Why Taffy

- **Rust** — natural fit for Vertz Runtime (Rust+V8)
- **Flexbox + CSS Grid** — covers Vertz's layout needs
- **WASM** — works in the browser too
- **Active maintenance** — used by Dioxus, Zed, and other Rust UI projects

### Implementation Layers (High-Level)

1. **Token resolver bridge:** Map Vertz's `css()` tokens to Taffy/Yoga style nodes
2. **Component descriptor extraction:** Compiler analyzes JSX + `css()` to generate layout tree descriptors
3. **Measurement integration:** Taffy's `measure` callback delegates to Pretext for text nodes
4. **VirtualScroll upgrade:** Replace auto-measurement with headless calculation. Same API — just a different internal strategy.

### Text Measurement API (`@vertz/ui/text`)

A general-purpose text measurement utility (Pretext wrapper) is a prerequisite for the headless layout engine. It will be designed in a separate doc covering: `textHeight()`, `prepareText()`, `measureText()`, `themeFont()`, bundle size, accuracy validation, and fallback strategy (Canvas `measureText()` with OffscreenCanvas if Pretext doesn't meet targets).
