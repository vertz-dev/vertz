# Phase 1: Dev-Mode Entity Store Proxy

- **Author:** implementation agent
- **Reviewer:** adversarial review agent
- **Commits:** (single phase, not yet committed)
- **Date:** 2026-03-11

## Changes

- packages/ui/src/store/field-selection-tracker.ts (new)
- packages/ui/src/store/__tests__/field-selection-tracker.test.ts (new)
- packages/ui/src/store/entity-store.ts (modified)
- packages/ui/src/store/types.ts (modified)
- packages/ui/src/store/index.ts (modified)
- packages/ui/src/index.ts (modified)
- packages/ui/src/store/__tests__/entity-store.test.ts (modified)

## CI Status

- [x] `bun test` passed (264 tests across 18 files)
- [x] `tsc --noEmit` passed (@vertz/ui, @vertz/ui-server)
- [x] `biome check` clean (only pre-existing Signal<any> error)

## Review Checklist

- [x] Delivers what the ticket asks for
- [x] TDD compliance (tests before/alongside implementation)
- [x] No type gaps or missing edge cases
- [x] No security issues
- [x] Public API changes match design doc

## Findings

### Initial Review — Changes Requested

| Finding | Severity | Resolution |
|---------|----------|------------|
| BUG-1: shallowEqual triggers spurious warnings through Proxy | High | Fixed: compare against `lastPlainVisible` instead of Proxy-wrapped signal value |
| BUG-2: No warning deduplication (spam on repeated access) | Medium | Fixed: added `_warned` Set with `${type}:${id}:${field}` keys |
| BUG-3: `_selectInfo` Map never evicts stale entries | Medium | Fixed: added `removeEntity()` called from `EntityStore.remove()` and `evictOrphans()` |
| BUG-4: Dead symbol string entries in INTERNAL_PROPS | Low | Fixed: removed unreachable entries |
| GAP-1: No test for Proxy + shallowEqual interaction | Medium | Fixed: added test for merging unchanged data |
| GAP-2: No test for Proxy + optimistic layers | Medium | Fixed: added tests for applyLayer, rollbackLayer, commitLayer |
| GAP-3: No test for nested entity normalization | Low | Acknowledged: Phase 1 doesn't track select on nested relations |
| GAP-4: FieldSelectionTracker exported publicly | Low | Kept: useful for testing and future integration |

### Re-review — Approved

All blocking findings addressed. Code is clean.

## Resolution

All findings from the adversarial review were addressed:
- BUG-1: `_recomputeVisible` now uses `lastPlainVisible` field on EntityEntry for equality comparison, avoiding Proxy interference
- BUG-2: `FieldSelectionTracker._warned` Set deduplicates warnings per (type, id, field) triple
- BUG-3: `removeEntity()` method added, called from `remove()` and `evictOrphans()`
- BUG-4: Removed dead symbol strings from `INTERNAL_PROPS`
- GAP-1/2: Added 4 new entity store tests covering shallowEqual dedup, applyLayer, rollbackLayer, commitLayer
