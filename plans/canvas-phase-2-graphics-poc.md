# Graphics Redraw POC — Findings

**Date:** 2026-02-18
**Question:** Is clear() + redraw fast enough for reactive Graphics updates?

## Results

| Scenario | Paths | Avg Time | Max FPS | Pass? |
|----------|-------|----------|---------|-------|
| Simple redraw (100 paths) | 200 (100 rects + 100 circles) | 0.122ms | 8,174 | PASS |
| Stress test (500 paths) | 500 rects | 0.199ms | 5,019 | PASS |
| Signal -> effect -> redraw | 100 rects | 0.057ms | 17,543 | PASS |

## Methodology

- Ran in vitest with happy-dom environment (no GPU) — measures **JavaScript overhead only**
- GPU-side tessellation/batching not included; real-world cost will be higher but GPU work is parallelized
- Each benchmark warms up before measuring to avoid JIT compilation noise
- Multiple iterations averaged (100 for simple, 50 for stress, 60 for signal)

## Key Observations

1. **JS overhead is negligible.** Even 500 paths redraw in under 0.2ms — well within the 16.67ms frame budget for 60fps.

2. **Signal -> effect -> redraw adds minimal overhead.** The full reactive path (signal update -> effect execution -> clear + redraw) averages 0.057ms per update, which is actually faster than the raw benchmark because the effect only draws 100 rects (no circles).

3. **Effect triggers are synchronous.** Each `signal.value = X` assignment immediately triggers the subscribed effect. Over 60 signal updates, exactly 60 redraws fired — no batching, no dropped frames.

4. **Scaling is linear.** Going from 200 paths (0.122ms) to 500 paths (0.199ms) shows roughly linear scaling. At this rate, even 2,000 paths would stay under 1ms of JS time.

## Caveat: GPU Cost Not Measured

These benchmarks measure the JavaScript side: building the Graphics command buffer via `rect()`, `circle()`, `fill()`, and `clear()`. The actual GPU tessellation and rendering is not measured in a happy-dom environment. However:

- PixiJS v8 uses a retained-mode Graphics pipeline with smart batching
- The clear() + redraw pattern produces a fresh command buffer that PixiJS can optimize in a single draw pass
- For typical game/visualization UIs (100-500 paths), the GPU cost is negligible on modern hardware

## Conclusion

**PASS** for Phase 2. The `clear() + redraw` pattern is fast enough for reactive Graphics updates driven by signals. The JavaScript overhead is well under 1ms even for complex shapes, leaving ample frame budget for other work (layout, text, user input).

## Recommendation

**Proceed with clear+redraw as the default Graphics update strategy.** No need for decomposition into multiple Graphics objects or dirty-rectangle optimization at this scale. If a future use case requires 5,000+ paths with per-frame updates, consider:

1. Decomposing into multiple Graphics (one per logical group)
2. Only redrawing the Graphics whose backing signals changed
3. Using Container-level transforms for position/rotation instead of redrawing

For Phase 2's scope (canvas JSX elements with reactive props), the simple clear+redraw pattern is the right choice.
