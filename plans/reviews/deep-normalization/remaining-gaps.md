# Deep Normalization — Remaining Gaps

**PR:** #1038 (main feature), follow-up PRs for gaps
**Issue:** #993
**Date:** 2026-03-08
**Updated:** 2026-03-08

This documents everything from the design plan (`plans/deep-normalization.md`) that was NOT implemented in the original PR, and their resolution status.

---

## 1. Missing Tests — ALL RESOLVED

### 1.1 Type-level tests (.test-d.ts) — DONE

Created `packages/ui/src/store/__tests__/deep-normalization.test-d.ts` with `@ts-expect-error` directives verifying `RelationFieldDef` rejects invalid types and missing fields.

### 1.2 Full `query()` integration test with QueryDescriptor — DONE

Created `packages/ui/src/query/__tests__/query-deep-normalization.test.ts` with mock `QueryDescriptor` objects that exercise the full pipeline: `query()` → `normalizeToEntityStore()` → `resolveReferences` → cross-entity reactive updates.

### 1.3 `query()` ref counting integration tests — DONE

The `query-deep-normalization.test.ts` file includes:
1. Get query increments refCount and decrements on dispose
2. Two queries sharing an entity accumulate refCount
3. Transitive refs: post → author → org all get refCount

### 1.4 E2E acceptance test — DONE (consolidated)

`deep-normalization.integration.test.ts` now covers all test groups from the design doc:
- Write-side: one-relation, many-relation, deep nesting, merge enrichment
- Read-side: bare ID resolution, missing → null, transitive refKeys
- Cross-entity reactive propagation
- Memory efficiency
- Ref counting lifecycle (addRef/removeRef through resolve pipeline)
- Backward compat: no schema, passthrough, non-normalized objects

---

## 2. Missing Implementation — ALL RESOLVED

### 2.1 Dev-mode warnings for unexpected relation field types — DONE

Added `console.warn` in `normalize.ts` for unexpected relation field types.

### 2.2 Codegen: relation config filtering (`config === false`) — DONE (at IR level)

The EntityAnalyzer already filters out relations with `config === false` at the IR generation level (`entity-analyzer.ts`: `return boolVal !== false`). Relations marked `false` never enter `EntityRelationIR`, so they never reach codegen.

### 2.3 Codegen: integration test for generated client registering schemas — DONE

Created `packages/integration-tests/src/__tests__/codegen-relation-manifest-eval.test.ts`:
- Cross-package test: `@vertz/codegen` → `@vertz/ui` runtime
- Pipeline: `generateRelationManifest()` → `registerRelationSchema()` → `getRelationSchema()`
- 5 tests covering registration, retrieval, immutability, empty schemas, multi-entity

---

## 3. Additional Work

### 3.1 Compiler: EntityRelationIR enrichment — DONE

Added `type` ('one'/'many') and `entity` (target entity name) fields to `EntityRelationIR`.

- **Type extraction:** `resolveModelRelationTypes()` reads `_type` literal from the model's `RelationDef` generic parameter via ts-morph type resolution.
- **Entity resolution:** `resolveRelationEntities()` builds a table-type-text → entity-name map across all entities and matches relation `_target` return types to identify target entities.

### 3.2 IR Adapter: relation mapping — DONE

Updated `packages/codegen/src/ir-adapter.ts` to map `EntityRelationIR` → `CodegenRelation`:
- Filters to only include relations where both `type` and `entity` are resolved
- Sets `relations` to `undefined` when no relations are fully resolved

### 3.3 Public API exports — DONE

- Exported `registerRelationSchema`, `getRelationSchema`, `resetRelationSchemas_TEST_ONLY` from `@vertz/ui` (required by generated `client.ts`)
- Exported `generateRelationManifest`, `RelationManifestEntry`, `CodegenRelation` from `@vertz/codegen`

---

## 4. Summary

| # | Gap | Status |
|---|-----|--------|
| 1.1 | Type-level tests (.test-d.ts) | DONE |
| 1.2 | query() + QueryDescriptor integration test | DONE |
| 1.3 | query() ref counting integration tests | DONE |
| 1.4 | E2E test consolidation | DONE |
| 2.1 | Dev-mode warnings in normalize.ts | DONE |
| 2.2 | Codegen relation config filtering | DONE |
| 2.3 | Codegen eval integration test | DONE |
| 3.1 | Compiler EntityRelationIR enrichment | DONE |
| 3.2 | IR Adapter relation mapping | DONE |
| 3.3 | Public API exports | DONE |

**All gaps from the design plan are resolved.**
