# Deep Normalization — Remaining Gaps

**PR:** #1038
**Issue:** #993
**Date:** 2026-03-08

This documents everything from the design plan (`plans/deep-normalization.md`) that was NOT implemented in the PR, organized by priority and category.

---

## 1. Missing Tests

### 1.1 Type-level tests (.test-d.ts) — NOT CREATED

The design specifies `packages/ui/src/store/__tests__/deep-normalization.test-d.ts` with:

```typescript
// @ts-expect-error — invalid relation type
const bad: RelationFieldDef = { type: 'invalid', entity: 'users' };

// @ts-expect-error — missing entity field
const bad2: RelationFieldDef = { type: 'one' };
```

**Why it matters:** The TDD rules require type-level tests for type constraints. These verify that `RelationFieldDef` rejects invalid `type` values and missing fields at compile time.

**Effort:** Small — copy from design doc, verify `@ts-expect-error` directives fire.

### 1.2 Full `query()` integration test with QueryDescriptor — NOT CREATED

Phase 3 acceptance criteria:
> **Full query() integration test:** Create a mock `QueryDescriptor` with `_entity` metadata that returns nested data. Verify `query().data` resolves relations and reflects cross-entity changes.

The current tests exercise `resolveReferences` inside a `computed()` (which mimics what `query()` does internally), but don't go through the actual `query()` function with a mock `QueryDescriptor`. This leaves the integration between `query()` → `normalizeToEntityStore()` → `resolveReferences` untested as a connected pipeline.

**Effort:** Medium — requires mocking a `QueryDescriptor` with `_entity` metadata and setting up the entity store singleton.

### 1.3 `query()` ref counting integration tests — NOT CREATED

Phase 4 acceptance criteria list 4 integration tests that exercise ref counting through `query()`:

1. **query normalizes 3 entities → refCount is 1 for each. Dispose query → refCount is 0, orphanedAt is set.**
2. **Two queries reference same entity → refCount is 2. Dispose one → refCount is 1. Dispose second → refCount is 0.**
3. **Transitive refs — query includes post with author. Both post and author have refCount incremented.**
4. **Query refetches with different entity IDs — old refs decremented, new refs incremented.**

The underlying mechanisms (`addRef`/`removeRef`/`updateRefCounts`/`evictOrphans`) are thoroughly unit tested at the EntityStore level. What's missing is verifying that `query()` calls them correctly through the full lifecycle (fetch → resolve → ref count → dispose → deref).

**Effort:** Medium-High — requires mocking the fetch pipeline and entity store singleton, then inspecting ref counts after query lifecycle events.

### 1.4 E2E acceptance test — PARTIAL

The design doc specifies a comprehensive E2E test at `packages/ui/src/store/__tests__/deep-normalization.integration.test.ts` with these test groups:

| Test group | Status |
|---|---|
| Write-side: extracts one-relation | Covered (different test structure) |
| Write-side: extracts many-relation | NOT in integration test (covered in unit tests) |
| Write-side: deep nesting | NOT in integration test (covered in unit tests) |
| Write-side: commitLayer normalizes | NOT in integration test (covered in entity-store unit tests) |
| Read-side: resolves bare ID refs | NOT in integration test (covered in resolve unit tests) |
| Read-side: resolves missing → null | NOT in integration test (covered in resolve unit tests) |
| Read-side: collects transitive refKeys | NOT in integration test (covered in resolve unit tests) |
| Cross-entity propagation | **Covered** |
| Memory efficiency | **Covered** |
| Ref counting + eviction | NOT in integration test (covered in entity-store unit tests) |
| Backward compat: no schema | NOT in integration test (covered in entity-store unit tests) |
| Backward compat: resolveReferences passthrough | NOT in integration test (covered in resolve unit tests) |
| Backward compat: non-normalized objects | NOT in integration test |

The integration test file has 3 tests. The design doc's E2E section specifies ~15 tests across 5 groups. The behaviors ARE tested, but in separate unit test files rather than consolidated into the integration test file as specified.

**Decision needed:** Are the unit tests sufficient, or should the integration test file match the design doc exactly? The unit tests cover the same behaviors — the difference is organizational, not functional.

---

## 2. Missing Implementation

### 2.1 Dev-mode warnings for unexpected relation field types — NOT IMPLEMENTED

Phase 2 changes list:
> Dev-mode warnings for unexpected relation field types

The design doc's adversarial review disposition table (#14) says "Added", but `normalize.ts` contains no `console.warn` calls. The intended behavior: when a relation field contains an unexpected type (e.g., a number instead of a string or object), log a dev-mode warning to help developers debug data shape mismatches.

**Effort:** Small — add `console.warn` in normalize.ts when a relation field value doesn't match expected types (string, object, array, null).

### 2.2 Codegen: relation config filtering (`config === false`) — NOT IMPLEMENTED

Phase 5 changes list:
> Relations with `config === false` (hidden) are NOT registered
> Relations with `config === true` or field selection (`{ field: true }`) ARE registered

Phase 5 acceptance criteria:
> Codegen snapshot test: relations config with field selection (`{ field: true }`) still registers the relation
> Codegen snapshot test: relations config with `false` (hidden) does NOT register the relation

The current implementation reads `CodegenRelation[]` directly from the IR. There is no filtering based on a `config` property because `CodegenRelation` doesn't have one — it only has `{ name, type, entity }`.

**Root cause:** This filtering belongs in the **IR generation layer** (the parser/transformer that builds `CodegenEntityModule` from `EntityDefinition`). The codegen reads whatever relations are on the IR. The parser needs to:
1. Read `EntityDefinition.relations` config
2. Filter out relations with `config === false`
3. Emit only visible relations as `CodegenRelation[]` on the `CodegenEntityModule`

**Effort:** Medium — requires changes in the parser/IR builder (likely `packages/codegen/src/parsers/` or wherever `CodegenEntityModule` is constructed from server-side types). The codegen layer itself is correct — it emits whatever relations are in the IR.

### 2.3 Codegen: integration test for generated client registering schemas — NOT IMPLEMENTED

Phase 5 acceptance criteria:
> Integration test: generated client registers schemas on import, `getRelationSchema` returns them

This would eval the generated `client.ts` code and verify that `getRelationSchema` returns the registered schemas. This is an end-to-end codegen integration test.

**Effort:** Medium — requires setting up a test that generates code, evaluates it, and checks the relation registry.

---

## 3. Summary — Priority Order

| # | Gap | Priority | Effort | Blocking? |
|---|-----|----------|--------|-----------|
| 2.1 | Dev-mode warnings in normalize.ts | Low | Small | No |
| 1.1 | Type-level tests (.test-d.ts) | Medium | Small | No — types work, just untested at compile level |
| 1.2 | query() + QueryDescriptor integration test | Medium | Medium | No — behavior tested at lower level |
| 1.3 | query() ref counting integration tests | Medium | Medium-High | No — mechanisms unit tested |
| 1.4 | E2E test consolidation | Low | Medium | No — behaviors covered in unit tests |
| 2.2 | Codegen relation config filtering | High | Medium | **Yes for full feature** — hidden relations currently leak into the manifest |
| 2.3 | Codegen eval integration test | Low | Medium | No |

**The only functionally blocking gap is 2.2** — without config filtering, relations marked as hidden on the server will still appear in the generated client's relation schema. This doesn't break anything (normalization still works correctly), but it's a correctness issue: the client-side schema should match the server-side visibility config.

Everything else is test coverage improvements — the runtime behavior is correct and well-tested at the unit level.
