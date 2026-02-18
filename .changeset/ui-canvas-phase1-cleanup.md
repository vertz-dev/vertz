---
"@vertz/ui-canvas": minor
---

Breaking changes to `@vertz/ui-canvas` to fix Phase 1 issues before Phase 2:

- `render()` is now async (returns `Promise<CanvasState>`) — migrated to PixiJS v8 `app.init()` API
- `render()` now returns `{ canvas, app, stage, dispose }` — exposes PixiJS Application and stage for scene building
- `destroy()` removed from public API — use `dispose()` from `render()` return value instead
- `@vertz/ui` moved from `devDependencies` to `peerDependencies`
- `bindSignal` internal cleanup (redundant signal read removed)
