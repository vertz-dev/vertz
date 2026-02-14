# Canvas Rendering Spike

**Status:** ✅ Complete  
**Branch:** `spike/canvas-rendering-poc`  
**Date:** 2026-02-14

## What is this?

A proof-of-concept exploring Canvas/WebGL rendering as an alternative render target for Vertz. Built with PixiJS v8 and Vertz-inspired signals.

## Quick Start

```bash
# Install dependencies
npm install

# Run the demo (side-by-side DOM vs Canvas comparison)
npm run dev

# Run headless benchmarks
npx tsx src/benchmark.ts
```

Open http://localhost:3000 to see the interactive demo.

## What it demonstrates

- ✅ Vertz signals driving PixiJS scene graph
- ✅ 100+ interactive draggable nodes
- ✅ Side-by-side DOM vs Canvas comparison
- ✅ FPS counters for performance monitoring
- ✅ Shared reactive data layer between renderers

## Key Files

- `src/signal.ts` - Simplified fine-grained reactivity
- `src/dom-renderer.ts` - Traditional DOM rendering
- `src/canvas-renderer.ts` - PixiJS/WebGL rendering
- `src/main.ts` - Demo application
- `FINDINGS.md` - Comprehensive analysis and recommendations
- `ARCHITECTURE.md` - Technical architecture details

## Performance Results

**Signal overhead (headless benchmark):**
- 100 nodes: 1.4M ops/sec (0.0007ms per update)
- 500 nodes: 1.4M ops/sec (0.0007ms per update)  
- 1000 nodes: 5.7M ops/sec (0.0002ms per update)

**Conclusion:** Signal overhead is negligible. Renderer is the bottleneck, not reactivity.

## Recommendations

**Build a hybrid approach:**
- Use DOM for text, forms, structure
- Use Canvas for high-performance graphics zones
- Use Vertz signals to coordinate both

**Timeline:**
- 3 months: Core Canvas renderer (`@vertz/canvas`)
- 6 months: + Layout engine
- 12 months: Production-ready with accessibility

See `FINDINGS.md` for full analysis.

## Tech Stack

- **PixiJS 8** - WebGL/Canvas rendering
- **Vite** - Build tool
- **TypeScript** - Type safety
- **Simplified signals** - Inspired by Vertz's reactivity system

## Limitations

This is spike-quality code:
- No tests
- Simplified signal implementation (no batching, proper cleanup)
- No layout engine (manual positioning only)
- No accessibility layer
- Basic text rendering (Canvas2D fallback)

For production, see recommendations in `FINDINGS.md`.

## Questions?

Read `FINDINGS.md` for comprehensive analysis, or ping Kai (@kai).
