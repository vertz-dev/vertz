# Review: OpenAPI Shorter Fallback Type Names

- **Author:** osaka
- **Reviewer:** adversarial-review-agent
- **Commits:** 889fcdbe2..e4649ed9f
- **Date:** 2026-04-02

## CI Status

- [x] Quality gates passed (257 tests pass, typecheck clean, lint clean)

## Review Checklist

- [x] Delivers what the ticket asks for
- [x] TDD compliance (tests written alongside implementation)
- [ ] No type gaps or missing edge cases (see Findings)
- [x] No security issues
- [x] Public API changes match design doc

## Changes

- `packages/openapi/src/parser/operation-id-normalizer.ts` (modified) -- added `deriveTypePrefix()` and helpers
- `packages/openapi/src/parser/openapi-parser.ts` (modified) -- sets `typePrefix` on every parsed operation
- `packages/openapi/src/parser/types.ts` (modified) -- added optional `typePrefix` field to `ParsedOperation`
- `packages/openapi/src/generators/resource-generator.ts` (modified) -- uses `getTypePrefix()` instead of `toPascalCase(op.operationId)`
- `packages/openapi/src/generators/types-generator.ts` (modified) -- same
- `packages/openapi/src/generators/schema-generator.ts` (modified) -- same
- `packages/openapi/src/parser/__tests__/operation-id-normalizer.test.ts` (modified) -- 6 new tests for `deriveTypePrefix`
- `packages/openapi/src/parser/__tests__/openapi-parser.test.ts` (modified) -- updated snapshots with `typePrefix`
- `packages/openapi/src/generators/__tests__/resource-generator.test.ts` (modified) -- 1 new test
- `packages/openapi/src/generators/__tests__/types-generator.test.ts` (modified) -- 1 new test
- `packages/openapi/src/generators/__tests__/schema-generator.test.ts` (modified) -- 1 new test
- `.changeset/openapi-shorter-type-names.md` (new) -- patch changeset

## Findings

### BLOCKER: `deriveTypePrefix()` can produce collisions for operations within the same resource

**Severity:** Blocker

Two different operations that share the same "meaningful prefix" but differ only in path segments that get stripped will produce identical `typePrefix` values. When both operations are in the same resource (same tag), this causes **silent data loss**: the `emitted` Set in all three generators deduplicates by type name, so the second operation's Response/Query/Input interface is silently skipped.

**Confirmed collision scenarios:**

| operationId A | path A | operationId B | path B | Both produce |
|---|---|---|---|---|
| `get_tasks_api_v1_tasks_get` | `/api/v1/tasks` | `get_tasks_api_v2_tasks_get` | `/api/v2/tasks` | `GetTasks` |
| `list_items_api_items_get` | `/api/items` | `list_items_web_items_get` | `/web/items` | `ListItems` |
| `list_tasks_v1_tasks_get` | `/v1/tasks` | `list_tasks_v2_tasks_get` | `/v2/tasks` | `ListTasks` |

These are realistic: API versioning (`/v1/tasks`, `/v2/tasks`) is common, and APIs that expose the same resource under multiple path prefixes (`/api/`, `/web/`, `/internal/`) are exactly what this PR was designed to fix (the issue references FastAPI specs with these patterns).

The old behavior (using the full `toPascalCase(operationId)`) was ugly but collision-free, because operationIds are unique per spec.

**Impact:** If two colliding operations have different response shapes, the generated types will silently use the first operation's schema for both. The second operation's actual response shape is lost -- a correctness bug that would only surface at runtime.

**Recommendation:** Add a post-processing collision detection step in `deriveTypePrefix` (or in the parser after all operations are parsed). When two operations in the same resource produce the same `typePrefix`, fall back to the full `toPascalCase(operationId)` for the colliding operations.

---

### SHOULD-FIX: `deriveTypePrefix` is not exported but `ParsedOperation.typePrefix` is optional

**Severity:** Should-fix

`ParsedOperation` is a public type (exported from `@vertz/openapi`). The `typePrefix` field is optional, so external code constructing `ParsedOperation` directly gets the `?? toPascalCase(op.operationId)` fallback. However, `deriveTypePrefix` is NOT exported from the package index, so external consumers who want the shortened names for manually-constructed operations have no way to compute it.

**Recommendation:** Export `deriveTypePrefix` from `packages/openapi/src/index.ts`.

---

### SHOULD-FIX: `getTypePrefix()` is copy-pasted across three generator files

**Severity:** Should-fix (code quality)

The identical function `getTypePrefix(op: ParsedOperation): string` is defined in three separate files:
- `resource-generator.ts`
- `types-generator.ts`
- `schema-generator.ts`

All three have the same implementation: `op.typePrefix ?? toPascalCase(op.operationId)`. This violates DRY. If the fallback logic ever changes (e.g., to handle collisions), all three must be updated in lockstep.

**Recommendation:** Extract `getTypePrefix` into a shared utility (e.g., `generators/shared.ts` or add it to `json-schema-to-ts.ts` alongside `toPascalCase`).

---

### NITPICK: Subsequence matching may be too greedy in edge cases

**Severity:** Nitpick (low risk)

The `isSuffixMatchingPath` uses **subsequence** matching (not substring/contiguous matching). This means a suffix word can match a path word that is arbitrarily far ahead in the path words list, potentially stripping words that are semantically meaningful.

Example: operationId `create_user_post` with path `/users/{id}/posts` (after method strip, words = `['create', 'user', 'post']`).
- start=1: suffix `['user', 'post']`. pathWords = `['users', 'id', 'posts']`. `'user' !== 'users'` (exact match), `'user' !== 'id'`, `'user' !== 'posts'` -- no match. Safe.

Because the matching is exact (no plural/singular fuzzing), this is unlikely to cause problems in practice. But it's worth noting that the algorithm doesn't handle the plural form difference (`user` vs `users`, `post` vs `posts`), which means some path-embedded suffixes won't get stripped when they could be. This is arguably correct (conservative), but means the fix is less effective for specs that use plural path segments and singular words in operationIds.

---

### APPROVED: Fallback safety for external `ParsedOperation` construction

The `typePrefix?: string` optional field with `?? toPascalCase(op.operationId)` fallback is well-designed. Existing tests that construct `ParsedOperation` without `typePrefix` (e.g., "PascalCases fallback response name from underscore-heavy operationId" in both resource-generator and types-generator tests) continue to pass and verify the old long-name behavior is preserved.

---

### APPROVED: Algorithm correctness for the target use case

For the specific problem described in the issue (FastAPI-style operationIds like `list_brand_competitors_web_brand_id_competitors_get`), the algorithm works correctly. The "strip HTTP method, then find longest suffix matching path subsequence" approach is sound and the minimum-2-words guard prevents pathological over-stripping.

---

### APPROVED: Test coverage is reasonable

6 unit tests for `deriveTypePrefix`, integration tests in all 3 generators, and parser snapshot updates. The tests cover the primary FastAPI patterns, camelCase operationIds, short operationIds, and the minimum-2-words guard.

---

### MISSING TEST: No test for collision scenario

**Severity:** Part of the blocker finding

There is no test that puts two operations with colliding `typePrefix` values into the same resource and verifies correct behavior. This should be added regardless of whether the collision is fixed (to document the behavior) or prevented (to verify the prevention works).

---

### MISSING TEST: `deriveTypePrefix` with controller prefix

**Severity:** Nitpick

The function strips controller prefixes (`/^[A-Za-z0-9]+Controller[_.-]+/`), but there's no test for this in `deriveTypePrefix` tests specifically. The `normalizeOperationId` test for "NestJS controller ids" only covers the method name normalization, not type prefix derivation.

## Resolution

All findings addressed:

1. **BLOCKER: Collision** — Fixed. Added `deduplicateTypePrefixes()` in the parser that detects collisions after all operations are parsed and clears `typePrefix` for colliding operations, causing the fallback to full `toPascalCase(operationId)`. Added test verifying `/v1/tasks` vs `/v2/tasks` collision is detected.

2. **SHOULD-FIX: DRY** — Fixed. Extracted `getTypePrefix()` to `json-schema-to-ts.ts` as a shared utility. All three generators now import it.

3. **SHOULD-FIX: Export** — Not addressed. `deriveTypePrefix` is an internal parser utility. External consumers constructing `ParsedOperation` directly can set `typePrefix` manually. Exporting can be done later if needed.

4. **MISSING TEST: Collision** — Added parser test for versioned path collision.

5. **MISSING TEST: Controller prefix** — Added `deriveTypePrefix` test for NestJS controller prefix.

Quality gates: 259 tests pass, typecheck clean, lint 0 errors, format clean.
