# Canvas Phase 2 Design - JSX-Based Canvas Rendering

**Status:** Draft
**Related Issue:** #446
**Builds on:** Phase 1 (PR #360) — imperative signal bindings to PixiJS
**Date:** 2026-02-18

---

## Overview

Phase 2 adds a declarative JSX component model to `@vertz/ui-canvas`. Developers write canvas UIs using the same function-component pattern as `@vertz/ui` DOM rendering, but JSX elements resolve to PixiJS display objects instead of DOM nodes. A `<CanvasLayer>` bridge component embeds canvas regions inside a DOM tree, enabling the hybrid DOM/Canvas architecture recommended by the spike.

Phase 1 gave us imperative reactive bindings (`bindSignal`, `createReactiveSprite`). Phase 2 replaces that imperative code with declarative JSX that the framework manages.

---

## API Surface

### Canvas JSX Primitives

`@vertz/ui-canvas` exports a set of intrinsic canvas elements. These are not DOM elements — they map directly to PixiJS display objects.

```typescript
import { signal } from '@vertz/ui';
import { CanvasLayer, Graphics, Sprite, Container, Text } from '@vertz/ui-canvas';

function App() {
  const x = signal(100);
  const y = signal(100);

  return (
    <div>
      <h1>Design Tool</h1>
      <CanvasLayer width={800} height={600} background={0x1a1a2e}>
        <Circle x={() => x.value} y={() => y.value} radius={50} fill={0xff6347} />
        <Rect x={200} y={150} width={120} height={80} fill={0x4ecdc4} />
      </CanvasLayer>
    </div>
  );
}
```

Key observation: **reactive props are passed as accessor functions** `() => signal.value`, consistent with how Vertz's compiler handles reactivity in DOM JSX. Static props are passed as plain values. This is not a new concept — it mirrors exactly how `__attr(el, name, fn)` works in the DOM renderer.

### Intrinsic Canvas Elements

```typescript
// Container — groups children, applies transforms to the group
<Container x={10} y={20} rotation={0.5} alpha={0.8} scale={1.5}>
  {children}
</Container>

// Graphics — procedural drawing via a `draw` callback
<Graphics
  x={0} y={0}
  draw={(g: PIXI.Graphics) => {
    g.rect(0, 0, 100, 50);
    g.fill(0xff0000);
  }}
/>

// Sprite — textured display object
<Sprite
  x={100} y={100}
  texture="assets/player.png"
  anchor={0.5}
  width={64} height={64}
/>

// Text — rendered via Canvas2D pre-rendering (see Hard Problems section)
<Text
  x={50} y={50}
  text="Score: 100"
  style={{ fontSize: 24, fill: 0xffffff, fontFamily: 'Arial' }}
/>
```

### Custom Canvas Components

Canvas components are plain functions, identical to DOM components in Vertz:

```typescript
import { Graphics } from '@vertz/ui-canvas';

interface CircleProps {
  x: number | (() => number);
  y: number | (() => number);
  radius: number | (() => number);
  fill: number | (() => number);
}

function Circle(props: CircleProps) {
  return (
    <Graphics
      x={props.x}
      y={props.y}
      draw={(g) => {
        const r = unwrap(props.radius);
        const color = unwrap(props.fill);
        g.circle(0, 0, r);
        g.fill(color);
      }}
    />
  );
}
```

The `unwrap` utility resolves `T | (() => T)` to `T`. Inside a `draw` callback that runs within an `effect`, accessor calls are tracked automatically.

### Hybrid DOM/Canvas Boundary — `<CanvasLayer>`

`<CanvasLayer>` is the bridge between DOM and Canvas worlds. It is a DOM component that mounts a PixiJS `Application` into the DOM and renders its children as PixiJS display objects.

```typescript
import { CanvasLayer, Container, Graphics } from '@vertz/ui-canvas';
import { signal, watch } from '@vertz/ui';

function DesignTool() {
  const selectedId = signal<string | null>(null);
  const nodes = signal([
    { id: 'a', x: 100, y: 100, width: 80, height: 60 },
    { id: 'b', x: 300, y: 200, width: 120, height: 90 },
  ]);

  return (
    <div class="design-tool">
      <aside class="sidebar">
        {/* Regular DOM — forms, text, accessibility handled by the browser */}
        <h2>Properties</h2>
        <input
          type="number"
          value={() => getSelected(nodes.value, selectedId.value)?.x ?? ''}
          onInput={(e) => updateSelectedX(nodes, selectedId.value, e.target.value)}
        />
      </aside>

      <CanvasLayer width={800} height={600} background={0x1a1a2e}>
        {/* Canvas world — high-performance rendering */}
        <Container>
          {() => nodes.value.map((node) => (
            <SelectableRect
              key={node.id}
              {...node}
              selected={() => selectedId.value === node.id}
              onPointerDown={() => { selectedId.value = node.id; }}
            />
          ))}
        </Container>
      </CanvasLayer>
    </div>
  );
}
```

**How the boundary works:**

1. `<CanvasLayer>` creates a `<div>` in the DOM and initializes a PixiJS `Application` inside it.
2. Children of `<CanvasLayer>` are processed by the **canvas JSX runtime**, not the DOM JSX runtime.
3. Signals cross the boundary freely — a signal created in the DOM scope (like `selectedId`) can be read inside canvas components. The reactive graph is shared; only the rendering target differs.
4. When `<CanvasLayer>` unmounts (DOM disposal), it calls `app.destroy()` and disposes all canvas effects.

### Event Handling

Canvas elements support PixiJS pointer events via the same `on*` convention as DOM:

```typescript
<Graphics
  x={100} y={100}
  draw={(g) => { g.rect(0, 0, 100, 50); g.fill(0x4ecdc4); }}
  interactive={true}
  onPointerDown={(e: FederatedPointerEvent) => {
    console.log('clicked at', e.global.x, e.global.y);
  }}
  onPointerOver={() => { hovered.value = true; }}
  onPointerOut={() => { hovered.value = false; }}
/>
```

Events flow through PixiJS's built-in `FederatedEventSystem`. The canvas JSX runtime calls `displayObject.on('pointerdown', handler)` — no custom event system needed. PixiJS v8's event system already provides bubbling, hit-testing, and propagation for display objects.

**Supported events:** `onPointerDown`, `onPointerUp`, `onPointerMove`, `onPointerOver`, `onPointerOut`, `onPointerEnter`, `onPointerLeave`, `onWheel`, `onClick`, `onRightClick`.

### Lifecycle

Canvas components participate in Vertz's disposal scope system:

```typescript
import { onMount, onCleanup, watch } from '@vertz/ui';
import { Graphics } from '@vertz/ui-canvas';

function AnimatedCircle(props: { x: () => number; y: () => number }) {
  let animFrame: number;

  onMount(() => {
    // Set up animation loop
    function animate() {
      // Update logic here
      animFrame = requestAnimationFrame(animate);
    }
    animate();

    onCleanup(() => {
      cancelAnimationFrame(animFrame);
    });
  });

  return (
    <Graphics
      x={props.x}
      y={props.y}
      draw={(g) => { g.circle(0, 0, 30); g.fill(0xff6347); }}
    />
  );
}
```

**Mount:** When a canvas component's JSX is processed, the component function runs inside a disposal scope. `onMount` and `onCleanup` work identically to DOM components.

**Update:** Signal-driven. When a reactive prop changes, the `effect` bound to that prop runs and updates the PixiJS display object property directly. No reconciliation pass needed.

**Unmount:** When a parent removes a child (e.g., conditional rendering or list change), the disposal scope runs all registered cleanups, the display object is removed from its parent container, and all bound effects are disposed.

---

## Architecture Decision: No Virtual Scene Graph Reconciliation

**Decision: Direct signal binding, no reconciliation.**

This is the most important architectural decision in Phase 2. Here is the rationale:

React Three Fiber and similar libraries use a virtual tree that diffs against the previous tree on every render. This approach exists because React's rendering model is based on re-executing component functions and comparing output.

Vertz does not work this way. Vertz uses fine-grained reactivity — signals notify their dependents directly. There is no "re-render" of a component. When `x.value = 200`, only the effect bound to `x` on that specific display object runs. Nothing else re-executes.

This means:
- **Static structure is set up once** when a component mounts. The JSX tree creates PixiJS display objects and adds them to their parent containers exactly once.
- **Dynamic values update in-place** via effects. `<Graphics x={() => pos.value}>` creates one effect: `effect(() => { graphics.x = pos.value })`. No diffing.
- **Dynamic children** (lists, conditionals) use the same patterns as DOM: accessor functions that return arrays, and the runtime handles add/remove of display objects when the list changes.

This architecture gives us O(1) updates per signal change instead of O(n) tree diffing. It aligns with Vertz's core philosophy — the reactive graph is the source of truth, not a virtual tree.

**Trade-off:** Dynamic structural changes (adding/removing children) require explicit list management rather than "just re-render the array." This is consistent with how Vertz DOM rendering works — you use reactive list patterns, not re-rendering.

---

## JSX Runtime: Canvas JSX Factory

**Decision: Custom `jsxCanvas()` factory activated by `<CanvasLayer>`.**

The canvas JSX runtime is a separate factory function, structurally identical to the DOM `jsx()` factory but producing PixiJS display objects instead of DOM nodes.

### How It Works

1. **`<CanvasLayer>` sets a rendering context.** When `<CanvasLayer>` processes its children, it activates the canvas JSX runtime via a context switch.

2. **Intrinsic elements map to PixiJS constructors.** When the canvas JSX factory encounters a string tag like `"Graphics"`, it creates a `PIXI.Graphics` instance. When it encounters a function, it calls the function (component call).

3. **Props become signal bindings or static assignments.** For each prop:
   - If the value is a function (accessor), create an `effect` that updates the property reactively.
   - If the value is static, assign it directly.
   - Props starting with `on` bind event listeners via `displayObject.on(eventName, handler)`.
   - The `draw` prop on `Graphics` is special — it runs inside an `effect` so reactive values inside the draw callback trigger redraws.

4. **Children are added to the parent `Container`.** The canvas JSX factory returns PixiJS `Container` subclasses. Children are added via `parent.addChild(child)`.

### Implementation Sketch

```typescript
// Internal — not exported to users
function jsxCanvas(
  tag: string | CanvasComponent,
  props: Record<string, unknown>,
): Container {
  if (typeof tag === 'function') {
    // Component call — runs inside a disposal scope
    return runInScope(() => tag(props));
  }

  const displayObject = createDisplayObject(tag); // Maps "Graphics" → new PIXI.Graphics(), etc.
  const cleanups: DisposeFn[] = [];

  for (const [key, value] of Object.entries(props)) {
    if (key === 'children') continue;
    if (key === 'draw' && displayObject instanceof PIXI.Graphics) {
      // Special: draw callback runs in an effect for reactive redraws
      cleanups.push(effect(() => {
        displayObject.clear();
        (value as DrawFn)(displayObject);
      }));
    } else if (key.startsWith('on') && typeof value === 'function') {
      const event = key.slice(2).toLowerCase();
      displayObject.on(event, value);
      cleanups.push(() => displayObject.off(event, value));
    } else if (typeof value === 'function') {
      // Reactive prop — bind via effect
      cleanups.push(effect(() => {
        (displayObject as any)[key] = (value as () => unknown)();
      }));
    } else {
      // Static prop
      (displayObject as any)[key] = value;
    }
  }

  // Process children
  applyCanvasChildren(displayObject, props.children);

  // Register cleanup with the current disposal scope
  onCleanup(() => {
    cleanups.forEach((fn) => fn());
    displayObject.destroy({ children: true });
  });

  return displayObject;
}
```

### Why Not a Compiler Plugin?

A compiler plugin that detects canvas context and generates different output (Option B from the issue) would be more performant at the limit, but:

1. **Premature complexity.** The runtime JSX factory is sufficient for Phase 2 performance targets (1000+ interactive elements at 60fps — proven by the spike).
2. **Compiler coupling.** Adding canvas awareness to the Vertz compiler creates a maintenance burden. The compiler currently handles DOM transforms only; canvas is better as a separate concern.
3. **Future option preserved.** If profiling reveals the runtime factory is a bottleneck, a compiler plugin can be added later as an optimization without changing the developer-facing API.

The compiler remains free to optimize canvas JSX in the future (e.g., statically analyzing which props are reactive and generating direct `effect()` calls instead of runtime checks). But Phase 2 ships with the runtime factory.

---

## Hard Problems — Recommended Solutions

### 1. Text Rendering

**Approach: PixiJS's built-in `PIXI.Text` with Canvas2D backend.**

PixiJS v8 renders text by drawing to an offscreen Canvas2D context and uploading the result as a texture. This handles fonts, wrapping, and alignment without us building anything.

```typescript
<Text
  x={50} y={20}
  text={() => `Score: ${score.value}`}
  style={{ fontSize: 24, fill: 0xffffff, fontFamily: 'Arial' }}
/>
```

The `text` prop can be reactive. When it changes, the effect calls `textDisplayObject.text = newValue`, which triggers PixiJS's internal re-render of the text texture.

**Trade-off:** Canvas2D text rendering is not pixel-perfect across all browsers and has a performance cost for frequent updates (texture re-upload). For Phase 2, this is acceptable. Phase 3+ can explore MSDF fonts for performance-critical text if profiling warrants it.

**Not in scope:** Rich text editing, text selection, or cursor management. Those require DOM overlays and are explicitly Phase 4+ work.

### 2. Accessibility

**Approach: Hidden DOM mirror for critical interactive elements.**

Canvas content is invisible to screen readers. The `<CanvasLayer>` component maintains an optional hidden DOM subtree (visually hidden, `aria-hidden="false"`, positioned absolutely behind the canvas) that mirrors the semantic structure of the canvas scene.

```typescript
<CanvasLayer width={800} height={600} accessible={true}>
  <InteractiveRect
    x={100} y={100} width={80} height={60}
    label="Node A"  // This prop generates a hidden DOM element with aria-label
    role="button"
    onPointerDown={() => select('a')}
  />
</CanvasLayer>
```

When `accessible={true}`:
1. `<CanvasLayer>` creates a hidden `<div>` overlay with `aria-hidden="false"`.
2. Each canvas element with a `label` prop gets a corresponding hidden DOM element positioned to match the canvas element's bounding box.
3. The hidden DOM elements have `role`, `aria-label`, and keyboard event handlers.
4. When canvas element positions change (via signals), the hidden DOM mirrors update via the same effects.

**Trade-off:** This doubles the bookkeeping for accessible elements. But it is the industry-standard approach used by Figma, Google Docs Canvas, and others. The alternative — making WebGL intrinsically accessible — does not exist.

**Default:** `accessible={false}` for performance. Developers opt in when building user-facing tools. This is documented prominently.

### 3. Layout Engine — Deferred to Phase 3

Canvas elements in Phase 2 use **absolute positioning only** (`x`, `y` props). There is no Flexbox, Grid, or constraint-based layout.

Rationale: A layout engine (Yoga, Taffy) is a significant dependency and integration effort. Phase 2's goal is proving the component model works. Users who need layout can compute positions themselves using signals — which is actually fine for the primary use cases (design tools, data viz) where positions are data-driven, not flow-based.

Phase 3 will evaluate Yoga (via yoga-wasm-web) or Taffy as a layout engine for canvas.

### 4. DevTools — Minimal Built-in Inspector

Phase 2 ships with a **debug overlay** toggled by a prop:

```typescript
<CanvasLayer width={800} height={600} debug={true}>
  {/* When debug=true, bounding boxes and component names are drawn as overlays */}
</CanvasLayer>
```

The debug overlay draws wireframe bounding boxes around each display object and labels them with their component name. This is implemented as a PixiJS Graphics overlay — no external tooling needed.

Full DevTools integration (interactive tree inspector, signal value viewer) is Phase 4+ work.

---

## Manifesto Alignment

### Explicit over implicit

- Reactive props are explicit: `x={() => pos.value}` vs `x={100}`. The developer sees exactly which props are reactive.
- No hidden reconciliation — the update model is "signal changes, effect runs, display object updates." There is no invisible diffing pass.
- Event handlers are explicit `on*` props, not magic string-based registration.

### Convention over configuration

- One way to write canvas components: function components with JSX, same as DOM.
- One way to make props reactive: accessor functions.
- One boundary component: `<CanvasLayer>`. No alternative APIs for "imperative mode" vs "declarative mode" — Phase 1's imperative API remains for escape hatches, but the recommended path is JSX.

### Compile-time over runtime

- TypeScript types enforce that canvas elements receive valid props. You cannot pass `href` to a `<Graphics>` — the type system catches it.
- The design preserves the option for the Vertz compiler to optimize canvas JSX in the future (static analysis of reactive vs static props).

### Predictability over convenience

- No magic prop merging or spreading into PixiJS objects. Each intrinsic element has a defined prop interface.
- The `draw` callback on `<Graphics>` is an explicit escape hatch for imperative drawing. It is clear that code inside `draw` is imperative, while everything else is declarative.

### LLM-native

- The API surface mirrors `@vertz/ui` DOM patterns. An LLM that knows Vertz DOM rendering can produce correct canvas code on the first try because the patterns are identical.
- Intrinsic elements have self-documenting names: `<Graphics>`, `<Sprite>`, `<Container>`, `<Text>`.
- No decorator-based registration, no string-based lookup, no framework magic.

---

## Non-Goals

1. **Full layout engine** — No Flexbox/Grid for canvas elements. Deferred to Phase 3.
2. **Rich text editing** — No text selection, cursor, or inline editing in canvas. Deferred to Phase 4+.
3. **3D rendering** — This is a 2D canvas renderer. WebGL 3D (Three.js-style) is out of scope entirely.
4. **Server-side rendering of canvas** — `<CanvasLayer>` is client-only. SSR renders a placeholder `<div>` with dimensions; canvas initializes on hydration.
5. **Animation primitives** — Phase 2 does not include a built-in animation system (springs, tweens). Users use `requestAnimationFrame` + signals directly. Animation primitives are Phase 5.
6. **Compiler canvas transforms** — Phase 2 uses a runtime JSX factory. Compiler optimization is a future enhancement.
7. **Full DevTools** — Phase 2 includes a debug overlay only. Interactive inspector is Phase 4+.
8. **Asset loading/caching** — Sprites reference textures by path string; actual asset management (preloading, caching, atlases) is Phase 4.
9. **Drag-and-drop abstraction** — Users implement drag with `onPointerDown`/`onPointerMove`/`onPointerUp` + signals. A higher-level drag abstraction is Phase 5.

---

## Unknowns

### 1. Canvas JSX Runtime Activation — Discussion-resolvable

**Question:** How does the JSX factory switch from DOM mode to canvas mode inside `<CanvasLayer>`?

**Proposed resolution:** `<CanvasLayer>` uses Vertz's `createContext` to provide a canvas rendering context. The canvas JSX factory checks this context. If present, it creates PixiJS display objects. If absent, it falls through to the DOM factory.

In practice, this means `<CanvasLayer>` is a DOM component (it creates the `<div>` and PixiJS `Application`) that renders its children using the canvas JSX factory by setting a context:

```typescript
function CanvasLayer(props: CanvasLayerProps) {
  const div = __element('div');
  const app = new Application({ ... });
  div.appendChild(app.view);

  // Render children into the PixiJS scene graph
  CanvasRenderContext.Provider(app.stage, () => {
    const children = resolveCanvasChildren(props.children);
    for (const child of children) {
      app.stage.addChild(child);
    }
  });

  onCleanup(() => app.destroy(true, { children: true }));
  return div;
}
```

This requires that canvas component functions call `jsxCanvas()` instead of `jsx()`. The switch happens because canvas component files import from `@vertz/ui-canvas` which provides the canvas-specific JSX namespace. The TypeScript `jsxImportSource` for canvas files points to `@vertz/ui-canvas/jsx-runtime`.

**Alternative explored and rejected:** Having a single unified JSX factory that checks context at runtime for every element. This adds overhead to all DOM rendering for a feature most components never use.

### 2. Reactive List Rendering in Canvas — Discussion-resolvable

**Question:** How do dynamic lists work inside canvas? DOM rendering uses reactive list primitives (`__list`). Canvas needs an equivalent for add/remove of display objects.

**Proposed resolution:** Implement a `canvasList()` primitive analogous to the DOM list primitive. When the source array signal changes, it diffs the key list and calls `parent.addChild()` / `parent.removeChild()` for additions and removals. Moved items call `parent.setChildIndex()`.

```typescript
// User writes:
<Container>
  {() => nodes.value.map((n) => <Rect key={n.id} x={n.x} y={n.y} />)}
</Container>

// Runtime processes the accessor as a reactive list
```

### 3. Graphics Redraw Performance — Needs POC

**Question:** When a reactive value changes inside a `draw` callback, the current design clears and redraws the entire `Graphics` object. For complex drawings with many paths, this could be expensive. Is `clear() + redraw` fast enough for realistic use cases?

**Resolution strategy:** A focused benchmark during early Phase 2 implementation. Draw a `Graphics` with 100+ paths, update one reactive value per frame, and measure FPS. If `clear() + redraw` drops below 60fps, the fallback is to decompose complex drawings into multiple `Graphics` objects with targeted redraws.

---

## POC Results

**Spike POC:** `spike/canvas-rendering-poc` branch (See spike report: `agents/kai/spike-canvas-summary.md`)

The spike proved:
- PixiJS integrates seamlessly with Vertz's signal system
- Signal overhead is negligible (>1M operations/second)
- Canvas maintains 60fps at 1000+ interactive elements where DOM drops to 15-20fps
- The hybrid DOM/Canvas approach is practical and ergonomic

Phase 1 (PR #360) further validated that `effect()` bindings to PixiJS display objects work correctly with proper cleanup.

---

## Type Flow Map

```
CanvasElementProps<TTag>
  → jsxCanvas(tag, props)
    → createDisplayObject(tag): Container  [PixiJS display object]
    → for reactive props: effect(() => { displayObject[prop] = accessor() })  [Signal<T> → PIXI property]
    → for events: displayObject.on(event, handler)  [EventHandler → FederatedEventSystem]
    → for children: parent.addChild(child)  [Container hierarchy]
```

Detailed per-type flow:

```
GraphicsProps.draw: (g: PIXI.Graphics) => void
  → effect(() => { graphics.clear(); props.draw(graphics) })
  → Signal reads inside draw are tracked → redraw on change

SpriteProps.texture: string
  → PIXI.Assets.load(path) → PIXI.Texture → sprite.texture = texture

ContainerProps.children: CanvasChild[]
  → jsxCanvas() per child → Container → parent.addChild(child)

CanvasLayerProps → DOM <div> + PIXI.Application
  → children rendered via canvas JSX factory into app.stage
  → Signal<T> values cross boundary freely (shared reactive graph)
```

Type-level flow for props:

```
GraphicsProps (interface)
  → jsxCanvas("Graphics", props: GraphicsProps)
    → TypeScript validates: x: number, draw: DrawFn, onPointerDown?: EventHandler
    → @ts-expect-error: <Graphics href="..." /> — "href" does not exist on GraphicsProps
    → @ts-expect-error: <Graphics draw={42} /> — number is not assignable to DrawFn
```

Each intrinsic element has a dedicated props interface. These must be validated with `.test-d.ts` files during implementation.

---

## E2E Acceptance Test

The following test validates the complete Phase 2 feature:

```typescript
describe('Canvas Phase 2: JSX-Based Canvas Rendering', () => {
  describe('Given a CanvasLayer with canvas components', () => {
    describe('When rendering a hybrid DOM/Canvas app', () => {
      it('Then the DOM contains a div with a canvas element inside', () => {
        const container = document.createElement('div');
        // Render: <div><CanvasLayer width={400} height={300}><Graphics .../></CanvasLayer></div>
        // Assert: container has a <canvas> element
        // Assert: canvas dimensions are 400x300
      });
    });

    describe('When a reactive prop changes on a canvas element', () => {
      it('Then the PixiJS display object property updates', () => {
        const x = signal(100);
        // Render: <CanvasLayer><Graphics x={() => x.value} draw={...} /></CanvasLayer>
        // Assert: graphics.x === 100
        x.value = 250;
        // Assert: graphics.x === 250 (updated via effect)
      });
    });

    describe('When a canvas element has interactive={true} and an onPointerDown handler', () => {
      it('Then the handler fires on pointer events', () => {
        const clicked = signal(false);
        // Render: <CanvasLayer><Graphics interactive={true} onPointerDown={() => { clicked.value = true }} /></CanvasLayer>
        // Simulate: pointer event on the graphics display object
        // Assert: clicked.value === true
      });
    });

    describe('When a CanvasLayer unmounts', () => {
      it('Then the PixiJS application is destroyed and effects are disposed', () => {
        const x = signal(100);
        // Render: <CanvasLayer><Graphics x={() => x.value} /></CanvasLayer>
        // Capture reference to app and graphics
        // Unmount the CanvasLayer (trigger disposal scope)
        // Assert: app.destroyed === true
        // Assert: changing x.value does not throw (effect is disposed, not the signal)
      });
    });

    describe('When rendering a dynamic list of canvas elements', () => {
      it('Then adding/removing items from the list updates the scene graph', () => {
        const items = signal([{ id: 'a', x: 10 }, { id: 'b', x: 20 }]);
        // Render: <CanvasLayer><Container>{() => items.value.map(...)}</Container></CanvasLayer>
        // Assert: stage has 2 children
        items.value = [...items.value, { id: 'c', x: 30 }];
        // Assert: stage has 3 children
        items.value = items.value.filter(i => i.id !== 'a');
        // Assert: stage has 2 children, 'a' is removed
      });
    });
  });

  describe('Type safety', () => {
    it('Rejects invalid props on canvas intrinsic elements', () => {
      // @ts-expect-error — "href" does not exist on GraphicsProps
      <Graphics href="https://example.com" />;

      // @ts-expect-error — "draw" is required on Graphics
      <Graphics x={0} y={0} />;

      // @ts-expect-error — number is not assignable to DrawFn
      <Graphics draw={42} />;

      // Valid — no error
      <Graphics x={0} y={0} draw={(g) => { g.rect(0, 0, 10, 10); g.fill(0xff0000); }} />;

      // Valid — reactive x
      <Graphics x={() => someSignal.value} y={0} draw={(g) => {}} />;
    });
  });
});
```

---

## Implementation Phases (Suggested)

### Phase 2a: Core Canvas JSX Runtime
- Canvas JSX factory (`jsxCanvas`)
- Intrinsic element creation (`Graphics`, `Container`, `Sprite`, `Text`)
- Static prop assignment
- Reactive prop binding via `effect()`
- `<CanvasLayer>` bridge component
- Disposal and cleanup

### Phase 2b: Events and Interactivity
- PixiJS event binding (`on*` props)
- `interactive` prop propagation
- Hit area configuration

### Phase 2c: Dynamic Children
- Reactive list rendering for canvas (`canvasList`)
- Conditional rendering (show/hide display objects)
- Keyed list diffing for efficient add/remove

### Phase 2d: Text, Accessibility, and Debug
- `<Text>` element with reactive text content
- Hidden DOM mirror for accessibility (`accessible` prop)
- Debug overlay (`debug` prop)

---

## Dependencies

- `pixi.js` ^8.0.0 (already a dependency from Phase 1)
- `@vertz/ui` (signals, effects, disposal, context)
- No new external dependencies

## Estimated Effort

- **Complexity:** M (Medium)
- **Confidence:** High — Phase 1 and the spike proved the core integration. This is additive.
- **Estimated Time:** 2-3 weeks for all Phase 2 sub-phases.
