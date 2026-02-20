# Phase 2: d.model() and Derived Schemas

- **Author:** ben
- **Reviewer:** mike
- **Commits:** 1b051ff (`feat(db): add d.model() and derived schemas [#457]`)
- **Date:** 2026-02-20

## Changes

- `packages/db/src/schema/model.ts` (new) -- `ModelDef` interface and `createModel` factory
- `packages/db/src/schema/model-schemas.ts` (new) -- `ModelSchemas` interface, `deriveSchemas` factory, `SchemaLike`, `stripKeys`, `getColumnNamesWhere`, `getRequiredInputColumns`
- `packages/db/src/schema/__tests__/model.test.ts` (new) -- 7 runtime tests
- `packages/db/src/schema/__tests__/model.test-d.ts` (new) -- 7 type-level tests
- `packages/db/src/d.ts` (modified) -- `d.model()` overloads and implementation added
- `packages/db/src/index.ts` (modified) -- `ModelDef` and `ModelSchemas` type exports added

## CI Status

- [ ] Not verified (reviewing from branch, not CI)

## Review Checklist

- [x] Delivers what the ticket asks for
- [ ] No type gaps or missing edge cases (see findings BUG-1, T-1, T-2, T-3, T-4, T-5)
- [x] No security issues
- [ ] Public API changes match design doc (see finding D-1)
- [ ] Code quality (see findings C-1, C-2, C-3)

## Findings

### Changes Requested

The core shape is good. `ModelDef` cleanly pairs table + relations + schemas, the `SchemaLike` interface is the right abstraction for duck-typing with `@vertz/schema`, and the runtime `parse()` implementations correctly strip keys using column metadata. The type-level tests use `expectTypeOf` which is clean.

However, I found one critical runtime bug, several type safety gaps, and missing test coverage that need to be addressed before merge. Itemized below, ranked by severity.

---

#### BUG-1: `createInput.parse()` validates required fields BEFORE stripping excluded keys -- produces false positives on PK columns [CRITICAL]

Look at the `createInput.parse()` implementation in `model-schemas.ts` lines 50-57:

```typescript
createInput: {
  parse(value: unknown) {
    const data = value as Record<string, unknown>;
    const missing = requiredCols.filter((col) => !(col in data) || data[col] === undefined);
    if (missing.length > 0) {
      throw new Error(`Missing required fields: ${missing.join(', ')}`);
    }
    return stripKeys(value, inputExcluded) as TTable['$create_input'];
  },
},
```

Now look at how `requiredCols` is computed in `deriveSchemas` lines 41:

```typescript
const requiredCols = getRequiredInputColumns(table, inputExcluded, defaultCols);
```

And `getRequiredInputColumns` at lines 82-88:

```typescript
function getRequiredInputColumns(
  table: TableDef<ColumnRecord>,
  excluded: Set<string>,
  defaults: Set<string>,
): string[] {
  return Object.keys(table._columns).filter((key) => !excluded.has(key) && !defaults.has(key));
}
```

This correctly filters OUT excluded and defaulted columns from the required list. So `id` (primary), `createdAt` (readOnly), `updatedAt` (readOnly) are not in `requiredCols`. Good -- no false positive on PK.

**Wait -- I retract the BUG-1 title. On closer inspection, this is correct.** The `getRequiredInputColumns` function already excludes primary/readOnly from the required set. My initial read was wrong. Let me re-categorize.

~~BUG-1 retracted.~~ Replacing with a different critical finding:

#### BUG-1: `createInput.parse()` does not validate against EXTRA unknown keys -- silently passes through unexpected fields [MEDIUM]

The `createInput.parse()` strips readOnly and PK keys, but any key NOT in the column set at all passes through silently:

```typescript
model.schemas.createInput.parse({
  email: 'a@b.com',
  name: 'Alice',
  passwordHash: 'hash',
  totallyBogusField: 'I will end up in the result',
});
// result contains { email, name, passwordHash, role, totallyBogusField }
```

The `stripKeys` function only removes keys that are in the `excluded` set. It does NOT restrict to known column keys. This means `createInput.parse()` is not a proper schema validator -- it is a key-stripping filter that validates required fields but allows arbitrary extra properties to flow through.

**Impact:** If this `parse()` output is used to build SQL INSERT statements, unknown keys will either (a) cause a Postgres error for non-existent columns, or (b) be silently ignored by the query builder. Either way, the parse layer should catch this early.

**The `response.parse()` and `updateInput.parse()` have the same issue** -- extra unknown keys pass through.

**Fix:** Add a `knownKeys` set (all column keys from the table) and intersect with it in `stripKeys`, or add explicit unknown-key rejection. At minimum, document this as a known limitation if the intent is to defer strict validation to `@vertz/schema` integration.

---

#### BUG-2: `createInput.parse()` throws a plain `Error` -- violates the `no-throw-plain-error` biome plugin [LOW]

In `model-schemas.ts` line 54:

```typescript
throw new Error(`Missing required fields: ${missing.join(', ')}`);
```

Per the biome plugin `no-throw-plain-error`, the project convention is to use `VertzException` subclasses. This is a `warn`-level plugin so it won't block CI, but it deviates from project convention. Consider creating a `ValidationError` subclass or using an existing error type from `@vertz/db/errors`.

---

#### T-1: `SchemaLike` is defined twice -- in `model-schemas.ts` AND in `d.ts` -- no shared export [MEDIUM]

`SchemaLike<T>` is defined as a private `interface` in `model-schemas.ts` line 14:

```typescript
interface SchemaLike<T> {
  parse(value: unknown): T;
}
```

And independently in `d.ts` line 29:

```typescript
interface SchemaLike<T> {
  parse(value: unknown): T;
}
```

These are structurally identical but not the same type. If one changes (e.g., adding a `safeParse` method), the other won't. The `SchemaLike` in `model-schemas.ts` is the one that `ModelSchemas` is built on, and it is NOT exported from `index.ts`.

**Impact:** Consumers who want to type something as `SchemaLike` (e.g., wrapping a model schema) have no public import path for it. The `ModelSchemas` interface references `SchemaLike` but callers cannot import `SchemaLike` to extend or constrain against it.

**Fix:** Extract `SchemaLike` to a shared location (e.g., `packages/db/src/schema/types.ts`), export it from `index.ts`, and import it in both `model-schemas.ts` and `d.ts`. Or at minimum, export the one from `model-schemas.ts`.

---

#### T-2: Type-level test for `updateInput` does NOT verify all fields are optional [MEDIUM]

Acceptance criterion #6 from the plan states:

> Type test: `modelDef.schemas.updateInput` makes all fields optional

The type-level test in `model.test-d.ts` lines 75-88 only checks that readOnly and PK columns are excluded:

```typescript
describe('ModelDef schemas.updateInput type', () => {
  it('excludes readOnly columns', () => {
    type UpdateType = ReturnType<typeof usersModel.schemas.updateInput.parse>;
    expectTypeOf<UpdateType>().not.toHaveProperty('createdAt');
    expectTypeOf<UpdateType>().not.toHaveProperty('updatedAt');
  });

  it('excludes primary key columns', () => {
    type UpdateType = ReturnType<typeof usersModel.schemas.updateInput.parse>;
    expectTypeOf<UpdateType>().not.toHaveProperty('id');
  });
});
```

There is NO test asserting that the remaining fields (`email`, `name`, `passwordHash`, `role`) are optional. The `$update_input` type makes them all optional via the `?` modifier, but without a type test proving it, a regression that makes them required would not be caught.

Missing test:

```typescript
it('makes all remaining fields optional', () => {
  type UpdateType = ReturnType<typeof usersModel.schemas.updateInput.parse>;

  // An empty object should be assignable to UpdateType (all fields optional)
  expectTypeOf<{}>().toMatchTypeOf<UpdateType>();
});
```

**Fix:** Add a type-level test confirming partial update semantics.

---

#### T-3: Type-level test for `createInput` does NOT verify required vs optional distinction [MEDIUM]

Acceptance criterion #4/#5 require the type to exclude hidden/readOnly columns, but the `$create_input` type also has a critical semantic: columns with defaults are OPTIONAL, columns without defaults are REQUIRED. The type-level tests don't verify this distinction.

For the fixture table:
- `email` (no default) should be required
- `name` (no default) should be required
- `passwordHash` (no default) should be required
- `role` (has default 'viewer') should be optional

Missing tests:

```typescript
it('columns with defaults are optional in createInput', () => {
  type CreateType = ReturnType<typeof usersModel.schemas.createInput.parse>;

  // Should compile: role is optional (has default 'viewer')
  expectTypeOf<{ email: string; name: string; passwordHash: string }>()
    .toMatchTypeOf<CreateType>();
});

it('columns without defaults are required in createInput', () => {
  type CreateType = ReturnType<typeof usersModel.schemas.createInput.parse>;

  // @ts-expect-error -- email is required, cannot omit it
  expectTypeOf<{ name: string; passwordHash: string }>()
    .toMatchTypeOf<CreateType>();
});
```

Note: the `@ts-expect-error` approach may not work cleanly with `expectTypeOf` -- you may need to use direct assignment tests instead. The point is: there is no type test proving the required/optional split.

**Fix:** Add type tests that verify the required/optional distinction in `$create_input`.

---

#### T-4: `nullable` columns are not considered in the required-field validation [MEDIUM]

Consider a nullable column with no default:

```typescript
const table = d.table('things', {
  id: d.uuid().primary(),
  name: d.text(),
  nickname: d.text().nullable(),
});
```

Here `nickname` has `nullable: true` but `hasDefault: false`. The `getRequiredInputColumns` function will include `nickname` in the required set because it is not excluded and has no default. But `nickname` being nullable arguably means it should accept `undefined` / be optional in `createInput`.

At the type level, `$create_input` maps `nickname` as required with type `string | null`. So the user MUST provide `{ nickname: null }` explicitly -- they cannot omit it. This is a defensible design choice (explicit nullability), but it conflicts with what most ORMs do (nullable = optional on create).

More importantly, the runtime `parse()` will throw `Missing required fields: nickname` if the user omits `nickname`, even though the type system says the value can be `null`. The user would need to pass `{ nickname: null }` to satisfy the runtime check, which is surprising.

**Impact:** This is a semantic design decision that should be explicitly tested and documented, not left ambiguous.

**Fix:** Either (a) add `nullable` columns to the "has a default" set in `getRequiredInputColumns` so they become optional at runtime (matching the convention that nullable = omittable), or (b) add an explicit test documenting that nullable columns without defaults ARE required and must be explicitly provided as `null`. The current behavior is defensible but untested.

---

#### T-5: No runtime test for `parse()` when called with `null` or non-object input [LOW]

All three `parse()` methods cast `value` to `Record<string, unknown>` without guarding:

```typescript
parse(value: unknown) {
  const data = value as Record<string, unknown>;
  // ...
}
```

What happens when `parse(null)` or `parse(42)` or `parse(undefined)` is called?

- `response.parse(null)` -- `Object.entries(null as any)` throws `TypeError: Cannot convert undefined or null to object` in the `stripKeys` helper.
- `response.parse(42)` -- `Object.entries(42 as any)` returns `[]`, so `parse` returns `{}`. This silently produces an empty object instead of throwing a validation error.
- `createInput.parse(42)` -- All required cols will be "missing", so it throws `Missing required fields: ...`. Acceptable but the error message is misleading.

**Impact:** For a `SchemaLike`-compatible interface that accepts `unknown`, the contract implies basic type validation. Passing a non-object should throw a clear error, not produce a silent empty object (response/updateInput) or a confusing "missing fields" error (createInput).

**Fix:** Add a guard at the top of each `parse()`:

```typescript
if (value === null || typeof value !== 'object' || Array.isArray(value)) {
  throw new Error('Expected a plain object');
}
```

And add tests for these edge cases.

---

#### T-6: No test for `d.model()` with an empty table (no columns) [LOW]

What happens with `d.model(d.table('empty', {}))`? The `deriveSchemas` function will produce schemas where:
- `response.parse({})` returns `{}`
- `createInput.parse({})` returns `{}` (no required fields)
- `updateInput.parse({})` returns `{}`

This is probably correct behavior, but it is untested. Edge case worth covering.

---

#### D-1: `SchemaLike` is not exported from `index.ts` -- consumers cannot reference the schema interface [MEDIUM]

The `ModelSchemas` type is exported from `index.ts`, which is good. But `SchemaLike` (used by `ModelSchemas`) is NOT exported. A consumer who wants to write a generic function over model schemas:

```typescript
function validateInput<T>(schema: SchemaLike<T>, data: unknown): T {
  return schema.parse(data);
}
```

...cannot import `SchemaLike` from `@vertz/db`. They would need to inline the type or use `{ parse(value: unknown): T }` directly.

This is especially relevant because the acceptance criteria say schemas should be "compatible with `SchemaLike` interface" -- but if the interface is not public, the compatibility promise is unverifiable by consumers.

**Fix:** Export `SchemaLike` from `index.ts`.

---

#### D-2: Default relations type mismatch between `ModelDef` interface and `createModel` factory [LOW]

The `ModelDef` interface defaults `TRelations` to `{}`:

```typescript
export interface ModelDef<
  TTable extends TableDef<ColumnRecord> = TableDef<ColumnRecord>,
  TRelations extends Record<string, RelationDef> = {},
> { ... }
```

But the `createModel` factory defaults `TRelations` to `Record<string, never>`:

```typescript
export function createModel<
  TTable extends TableDef<ColumnRecord>,
  TRelations extends Record<string, RelationDef> = Record<string, never>,
>(table: TTable, relations?: TRelations): ModelDef<TTable, TRelations> { ... }
```

And the `d.model()` overload in `d.ts` uses `{}`:

```typescript
model<TTable extends TableDef<ColumnRecord>>(table: TTable): ModelDef<TTable, {}>;
```

`{}` and `Record<string, never>` are structurally different types in TypeScript. `Record<string, never>` means "every string key maps to `never`", which makes it impossible to access any property without getting `never`. `{}` means "any object". The practical difference here is minimal because the relations record is used for property access patterns, but the inconsistency is a code smell.

**Fix:** Pick one -- `{}` or `Record<string, never>` -- and use it consistently in all three locations.

---

#### C-1: `getColumnNamesWhere` uses `keyof ColumnMetadata` but only works for boolean flags [MEDIUM]

The function signature is:

```typescript
function getColumnNamesWhere(
  table: TableDef<ColumnRecord>,
  flag: keyof ColumnMetadata,
): Set<string> {
```

It accepts ANY key of `ColumnMetadata`, including non-boolean keys like `sqlType`, `references`, `check`, `defaultValue`, `format`, etc. When called with a non-boolean flag like `getColumnNamesWhere(table, 'references')`, it would include any column whose `references` value is truthy (i.e., not `null`). This happens to work for the `references` case but is semantically wrong for `sqlType` (always truthy) or `check` (depends on null vs string).

Currently the function is only called with `'hidden'`, `'isReadOnly'`, `'primary'`, and `'hasDefault'` -- all booleans. But the type signature allows misuse.

**Fix:** Constrain the `flag` parameter to only boolean metadata keys:

```typescript
type BooleanMetaKey = {
  [K in keyof ColumnMetadata]: ColumnMetadata[K] extends boolean ? K : never;
}[keyof ColumnMetadata];

function getColumnNamesWhere(
  table: TableDef<ColumnRecord>,
  flag: BooleanMetaKey,
): Set<string> { ... }
```

---

#### C-2: `deriveSchemas` is not tested in isolation -- only through `d.model()` [LOW]

The `deriveSchemas` function is exported and could be called directly. All tests go through `d.model()`, which calls `createModel`, which calls `deriveSchemas`. If someone calls `deriveSchemas` directly with a malformed table (e.g., missing `_columns`), it would crash on `Object.entries(table._columns)`.

This is fine if `deriveSchemas` is considered a private implementation detail. But it is importable from `./model-schemas` by any package-internal consumer.

**Request:** Either (a) make `deriveSchemas` a non-exported function (move it to be called only from `createModel`), or (b) accept that it is an internal utility and document the precondition.

---

#### C-3: No changeset file [LOW]

Same as Phase 1 -- no `.changeset/*.md` file. Per the semver policy, this should be a `patch` changeset for `@vertz/db`. Acknowledged that this will be added with the final feature branch merge.

---

### Summary

| ID | Severity | Category | Description |
|---|---|---|---|
| BUG-1 | MEDIUM | Runtime gap | `parse()` does not reject unknown keys -- extra properties pass through silently |
| BUG-2 | LOW | Convention | `createInput.parse()` throws plain `Error` instead of framework error type |
| T-1 | MEDIUM | Maintainability | `SchemaLike` defined twice independently in `model-schemas.ts` and `d.ts` |
| T-2 | MEDIUM | Test coverage | No type test proving `updateInput` fields are all optional |
| T-3 | MEDIUM | Test coverage | No type test proving `createInput` required vs optional distinction |
| T-4 | MEDIUM | Design clarity | `nullable` columns without defaults are required at runtime -- untested, undocumented |
| T-5 | LOW | Runtime safety | `parse(null)`, `parse(42)` produce crashes or silent empty objects |
| T-6 | LOW | Test coverage | No test for empty table edge case |
| D-1 | MEDIUM | Public API | `SchemaLike` is not exported -- consumers cannot reference the schema interface |
| D-2 | LOW | Type consistency | Default relations type mismatch: `{}` vs `Record<string, never>` |
| C-1 | MEDIUM | Type safety | `getColumnNamesWhere` accepts any metadata key, not just boolean flags |
| C-2 | LOW | Code organization | `deriveSchemas` is exported but only tested indirectly |
| C-3 | LOW | Process | Missing changeset file |

### Verdict

**Changes requested.** The core design is sound, but there are several gaps that should be addressed before merge:

**Required (blocking):**
- **T-2** and **T-3** -- The plan explicitly lists acceptance criteria for type tests on `updateInput` optionality and `createInput` required/optional distinction. These are not covered. Per the project's TDD rules, untested behavior does not exist.
- **T-4** -- The nullable column behavior needs to be explicitly tested and documented, whichever direction is chosen. This is a user-facing semantic decision.
- **T-1** -- The duplicate `SchemaLike` is a maintenance hazard. Consolidate before it diverges.

**Strongly recommended (should fix in this PR):**
- **BUG-1** -- Extra key passthrough is a footgun. At minimum, add a whitelist filter to `stripKeys` that only keeps known column keys.
- **C-1** -- Constrain `getColumnNamesWhere` to boolean flags. This is a 5-line fix.
- **D-1** -- Export `SchemaLike` so consumers can reference the schema duck type.

**Can be follow-ups:**
- BUG-2, T-5, T-6, D-2, C-2, C-3 -- These are real but low-severity. Track and address in Phase 3 or a cleanup pass.
