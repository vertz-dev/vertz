# Phase 3: Wire coerce utility into form() + E2E + docs

## Context

Issue [#2771](https://github.com/vertz-dev/vertz/issues/2771). Phases 1 (element getter) and 2 (`coerce.ts`) are complete. This phase makes the fix user-visible by wiring `coerceFormDataToSchema` into `form().submitPipeline`, wiring `coerceLeaf` into the blur/change re-validation path, and adding the E2E acceptance test from the design doc. Also updates user-facing docs in `packages/mint-docs`.

This is the only phase the user feels. After it lands, the issue's reproduction case works end to end.

## Tasks

### Task 1: Wire `coerceFormDataToSchema` into `submitPipeline`

**Files:** (2)
- `packages/ui/src/form/form.ts` (modify)
- `packages/ui/src/form/__tests__/form-coercion.test.ts` (new) — first 8 BDD scenarios from the design doc (everything except the blur scenario, deferred to Task 2)

**What to implement:**

In `packages/ui/src/form/form.ts:258-271` (`submitPipeline`), replace:

```ts
const data = formDataToObject(formData, { nested: true });
```

with:

```ts
const data = resolvedSchema
  ? coerceFormDataToSchema(formData, resolvedSchema)
  : formDataToObject(formData, { nested: true });
```

Import `coerceFormDataToSchema` from `./coerce`. Validation and SDK call remain unchanged.

**Acceptance criteria:**
- [ ] All 8 non-blur BDD scenarios in `form-coercion.test.ts` pass (boolean checked/unchecked/`"false"`, number `42`/`0`/empty, multi-checkbox tags, string-looks-numeric).
- [ ] Existing `form.test.ts` tests still pass unchanged.
- [ ] `submitPipeline` does not double-coerce when `resolvedSchema` is undefined (custom-schema-less SDK methods retain today's behavior).
- [ ] No regression in `form.ts:388-394` (`submit(formData?)` overload routes through `submitPipeline`).
- [ ] Quality gate green: `vtz test --filter packages/ui && vtz run typecheck && vtz run lint`.
- [ ] Coverage on the modified region of `form.ts` ≥ 95%.

---

### Task 2: Apply `coerceLeaf` in blur/change re-validation

**Files:** (2)
- `packages/ui/src/form/form.ts` (modify — same file as Task 1)
- `packages/ui/src/form/__tests__/form-coercion.test.ts` (modify — add the 9th scenario: blur error == submit error)

**What to implement:**

In `packages/ui/src/form/form.ts` find `revalidateFieldIfNeeded` (around `form.ts:327-335`). Before calling `validateField`, look up the field's leaf schema via the existing `resolveFieldSchema` (in `validation.ts`) and coerce the field's current value:

```ts
function revalidateFieldIfNeeded(fieldName: string): void {
  if (!resolvedSchema) return;
  const field = fieldCache.get(fieldName);
  if (!field || field.error.peek() === undefined) return;

  const leafSchema = resolveFieldSchema(resolvedSchema, fieldName);
  const raw = field.value.peek();
  const coerced = leafSchema ? coerceLeaf(raw, leafSchema) : raw;
  const result = validateField(resolvedSchema, fieldName, coerced, /* fullData ... */);
  // existing error-clearing / setting logic
}
```

`resolveFieldSchema` is currently file-internal in `validation.ts`. Export it (or inline the same lookup in `coerce.ts` and re-use). Keep the existing `validateField` contract; only the value passed in changes.

**Acceptance criteria:**
- [ ] The blur-revalidation BDD scenario in `form-coercion.test.ts` passes — submit error and blur error are equal for the same field value.
- [ ] Existing `form.test.ts` revalidation tests still pass.
- [ ] If the schema doesn't expose `_schemaType` on the resolved leaf (custom adapter), `validateField` is called with the raw value (today's behavior — no regression).
- [ ] Quality gate green.

---

### Task 3: Update `packages/mint-docs` form() page + add changeset

**Files:** (2)
- `packages/mint-docs/<existing form() page>.mdx` (modify — locate via search; likely `pages/forms/form.mdx` or similar)
- `.changeset/<new>.md` (new)

**What to implement:**

1. Find the existing `form()` documentation page in `packages/mint-docs`. Add a new section "FormData coercion" describing:
   - Boolean fields: checked/unchecked semantics, custom `value` attributes.
   - Number/BigInt fields: numeric strings coerced; empty strings dropped (let `optional()`/`default()` apply).
   - Date fields: parseable strings → `Date`; unparseable passed through.
   - String fields: never coerced (even if value looks numeric).
   - Multi-value fields: `<input type="checkbox" name="tags" value="..." />` arrays of primitives.
   - Out of scope: arrays of objects (today's dotted-index FormData behavior is preserved without leaf coercion).
2. Remove/update any examples that show `s.coerce.boolean()` / `s.coerce.number()` in user schemas as a workaround for non-string inputs. Replace with strict `s.boolean()` / `s.number()`.
3. Add a changeset:

```md
---
'@vertz/ui': patch
'@vertz/schema': patch
---

fix(ui,schema): coerce FormData to schema-declared types in `form()` (#2771)

`form()` now coerces FormData values to match the body schema's declared types
before validation and submission.

- Boolean fields: checked → `true`; unchecked → `false`; `value="false"`/`"0"`/`"off"` → `false`.
- Number/BigInt fields: numeric strings → numbers; empty strings dropped (let `optional()`/`default()` apply).
- Date fields: parseable strings → `Date`.
- String fields: never coerced, even if the value looks numeric.
- Multi-value fields: `<input type="checkbox" name="tags" value="..." />` produces `string[]`.
- Same coercion is applied to blur/change re-validation so live and submit
  errors agree.

Behavior change: (1) Custom `onSubmit` handlers that pre-coerce values should
remove that logic to avoid double-coercion. (2) User schemas that switched
fields to `s.coerce.boolean()` / `s.coerce.number()` as a workaround should
revert to strict `s.boolean()` / `s.number()` — the UI layer now handles the
conversion.

Adds a public `get element(): Schema<unknown>` accessor to `ArraySchema` in
`@vertz/schema` (additive; previously `_element` was private).
```

**Acceptance criteria:**
- [ ] mint-docs page builds without warnings (run the docs check command for the package).
- [ ] No remaining `s.coerce.boolean()`/`s.coerce.number()` in form examples.
- [ ] Changeset file lints clean.
- [ ] Quality gate green across the monorepo: `vtz test && vtz run typecheck && vtz run lint`.

---

### Task 4: File the two follow-up GitHub issues

**Files:** (none — runtime work, not code)

**What to implement:**

Open two issues with `gh issue create` from this branch, both linked to #2771 in their bodies:

1. **"Server-side body coercion using shared `coerceFormDataToSchema`"** — body references `packages/ui/src/form/coerce.ts` as the kernel to lift. Lists three callers that need it: progressive-enhancement no-JS form posts, agent/curl callers using `application/x-www-form-urlencoded`, and the Vertz Cloud edge layer that runs entity-access rules before the developer's app code.

2. **"`s.number()` / `s.bigint()` / `s.date()` error messages when given a non-numeric / unparseable string"** — body references the `coerceLeaf` "non-numeric pass-through" rationale in the design doc. Goal: the schema's native error should say "Must be a number" (or similar) rather than "Expected number, received string" when the input is `"42a"`.

Capture the new issue numbers; add them to the final PR body.

**Acceptance criteria:**
- [ ] Both issues exist in the `vertz-dev/vertz` repo.
- [ ] Both reference #2771.
- [ ] Both reference `packages/ui/src/form/coerce.ts` where appropriate.

## Phase Definition of Done

- All four task acceptance criteria met.
- All 9 BDD scenarios in `form-coercion.test.ts` pass.
- Adversarial review at `reviews/2771-form-coerce-field-types/phase-03-wire-form-and-docs.md` — no blockers.
- Phase commit pushed to `viniciusdacal/issue-2771`.
- Two follow-up issue numbers recorded for the final PR description.
