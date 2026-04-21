# Phase 1: arrayContains / arrayContainedBy / arrayOverlaps type gating

- **Author:** vertz-tech-lead bot (commit `83247f814`)
- **Reviewer:** adversarial-review bot (Opus 4.7 1M)
- **Commits:** `83247f814` (single commit)
- **Date:** 2026-04-21

## Changes

- `packages/db/src/schema/inference.ts` (modified) — adds `IsArrayColumn`, `ArrayElementOf`, `ArrayOperatorSlots`; routes array columns through a 3-way union branch in `FilterType`.
- `packages/db/src/schema/array-filter-brand.ts` (new) — keyed-never brand interface.
- `packages/db/src/client/__tests__/array-operators.test-d.ts` (new) — type tests for the new surface.
- `plans/2885-array-op-type-gating.md` (new) — design doc.

## CI Status

- [x] Reviewer ran `npx tsc --noEmit -p packages/db/tsconfig.typecheck.json` — clean (only pre-existing `postgres-integration.local.ts` noise, unrelated).
- [ ] `vtz test` not run by reviewer (no runtime change; existing `where.test.ts` / `sqlite-builders.test.ts` suites cover the SQL emission and throw path).

## Review Checklist

- [x] Delivers what the ticket asks for — typed `arrayContains` / `arrayContainedBy` / `arrayOverlaps` with brand gating on SQLite, per-element-type operand enforcement, routes through `FilterType`.
- [x] TDD compliance — type tests include positives per column type, negatives for wrong element types, brand negatives per operator, nullable `isNull` retention, direct-value shorthand, end-to-end via `createDb()`.
- [x] No type gaps on the happy path — reviewer empirically verified `IsArrayColumn` matches only the three supported sqlTypes; `ArrayElementOf` extracts correct element types; the nested-include path (`include.posts.where`) correctly propagates the gate; `jsonb<string[]>()` does NOT spuriously match the array branch.
- [x] No security issues — pure type surface, no new runtime/binding path.
- [ ] Public API changes match design doc — **deviates silently**; see F-1.

## Findings

### Changes Requested

#### F-1 — SHOULD-FIX — Design doc promises intersection, implementation ships a 3-way union

The design doc at `plans/2885-array-op-type-gating.md:117-119` specifies the new `FilterType` branch as:

```ts
| InferColumnType<TColumns[K]>
| (ColumnFilterOperators<...> & ArrayOperatorSlots<...>)
```

And explicitly rejects the standalone-union alternative at line 184:
> _"Rejected alternative: making `ArrayOperatorSlots` a standalone union member in `FilterType` ... Intersection with `ColumnFilterOperators` composes better: users can write `{ eq: [...], arrayOverlaps: [...] }` in one object. A standalone branch would force an either/or."_

The shipped code at `packages/db/src/schema/inference.ts:186-189` is the rejected alternative:

```ts
| InferColumnType<TColumns[K]>
| ColumnFilterOperators<...>
| ArrayOperatorSlots<...>
```

The test file acknowledges the switch in a comment at `array-operators.test-d.ts:96-101` and the commit message hints at it (_"The 3-way union ... is what keeps element-type errors narrow per property"_), but the design doc was **not updated** to reflect the decision reversal.

Two concerns:

1. **The design doc's justification for rejecting union is now wrong.** It claimed union "would force an either/or." Empirically that is false — TS's union contextual typing accepts `{ eq: [...], arrayOverlaps: [...] }` on the union form (confirmed by `pgMixedOps` passing in the test file). The real reason to choose union was different — something about per-property diagnostic narrowing — and the design doc needs to state it correctly.
2. **Reviewer double-checked intersection vs union for element-type errors empirically.** Both forms fire `TS2322: Type 'number' is not assignable to type 'string'` for `arrayContains: [42]` on a `string[]` column. The "keeps element-type errors narrow" claim is plausible but under-specified — what concrete case does intersection handle worse than union? If the answer is "none," the design-doc reversal is cosmetic and the union is fine. If the answer is a specific case, the test file should assert it.

**Recommended fix:** Update `plans/2885-array-op-type-gating.md` to (a) reflect the shipped 3-way union shape in section 5, (b) flip the "Rejected alternative" at line 184 to instead reject the intersection form, with the concrete reason, (c) add one sentence to the PR description calling out the deviation. If no concrete reason exists, either revert to intersection (matches the design doc as sold) or document that the choice is DX-neutral.

Cite: `plans/2885-array-op-type-gating.md:117-119,184`; `packages/db/src/schema/inference.ts:186-189`; `packages/db/src/client/__tests__/array-operators.test-d.ts:96-105`.

---

#### F-2 — SHOULD-FIX — Brand name does not give actionable recovery

The convention established in #2850 and #2868 is that "the alias name IS the recovery sentence":

- `JsonbPathFilter_Error_Requires_Dialect_Postgres_On_SQLite_Use_list_And_Filter_In_JS` — tells you the recovery.
- `JsonbOperator_Error_Requires_Dialect_Postgres_On_SQLite_Fetch_And_Filter_In_JS` — tells you the recovery.

New brand: `ArrayFilter_Error_Requires_Dialect_Postgres_On_SQLite_Not_Supported` — says "not supported" and stops. No recovery guidance is encoded.

The runtime throw in `packages/db/src/sql/where.ts:267-269` says _"Use a different filter strategy or switch to Postgres"_ — which is also vague. Contrast the `hasAllKeys` SQLite throw resolution in #2886 F-6 which called out the in-framework composition workaround.

There IS a natural recovery: fetch with `list()` and filter in application code (same as JSONB). So the brand should read:

```
ArrayFilter_Error_Requires_Dialect_Postgres_On_SQLite_Fetch_And_Filter_In_JS
```

Matching the JSONB convention, and the runtime throw message should be updated to the same guidance (and tested in `sqlite-builders.test.ts`). Today the brand and the runtime message are both vague, which is a DX regression relative to #2850/#2868.

This is a **rename + one-line runtime message update** — small change, but affects the public brand name which is exactly what gets quoted into the LLM retrieval surface per the "alias name IS the recovery sentence" rationale at `packages/db/src/schema/jsonb-filter-brand.ts:1-11`.

Cite: `packages/db/src/schema/array-filter-brand.ts:21`; `packages/db/src/sql/where.ts:267-269,278-280,289-291`; `packages/db/src/sql/__tests__/sqlite-builders.test.ts:237,245,253`.

---

#### F-3 — SHOULD-FIX — No changeset under `.changeset/`

The design doc's own Definition of Done at `plans/2885-array-op-type-gating.md:288` lists _"Changeset added under `.changeset/`"_. No changeset file was added in this commit. Compare to `.changeset/jsonb-plural-key-ops-2886.md` which landed with the parent #2886 PR.

Add `.changeset/array-op-type-gating-2885.md` (patch — per `.claude/rules/policies.md` _"Every changeset = `patch`"_).

---

### Nits

#### F-4 — NIT — Test file is missing the combined-operator param-index sanity case

Pre-existing parallel with #2886 review F-3: the new operator keys all live in the same `buildOperatorCondition` chain (`where.ts:264-296`) and each bumps `idx` independently. There's no runtime test asserting that `tags: { arrayContains: [...], arrayOverlaps: [...] }` produces `$1`/`$2` correctly (type layer now permits mixing these on Postgres per the union decision in F-1). If the current `where.test.ts` doesn't exercise this already for array ops, one 3-line unit test closes the gap — completely analogous to what #2886 resolution F-3 added for `hasAllKeys`/`hasAnyKey`.

This is a NIT because the code obviously looks correct and each operator was tested in isolation when array-ops first landed; but the PR actively promotes mixing (union comment at `array-operators.test-d.ts:96-101`), so the mixed case deserves a unit test.

Cite: `packages/db/src/sql/where.ts:264-296`; `packages/db/src/sql/__tests__/where.test.ts` (no combined array-op test at time of review).

---

#### F-5 — NIT — Dialect branch of `ArrayOperatorSlots` repeats the brand three times — opportunity to DRY (also called out in #2886 F-7)

`packages/db/src/schema/inference.ts:150-154` spells the brand three times. `packages/db/src/schema/path-chain.ts:75-81` spelled it five times. This is fine for now, but a small helper would reduce the visual noise as the surface grows:

```ts
type GatedOps<K extends string, B> = { readonly [P in K]?: B };
```

Not blocking; cosmetic. Same comment as #2886 F-7 — worth a small follow-up refactor once the pattern appears three times.

---

#### F-6 — NIT — `pgPlainNoArrayOps` test asserts ONE operator, not all three

`array-operators.test-d.ts:140-144` checks that `name: { arrayContains: ['a'] }` is rejected on a `d.text()` column. The check is valid, but it only exercises `arrayContains`. If a future refactor accidentally loosened one of the three slots (e.g., moved `arrayOverlaps` to `ColumnFilterOperators`), the current test would miss it. A three-operator sweep (`arrayContains` / `arrayContainedBy` / `arrayOverlaps`) on `name: d.text()` AND `count: d.integer()` would close the gap.

Same critique applies to the `pgPlainNoArrayOps` absence on `d.integer()` — the negative is only tested on `d.text()`.

Cite: `packages/db/src/client/__tests__/array-operators.test-d.ts:133-144`.

---

#### F-7 — NIT — Design doc's Type Flow Map omits `TDialect → ArrayOperatorSlots → brand` reverse flow

The Type Flow Map at `plans/2885-array-op-type-gating.md:188-194` lists how TDialect flows but does not trace which diagnostic the user sees on the SQLite branch. The JSONB design docs added a "Diagnostic Shape" sub-section after the Type Flow Map. Consider adding a two-line snippet showing the actual TS2322 output (as reviewer captured empirically: `Type '{ arrayContains: string[]; }' is not assignable to type 'string[] | { readonly arrayContains?: ArrayFilter_Error_... ; ... } | ...'`).

This is mainly documentation polish and aligns the doc with how #2850/#2868 captured the error shape. Not blocking.

---

## What is NOT a finding (explicitly considered and dismissed)

- **`IsArrayColumn` matching by `sqlType` vs by inferred TS type.** Correct choice. `d.bytea()` inferred as `Uint8Array` wouldn't match `readonly U[]` anyway, but the explicit `sqlType`-based narrowing matches the existing `IsJsonbColumn` pattern and is the right precedent.
- **Readonly vs mutable operand.** `readonly TElem[]` accepts both `string[]` and `readonly string[] as const` — verified by `pgTextAsConst` test and empirically by reviewer.
- **Vector dimension not enforced on operand length.** Same semantics as the pre-existing runtime — `d.vector(3)` accepts an operand of any length. Future work if needed, not a regression.
- **Widened-dialect case (`const d: DialectName = ...`).** The runtime throw at `where.ts:264-296` remains the backstop per the design doc and `array-filter-brand.ts:14-17` — intentional, not a gap.
- **`isNull` on nullable array columns.** Verified: `labels: d.textArray().nullable()` still accepts `{ isNull: true }`; non-nullable `tags` correctly rejects it. The union + `ColumnFilterOperators` + nullable gating composes correctly.
- **Nested `include.where` propagates the gate.** Empirically verified via a probe script — `user.list({ include: { posts: { where: { tags: { arrayContains: [...] } } } } })` fires the brand on SQLite.
- **`jsonb<string[]>()` does not accidentally match `IsArrayColumn`.** Verified — routed through the JSONB branch; `arrayContains` is rejected as an unknown operator. `IsJsonbColumn` fires first in the conditional chain.
- **`ArrayElementOf<ColumnBuilder<string[], _>>`.** Returns `string` — verified; `number[]` → `number` for integer arrays and vectors.
- **`@ts-expect-error` placement.** TS reports wrong-element errors on the OUTER property (`tags:` line) for array columns but on the INNER operator (`arrayContains:` line) for non-array columns. The test file places `@ts-expect-error` on the line immediately above the property assignment, which works for both cases (the directive suppresses any error on the next non-comment line). Verified empirically — no unused-directive errors when typecheck runs.
- **Compile-time cost.** The new conditional branch adds ~40% work to `FilterType[K]` resolution for columns that ARE array columns. Negligible; no instantiation-depth issue given `IsArrayColumn` is a shallow distributive conditional.
- **Intersection-vs-union contextual typing on `pgMixedOps`.** Both forms accept `{ eq: [...], arrayOverlaps: [...] }`. See F-1 for why this matters for the design doc text.

## Resolution

No blockers; three SHOULD-FIX items recommended before PR:

- **F-1** — Update design doc to reflect the shipped union shape + flip "Rejected alternative" with a concrete reason (or revert to intersection). At minimum, mention the deviation in the PR description.
- **F-2** — Rename brand to `ArrayFilter_Error_Requires_Dialect_Postgres_On_SQLite_Fetch_And_Filter_In_JS` and update the runtime throw message symmetrically. This is the **public diagnostic surface** — pre-v1 policy in `.claude/rules/policies.md` says consolidate aggressively, and the three brands should match their convention.
- **F-3** — Add `.changeset/array-op-type-gating-2885.md` (patch).

Nits (F-4 through F-7) can be deferred as follow-ups; none block the PR.
