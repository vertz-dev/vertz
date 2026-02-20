# Phase 1: Schema Annotations

- **Author:** ben
- **Reviewer:** mike
- **Commits:** 1973e63..8a63913 (`8a63913 feat(db): add readOnly/autoUpdate annotations and EDA phantom types [#456]`)
- **Date:** 2026-02-20

## Changes

- `packages/db/src/schema/column.ts` (modified) -- `isReadOnly`/`isAutoUpdate` on `ColumnMetadata`, `ColumnBuilder`, `DefaultMeta`, `SerialMeta`, `TenantMeta`
- `packages/db/src/schema/table.ts` (modified) -- `Response`, `ApiCreateInput`, `ApiUpdateInput` type aliases; `$response`, `$create_input`, `$update_input` phantom types on `TableDef`
- `packages/db/src/query/helpers.ts` (modified) -- `getReadOnlyColumns()`, `getAutoUpdateColumns()`
- `packages/db/src/query/crud.ts` (modified) -- strip readOnly in `create()`, strip readOnly + inject autoUpdate in `update()`
- `packages/db/src/schema/__tests__/annotations.test.ts` (new) -- runtime tests
- `packages/db/src/schema/__tests__/annotations.test-d.ts` (new) -- type-level tests

## CI Status

- [x] All quality gates passed at `8a63913`

## Review Checklist

- [x] Delivers what the ticket asks for
- [ ] TDD compliance (see finding T-1)
- [ ] No type gaps or missing edge cases (see findings T-2 through T-7)
- [x] No security issues
- [ ] Public API changes match design doc (see finding D-1)
- [ ] Code quality (see findings C-1, C-2)

## Findings

### Changes Requested

Overall this is a solid foundation. The core annotations work, the phantom types are correctly wired, and the CRUD integration for `create()` and `update()` is sound. However, I found several gaps that need to be addressed before merge. The most critical are the missing CRUD coverage for bulk operations and the `$create_input`/`$response` semantic overlap issues. Itemized below, ranked by severity.

---

#### BUG-1: `createMany()`, `createManyAndReturn()`, `updateMany()`, and `upsert()` do NOT strip readOnly or inject autoUpdate [CRITICAL]

The readOnly stripping and autoUpdate injection were added only to `create()` and `update()`. The bulk variants and `upsert()` remain unprotected:

| Function | Strips readOnly? | Injects autoUpdate? |
|---|---|---|
| `create()` | YES | n/a (create doesn't auto-update) |
| `createMany()` | **NO** | n/a |
| `createManyAndReturn()` | **NO** | n/a |
| `update()` | YES | YES |
| `updateMany()` | **NO** | **NO** |
| `upsert()` | **NO** (neither create nor update path) | **NO** |

This means a user calling `createMany()` with a readOnly field in the data array will have that field silently inserted into the SQL. Similarly, `updateMany()` will not auto-set `updatedAt` on bulk updates, and `upsert()` is completely unprotected on both paths.

**Impact:** Runtime bypass of readOnly contract. A user doing `createMany(queryFn, users, { data: [{ email: 'a@b.com', name: 'Alice', createdAt: new Date('1999-01-01') }] })` will successfully set `createdAt` to an arbitrary value.

**Fix:** Apply the same `getReadOnlyColumns()` filtering to all create variants and `getAutoUpdateColumns()` injection to all update variants including the update path of `upsert()`.

---

#### T-2: `$create_input` includes `hidden` columns (e.g., `passwordHash`) -- is this intentional? [MEDIUM]

The `ApiCreateInput<T>` type excludes `isReadOnly` and `primary` columns but does NOT exclude `hidden` columns. This means `passwordHash` (which is `.hidden()`) appears as a required field on `$create_input`.

Looking at the type test fixture (annotations.test-d.ts line 56-60):
```typescript
const _valid: CreateInput = {
  email: 'alice@example.com',
  name: 'Alice',
  passwordHash: 'hash',  // <-- hidden column required in $create_input
};
```

This is tested and intentional in the current implementation. The design doc is silent on this exact combination. For a column like `passwordHash`, this is arguably correct -- you DO need to provide a password hash when creating a user, even though it is hidden from responses.

However, this raises a design question: what about a column that is both `.hidden()` AND `.readOnly()`? Currently that combination would be excluded from `$create_input` (because `isReadOnly` is checked), which is correct. But the fact that `hidden` alone does NOT exclude from `$create_input` should be explicitly documented in the design doc, because it is a semantic choice that will confuse users who expect "hidden = not part of the API."

**Request:** Add a comment to the `ApiCreateInput` type alias explaining why `hidden` is intentionally included. Add a type test that explicitly shows a `.hidden()` non-readOnly column IS included in `$create_input` and a `.hidden().readOnly()` column IS excluded.

---

#### T-3: `$response` is structurally identical to `$not_hidden` and `$infer` -- redundant type [LOW]

The `Response<T>` type alias in table.ts is:
```typescript
type Response<T extends ColumnRecord> = {
  [K in ColumnKeysWhereNot<T, 'hidden'>]: InferColumnType<T[K]>;
};
```

This is byte-for-byte identical to both `NotHidden<T>` (line 97-99) and `Infer<T>` (line 56-58). All three types exclude hidden columns and include everything else.

I understand the naming intent -- `$response` is the EDA-facing name for "what the API returns" -- but having three identical type aliases is a maintenance risk. If the semantics of `$response` ever diverge from `$infer` (e.g., if `$response` should exclude `sensitive` columns), someone will change one and forget the other.

**Request:** Either (a) define `Response<T> = Infer<T>` to make the structural identity explicit, or (b) add a comment explaining that `$response` is intentionally a separate definition to allow future divergence. I prefer (a).

---

#### T-4: Missing metadata type-level tests for `.readOnly()` and `.autoUpdate()` [MEDIUM]

The existing `column.test-d.ts` file has explicit metadata type-level tests for every other builder method: `.primary()`, `.nullable()`, `.default()`, `.sensitive()`, `.hidden()`, `.unique()` -- each with a positive assignment and a `@ts-expect-error` negative test confirming the flag is narrowed to a literal `true`/`false`.

The new `.readOnly()` and `.autoUpdate()` methods have NO equivalent metadata type tests. The `annotations.test-d.ts` file only tests the phantom types (`$response`, `$create_input`, `$update_input`), not the column-level metadata narrowing.

Missing tests:
```typescript
it('.readOnly() sets isReadOnly to true in metadata type', () => {
  const col = d.text().readOnly();
  const _ro: typeof col._meta.isReadOnly = true;
  // @ts-expect-error -- isReadOnly is true, false not assignable
  const _notRo: typeof col._meta.isReadOnly = false;
});

it('.autoUpdate() sets isAutoUpdate to true in metadata type', () => {
  const col = d.timestamp().autoUpdate();
  const _au: typeof col._meta.isAutoUpdate = true;
  // @ts-expect-error -- isAutoUpdate is true, false not assignable
  const _notAu: typeof col._meta.isAutoUpdate = false;
});

it('.autoUpdate() sets isReadOnly to true in metadata type', () => {
  const col = d.timestamp().autoUpdate();
  const _ro: typeof col._meta.isReadOnly = true;
  // @ts-expect-error -- isReadOnly is true (implied by autoUpdate), false not assignable
  const _notRo: typeof col._meta.isReadOnly = false;
});
```

Without these, a regression that breaks the `Omit<TMeta, ...> & { ... }` pattern in the `.readOnly()` or `.autoUpdate()` type signature would not be caught.

**Fix:** Add the above tests to `annotations.test-d.ts` (or `column.test-d.ts`, consistent with the existing pattern).

---

#### T-5: No test for `readOnly()` + `autoUpdate()` chaining interaction [LOW]

What happens if a user calls `.readOnly().autoUpdate()` vs `.autoUpdate().readOnly()`? Both should produce the same metadata. Currently only `.autoUpdate()` alone is tested. Add at minimum one test showing chaining order doesn't matter:

```typescript
it('.readOnly().autoUpdate() and .autoUpdate().readOnly() produce identical metadata', () => {
  const a = d.timestamp().readOnly().autoUpdate();
  const b = d.timestamp().autoUpdate().readOnly();
  expect(a._meta.isReadOnly).toBe(true);
  expect(a._meta.isAutoUpdate).toBe(true);
  expect(b._meta.isReadOnly).toBe(true);
  expect(b._meta.isAutoUpdate).toBe(true);
});
```

---

#### T-6: No test for `autoUpdate()` on non-timestamp columns [LOW]

The acceptance criteria mention "autoUpdate + non-timestamp" as an edge case. Currently, `.autoUpdate()` is only tested on `d.timestamp()`. What happens if someone writes `d.text().autoUpdate()`? At the type level it compiles fine. At runtime, the CRUD code sets the value to `'now'` and adds it to `nowColumns`, which means `buildUpdate` will emit `SET col = NOW()`. For a non-timestamp column, this produces a Postgres type mismatch at query time.

The framework should either:
1. Prevent `.autoUpdate()` on non-timestamp columns at the type level (constrain `autoUpdate()` to only be available when `TMeta['sqlType']` is `'timestamp with time zone'`), or
2. Document that `.autoUpdate()` is only meaningful on timestamps and the error will surface at the database level.

Option 1 is preferable for a framework that values compile-time safety. Even if you choose option 2 for now, add a test documenting the behavior.

---

#### T-7: `$create_input` is an intersection type -- may cause DX issues [LOW]

`ApiCreateInput<T>` is defined as an intersection of two mapped types:
```typescript
type ApiCreateInput<T> = {
  [K in RequiredKeys]: InferColumnType<T[K]>;
} & {
  [K in OptionalKeys]?: InferColumnType<T[K]>;
};
```

This is the same pattern used by the existing `$insert` type, so it is consistent. However, intersection types produce ugly hover tooltips in IDEs (users see `{ email: string; name: string; ... } & { role?: "admin" | "editor" | "viewer" | undefined }` instead of a clean flat object). The existing `$insert` type has the same issue, so this is not new technical debt, but worth noting for Phase 2 where `d.model()` will be the primary public API. Consider adding a `Simplify<T>` utility type:

```typescript
type Simplify<T> = { [K in keyof T]: T[K] };
```

And wrapping the intersection: `type ApiCreateInput<T> = Simplify<RequiredPart & OptionalPart>`.

This is a nice-to-have, not a blocker.

---

#### D-1: Design doc specifies `CreateInput` but implementation uses `ApiCreateInput` [LOW]

The design doc (issue #456) shows the type alias name as `CreateInput<T>` and `UpdateInput<T>`. The implementation uses `ApiCreateInput<T>` and `ApiUpdateInput<T>`. This was presumably done to avoid naming conflicts, which is reasonable, but the deviation should be noted and the design doc updated.

---

#### C-1: Redundant autoUpdate injection in `update()` -- `filteredData[col] = 'now'` is fragile [MEDIUM]

In `crud.ts` lines 293-296:
```typescript
// Auto-set autoUpdate columns to NOW()
for (const col of autoUpdateCols) {
  filteredData[col] = 'now';
}
```

This mutates `filteredData` by injecting `'now'` as a string value, then relies on `allNowColumns` to tell `buildUpdate` to replace `'now'` with `NOW()`. This works, but the coupling is fragile -- it depends on the `buildUpdate` "now sentinel" convention, and the magic string `'now'` is not typed or documented as a sentinel.

Additionally, if a user somehow already had a column named `now` with the string value `'now'`, this sentinel pattern would incorrectly replace it with `NOW()`. This is admittedly unlikely but represents a leaky abstraction.

The existing `getTimestampColumns()` + `nowColumns` pattern has the same issue, so this is pre-existing debt, not new. But stacking more usage on top of a fragile pattern is worth flagging.

**Request:** At minimum, add a code comment in `update()` explaining the sentinel pattern and why `'now'` is the chosen sentinel value. Ideally, use a `Symbol` sentinel instead of a string, but that is a larger refactor outside this PR's scope.

---

#### C-2: No changeset file [LOW]

The diff does not include a `.changeset/*.md` file. Per the project's semver policy, this should be a `patch` changeset for `@vertz/db`.

---

### Summary

| ID | Severity | Category | Description |
|---|---|---|---|
| BUG-1 | CRITICAL | Runtime gap | `createMany`, `createManyAndReturn`, `updateMany`, `upsert` bypass readOnly/autoUpdate |
| T-2 | MEDIUM | Design clarity | `$create_input` includes hidden columns -- needs documentation and explicit test |
| T-3 | LOW | Maintainability | `$response` is identical to `$infer`/`$not_hidden` -- deduplicate or document |
| T-4 | MEDIUM | Test coverage | Missing metadata type-level tests for `.readOnly()` and `.autoUpdate()` |
| T-5 | LOW | Test coverage | No chaining order test for `readOnly` + `autoUpdate` |
| T-6 | LOW | Type safety | `autoUpdate()` on non-timestamp columns compiles but produces runtime DB errors |
| T-7 | LOW | DX | Intersection type tooltip noise on `$create_input` |
| D-1 | LOW | Documentation | Type alias names deviate from design doc |
| C-1 | MEDIUM | Code quality | Sentinel `'now'` string coupling is fragile -- needs at least a comment |
| C-2 | LOW | Process | Missing changeset file |

### Verdict

**Changes requested.** BUG-1 is a blocking issue -- readOnly enforcement is meaningless if half the CRUD surface bypasses it. T-4 is also required per the project's TDD rules (every builder method has metadata type tests; these two are missing). The rest can be addressed in this PR or tracked as follow-ups at the author's discretion.

## Resolution

Addressed in `ceb6506`:

- **BUG-1 (CRITICAL):** Fixed. `createMany()`, `createManyAndReturn()`, `updateMany()`, and `upsert()` now strip readOnly fields and inject autoUpdate columns. Each variant has a dedicated test confirming the behavior.
- **T-4 (MEDIUM):** Fixed. Added 3 metadata type-level tests to `annotations.test-d.ts`: `.readOnly()` narrows `isReadOnly` to `true`, `.autoUpdate()` narrows `isAutoUpdate` to `true`, `.autoUpdate()` also narrows `isReadOnly` to `true`. All use `@ts-expect-error` for negative assertions.
- **C-1 (MEDIUM):** Fixed. Added code comment in `update()` explaining the `'now'` sentinel pattern and how `buildUpdate` consumes it.

Follow-ups tracked for future phases:
- T-2: `$create_input` including hidden columns — intentional, will document in design doc
- T-3: `$response` / `$infer` / `$not_hidden` deduplication — will evaluate in Phase 2
- T-5: Chaining order tests — nice-to-have, not blocking
- T-6: `autoUpdate()` on non-timestamp columns — type-level constraint deferred to future iteration
- T-7: Intersection type DX — will evaluate `Simplify<T>` in Phase 2 when `d.model()` is built
- D-1: Internal type alias naming — `ApiCreateInput`/`ApiUpdateInput` are implementation details, not public API
- C-2: Changeset will be added with the final feature branch → main PR
