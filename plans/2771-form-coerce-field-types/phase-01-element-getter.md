# Phase 1: Public ArraySchema.element getter

## Context

Issue [#2771](https://github.com/vertz-dev/vertz/issues/2771) requires `form()` to coerce FormData values to schema-declared types. The coercion utility (Phase 2) walks the bodySchema's tree and needs to read the element schema from `s.array(...)` nodes. Today `ArraySchema` stores its element in a private `_element` field with no public getter (`packages/schema/src/schemas/array.ts:8`). This phase adds a stable public accessor so Phase 2 doesn't reach into private state.

This phase is independently shippable: it's an additive, type-safe getter with no behavior change. Design doc: `plans/2771-form-coerce-field-types.md` (see "API Surface — One non-public API addition" and Phase 1 in "Implementation Plan").

## Tasks

### Task 1: Add `get element()` to `ArraySchema`, with tests

**Files:** (3)
- `packages/schema/src/schemas/array.ts` (modify)
- `packages/schema/src/schemas/__tests__/array.test.ts` (modify) — add a small describe block for the getter
- `packages/schema/src/index.ts` (verify only — no change expected; `ArraySchema` is already exported transitively via `s.array`)

**What to implement:**

In `packages/schema/src/schemas/array.ts`, expose the existing private `_element` field via a public getter:

```ts
get element(): Schema<unknown> {
  return this._element as Schema<unknown>;
}
```

The return type is `Schema<unknown>` (mirrors how `ObjectSchema.shape` is consumed). Tests assert the getter returns the same reference passed at construction.

**Acceptance criteria:**
- [ ] `s.array(s.string()).element` returns a schema whose `_schemaType()` is `SchemaType.String`.
- [ ] `s.array(s.boolean()).element.parse(true)` returns `{ ok: true, data: true }` (proves it's the live element schema, not a copy).
- [ ] `s.array(s.object({ a: s.number() })).element` is the inner ObjectSchema; `(.element as ObjectSchema).shape` is reachable from a downstream test.
- [ ] No clippy/oxlint/typecheck regressions in the schema package.
- [ ] Coverage on `array.ts` ≥ 95%.
- [ ] Quality gate green: `vtz test --filter packages/schema && vtz run typecheck && vtz run lint`.

## Phase Definition of Done

- All Task 1 acceptance criteria met.
- Adversarial review at `reviews/2771-form-coerce-field-types/phase-01-element-getter.md` — no blockers.
- Phase commit pushed to `viniciusdacal/issue-2771`.
