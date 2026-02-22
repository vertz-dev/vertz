# @vertz/ui-canvas

## 0.2.0

### Minor Changes

- [#449](https://github.com/vertz-dev/vertz/pull/449) [`935e769`](https://github.com/vertz-dev/vertz/commit/935e769959b113630ef366afed2ed6043bb1181e) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - Breaking changes to `@vertz/ui-canvas` to fix Phase 1 issues before Phase 2:

  - `render()` is now async (returns `Promise<CanvasState>`) — migrated to PixiJS v8 `app.init()` API
  - `render()` now returns `{ canvas, app, stage, dispose }` — exposes PixiJS Application and stage for scene building
  - `destroy()` removed from public API — use `dispose()` from `render()` return value instead
  - `@vertz/ui` moved from `devDependencies` to `peerDependencies`
  - `bindSignal` internal cleanup (redundant signal read removed)

### Patch Changes

- Updated dependencies [[`7385806`](https://github.com/vertz-dev/vertz/commit/7385806922a6fe68296d8580c8c89b3033bf8c8b), [`215635f`](https://github.com/vertz-dev/vertz/commit/215635f4c8ee92826f66b964a107727ad856d81a), [`e878b05`](https://github.com/vertz-dev/vertz/commit/e878b05f640e65d4e2c9037de863d5d05026f7a8)]:
  - @vertz/ui@0.2.1
