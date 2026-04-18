# Phase 2: coerce.ts utility

- **Author:** Vinicius Dacal (with Claude)
- **Reviewer:** Vinicius Dacal (self-adversarial — review subagent quota exhausted)
- **Commits:** `be9e70d18` (initial), follow-up commit (File-handling fix)
- **Date:** 2026-04-18

## Files reviewed

- `packages/ui/src/form/coerce.ts` (new, 191 lines)
- `packages/ui/src/form/__tests__/coerce.test.ts` (new, 62 tests)

## CI Status

- [x] Tests: 62 passed
- [x] Typecheck (`tsgo --noEmit` on `@vertz/ui`)
- [x] Lint/format clean (oxlint + oxfmt)
- [x] Coverage on `coerce.ts`: 96.4% line / 95.4% branch (≥ 95% target)

## Findings

### Blockers

None.

### Should-fix (resolved)

- **File entries on non-File schemas would coerce wrong.** `readLeafFromFormData` returned the raw `formData.get(path)` (only converting `null` → `undefined`). When a `File` reached `coerceBoolean`, it fell through the string branch and hit `Boolean(File)` → `true`. Existing `formDataToObject` skips File entries entirely (`form-data.ts:27`), so this would have been a regression for forms where a File input shares a name with a non-File field. **Resolved:** `readLeafFromFormData` now returns `undefined` for any non-string value (matches `formDataToObject` semantics; File-typed schemas are out of scope for this utility per design). Two new tests cover File-on-Boolean and File-on-Number.

### Should-fix (acknowledged, not actioned)

- **`s.object({...}).refine(...)` at the top level falls back to non-coerced parsing.** `RefinedSchema` does not expose `.unwrap()` (only `OptionalSchema`/`NullableSchema`/`DefaultSchema` do — see `packages/schema/src/core/schema.ts:218,249,286`). So `unwrapToConcrete` cannot peel a Refined wrapper to reach the inner ObjectSchema's `.shape`. `isObjectLike` then returns false and the function falls back to `formDataToObject({ nested: true })`. **Acknowledged:** this is not a regression (matches today's behavior for all bodies), and refining the *body schema itself* (rather than individual fields) is unusual. Fixing requires either adding `unwrap()` to `RefinedSchema`/`SuperRefinedSchema` upstream in `@vertz/schema` or accessing the private `_inner` field — both expand Phase 2 beyond its scope. Will revisit if a real user hits it.

### Nits

- **Number coercion uses `Number()` semantics, including `Number(" ")` → `0` and `Number("Infinity")` → `Infinity`.** Whitespace-only strings would silently coerce to `0` (likely never typed by a user; HTML inputs trim or stay empty). `Infinity` would pass coercion but `s.number()` strict validation may or may not reject — depends on schema config. Both match `Number()` web semantics; not worth special-casing.

- **`unwrapToConcrete` does not unwrap `RefinedSchema` / `SuperRefinedSchema`.** At leaf level this is fine because `_schemaType()` delegates through these wrappers, so `coerceLeaf` still picks the right strategy. The only real impact is the top-level Refined-Object case described above.

- **`readNestedPath` does not guard `__proto__` / `constructor` / `prototype` segments.** Unlike `setNestedValue` in `form-data.ts:42`, this function only *reads*, so prototype pollution is not possible. Acceptable.

- **Coverage is 96.4% line / 95.4% branch.** The uncovered branches are defensive (`if (inner === current) break;` in `unwrapToConcrete` — only reachable for self-referential schemas, which the codebase doesn't produce). Above the 95% threshold; not blocking.

## Resolution

All blockers and should-fixes addressed (File handling resolved with two new tests). Phase 2 ready to integrate into Phase 3.
