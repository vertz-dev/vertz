# Design: `<List>` Compound Component Primitive

## Context

Vertz currently has two list rendering paths:

1. **Plain `.map()`** — compiler transforms to `__list()`. Works with VertzQL field selection. No animations.
2. **`<ListTransition>`** — render callback pattern (`children: (item: T) => Node`). Supports enter/exit CSS animations. **Breaks VertzQL field selection** because the callback parameter rename severs the query→field chain.

The goal is a single `<List>` compound component that uses plain `.map()` inside (preserving field selection), while supporting FLIP animations and drag-and-sort.

### Critical compiler gap

The compiler's `transformChildAsValue()` (line 611–653 in `jsx-transformer.ts`) does NOT detect `.map()` calls. It only handles conditionals, reactive expressions, and JSX. Meanwhile, `transformChild()` (for intrinsic element children) DOES detect `.map()` and transforms it to `__list()` (line 566–576).

Since `<List>` is a component (uppercase), its children go through `buildComponentChildrenThunk` → `transformChildAsValue`. The `.map()` inside is left as a raw JS call — no keyed reconciliation, no reactivity.

**This means Phase 1 must add `.map()` detection to `transformChildAsValue`.**

---

## Target API

```tsx
import { List } from '@vertz/ui/components';

// Basic list — no animation
<List>
  {items.map(item => <List.Item key={item.id}>{item.name}</List.Item>)}
</List>

// Animated list — FLIP enter/exit/reorder
<List animate>
  {issues.data.items.map(issue => (
    <List.Item key={issue.id}><IssueCard issue={issue} /></List.Item>
  ))}
</List>

// Custom animation config
<List animate={{ duration: 300, easing: 'ease-in-out' }}>
  {items.map(item => <List.Item key={item.id}>...</List.Item>)}
</List>

// Drag-sortable
<List animate sortable onReorder={(from, to) => reorder(items, from, to)}>
  {items.map(item => (
    <List.Item key={item.id}>
      <List.DragHandle><GripIcon /></List.DragHandle>
      <IssueCard issue={item} />
    </List.Item>
  ))}
</List>

// Polymorphic elements
<List as="div">
  {items.map(item => <List.Item as="div" key={item.id}>...</List.Item>)}
</List>
```

---

## Architecture

### How `.map()` works inside `<List>`

1. **Compiler**: `transformChildAsValue()` gains `.map()` detection → emits `__listValue(items, keyFn, renderFn)` (new runtime helper)
2. **Runtime**: `__listValue()` returns a `DisposableNode` (DocumentFragment with comment markers + reactive reconciliation), same pattern as `__conditional()`
3. **Animation hooks**: `__listValue()` reads a `ListAnimationContext` from the context stack at init time. If present, it calls lifecycle hooks (`onBeforeReconcile`, `onAfterReconcile`, `onItemEnter`, `onItemExit`) during reconciliation
4. **`<List>`**: Provides the `ListAnimationContext` with FLIP logic, then evaluates children. The `__listValue()` call inside children picks up the context.

This works because Vertz's context system is synchronous — `<List>` calls `Provider()`, then evaluates the children thunk, and `__listValue()` runs synchronously within that scope.

### FLIP animation flow

1. `onBeforeReconcile()` → snapshot `getBoundingClientRect()` for all registered items
2. Reconciler runs (add/remove/reorder DOM nodes)
3. `onItemEnter(node, key)` → set `data-presence="enter"` on new items
4. `onItemExit(node, key)` → set `data-presence="exit"`, set `position: absolute` with measured dimensions, return a Promise that resolves when animation completes. Reconciler defers `removeChild` until Promise resolves.
5. `onAfterReconcile()` → for each surviving item: calculate position delta (first rect - last rect), apply `transform: translate(deltaX, deltaY)`, then `requestAnimationFrame` → set `transition` and clear `transform` to animate to final position

### Drag-and-sort flow

1. `<List.DragHandle>` registers `pointerdown` handler via `ListContext`
2. On `pointerdown`: snapshot all item rects, create absolute-positioned ghost clone, track pointer
3. On `pointermove`: move ghost, calculate insertion index from pointer Y vs item midpoints
4. On `pointerup`: remove ghost, call `onReorder(fromIndex, toIndex)`, FLIP animate to new positions
5. `sortable` prop is reactive — toggling it disables/enables the `pointerdown` handler dynamically
6. If no `<List.DragHandle>` exists but `sortable` is true, the entire `<List.Item>` acts as drag handle

---

## Phases

### Phase 1: `__listValue()` runtime + compiler support

**Goal**: Make `.map()` reactive inside any component's children. This alone fixes the field selection problem.

**Files to create:**
- `packages/ui/src/dom/list-value.ts` — new `__listValue()` runtime function

**Files to modify:**
- `packages/ui/src/internals.ts` — export `__listValue`
- `packages/ui-compiler/src/transformers/jsx-transformer.ts` — add `tryTransformListValue()` to `transformChildAsValue()` (around line 628, after conditional detection)
- `packages/ui-compiler/src/compiler.ts` — add `__listValue` to `DOM_HELPERS` array for auto-import detection

**Runtime design:**

```ts
// packages/ui/src/dom/list-value.ts
export function __listValue<T>(
  items: Signal<T[]> | (() => T[]),
  keyFn: ((item: T, index: number) => string | number) | null,
  renderFn: (item: T) => Node,
): DisposableNode {
  const startMarker = document.createComment('lv-s');
  const endMarker = document.createComment('lv-e');
  const fragment = document.createDocumentFragment();
  fragment.appendChild(startMarker);
  fragment.appendChild(endMarker);

  // Reuse core reconciliation logic (same as listTransition)
  // but without animation — basic keyed reconciliation with comment markers
  // ...

  return Object.assign(fragment, { dispose });
}
```

**Compiler change:**

```ts
// In transformChildAsValue(), after conditional detection (line ~633):
if (!isLiteralExpression(exprNode)) {
  const listCode = tryTransformListValue(exprNode, reactiveNames, jsxMap, source);
  if (listCode) return listCode;
}
```

`tryTransformListValue()` is identical to `tryTransformList()` but emits `__listValue(items, keyFn, renderFn)` (no `parentVar` parameter).

**Acceptance criteria:**

```typescript
describe('Feature: __listValue for .map() in component children', () => {
  describe('Given a .map() call inside component JSX children', () => {
    describe('When the compiler transforms the JSX', () => {
      it('Then emits __listValue() instead of raw .map()', () => {})
      it('Then extracts key function from JSX key prop', () => {})
      it('Then wraps source array in getter for reactivity', () => {})
    })
  })
  describe('Given __listValue with a signal-backed array', () => {
    describe('When the array signal changes', () => {
      it('Then DOM nodes are reactively added/removed', () => {})
      it('Then existing nodes are reused by key', () => {})
      it('Then removed nodes are disposed', () => {})
    })
  })
  describe('Given __listValue without key function', () => {
    describe('When array changes', () => {
      it('Then uses full-replacement mode (unkeyed)', () => {})
    })
  })
})
```

---

### Phase 2: Basic `<List>` + `<List.Item>` compound component

**Goal**: Functional compound component with polymorphic `as` prop, context distribution, theme integration. No animation yet.

**Files to create:**
- `packages/ui-primitives/src/list/list-composed.tsx` — unstyled `<List>`, `<List.Item>`, `<List.DragHandle>` (inert in this phase)
- `packages/ui-primitives/src/list/__tests__/list-composed.test.tsx` — unit tests
- `packages/theme-shadcn/src/styles/list.ts` — CSS styles
- `packages/theme-shadcn/src/components/primitives/list.tsx` — themed wrapper

**Files to modify:**
- `packages/ui-primitives/src/index.ts` — export `ComposedList`
- `packages/theme-shadcn/src/configure.ts` — register List in theme
- `packages/ui/src/components/index.ts` — add `List` proxy via `createCallableSuiteProxy('List', ['Item', 'DragHandle'])`
- `packages/ui/src/components/types.ts` — add List to `ThemeComponentMap`

**Type signatures:**

```ts
interface ListProps {
  as?: keyof HTMLElementTagNameMap;  // default: 'ul'
  animate?: boolean | AnimateConfig;
  sortable?: boolean;
  onReorder?: (fromIndex: number, toIndex: number) => void;
  children?: ChildValue;
  className?: string;
}

interface AnimateConfig {
  duration?: number;  // ms, default: 200
  easing?: string;    // default: 'ease-out'
}

interface ListItemProps {
  as?: keyof HTMLElementTagNameMap;  // default: 'li'
  children?: ChildValue;
  className?: string;
}

interface ListDragHandleProps {
  children?: ChildValue;
  className?: string;
}
```

**Component structure follows Dialog/Tabs pattern:**

```ts
export const ComposedList = Object.assign(ComposedListRoot, {
  Item: ComposedListItem,
  DragHandle: ComposedListDragHandle,
});
```

**Acceptance criteria:**

```typescript
describe('Feature: Basic <List> compound component', () => {
  describe('Given <List> with <List.Item> children via .map()', () => {
    describe('When rendered', () => {
      it('Then renders <ul> with <li> children', () => {})
      it('Then items update reactively when source array changes', () => {})
    })
  })
  describe('Given <List as="div"> with <List.Item as="div">', () => {
    describe('When rendered', () => {
      it('Then renders <div> elements instead', () => {})
    })
  })
  describe('Given <List> imported from @vertz/ui/components', () => {
    describe('When used with theme registered', () => {
      it('Then List, List.Item, List.DragHandle are available', () => {})
      it('Then theme classes are applied', () => {})
    })
  })
})
```

---

### Phase 3: FLIP animations (enter/exit/reorder)

**Goal**: Full FLIP animation support — enter, exit with height collapse, reorder with position animation.

**Files to create:**
- `packages/ui/src/dom/list-animation-context.ts` — `ListAnimationContext` and lifecycle hook types
- `packages/ui/src/dom/flip.ts` — FLIP utility: snapshot, invert, play
- `packages/ui-primitives/src/list/__tests__/list-animation.test.tsx` — animation tests

**Files to modify:**
- `packages/ui/src/dom/list-value.ts` — read `ListAnimationContext`, call lifecycle hooks during reconciliation
- `packages/ui/src/internals.ts` — export animation context
- `packages/ui-primitives/src/list/list-composed.tsx` — provide `ListAnimationContext` with FLIP logic when `animate` is truthy
- `packages/ui/src/dom/animation.ts` — reuse `onAnimationsComplete()`

**Lifecycle hooks interface:**

```ts
interface ListAnimationHooks {
  onBeforeReconcile: () => void;
  onAfterReconcile: () => void;
  onItemEnter: (node: Node, key: string | number) => void;
  onItemExit: (node: Node, key: string | number, done: () => void) => void;
}
```

**Exit animation with height collapse:**

1. `onItemExit` is called with the node and a `done` callback
2. Measure the item's height via `getBoundingClientRect()`
3. Set explicit `height: <measured>px`, `overflow: hidden`
4. Set `data-presence="exit"`
5. Wait for CSS animation (via `onAnimationsComplete`)
6. Call `done()` — reconciler removes the node from DOM

**FLIP reorder animation:**

1. `onBeforeReconcile` → `firstRects = Map<key, DOMRect>` for all registered items
2. Reconciler runs, DOM is mutated
3. `onAfterReconcile` → for each item still present:
   - `lastRect = el.getBoundingClientRect()`
   - `deltaY = firstRect.top - lastRect.top`
   - Apply `transform: translateY(deltaY)` (instant, puts element in old position)
   - `requestAnimationFrame` → set `transition: transform <duration>ms <easing>`, clear transform
   - On `transitionend` → clear `transition`

**Acceptance criteria:**

```typescript
describe('Feature: List FLIP animations', () => {
  describe('Given <List animate> with items', () => {
    describe('When a new item is added (not first render)', () => {
      it('Then item gets data-presence="enter"', () => {})
      it('Then data-presence is cleared after CSS animation', () => {})
      it('Then first-render items do NOT get data-presence', () => {})
    })
    describe('When an item is removed', () => {
      it('Then item gets data-presence="exit"', () => {})
      it('Then item height animates to 0 (overflow hidden)', () => {})
      it('Then DOM removal is deferred until animation completes', () => {})
      it('Then remaining items FLIP-animate to new positions', () => {})
    })
    describe('When items are reordered', () => {
      it('Then moved items FLIP-animate via transform', () => {})
      it('Then non-moved items are unaffected', () => {})
    })
  })
  describe('Given animate={{ duration: 300, easing: "ease-in-out" }}', () => {
    it('Then custom duration and easing are used for FLIP', () => {})
  })
  describe('Given prefers-reduced-motion', () => {
    it('Then animations are skipped (instant transitions)', () => {})
  })
})
```

---

### Phase 4: Drag-and-sort

**Goal**: Drag-and-drop reordering with `<List.DragHandle>` and reactive `sortable` prop.

**Files to modify:**
- `packages/ui-primitives/src/list/list-composed.tsx` — implement drag logic in `<List>`, `<List.DragHandle>` registration
- `packages/theme-shadcn/src/styles/list.ts` — drag ghost, insertion indicator, dragging state CSS

**Files to create:**
- `packages/ui-primitives/src/list/__tests__/list-drag.test.tsx` — drag tests

**Drag mechanics:**

- `<List.DragHandle>` registers a `pointerdown` handler via `ListContext`
- On drag: clone item as absolute-positioned ghost, track pointer globally
- Insertion index calculated from pointer Y vs item midpoints
- `onReorder(fromIndex, toIndex)` called on drop
- If `sortable` but no `<List.DragHandle>`, the entire `<List.Item>` is the handle
- `sortable` is reactive: toggling it on/off dynamically enables/disables drag
- `data-dragging` attribute on the dragged item for CSS styling
- `data-list-drag-ghost` on the ghost element
- FLIP animation on drop (reuses Phase 3 infrastructure)

**Acceptance criteria:**

```typescript
describe('Feature: List drag-and-sort', () => {
  describe('Given <List sortable onReorder={fn}> with DragHandle', () => {
    describe('When drag sequence (pointerdown→move→up)', () => {
      it('Then onReorder is called with correct indices', () => {})
      it('Then items FLIP-animate to new positions', () => {})
    })
  })
  describe('Given sortable={false}', () => {
    it('Then DragHandle pointerdown does nothing', () => {})
  })
  describe('Given sortable toggles from false to true reactively', () => {
    it('Then DragHandle becomes interactive', () => {})
  })
  describe('Given <List sortable> without DragHandle', () => {
    it('Then entire List.Item acts as drag handle', () => {})
  })
})
```

---

### Phase 5: Deprecation, migration, docs

**Goal**: Deprecate `ListTransition`, migrate examples, update docs.

**Files to modify:**
- `packages/ui/src/component/list-transition.ts` — add `@deprecated` JSDoc pointing to `<List animate>`
- Example apps — migrate `ListTransition` usage to `<List animate>`
- `packages/docs/` — document `<List>`, update field selection guide

---

## Key files reference

| File | Role |
|------|------|
| `packages/ui/src/dom/list.ts` | Current `__list()` runtime — reference for reconciliation logic |
| `packages/ui/src/dom/list-transition.ts` | Current `listTransition()` — reference for enter/exit animation + comment markers |
| `packages/ui/src/dom/animation.ts` | `onAnimationsComplete()` — reuse for enter/exit |
| `packages/ui/src/dom/conditional.ts` | `__conditional()` — pattern for `DisposableNode` return |
| `packages/ui-compiler/src/transformers/jsx-transformer.ts` | Compiler: `transformChildAsValue` (line 611), `tryTransformList` (line 759) |
| `packages/ui-compiler/src/compiler.ts` | `DOM_HELPERS` array for auto-import detection |
| `packages/ui/src/internals.ts` | Internal exports for DOM helpers |
| `packages/ui-primitives/src/dialog/dialog-composed.tsx` | Pattern reference: compound component |
| `packages/ui/src/components/index.ts` | Component proxy exports |
| `packages/theme-shadcn/src/configure.ts` | Theme registration |

## Verification

After each phase:
1. `bun test` — all tests pass (including new phase tests)
2. `bun run typecheck` — types clean
3. `bun run lint` — lint clean
4. Phase-specific: compile a `.tsx` file with `.map()` inside `<List>` and verify the output contains `__listValue()` (Phase 1)
5. End-to-end: build an example with `<List animate>` and verify field selection works + animations play (Phase 3+)
