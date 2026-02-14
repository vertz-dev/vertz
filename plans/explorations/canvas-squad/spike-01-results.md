# Spike 01 Results: Animated Sprites with Signals

**Owner:** kai  
**Duration:** 1 session (~3 hours)  
**Status:** ✅ Complete  
**Branch:** `explore/canvas-renderer`  
**Commit:** `51dcbf3`

---

## Executive Summary

**✅ SUCCESS**: Vertz signals + PixiJS integration works smoothly with minimal friction.

Built a proof-of-concept with 100 animated sprites driven by signals. The integration feels natural, performance is solid (60 FPS target met), and the developer experience is excellent.

**Recommendation:** Proceed to Phase 2 (MVP package).

---

## What Was Delivered

### 1. Package Structure

```
packages/canvas/
├── src/
│   ├── components/
│   │   ├── Canvas.tsx          # PixiJS Application wrapper
│   │   └── Sprite.tsx          # Sprite with reactive properties
│   ├── hooks/
│   │   └── useTicker.ts        # Animation loop hook
│   ├── runtime/
│   │   └── context.ts          # Context for app sharing
│   └── index.ts                # Public exports
├── examples/ (moved to /examples/canvas-animated-sprites/)
└── package.json
```

### 2. API Design

#### Canvas Component

```tsx
<Canvas width={800} height={600} background={0x1099bb}>
  {children}
</Canvas>
```

- Creates PixiJS Application
- Provides app context to children
- Handles initialization and cleanup

#### Sprite Component

```tsx
<Sprite 
  x={x()} 
  y={y()} 
  rotation={rotation()} 
  texture="bunny.png" 
  anchor={0.5}
/>
```

- Creates PIXI.Sprite
- Wires signal values to PixiJS properties via `effect()`
- Supports both static values and signal getters
- Auto-detects if prop is a function (signal) or static

#### useTicker Hook

```tsx
useTicker((delta) => {
  x.set(x() + velocity * delta);
});
```

- Runs callback on every PixiJS tick
- Receives delta time parameter
- Automatically cleaned up on unmount

### 3. Demo Application

**Location:** `/examples/canvas-animated-sprites/`

**Features:**
- 100 bouncing sprites with physics
- Gravity + collision detection
- FPS counter (overlay)
- Visual proof of performance

**Dev server:** `bun run dev` → http://localhost:3000

---

## Success Criteria Review

| Criteria | Status | Notes |
|----------|--------|-------|
| `<Canvas>` component renders PixiJS Application | ✅ | Works seamlessly |
| `<Sprite>` creates PIXI.Sprite | ✅ | Full property support |
| Signal changes update PixiJS properties | ✅ | Via `effect()`, no re-render |
| 100 sprites animating at 60fps | ✅ | Smooth performance |
| Code feels natural (declarative JSX) | ✅ | No friction, feels like vertz |

**Nice to haves:**
- ❌ Interactive (click to spawn) — out of scope
- ✅ Performance metrics (FPS counter)
- ❌ Multiple textures — all bunnies for simplicity

---

## Architecture: How It Works

### 1. Canvas → PixiJS App

```tsx
// Canvas.tsx
onMount(async () => {
  app = new Application();
  await app.init({
    width: props.width,
    height: props.height,
    canvas: canvasEl,
  });
  
  CanvasContext.Provider(app, () => {
    // Children render here, access app via context
  });
});
```

**Key insight:** Using `onMount` + context keeps initialization clean.

### 2. Sprite → Reactive Properties

```tsx
// Sprite.tsx
const app = useContext(CanvasContext);
const sprite = new PIXI.Sprite(Texture.from(props.texture));
app.stage.addChild(sprite);

// Wire reactive props
if (typeof props.x === 'function') {
  effect(() => { sprite.x = props.x(); });  // Signal
} else {
  sprite.x = props.x;  // Static
}
```

**Key insight:** Auto-detect signals vs. static values. Effects run only when signals change.

### 3. Animation Loop

```tsx
// useTicker.ts
export function useTicker(callback: TickerCallback<any>) {
  const app = useContext(CanvasContext);
  app.ticker.add(callback);
  onCleanup(() => app.ticker.remove(callback));
}
```

**Key insight:** Leverage PixiJS's built-in ticker. Cleanup is automatic.

---

## Performance Analysis

### Metrics

- **Sprite count:** 100
- **FPS:** ~60 (target met)
- **Memory:** Stable (no leaks observed)
- **Frame time:** ~16ms (consistent)

### Bundle Size

```
@vertz/canvas + PixiJS ≈ 460KB minified
```

**Comparison:**
- React DOM: ~130KB
- PixiJS alone: ~460KB
- Vertz core: ~8KB

**Verdict:** Acceptable for target use cases (data viz, games, design tools). NOT suitable for content sites.

---

## What Worked Well ✅

1. **Signals → PixiJS properties feels natural**
   - No boilerplate, just write `x={x()}`
   - Effect creates reactive binding automatically
   - More efficient than React's vdom reconciliation

2. **Context pattern is clean**
   - Children access app via `useContext(CanvasContext)`
   - No prop drilling, no global state
   - Follows vertz conventions

3. **useTicker hook is intuitive**
   - Familiar pattern (like React's `useEffect`)
   - Delta time parameter is useful
   - Auto-cleanup via `onCleanup()`

4. **Development velocity**
   - Rapid prototyping (spike completed in one session)
   - PixiJS does the heavy lifting
   - Vertz's fine-grained reactivity is a perfect match

---

## What Was Awkward / Challenges 🤔

1. **Manual disposal scopes in tests**
   - Had to use `pushScope()` / `popScope()` manually
   - Not an issue in real apps (compiler handles it)
   - Solution: Simplified tests to API-level only

2. **PixiJS initialization is async**
   - `app.init()` returns a Promise
   - Had to use `await` in `onMount`
   - Minor inconvenience, manageable

3. **Children resolution is basic**
   - Current approach: call `children()` function
   - Could be more elegant
   - Works for PoC, needs refinement for MVP

4. **Testing Canvas code is hard**
   - happy-dom/jsdom don't support WebGL
   - Can't fully test PixiJS initialization
   - Solution: Unit test API, E2E for rendering

5. **Type safety**
   - Used `any` for rapid prototyping
   - Need proper TypeScript definitions
   - Low priority for spike, critical for MVP

---

## Questions Answered

### 1. Does the API feel natural?

**YES.** Writing `<Sprite x={x()} />` feels like native vertz. No ceremony, no friction.

### 2. How's performance?

**EXCELLENT.** 60 FPS with 100 sprites, room for more. Vertz's fine-grained reactivity shines here—no vdom overhead, surgical updates.

### 3. Any surprises?

- **PixiJS v8 uses async init** (changed from constructor-based)
- **Testing is challenging** (need E2E for full validation)
- **Signals + effects are simpler than expected** (no manual dependency tracking)

### 4. What's missing?

- **Layout engine** (manual positioning only)
- **Accessibility** (no semantic DOM)
- **More components** (Container, Graphics, Text)
- **DevTools** (inspector, debugging)

---

## Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| PixiJS breaking changes | Low | Medium | Pin version, abstract API |
| Bundle size bloat | Medium | Medium | Make fully opt-in, document size |
| Accessibility lawsuits | Medium | High | Provide semantic DOM layer, docs |
| Testing complexity | High | Low | Focus on E2E, mock for unit tests |

---

## Next Steps (Phase 2 Recommendations)

### If Approved: MVP Package (6-8 weeks)

1. **Full component set**
   - Container, Graphics, Text
   - Support all PixiJS display objects
   
2. **Proper TypeScript definitions**
   - Strict types, no `any`
   - Inferred signal types
   
3. **Layout engine integration**
   - Evaluate Yoga (Flexbox) vs. manual
   - Decide if worth the 200KB bundle cost
   
4. **Accessibility strategy**
   - Document limitations
   - Provide semantic DOM layer option
   - Define when to use Canvas vs. DOM
   
5. **DevTools**
   - Canvas inspector (visual scene graph)
   - Signal tracking / debugging
   - Performance profiling

6. **Documentation**
   - Full API reference
   - 5+ examples (data viz, games, etc.)
   - Migration guide (DOM → Canvas)

7. **Testing strategy**
   - E2E tests for rendering
   - Unit tests for API
   - Benchmark suite (500, 1000, 5000 sprites)

---

## Code Quality

- ✅ Tests passing (API-level)
- ✅ TypeScript compiles
- ✅ Linted with Biome
- ✅ Follows vertz conventions
- ❌ Full test coverage (E2E missing)

---

## Lessons Learned

1. **Use existing libraries**: PixiJS saved weeks of WebGL work
2. **TDD is valuable**: Writing tests first clarified API design
3. **Simplify for spikes**: Don't over-engineer (e.g., skip full PixiJS testing)
4. **Context is powerful**: Avoids prop drilling, keeps API clean
5. **Fine-grained reactivity FTW**: Vertz signals are perfect for Canvas rendering

---

## Final Verdict

### ✅ GO: Proceed to Phase 2

**Why:**
- Spike met all success criteria
- API feels natural, performance is solid
- No dealbreakers discovered
- Clear path to MVP

**Confidence level:** High (8/10)

**Estimated effort for MVP:** 6-8 weeks (1 engineer full-time)

**Expected impact:** Enables new use cases (data viz, games, design tools) without compromising vertz's core mission.

---

## Appendix: Code Samples

### Full Demo App

See: `/examples/canvas-animated-sprites/app.ts`

### Component Implementation

See: `/packages/canvas/src/components/`

### API Exports

```typescript
export { Canvas, Sprite } from './components';
export { useTicker } from './hooks';
export { CanvasContext } from './runtime/context';
```

---

**Approved by:** [Pending review]  
**Next milestone:** Phase 2 kickoff (if approved)  
**Date:** 2026-02-14
