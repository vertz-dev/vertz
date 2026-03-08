# Deep Normalization — Remaining Gaps

**PR:** #1038
**Issue:** #993
**Date:** 2026-03-08
**Updated:** 2026-03-08

This documents everything from the design plan (`plans/deep-normalization.md`) that was NOT implemented in the PR, organized by priority and category.

---

## 1. Missing Tests

### 1.1 Type-level tests (.test-d.ts) — DONE ✓

Implemented in commit `d47ff78c`. Created `packages/ui/src/store/__tests__/deep-normalization.test-d.ts` with `@ts-expect-error` directives verifying `RelationFieldDef` rejects invalid types and missing fields.

### 1.2 Full `query()` integration test with QueryDescriptor — DONE ✓

Implemented in commit `d47ff78c`. Created `packages/ui/src/query/__tests__/query-deep-normalization.test.ts` with mock `QueryDescriptor` objects that exercise the full pipeline: `query()` → `normalizeToEntityStore()` → `resolveReferences` → cross-entity reactive updates.

### 1.3 `query()` ref counting integration tests — DONE ✓

Implemented in commit `d47ff78c`. The `query-deep-normalization.test.ts` file includes:
1. Get query increments refCount and decrements on dispose
2. Two queries sharing an entity accumulate refCount
3. Transitive refs: post → author → org all get refCount

### 1.4 E2E acceptance test — PARTIAL (acceptable)

The behaviors ARE tested across unit and integration test files. Consolidating into a single E2E file is organizational, not functional. The query-deep-normalization integration tests cover the critical end-to-end path.

---

## 2. Missing Implementation

### 2.1 Dev-mode warnings for unexpected relation field types — DONE ✓

Implemented in commit `d47ff78c`. Added `console.warn` in `normalize.ts` for unexpected relation field types.

### 2.2 Codegen: relation config filtering (`config === false`) — DONE ✓ (at IR level)

The EntityAnalyzer already filters out relations with `config === false` at the IR generation level (`entity-analyzer.ts` line 671: `return boolVal !== false`). Relations marked `false` never enter `EntityRelationIR`, so they never reach codegen. The existing test `'excludes false relations'` in entity-analyzer.test.ts verifies this.

### 2.3 Codegen: integration test for generated client registering schemas — LOW PRIORITY

The generated code is thoroughly string-tested in `client-generator.test.ts` (4 tests covering import, emission, ordering, and absence of `registerRelationSchema`). The `registerRelationSchema` function itself is unit-tested. A full eval test would add marginal value.

---

## 3. Additional Work (this session)

### 3.1 Compiler: EntityRelationIR enrichment — DONE ✓

Added `type` ('one'/'many') and `entity` (target entity name) fields to `EntityRelationIR` in `packages/compiler/src/ir/types.ts`.

- **Type extraction:** `resolveModelRelationTypes()` reads `_type` literal from the model's `RelationDef` generic parameter via ts-morph type resolution.
- **Entity resolution:** `resolveRelationEntities()` builds a table-type-text → entity-name map across all entities and matches relation `_target` return types to identify target entities.
- **Type text matching:** Uses `getText()` instead of symbol identity to distinguish generic instantiations (e.g., `TableDef<"users">` vs `TableDef<"posts">`) that share the same `TableDef` symbol.

### 3.2 IR Adapter: relation mapping — DONE ✓

Updated `packages/codegen/src/ir-adapter.ts` to map `EntityRelationIR` → `CodegenRelation`:
- Filters to only include relations where both `type` and `entity` are resolved
- Sets `relations` to `undefined` when no relations are fully resolved (preserves backward compat)

---

## 4. Summary

| # | Gap | Status |
|---|-----|--------|
| 1.1 | Type-level tests (.test-d.ts) | ✓ Done |
| 1.2 | query() + QueryDescriptor integration test | ✓ Done |
| 1.3 | query() ref counting integration tests | ✓ Done |
| 1.4 | E2E test consolidation | Partial (acceptable) |
| 2.1 | Dev-mode warnings in normalize.ts | ✓ Done |
| 2.2 | Codegen relation config filtering | ✓ Done (at IR level) |
| 2.3 | Codegen eval integration test | Low priority — deferred |
| 3.1 | Compiler EntityRelationIR enrichment | ✓ Done |
| 3.2 | IR Adapter relation mapping | ✓ Done |

**All functionally blocking gaps are resolved.** The only remaining items are organizational (E2E consolidation) and low-priority (codegen eval test).
