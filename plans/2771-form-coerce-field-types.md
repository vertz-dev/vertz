# Coerce form() field values to schema types

**Issue:** [#2771](https://github.com/vertz-dev/vertz/issues/2771) — `form()` does not coerce field types — boolean/number fields fail validation.

## Problem

HTML forms only emit string values. A checkbox sends `"on"` (or no entry at all when unchecked); a number input sends `"42"`; a multi-select sends one entry per selected option. The codegen-emitted entity schemas use **strict** `s.boolean()`, `s.number()`, etc. (`packages/codegen/src/generators/entity-schema-generator.ts:12-18`).

Today `form()` calls `formDataToObject(formData, { nested: true })` (no coercion — `packages/ui/src/form/form.ts:260`) and then validates the resulting `Record<string, string>` against the strict schema. Result:

- Checkbox checked → `done: "on"` → `Expected boolean, received string`.
- Checkbox unchecked → `done` absent → `Expected boolean, received undefined`.
- Number input `42` → `count: "42"` → `Expected number, received string`.
- Multi-checkbox `tags=a&tags=b` → `tags: "b"` → `Expected array, received string`.

Every entity with a non-string scalar (`boolean`, `number`, `bigint`) or a string-array field is unusable from a plain HTML form. The framework's "schema is the source of truth" promise is broken at the most visible surface.

## Goal

`form()` MUST submit data that matches the schema's expected types, with no per-field configuration from the developer. Given a checkbox, an unchecked box, a number input, or a multi-select, the value reaching the action handler must be `boolean | number | string[]`, not `string`. The same coercion MUST also apply to per-field blur/change re-validation so live and submit validation tell a single story.

## API Surface

**Zero new public API on `form()`.** This is purely a behavior fix. The same code from the issue body just works:

```tsx
import { form } from '@vertz/ui';
import { api } from '../api';

export function NewTaskForm({ onSuccess }: { onSuccess: () => void }) {
  const taskForm = form(api.tasks.create, { resetOnSuccess: true, onSuccess });

  return (
    <form action={taskForm.action} method={taskForm.method} onSubmit={taskForm.onSubmit}>
      <input type="text" name={taskForm.fields.title} />
      <input type="checkbox" name={taskForm.fields.done} />
      <input type="number" name={taskForm.fields.priority} />
      <input type="checkbox" name={taskForm.fields.tags} value="frontend" />
      <input type="checkbox" name={taskForm.fields.tags} value="backend" />
      <button type="submit" disabled={taskForm.submitting}>Save</button>
    </form>
  );
}
```

After this change:

- `done` checked → `{ done: true }`
- `done` unchecked → `{ done: false }`
- `priority` empty → field omitted (lets schema's `optional()` / `default()` apply)
- `priority` `"42"` → `{ priority: 42 }`; `"0"` → `{ priority: 0 }`
- `tags` (two checked) → `{ tags: ["frontend", "backend"] }`
- A field whose schema is `s.string()` and whose value happens to be `"42"` → `{ field: "42" }` (NOT coerced)

The last bullet is the key invariant: coercion is **schema-driven**, not value-shape-driven.

### One **non-public** API addition

`packages/schema/src/schemas/array.ts` gains a public `get element(): Schema<unknown>` accessor. The internal `_element` field is private today (`array.ts:8`); we need a public, stable way to read the element schema during traversal. This is a 3-line addition with no behavioral change — exposes existing state.

### Comparison to peers

| Library | How it handles `<input type="checkbox" />` |
|--|--|
| React Hook Form | `register('done', { setValueAs: v => v === 'on' })` per field |
| TanStack Form | Manual `transform` per field |
| Remix / Next.js (server actions) | Manual `formData.get('done') === 'on'` in the action |
| Zod direct | `z.coerce.boolean()` in the schema (loosens the API contract) |
| **Vertz (this PR)** | Zero config. Schema-driven. The strict server schema stays strict; coercion is a UI-layer pre-process. |

This is a sellable DX win: the developer writes the obvious HTML and the framework does the right thing exactly once, at the right boundary.

## Design

### Where coercion runs

Two call sites, one utility.

```ts
// packages/ui/src/form/form.ts — submit path
async function submitPipeline(formData: FormData): Promise<void> {
  hasSubmitted = true;
  const data = resolvedSchema
    ? coerceFormDataToSchema(formData, resolvedSchema)
    : formDataToObject(formData, { nested: true });
  // ... validate(data), sdkMethod(data) — unchanged
}

// packages/ui/src/form/form.ts — blur/change re-validation path
function revalidateFieldIfNeeded(fieldName: string): void {
  // ...
  const leafSchema = resolveFieldSchema(resolvedSchema, fieldName);
  const coerced = leafSchema
    ? coerceLeaf(field.value.peek(), leafSchema)
    : field.value.peek();
  const result = validateField(resolvedSchema, fieldName, coerced, /* fullData built lazily */);
  // ...
}
```

`coerceFormDataToSchema(formData, schema)` produces a fully nested object whose leaves match the schema's expected types. `coerceLeaf(value, leafSchema)` is the per-leaf primitive used by both the form submit path and the blur revalidation path. The two share the leaf logic so live and submit validation tell the same story.

### Algorithm

```
coerceFormDataToSchema(formData, schema):
  if !isVertzSchema(schema): return formDataToObject(formData, { nested: true })
  return walk(formData, schema, path = '')

walk(formData, schema, path):
  type = schema._schemaType()         // dispatch FIRST — before any unwrap
  switch type:
    case Object:
      out = {}
      for [key, fieldSchema] of schema.shape:
        // recurse for nested objects/arrays/leaves
        out[key] = walkField(formData, fieldSchema, path ? path + '.' + key : key)
      return out
    case Array:
      element = unwrap(schema).element     // unwrap Optional/Default/Nullable to get .element
      elementType = element._schemaType()
      if elementType === Object:
        // s.array(s.object({...})) — out of scope for this PR (see Non-Goals).
        // Fall back to formDataToObject({ nested: true }) for the array path so
        // existing dotted-index behavior (items.0.id=a) is preserved unchanged.
        return readNestedFallback(formData, path)
      // multi-value primitive array: getAll() returns every value submitted
      // under this exact (flat dotted) key. Covers multi-checkbox + multi-select.
      values = formData.getAll(path)        // string[] of FormDataEntryValue
      return values.map(v => coerceLeaf(v, element))
    default:
      // top-level non-object schema is unusual but supported
      return coerceLeaf(readLeafFromFormData(formData, path), schema)

walkField(formData, fieldSchema, path):
  // peek through wrappers WITHOUT calling .unwrap() — _schemaType delegates
  type = fieldSchema._schemaType()
  if type === Object:
    inner = unwrap(fieldSchema)              // unwrap to access .shape
    return walk(formData, inner, path)
  if type === Array:
    return walk(formData, fieldSchema, path) // re-enter walk — Array branch above
  // leaf
  raw = readLeafFromFormData(formData, path) // string|undefined
  return coerceLeaf(raw, fieldSchema)

readLeafFromFormData(formData, path):
  // FormData stores entries by FLAT key. <input name="a.b" /> lives at key "a.b",
  // not at any nested structure. We use formData.get(path) directly with the
  // dotted path string. Returns undefined when absent (FormData.get returns null
  // → normalize to undefined so coerceLeaf can pattern-match on `absent`).
  v = formData.get(path)
  return v === null ? undefined : v

coerceLeaf(raw, leafSchema):
  type = leafSchema._schemaType()
  switch type:
    case Boolean: return coerceBoolean(raw)
    case Number:  return coerceNumber(raw)
    case BigInt:  return coerceBigInt(raw)
    case Date:    return coerceDate(raw)
    default:      return raw                 // String, Enum, Literal, Union, Unknown, Any → pass through

unwrap(schema):
  // walk OptionalSchema/DefaultSchema/NullableSchema until we find one with .shape or .element,
  // OR exhaust unwrap depth (max 10 — same precedent as validation.ts:104).
  // If schema doesn't expose .unwrap(), return as-is.
```

**Critical implementation notes:**

1. **Dispatch on `_schemaType()` first, then unwrap.** `OptionalSchema._schemaType()` already delegates to its inner schema's type (`packages/schema/src/core/schema.ts:201-202`). So `s.boolean().optional()._schemaType()` returns `Boolean`. We unwrap only when we need the *children* (`.shape`, `.element`), not the type discriminant.

2. **`RefinedSchema` / `TransformSchema` / `PipeSchema` / `BrandedSchema` / `CatchSchema` / `ReadonlySchema` / `SuperRefinedSchema` (`schema.ts:291-516`) all delegate `_schemaType()` but DO NOT expose `.unwrap()`.** Because we dispatch on `_schemaType()` first, `s.boolean().refine(...)` correctly resolves to `Boolean` and gets coerced. We only call `.unwrap()` when we need `.shape` / `.element`, and we tolerate its absence.

3. **`Lazy` schema** (`s.lazy(() => self)` for recursive types) is treated as **no coercion**. Recursing through a self-referential schema with a deeply-nested raw payload would loop. We skip `Lazy` rather than guard with a `WeakSet` — recursive form schemas are vanishingly rare and the safe fallback is correct.

4. **Duck-typing guard for non-`@vertz/schema` adapters.** `FormSchema<T>` only requires `.parse()`. `isVertzSchema(s)` returns `true` iff `typeof s._schemaType === 'function'`. Anything else falls through to today's behavior (`formDataToObject` without coercion). Existing custom-adapter tests pass unchanged.

5. **`coerceFormDataToSchema` returns a NEW object.** Reference identity of `formData` and intermediate objects is not load-bearing in `form.ts:260-279` (verified). Returning new structures avoids surprise mutations.

6. **Performance.** `O(N)` per submit where N = total leaf fields. Submits are user-initiated; no caching needed. Stated here so reviewers don't bikeshed memoization.

### Coercion table (per leaf)

After `_schemaType()` dispatch:

| Inner type | Raw | Coerced |
|--|--|--|
| `Boolean` | absent | `false` |
| `Boolean` | `""`, `"false"`, `"off"`, `"0"`, `false` | `false` |
| `Boolean` | `"on"`, `"true"`, `"1"`, `true` | `true` |
| `Boolean` | other non-empty string | `true` (matches `Boolean(string)` semantics) |
| `Number` | absent, `""` | absent (drop key — let `optional()` / `default()` apply) |
| `Number` | numeric string | `Number(value)` (covers `"0"`, `"-1.5"`, etc.) |
| `Number` | non-numeric non-empty string | passed through unchanged (validation reports its native error) |
| `BigInt` | absent, `""` | absent |
| `BigInt` | numeric string | `BigInt(value)` (try/catch — pass through on failure) |
| `Date` | absent, `""` | absent |
| `Date` | parseable string | `new Date(value)` |
| `Date` | unparseable string | passed through |
| `String`, `Enum`, `Literal`, `Union`, `DiscriminatedUnion`, `Unknown`, `Any` | any | passed through |
| `Array` of `Boolean`/`Number`/etc. | multi-value FormData entries | element-wise via `coerceLeaf` |
| `Object` | (nested) | recurse via `walk()` |

**Boolean truthy set rationale.** The narrow set `{ "on", "true", "1" }` is checked first so explicit user-supplied `value="false"` or `value="0"` resolves to `false` (the surprising case the DX review flagged). Anything else non-empty is `true` to match HTML's "any custom checkbox value is truthy when checked" intuition. This aligns with — and slightly extends — the existing `coerceValue` in `form-data.ts:64-73` (which only recognizes literal `"true"`/`"false"`).

**Boolean unchecked rationale.** A checkbox unchecked produces NO FormData entry. Without explicit handling, the field would be missing entirely, and a strict `s.boolean()` schema would reject `undefined`. The "absent → `false`" rule treats every checkbox as if it had a hidden default, which matches developer intuition.

**Date dead-code note.** Codegen currently emits `s.string()` for `d.date()` columns (`packages/codegen/src/generators/entity-schema-generator.ts:16` — JSON transport delivers ISO strings). The `Date` row in the coercion table therefore only fires for hand-written schemas that use `s.date()` directly. Including it costs nothing and keeps the utility correct for any future codegen change.

**Number empty rationale.** Coercing `""` → `0` or `Invalid Date` produces confusing validation errors. Stripping the key lets schema-level `optional()` / `default()` apply correctly. **Required-but-empty case:** `s.number()` (required, no default) with empty input still fails validation, but with the schema's native error ("expected number, received undefined") instead of a confusing one. Acceptable: the user got the validation feedback they need.

**Non-numeric number rationale.** Typing `"42a"` into a number input is a user typo. Today's strict schema reports "expected number, received string" — confusing because the user thinks they typed a number. We considered emitting a friendly error directly during coercion, but doing so would put validation logic in two places. Decision: pass through, let the schema produce its native error, and improve error messages in the schema package as a separate, focused change. Tracked: a follow-up issue created in this PR ("`s.number()` error message when a non-numeric string is provided").

### Server-side coercion

**Out of scope.** Issue #2771 is filed against `form()`. Server entity schemas remain strict so direct SDK callers (`api.tasks.create({ done: true })` from a Worker / curl / agent) are still type-checked correctly. A separate gap exists: progressive-enhancement no-JS form submits, FormData-shaped requests at the edge, and the cloud's deserialized rule layer all face the same coercion problem on the server side.

This PR creates a tracked follow-up issue ("Coerce FormData / urlencoded request bodies on the server using the same schema-driven utility") **at PR open time, not later**, so the gap is visible in the project board.

## Manifesto Alignment

- **Schema is the source of truth.** Coercion is driven entirely by the schema; no field-level config in JSX. This is exactly the principle the issue exposes.
- **Zero-config DX.** Developers write `<input type="checkbox" name={form.fields.done} />` and it works.
- **One way to do it.** The existing `formDataToObject({ coerce: true })` flag is generic dumb-coerce that's wrong for mixed string/number schemas. We do NOT enable it. The new schema-aware path is the only way `form()` coerces.
- **No half-finished implementations.** The blur re-validation path is patched in the same PR — we do not ship a fix that only works on submit but breaks on blur.

### What was rejected

1. **Change codegen to emit `s.coerce.boolean()` / `s.coerce.number()`.** Loosens the API contract for direct SDK callers — server would accept `"true"` from a typed `boolean` parameter. Coercion belongs to the form/HTML layer.
2. **Per-field `transform()` API.** Every non-string field would need it — exactly the boilerplate the framework should eliminate.
3. **Coerce in `formDataToObject` by default.** The utility is generic; schema-blind coercion would corrupt string fields that happen to look numeric.
4. **Generate a parallel "form schema" per entity.** Doubles the surface area; the existing schema is enough.

## Non-Goals

- **`s.array(s.object({...}))` (array-of-object) field coercion.** The walk() Array branch falls back to `formDataToObject({ nested: true })` for object-element arrays, preserving today's dotted-index behavior (`items.0.id=a`) untouched. Coercion is not applied to leaves inside object-array elements. Realistic HTML forms rarely produce these without JS-built FormData; the JS-built path can pre-coerce values at construction. Tracked as a separate follow-up if external users hit it.
- **Server-side body coercion.** Tracked as a follow-up issue created at PR open. Server schemas stay strict; SDK callers continue passing typed data; HTML forms going through `form()` get coerced UI-side.
- **Friendly per-field error messages for unparseable numeric/date input.** Tracked separately as a `@vertz/schema` improvement.
- **`Union` / `DiscriminatedUnion` coercion** (e.g. `s.union([s.boolean(), s.string()])`). Pass-through; if a developer needs it, they coerce manually.
- **`<input type="datetime-local">` / `type="time"` round-tripping nuances.** `new Date(value)` handles ISO 8601 and `YYYY-MM-DD`; richer date semantics are out of scope.
- **File uploads through `form()`.** `formDataToObject` already skips File entries; nothing changes here.
- **`useUncontrolledForm` / no-JS submit.** The `<form action="..." method="...">` attributes still point at the SDK URL/method; without JS the browser submits raw FormData (existing behavior, not regressed). Server-side gap covered by the follow-up.

## Unknowns

- **None identified.** All required APIs (`_schemaType`, `.shape`, the new `.element` getter, `.unwrap()`) are stable and either exist today or are added in Phase 1 of this PR. The `SchemaType` enum is closed and exhaustive.

## POC Results

No POC required. The schema traversal mechanism is identical to the existing `validateField` walk in `packages/ui/src/form/validation.ts:78-131` — already in production, already covered by tests. We're applying the same walk for coercion that we already apply for per-field validation.

## Type Flow Map

`form()` is **runtime-only** for coercion — no new type parameters, no inference work. The existing `TBody` continues to flow:

```
codegen entity schema (createTaskSchema: ObjectSchema<{ title: string; done: boolean }>)
  ↓
SdkMethodWithMeta<TBody, TResult>.meta.bodySchema  (TBody inferred from the SDK method)
  ↓
form(sdkMethod) → resolvedSchema = sdkMethod.meta.bodySchema
  ↓
coerceFormDataToSchema(formData, resolvedSchema): Record<string, unknown>
  ↓
sdkMethod(data as TBody)   (cast at the same site as today — `form.ts:279`)
```

No generics added to `coerceFormDataToSchema` because its output is fed straight into `validate()` which is the typing boundary today. No `.test-d.ts` changes needed; existing form type tests remain valid.

The new `ArraySchema.element` getter is typed `Schema<unknown>` — the array's existing `T` parameter does not need to flow out (consumers reading `.element` work with `unknown` and rely on validation downstream). This matches `.shape` on `ObjectSchema`.

## E2E Acceptance Test

Live integration test at `packages/ui/src/form/__tests__/form-coercion.test.ts`:

```ts
import { describe, expect, it } from 'vtz/test';
import { s } from '@vertz/schema';
import { form } from '@vertz/ui';
import { ok } from '@vertz/fetch';

describe('Feature: form() coerces FormData to schema types', () => {
  const schema = s.object({
    title: s.string().min(1),
    done: s.boolean(),
    priority: s.number().optional(),
    tags: s.array(s.string()).optional(),
  });

  let lastBody: Record<string, unknown> | undefined;
  const create = Object.assign(
    (body: { title: string; done: boolean; priority?: number; tags?: string[] }) => {
      lastBody = body;
      return Promise.resolve(ok({ id: '1', ...body }));
    },
    { url: '/tasks', method: 'POST' as const, meta: { bodySchema: schema } },
  );

  describe('Given a checkbox is checked (value="on")', () => {
    describe('When the form is submitted', () => {
      it('then the body has done: true', async () => {
        const f = form(create);
        const fd = new FormData();
        fd.set('title', 'task'); fd.set('done', 'on');
        await f.submit(fd);
        expect(lastBody).toEqual({ title: 'task', done: true });
      });
    });
  });

  describe('Given a checkbox is unchecked (key absent)', () => {
    describe('When the form is submitted', () => {
      it('then the body has done: false', async () => {
        const f = form(create);
        const fd = new FormData();
        fd.set('title', 'task');
        await f.submit(fd);
        expect(lastBody).toEqual({ title: 'task', done: false });
      });
    });
  });

  describe('Given a hidden boolean input with value="false"', () => {
    describe('When the form is submitted', () => {
      it('then the body has the field as false', async () => {
        const f = form(create);
        const fd = new FormData();
        fd.set('title', 'task'); fd.set('done', 'false');
        await f.submit(fd);
        expect(lastBody).toEqual({ title: 'task', done: false });
      });
    });
  });

  describe('Given a number input has value "42"', () => {
    describe('When the form is submitted', () => {
      it('then the body has priority: 42', async () => {
        const f = form(create);
        const fd = new FormData();
        fd.set('title', 'task'); fd.set('done', 'on'); fd.set('priority', '42');
        await f.submit(fd);
        expect(lastBody).toEqual({ title: 'task', done: true, priority: 42 });
      });
    });
  });

  describe('Given a number input has value "0"', () => {
    describe('When the form is submitted', () => {
      it('then the body has priority: 0 (not omitted)', async () => {
        const f = form(create);
        const fd = new FormData();
        fd.set('title', 'task'); fd.set('done', 'on'); fd.set('priority', '0');
        await f.submit(fd);
        expect(lastBody).toEqual({ title: 'task', done: true, priority: 0 });
      });
    });
  });

  describe('Given a number input is empty', () => {
    describe('When the form is submitted', () => {
      it('then priority is omitted from the body', async () => {
        const f = form(create);
        const fd = new FormData();
        fd.set('title', 'task'); fd.set('done', 'on'); fd.set('priority', '');
        await f.submit(fd);
        expect(lastBody).toEqual({ title: 'task', done: true });
      });
    });
  });

  describe('Given multiple checkboxes share name="tags"', () => {
    describe('When the form is submitted', () => {
      it('then tags is an array of all checked values', async () => {
        const f = form(create);
        const fd = new FormData();
        fd.set('title', 'task'); fd.set('done', 'on');
        fd.append('tags', 'frontend'); fd.append('tags', 'backend');
        await f.submit(fd);
        expect(lastBody).toEqual({ title: 'task', done: true, tags: ['frontend', 'backend'] });
      });
    });
  });

  describe('Given a string field whose value happens to look numeric', () => {
    describe('When the form is submitted', () => {
      it('then the value stays a string', async () => {
        const f = form(create);
        const fd = new FormData();
        fd.set('title', '42'); fd.set('done', 'on');
        await f.submit(fd);
        expect(lastBody).toEqual({ title: '42', done: true });
      });
    });
  });

  describe('Given a number field with value "0" re-validates on blur', () => {
    describe('When blur fires after a prior failed submit', () => {
      it('then the live error matches the submit error for the same input (single source of truth)', async () => {
        // Setup: bind to a real form element so blur events route through the proxy
        const f = form(create);
        const formEl = document.createElement('form');
        f.__bindElement(formEl);
        const titleInput = document.createElement('input');
        titleInput.name = 'title';
        const priorityInput = document.createElement('input');
        priorityInput.name = 'priority';
        priorityInput.type = 'number';
        formEl.append(titleInput, priorityInput);

        // Step 1: trigger first submit with empty title to flag fields for revalidation
        await f.submit(new FormData(formEl));
        expect(f.title.error.value).toBeDefined(); // required field empty

        // Step 2: type "0" into priority and capture submit-time error
        priorityInput.value = '0';
        priorityInput.dispatchEvent(new Event('input', { bubbles: true }));
        const fdAfter = new FormData(formEl);
        await f.submit(fdAfter);
        const submitErrorForPriority = f.priority.error.value;

        // Step 3: now blur priority and confirm the live error string matches submit error
        priorityInput.dispatchEvent(new Event('focusout', { bubbles: true }));
        const blurErrorForPriority = f.priority.error.value;

        // Contract: same input → same error message at both moments.
        // For "0" against s.number().optional(), both should be undefined (no error).
        expect(blurErrorForPriority).toBe(submitErrorForPriority);
      });
    });
  });
});
```

These nine scenarios are the contract. Boolean variant tests, BigInt, Date, nested fields, mutation-safety, schema-without-`_schemaType`, and `Lazy` skip are implementation-detail coverage added during phases.

## Implementation Plan (high level)

Three phases. Each phase ≤5 files per task; full breakdown lives in `plans/2771-form-coerce-field-types/phase-NN-*.md` after this design is approved.

### Phase 1 — Schema package: public `ArraySchema.element` accessor

Files (≤3):
- `packages/schema/src/schemas/array.ts` (modify) — add `get element()`.
- `packages/schema/src/schemas/__tests__/array.test.ts` (modify) — assert the getter returns the element schema.

Independently shippable; no `@vertz/ui` change needed yet.

### Phase 2 — `coerceFormDataToSchema` + `coerceLeaf` utilities + tests

Files (≤4):
- `packages/ui/src/form/coerce.ts` (new) — pure functions: `coerceFormDataToSchema`, `coerceLeaf`, internal `isVertzSchema`, `unwrap` helpers.
- `packages/ui/src/form/__tests__/coerce.test.ts` (new) — exhaustive table-driven tests for every row of the coercion table, the `Lazy` skip, the duck-typing fallback, and mutation safety (`coerceFormDataToSchema` does not mutate `formData`).

Internal-only; no public re-export from `@vertz/ui`.

### Phase 3 — wire into `form()` (submit + revalidate paths) + E2E tests + docs

Files (≤5):
- `packages/ui/src/form/form.ts` (modify) — call `coerceFormDataToSchema` in `submitPipeline`; call `coerceLeaf` in the blur/change re-validation path.
- `packages/ui/src/form/__tests__/form-coercion.test.ts` (new) — the 9 BDD scenarios above plus the live-revalidation contract scenario.
- `packages/mint-docs/src/<form-page>.mdx` (modify) — add a "FormData coercion" section: what types are coerced, the empty-string semantics, the `false` default for unchecked boxes, the multi-value array behavior. Removes any `s.coerce.*`-in-user-schema workaround examples that may exist today.

Phase 3 is the user-visible change.

### Follow-up issues created at PR open

1. **Server-side FormData / urlencoded body coercion.** Mirror `coerceFormDataToSchema` server-side so progressive-enhancement no-JS submits and the cloud edge layer get the same treatment.
2. **`s.number()` error message for non-numeric input.** Make the schema's native error friendlier than "expected number, received string" when the value is `"42a"`.

## Definition of Done

- All 9 BDD scenarios in the E2E test pass.
- `vtz test && vtz run typecheck && vtz run lint` clean across the monorepo.
- Coverage on `coerce.ts` ≥ 95% (target 100%).
- Adversarial review per phase, findings addressed.
- Two follow-up GitHub issues filed (server-side coercion; schema error message).
- Docs page in `packages/mint-docs/` updated.
- PR title surfaces both packages: `fix(ui,schema): coerce FormData to schema types in form() [#2771]`.
- Changeset: `patch` for `@vertz/schema` (additive `element` getter), `patch` for `@vertz/ui` with explicit callout: **"Behavior change: `form()` now coerces FormData to schema-declared types. (1) Custom `onSubmit` handlers that pre-coerce values should remove that logic to avoid double-coercion. (2) User schemas that switched fields to `s.coerce.boolean()` / `s.coerce.number()` as a workaround should revert to strict `s.boolean()` / `s.number()` — the UI layer now handles the conversion."**
- Follow-up server-side issue body explicitly references `packages/ui/src/form/coerce.ts` as the kernel to lift, so the server work doesn't get re-designed from scratch.
