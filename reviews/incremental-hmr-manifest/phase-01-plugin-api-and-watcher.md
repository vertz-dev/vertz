# Phase 1: Plugin Manifest Update API + Watcher Integration

- **Author:** claude
- **Reviewer:** claude (self-review, adversarial)
- **Date:** 2026-03-09

## Changes

- `packages/ui-server/src/bun-plugin/types.ts` (modified) — Added `ManifestUpdateResult`, `updateManifest`, `deleteManifest` to `VertzBunPluginResult`
- `packages/ui-server/src/bun-plugin/plugin.ts` (modified) — Implemented `updateManifest()`, `deleteManifest()`, `manifestsEqual()`, `setsEqual()` helpers; imported `regenerateFileManifest`
- `packages/ui-server/src/bun-dev-server.ts` (modified) — Wired file watcher to call `updateServerManifest()` before SSR re-import
- `packages/ui-server/src/diagnostics-collector.ts` (modified) — Added `recordManifestUpdate()` method and HMR manifest fields to snapshot
- `packages/ui-server/src/__tests__/bun-plugin-manifest-hmr.test.ts` (new) — 11 tests covering update, delete, change detection, cache invalidation, debug logging
- `packages/ui-server/src/__tests__/diagnostics-collector.test.ts` (modified) — 2 new tests + updated initial state test for manifest HMR fields

## CI Status

- [x] `bun test` passed — 460 tests, 0 failures (ui-server)
- [x] `bunx tsc --noEmit` passed — 0 new errors in changed packages
- [x] `bunx biome check` passed — 0 new warnings/errors

## Review Checklist

- [x] Delivers what the ticket asks for (#991)
- [x] TDD compliance (tests before/alongside implementation)
- [x] No type gaps or missing edge cases
- [x] No security issues
- [x] Public API changes match design doc (Section 2.2.6, 2.3 Layer 2c)

## Findings

### Approved

**Correctness:**
- `manifestsEqual()` correctly compares export counts, kinds, reactivity types, and signal-api property sets
- Cache invalidation (`manifestsRecord = null`) is correctly triggered only when shape actually changes
- `regenerateFileManifest()` is called with the correct arguments, reusing the existing manifest map
- File watcher correctly reads the changed file's source and calls `updateManifest()` before SSR re-import
- Graceful handling of deleted files (catch block around Bun.file().text())

**Edge cases covered:**
- New file not in initial manifest → changed: true
- Unchanged shape (body-only edit) → changed: false
- Export added/removed → changed: true
- Delete existing file → returns true
- Delete non-existent file → returns false
- Sequential updates verify cache is properly refreshed

**Known limitation (by design):**
- When a file's manifest shape changes, dependent files are NOT automatically recompiled during HMR. They get the updated manifest on the next full page refresh. This matches the design doc's stated acceptable limitation.

**Minor observations:**
- The `_durationMs` parameter in `recordManifestUpdate` is unused (prefixed with underscore). Could be stored for diagnostics but acceptable to defer.
- The watcher integration only handles `.ts`/`.tsx` files (correct — manifest generation skips other file types)

## Resolution

No changes needed. Implementation is correct, well-tested, and aligned with the design doc.
