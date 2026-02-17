# Canvas Phase 1 Design - PixiJS + Vertz Signals

**Status:** Implemented (PR #360)  
**Related Issue:** #348  
**Date:** 2026-02-16

## Overview

Phase 1 of the Canvas renderer integrates PixiJS with Vertz's reactive signals system. This enables declarative, reactive canvas rendering where PixiJS display objects automatically update when signal values change.

## Architecture

### Core Components

```
@vertz/ui-canvas
├── bindSignal()      - Binds a Vertz signal to a PixiJS property
├── createReactiveSprite() - Creates a sprite with bound position/transform signals
├── render()          - Renders a PixiJS Application to a DOM container
└── destroy()         - Cleans up PixiJS Application and removes from DOM
```

### Signal Integration

The key innovation is using Vertz's `effect()` function to create reactive bindings:

```typescript
function bindSignal<T>(
  sig: Signal<T>,
  displayObject: { [key: string]: unknown },
  property: string,
  transform?: (value: T) => unknown
): DisposeFn {
  const update = () => {
    const value = transform ? transform(sig.value) : sig.value;
    displayObject[property] = value;
  };

  update(); // Set initial value

  // Create effect to track signal and update on changes
  const disposeEffect = effect(() => {
    sig.value; // Track dependency
    update();
  });

  return disposeEffect;
}
```

When the signal updates, the effect automatically runs and updates the PixiJS display object property.

### Memory Management

**Problem:** PixiJS Application instances can leak if not properly destroyed.

**Solution:**
1. `render()` returns a `dispose` function that calls `destroy()`
2. `destroy()` removes the canvas from DOM and calls `app.destroy(true, { children: true, texture: true, baseTexture: true })`
3. Signal bindings return `DisposeFn` that cleanup effect subscriptions

```typescript
const { canvas, dispose } = render(container, { width: 800, height: 600 });

// Later, cleanup:
dispose(); // Removes canvas and destroys PixiJS app
```

## API Design

### `render(container, options)`

Renders a PixiJS canvas to a DOM element.

```typescript
interface CanvasOptions {
  width: number;
  height: number;
  backgroundColor?: number;
}

// Usage
const { canvas, dispose } = render(document.getElementById('app')!, {
  width: 800,
  height: 600,
  backgroundColor: 0x1099bb
});
```

### `bindSignal(signal, displayObject, property, transform?)`

Binds a Vertz signal to any PixiJS display object property.

```typescript
const x = signal(100);
const sprite = new PIXI.Graphics();

const dispose = bindSignal(x, sprite, 'x');

// Signal updates automatically reflect on sprite
x.value = 200; // sprite.x is now 200

dispose(); // Stop tracking
```

### `createReactiveSprite(options, displayObject)`

Creates a sprite with pre-bound transform signals (x, y, rotation, scaleX, scaleY, alpha).

```typescript
const x = signal(10);
const y = signal(20);
const rotation = signal(0);

const sprite = new PIXI.Graphics();
const { dispose } = createReactiveSprite(
  { x, y, rotation },
  sprite
);
```

## Testing Strategy

Tests verify:
1. **Reactive updates:** Signal changes propagate to PixiJS properties
2. **Cleanup:** Disposing bindings stops updates; destroying app releases resources
3. **Multiple bindings:** Each property updates independently
4. **DOM integration:** Canvas mounts/unmounts correctly

## Future Phases

- **Phase 2:** Component-based canvas rendering with JSX
- **Phase 3:** Scene graph management
- **Phase 4:** Asset loading and caching
- **Phase 5:** Animation primitives

## Dependencies

- `pixi.js` - Rendering engine
- `@vertz/ui` - Signal reactivity (`effect`, `Signal`, `DisposeFn`)
