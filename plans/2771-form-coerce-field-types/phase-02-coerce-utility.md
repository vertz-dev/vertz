# Phase 2: coerce.ts utility + exhaustive tests

## Context

Issue [#2771](https://github.com/vertz-dev/vertz/issues/2771). Phase 1 added the public `ArraySchema.element` accessor. This phase adds the pure utility that walks a schema and coerces a `FormData` (or a single leaf value) to match the schema's expected types. The utility is internal — no public re-export.

Two functions, one file. Follow the algorithm in `plans/2771-form-coerce-field-types.md` exactly (see "Algorithm" section, ~lines 110-153). Both functions are pure: they do not mutate inputs.

Key APIs used (all already stable):
- `schema._schemaType(): SchemaType` — discriminant; delegates through wrappers (`packages/schema/src/core/schema.ts:201-202`).
- `ObjectSchema.shape: Record<string, Schema>` — children of an object schema.
- `ArraySchema.element: Schema<unknown>` — element schema (added in Phase 1).
- `OptionalSchema.unwrap()`, `NullableSchema.unwrap()`, `DefaultSchema.unwrap()` — only needed to access `.shape` / `.element` on wrapped schemas.
- `formDataToObject(formData, { nested: true })` (`packages/ui/src/form/form-data.ts`) — used as the array-of-object fallback and as the no-coercion fallback for non-`@vertz/schema` adapters.

## Tasks

### Task 1: Implement `coerce.ts` with `coerceLeaf` (TDD, leaves first)

**Files:** (2)
- `packages/ui/src/form/coerce.ts` (new)
- `packages/ui/src/form/__tests__/coerce.test.ts` (new)

**What to implement:**

In `coerce.ts` export two pure functions:

```ts
export function coerceLeaf(value: unknown, leafSchema: unknown): unknown;
export function coerceFormDataToSchema(
  formData: FormData,
  schema: unknown,
): Record<string, unknown>;
```

Plus internal helpers: `isVertzSchema`, `unwrapToShapeOrElement`, `coerceBoolean`, `coerceNumber`, `coerceBigInt`, `coerceDate`.

**Build `coerceLeaf` first (drives all the table rows from the design):**

| Inner type | Raw | Coerced |
|--|--|--|
| `Boolean` | absent (`undefined`) | `false` |
| `Boolean` | `""`, `"false"`, `"off"`, `"0"`, `false` | `false` |
| `Boolean` | `"on"`, `"true"`, `"1"`, `true` | `true` |
| `Boolean` | other non-empty string | `true` (`Boolean(string)` semantics) |
| `Number` | absent, `""` | absent (return `undefined` so caller can drop key) |
| `Number` | numeric string (incl. `"0"`, `"-1.5"`) | `Number(value)` |
| `Number` | non-numeric non-empty string | passed through unchanged |
| `BigInt` | absent, `""` | absent |
| `BigInt` | numeric string | `BigInt(value)` (try/catch — pass through on failure) |
| `Date` | absent, `""` | absent |
| `Date` | parseable string | `new Date(value)` (only if `!isNaN(d.getTime())`) |
| `Date` | unparseable string | passed through |
| All others (`String`, `Enum`, `Literal`, `Union`, `DiscriminatedUnion`, `Unknown`, `Any`, `Lazy`) | any | passed through |
| Schema without `_schemaType` (custom adapter) | any | passed through |

**Then build `coerceFormDataToSchema` per the algorithm:**

- Duck-typing guard: if `typeof (schema as any)._schemaType !== 'function'`, return `formDataToObject(formData, { nested: true })` unchanged.
- Otherwise call `walk(formData, schema, '')`.
- `walk()` dispatches on `_schemaType()`:
  - `Object` → for each `[key, fieldSchema]` of `schema.shape`, call `walkField(formData, fieldSchema, joinPath(parent, key))`. Return assembled object. **`undefined` leaf values are dropped from the output object** so downstream `optional()`/`default()` apply.
  - `Array` → unwrap to access `.element`. If `element._schemaType()` is `Object`, fall back to `formDataToObject({ nested: true })` and read the array out of the result at `path` (preserves dotted-index data without dropping). Otherwise `formData.getAll(path).map(v => coerceLeaf(v, element))`.
  - default → `coerceLeaf(readLeafFromFormData(formData, path), schema)`.
- `walkField()` re-dispatches: Object → recurse into `walk(formData, unwrap(fieldSchema), path)`; Array → re-enter `walk(formData, fieldSchema, path)`; leaf → `coerceLeaf(readLeafFromFormData(formData, path), fieldSchema)`.
- `readLeafFromFormData(formData, path)`: `formData.get(path)`; null → undefined.

**TDD order (one failing test at a time):**

Tests for `coerceLeaf` — every row of the table above is a `describe`/`it` block. Sample:

```ts
describe('Feature: coerceLeaf — Boolean inner schema', () => {
  describe('Given the value is undefined', () => {
    it('then returns false', () => {
      expect(coerceLeaf(undefined, s.boolean())).toBe(false);
    });
  });
  describe('Given the value is "on"', () => {
    it('then returns true', () => { expect(coerceLeaf('on', s.boolean())).toBe(true); });
  });
  describe('Given the value is "false"', () => {
    it('then returns false', () => { expect(coerceLeaf('false', s.boolean())).toBe(false); });
  });
  // ... and so on for every row
});
```

Tests for `coerceFormDataToSchema`:
- Flat object with mixed types (string, boolean, number).
- Nested object: `<input name="address.street">` produces `{ address: { street: "..." } }` after coercion.
- Multi-checkbox primitive array: `tags=a&tags=b` → `tags: ['a','b']`.
- Multi-checkbox of booleans: `flags=on&flags=` → `flags: [true, false]`.
- Array of object → falls back to nested-index parsing (data preserved, leaves not coerced).
- `s.boolean().refine(b => b)` field → still coerces (Refined delegates `_schemaType`).
- `s.boolean().optional()` field absent → `false` (Optional delegates `_schemaType`; outer Optional unwrap NOT needed for leaves).
- `s.lazy(...)` field → no coercion (passed through).
- Custom adapter (object with only `.parse`) → returns the same as `formDataToObject({ nested: true })`.
- Mutation safety: original `formData` and any input objects are not mutated (re-read after the call).

**Acceptance criteria:**
- [ ] All table rows above have at least one passing test.
- [ ] All `coerceFormDataToSchema` scenarios above have passing tests.
- [ ] No `as any` in production code (tests may use type assertions).
- [ ] No new `@ts-expect-error` directives.
- [ ] Quality gate green: `vtz test --filter packages/ui && vtz run typecheck && vtz run lint`.
- [ ] Coverage on `coerce.ts` ≥ 95% (target 100%).
- [ ] No public re-export from `packages/ui/src/form/index.ts` or `packages/ui/src/index.ts` — utility stays internal.

## Phase Definition of Done

- All Task 1 acceptance criteria met.
- Adversarial review at `reviews/2771-form-coerce-field-types/phase-02-coerce-utility.md` — no blockers.
- Phase commit pushed to `viniciusdacal/issue-2771`.
