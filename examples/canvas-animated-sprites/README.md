# Canvas Animated Sprites Demo

**Spike 01:** Proof-of-concept showing 100 animated sprites driven by vertz signals, rendered via PixiJS.

## What This Demonstrates

- **Vertz + PixiJS Integration**: Declarative Canvas component wrapping PixiJS Application
- **Signal-Driven Rendering**: Sprite positions updated via vertz signals
- **Reactive Properties**: Position (x, y) automatically updates PixiJS sprites when signals change
- **Animation Loop**: `useTicker` hook provides frame-by-frame updates
- **Physics Simulation**: 100 sprites bouncing with gravity and collision detection
- **Performance**: FPS counter shows real-time performance metrics

## Architecture

### Components

- **`<Canvas>`**: Creates PixiJS Application, provides context to children
- **`<Sprite>`**: Creates PIXI.Sprite, wires signal values to PixiJS properties
- **`useTicker()`**: Hook for per-frame animation loop
- **`CanvasContext`**: Context for sharing PixiJS app across component tree

### How It Works

```typescript
// 1. Signal holds position state
const x = signal(100);
const y = signal(200);

// 2. useTicker updates signals each frame
useTicker((delta) => {
  x.set(x() + velocity * delta);
  y.set(y() + velocity * delta);
});

// 3. Sprite component reactively updates PixiJS sprite
<Sprite x={x()} y={y()} texture="bunny.png" />

// 4. Effect wires signal to PixiJS property
effect(() => {
  sprite.x = x();  // Runs when x() changes
});
```

### Key Insight: Fine-Grained Reactivity

Unlike React's vdom reconciliation, vertz's signals update PixiJS properties **directly**:

- **React approach**: Component renders → vdom diff → apply changes
- **Vertz approach**: Signal changes → effect runs → update PixiJS property

This is more efficient for Canvas rendering where you want surgical updates.

## Running the Demo

From the monorepo root:

```bash
# Install dependencies
bun install

# Start the dev server
cd examples/canvas-animated-sprites
bun run dev
```

Then open http://localhost:3000

## Performance

**Target**: 60 FPS with 100+ sprites

**Results**: 
- ✅ 100 sprites running smoothly
- Each sprite has independent physics (position, velocity, bouncing)
- FPS counter shows real-time performance
- Signals update 100 sprite positions per frame with minimal overhead

## What's Not Implemented (Out of Scope)

- Layout engine (manual positioning only)
- Accessibility (no semantic DOM layer)
- TypeScript strict mode (using `any` for rapid prototyping)
- Comprehensive tests (API tests only, no E2E)
- Multiple textures/variety (all bunnies for simplicity)

## Next Steps (If Spike Succeeds)

1. **Add layout engine**: Integrate Yoga for flexbox-style positioning
2. **Accessibility layer**: Semantic DOM overlay for screen readers
3. **More components**: Container, Graphics, Text
4. **DevTools**: Canvas inspector, signal tracking
5. **Performance profiling**: Measure at 500, 1000, 5000 sprites
6. **Documentation**: Full API docs, migration guide

## Code Structure

```
/examples/canvas-animated-sprites/
├── index.html          # HTML shell with styles
├── app.ts              # Main demo app
├── vite.config.ts      # Vite config with aliases
└── README.md           # This file

/packages/canvas/src/
├── components/
│   ├── Canvas.tsx      # PixiJS Application wrapper
│   └── Sprite.tsx      # PixiJS Sprite wrapper
├── hooks/
│   └── useTicker.ts    # Animation loop hook
├── runtime/
│   └── context.ts      # CanvasContext definition
└── index.ts            # Public exports
```

## Learnings

### What Worked Well

- **Signals → PixiJS properties** feels natural and efficient
- **Context for app sharing** keeps API clean
- **`useTicker` hook** provides familiar animation pattern
- **No boilerplate**: Just write components, signals handle reactivity

### What Was Awkward

- **Manual disposal scopes** in tests (not an issue in real apps)
- **Children resolution** needs more work (current approach is basic)
- **Type safety**: Used `any` for speed, needs proper TypeScript definitions

### Surprises

- **PixiJS initialization is async** (using `app.init()` instead of constructor)
- **Testing canvas code is hard** (happy-dom doesn't support WebGL)
- **Bundle size is acceptable** (~460KB for PixiJS, tree-shakeable)

## Conclusion

✅ **Spike successful!** Vertz signals + PixiJS = smooth, performant Canvas rendering with great DX.

The integration feels natural, performance is solid, and the API is clean. Worth investing in Phase 2 (full MVP).
