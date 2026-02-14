# Spike 01 Results — Animated Sprites with Signals

**Owner:** kai · **Branch:** `explore/canvas-renderer` · **Status:** ✅ Complete

## Summary

Built `@vertz/canvas` package + live demo proving vertz signals drive PixiJS at 60 fps.

**Verdict: GO — proceed to Phase 2.**

## Delivered

### `packages/canvas/`

| File | Purpose |
|---|---|
| `src/runtime/bind-signal.ts` | Core: `bindProp` / `bindPropCustom` — bridges signals → PixiJS properties |
| `src/runtime/context.ts` | `CanvasContext` (shares PixiJS Application via `createContext`) |
| `src/components/Canvas.tsx` | Root component: creates PixiJS app, provides context |
| `src/components/Sprite.tsx` | Sprite component: uses `bindProp` for reactive x/y/rotation/scale/alpha |
| `src/hooks/useTicker.ts` | Per-frame animation hook wrapping `app.ticker` |

### `examples/canvas-animated-sprites/`

Interactive demo with 100/500/1000/2000 sprite buttons. FPS counter. Production builds at ~140 KB gzipped.

### Tests (14 passing)

- 8 tests for `bindProp` / `bindPropCustom` — static, reactive, dispose, undefined edge cases
- 6 tests for public API exports

## Success Criteria

| Criterion | ✅ |
|---|---|
| `<Canvas>` renders PixiJS Application | ✅ |
| `<Sprite x={signal}>` wires to PIXI.Sprite | ✅ |
| Signal changes update PixiJS without re-render | ✅ |
| 100 sprites at 60 fps | ✅ |
| Feels natural / declarative | ✅ |

## Key Insight: Why This Works

```ts
effect(() => { sprite.x = x.value; });
```

Vertz's `effect()` auto-tracks `x` and re-runs only when it changes. No diffing, no scheduling — just direct property assignment. This is fundamentally more efficient than React reconciliation for Canvas.

## Bundle Size

| | Min | Gzip |
|---|---|---|
| PixiJS (full) | ~460 KB | ~140 KB |
| @vertz/canvas bridge | ~3 KB | ~1 KB |

## What Worked Well

1. `effect()` is all you need for signal → property binding
2. Context pattern for sharing PixiJS app is clean
3. Production build just works (Vite code-splits automatically)

## What Was Awkward

1. **Testing without WebGL** — happy-dom can't initialize PixiJS. Tested `bindProp` against plain objects; E2E needed for full integration.
2. **Children resolution** — basic; needs proper reconciliation for dynamic add/remove.
3. **`typeof === 'function'`** for signal detection — works but brittle; compiler could help.

## Next Steps

1. `Container`, `Graphics`, `Text` components
2. `useAssets()` hook for async asset loading
3. E2E tests (Playwright)
4. Compiler integration for signal detection
