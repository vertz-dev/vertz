# Canvas Rendering POC - Architecture

## Overview

This spike explores using PixiJS (WebGL/Canvas) as an alternative render target for Vertz's reactive UI framework. The goal is to achieve better performance for graphics-intensive UIs by bypassing the DOM.

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                     Application Layer                        │
│  ┌─────────────────┐              ┌──────────────────┐      │
│  │   User Input    │              │  Controls/State  │      │
│  └────────┬────────┘              └────────┬─────────┘      │
│           │                                 │                │
└───────────┼─────────────────────────────────┼────────────────┘
            │                                 │
            ▼                                 ▼
┌─────────────────────────────────────────────────────────────┐
│                    Reactive Layer (Signals)                  │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  Signal<T> - Fine-grained reactive primitives        │   │
│  │  • Automatic dependency tracking                     │   │
│  │  • Minimal re-computation (no vdom diffing)          │   │
│  │  • effect() for side effects                         │   │
│  └──────────────────────────────────────────────────────┘   │
└────────┬─────────────────────────────────────┬───────────────┘
         │                                     │
         │        Both consume signals         │
         │                                     │
    ┌────▼─────┐                        ┌─────▼──────┐
    │   DOM    │                        │   Canvas   │
    │ Renderer │                        │  Renderer  │
    └────┬─────┘                        └─────┬──────┘
         │                                     │
         ▼                                     ▼
    ┌──────────┐                        ┌────────────┐
    │  div/css │                        │  PixiJS    │
    │ elements │                        │ (WebGL/2D) │
    └──────────┘                        └────────────┘
```

## Key Components

### 1. Signal System (`signal.ts`)

Simplified implementation of Vertz's fine-grained reactivity:

```typescript
class Signal<T> {
  private _value: T;
  private _subscribers: Set<Subscriber>;
  
  get value(): T {
    // Auto-track dependencies during effect execution
    if (currentSubscriber) {
      this._subscribers.add(currentSubscriber);
    }
    return this._value;
  }
  
  set value(newValue: T) {
    if (Object.is(this._value, newValue)) return;
    this._value = newValue;
    this._notify(); // Trigger all subscribers
  }
}
```

**Key advantages:**
- **No virtual DOM diffing** - Direct signal → renderer updates
- **Surgical updates** - Only changed signals notify subscribers
- **Automatic tracking** - Dependencies are captured during execution
- **Batching support** - Multiple updates can be batched (not implemented in spike)

### 2. DOM Renderer (`dom-renderer.ts`)

Traditional DOM-based rendering:

```typescript
effect(() => {
  element.style.left = `${node.x.value}px`;
  element.style.top = `${node.y.value}px`;
});
```

**Characteristics:**
- Creates actual DOM elements (`<div>` with CSS)
- Uses CSS for styling and positioning
- Browser handles layout, hit testing, and accessibility
- Each update triggers style recalculation and repaint

### 3. Canvas Renderer (`canvas-renderer.ts`)

PixiJS-based WebGL/Canvas rendering:

```typescript
effect(() => {
  graphics.x = node.x.value;
  graphics.y = node.y.value;
});
```

**Characteristics:**
- Renders to a single `<canvas>` element
- PixiJS manages WebGL scene graph
- Manual hit testing via PixiJS pointer events
- Entire canvas redraws each frame (but GPU-accelerated)

## Signal-to-Renderer Flow

```
User drags node
    │
    ▼
node.x.value = newX  ← Signal update
    │
    ▼
effect() fires  ← Subscriber notification
    │
    ├─→ DOM: element.style.left = "Xpx"
    │       └─→ Browser layout/paint
    │
    └─→ Canvas: graphics.x = X
            └─→ PixiJS scene graph update
                └─→ Next frame render
```

## Performance Considerations

### DOM Rendering Bottlenecks
1. **Style recalculation** - Every position change triggers CSS recalc
2. **Layout thrashing** - Reading/writing layout properties in loops
3. **Paint/Composite** - Each element is a separate layer
4. **Memory overhead** - Each node = multiple DOM objects

### Canvas Rendering Advantages
1. **Single element** - Only one `<canvas>` in the DOM
2. **GPU acceleration** - WebGL offloads to GPU
3. **Batched rendering** - All updates applied in single frame
4. **Lower memory per node** - Just JavaScript objects + GPU textures

### Canvas Rendering Challenges
1. **Text rendering** - Complex, requires custom solution or canvas 2D fallback
2. **Accessibility** - Canvas is invisible to screen readers
3. **Layout** - Need custom layout engine (Yoga/Taffy)
4. **Hit testing** - Manual implementation required
5. **Retina/scaling** - Must handle devicePixelRatio manually

## Integration with Vertz

### Current Architecture
Vertz uses a compiler-based approach:
```
JSX → Compiler → VNode → Renderer → DOM
```

### Proposed Hybrid Architecture
```
JSX → Compiler → VNode → Renderer → DOM (structure/text)
                            └────────→ Canvas (graphics)
```

### Renderer Abstraction

Vertz already has a VNode abstraction that could support multiple backends:

```typescript
interface VNode {
  type: string | Component;
  props: Record<string, any>;
  children: VNode[];
}

interface Renderer {
  createElement(vnode: VNode): Element;
  updateElement(element: Element, vnode: VNode): void;
  removeElement(element: Element): void;
}
```

Canvas renderer would implement this interface, translating VNodes to PixiJS scene graph nodes.

## Trade-offs Summary

| Aspect | DOM | Canvas |
|--------|-----|--------|
| Performance (100 nodes) | Good | Excellent |
| Performance (1000+ nodes) | Degrades | Stable |
| Text rendering | Native | Complex |
| Accessibility | Native | Manual |
| Layout | CSS | Custom engine |
| Developer experience | Familiar | Specialized |
| Bundle size | 0KB | ~500KB+ (PixiJS) |
| Mobile performance | Variable | GPU-dependent |

## Recommended Use Cases

### Use DOM when:
- Text-heavy interfaces
- Forms and inputs
- Accessibility is critical
- Standard layouts (flex, grid)
- < 500 interactive elements

### Use Canvas when:
- 1000+ simultaneous elements
- Heavy animation (particles, physics)
- Data visualization (charts, graphs)
- Design tools (Figma-like)
- Game-like interfaces
- Mobile WebGL is available

### Hybrid approach (recommended):
- DOM for structure, navigation, text
- Canvas for performance-critical zones
- Use Vertz signals to coordinate both
