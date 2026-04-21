# Phase 1: hasAllKeys / hasAnyKey JSONB Operators

- **Author:** vertz-tech-lead bot (commit `42c765533`)
- **Reviewer:** adversarial-review bot (Opus 4.7 1M)
- **Commits:** `42c765533` (single commit)
- **Date:** 2026-04-21

## Changes

- `packages/db/src/sql/where.ts` (modified) — adds `hasAllKeys` / `hasAnyKey` to `FilterOperators`, `OPERATOR_KEYS`, and `buildOperatorCondition`. Emits `col ?& $N::text[]` / `col ?| $N::text[]` on Postgres; throws on SQLite.
- `packages/db/src/schema/path-chain.ts` (modified) — adds `readonly hasAllKeys?` / `readonly hasAnyKey?` to `JsonbPayloadOperators<T, 'postgres'>` as `readonly JsonbKeyOf<T>[]`; adds keyed-never brand fallback on the SQLite branch.
- `packages/db/src/sql/__tests__/where.test.ts` (modified) — two unit tests asserting the emitted SQL and params for each operator.
- `packages/db/src/sql/__tests__/sqlite-builders.test.ts` (modified) — two throw tests asserting the dialect-gate error on SQLite.
- `packages/db/src/client/__tests__/jsonb-typed-operators.test-d.ts` (modified) — positives (plain, readonly `as const`, union payload), negatives (unknown key, primitive payload), SQLite brand diagnostics.
- `.changeset/jsonb-plural-key-ops-2886.md` (new) — patch changeset describing the feature.

## CI Status

- [ ] Quality gates passed at `42c765533` — **not verified by reviewer.** Author asserts the phase is green; no CI log attached to this review. The reviewer did not execute `vtz test && vtz run typecheck && vtz run lint` because this review is a static inspection only.

## Review Checklist

- [x] Delivers what the ticket asks for — mostly yes, modulo the exact SQL shape called out in the acceptance criterion (see Finding F-1).
- [x] TDD compliance — runtime behaviors have unit tests; type surface has `.test-d.ts` positives and negatives; dialect gating has throw tests. No integration test against a real Postgres, which mirrors the existing `hasKey` pattern.
- [x] No type gaps in the basic happy path — operand element correctly constrained to `JsonbKeyOf<T>`; primitive/array payloads collapse to `readonly never[]` so the key cannot be spelled.
- [x] No obvious security issues — operand is parameter-bound; the raw array never enters the SQL string; only the literal SQL cast `::text[]` is concatenated into the query.
- [x] Public API changes match design doc (#2868 parent + #2886 scope).

## Findings

### Changes Requested

#### F-1 — SHOULD-FIX — Emitted SQL does not literally match issue #2886 acceptance

The issue's **Acceptance** section (quote: _"Concrete integration test: `where: { meta: { hasAllKeys: ['a', 'b'] } }` emits `"meta" ?& $1`."_) states the expected SQL as `"meta" ?& $1`. The actual emission in `packages/db/src/sql/where.ts:333` / `:343` is `"meta" ?& $1::text[]` (and `?|` variant).

The **Scope** section of the same issue does separately say _"with the operand bound as `text[]`"_, which justifies the cast. But the acceptance criterion is the literal pass/fail gate, and it is not met byte-for-byte.

Two paths forward:
- (A) Keep the cast and update the issue to reflect the final shape before closing (preferred — the cast is justified; see next paragraph).
- (B) Drop the cast.

Recommendation: keep (A). Without `::text[]`, porsager/postgres' `sql.unsafe()` with `prepare: true` has to infer the element type from the JS array; for a JSON array of strings this usually works but can produce `text[]` or `varchar[]` depending on driver heuristics. The explicit `::text[]` cast is safer and locks the server-side planner to the right operator overload. The reviewer agrees with keeping the cast. This finding is a SHOULD-FIX on **issue hygiene** (update the acceptance text to reflect the cast, or call out the deviation in the PR description), not on the code itself.

Cite: `packages/db/src/sql/where.ts:333`, `packages/db/src/sql/where.ts:343`; tests at `packages/db/src/sql/__tests__/where.test.ts:405,411`.

---

#### F-2 — SHOULD-FIX — No test for empty-array semantics; diverges from `in` / `notIn` short-circuit

`buildWhere({ meta: { hasAllKeys: [] } })` emits `"meta" ?& $1::text[]` bound to `[]`. At the Postgres level this is `jsonb ?& '{}'::text[]`, which returns **TRUE for every row** (vacuously true over the empty key set). `hasAnyKey: []` symmetrically returns **FALSE for every row**.

This is a silently meaningful semantic. Compare to the existing `in` / `notIn` handling at `packages/db/src/sql/where.ts:239–260`, which explicitly short-circuits the empty-array case to `FALSE` / `TRUE` at SQL-build time — precisely to avoid this class of surprise (and also to avoid emitting parameterized SQL with no elements on dialects that reject it).

Two concerns:
1. **Behavioral inconsistency** with `in` / `notIn`. A developer who already internalized "empty-set filter = safe no-op" will get a "match everything" from `hasAllKeys: []`. That's a footgun in user-supplied filter construction (e.g., a UI that synthesizes `hasAllKeys` from a selected-tag list — an empty selection should almost certainly NOT mean "match every row").
2. **Undocumented and untested.** Neither behavior appears in any test in this PR, nor in the changeset, nor in the commit message.

Options:
- (A) Short-circuit: `hasAllKeys: []` → `TRUE`, `hasAnyKey: []` → `FALSE` in the builder (mirrors Postgres semantics explicitly and consolidates the rule with `in`/`notIn`).
- (B) Keep current behavior and add a test that **asserts** it (so the semantics are locked down), plus a line in the changeset.
- (C) Reject at the builder with a thrown error ("`hasAllKeys` requires at least one key").

Recommended minimum: option (B) — add two unit tests asserting what happens for `[]` on each operator, and document the trap in the changeset. Option (C) is the most DX-correct if there is no known legitimate use case for an empty plural-key filter.

Cite: `packages/db/src/sql/where.ts:327–346` (no length check); empty-array tests exist for `in`/`notIn` at `packages/db/src/sql/__tests__/where.test.ts` — verify symmetry.

---

#### F-3 — SHOULD-FIX — Missing combined-operator test for param-index correctness

Every operator's `if` block in `buildOperatorCondition` bumps `idx` independently. The new operators are appended at the end of the chain (lines 327 and 337). There is **no test** exercising the case where `hasAllKeys` and `hasAnyKey` both appear on the same column, e.g.:

```ts
buildWhere({ meta: { hasAllKeys: ['a'], hasAnyKey: ['b'] } })
```

Expected SQL: `"meta" ?& $1::text[] AND "meta" ?| $2::text[]` with params `[['a'], ['b']]`. The code obviously *looks* correct, but the parent review criterion here is "every new branch's param-index interaction is under test." The existing jsonb tests all test operators in isolation; adding a combined case would close the gap.

Additionally: the positive tests call `buildWhere(..., paramOffset=0)` implicitly. A test at `paramOffset != 0` (as is done for some other operators elsewhere) would catch an off-by-one regression in `idx + 1` placeholder math.

Cite: `packages/db/src/sql/__tests__/where.test.ts:403–413` — two tests, each with a single operator in isolation.

---

#### F-4 — SHOULD-FIX — Missing mixed-with-other-filters test; `hasKey`/`jsonContains` have one, the new ops do not

At `packages/db/src/sql/__tests__/where.test.ts:415–422`, there is a dedicated "combines jsonContains with other filters" test. The new plural-key operators do not have the analogous `"status": 'active', meta: { hasAllKeys: [...] }` test. Given the parent ticket explicitly lists `"hasAllKeys('a','b')` equivalent: `AND: [{ meta: { hasKey: 'a' } }, { meta: { hasKey: 'b' } }]"`, developers WILL mix these operators with surrounding filter clauses. Test it.

---

#### F-5 — NIT — Collision-payload plural-key case not exercised at the type level

`CollisionPayload` has natural keys `'jsonContains'` and `'hasKey'`. The existing test at line 341 covers `{ hasKey: 'jsonContains' }`. There is no companion `{ hasAllKeys: ['jsonContains', 'hasKey'] }` test. Operand element type would be `'jsonContains' | 'hasKey'`, so the positive case `{ hasAllKeys: ['jsonContains', 'hasKey'] }` should compile and `{ hasAllKeys: ['bogus'] }` should be rejected. One-liner positive + `@ts-expect-error` negative closes the parity gap with `hasKey`.

Cite: `packages/db/src/client/__tests__/jsonb-typed-operators.test-d.ts:341–350`.

---

#### F-6 — NIT — Error message does not mention the AND/OR + hasKey composition workaround

The issue body itself documents the workaround for environments stuck on SQLite:

```
hasAllKeys('a','b') equivalent: AND: [{ meta: { hasKey: 'a' } }, { meta: { hasKey: 'b' } }]
hasAnyKey('a','b')  equivalent: OR:  [{ meta: { hasKey: 'a' } }, { meta: { hasKey: 'b' } }]
```

The runtime error on SQLite copies the `hasKey` message verbatim: _"On SQLite, fetch with list() and filter in application code."_ A more actionable message for the plural forms would be:

```
hasAllKeys requires dialect: postgres. On SQLite, compose with AND of hasKey checks per key, or fetch with list() and filter in application code.
```

Same shape for `hasAnyKey` → "compose with OR of hasKey checks per key". This is a NIT because consistency with `hasKey` has its own value, but the plural operators have a cleaner in-framework workaround worth surfacing.

Cite: `packages/db/src/sql/where.ts:330,340`.

---

#### F-7 — NIT — Dialect branch of `JsonbPayloadOperators` now has five `?: Brand` properties with identical type — opportunity to DRY

Every key on the SQLite branch of `path-chain.ts:75–81` has the same type (`JsonbOperator_Error_…`). This is fine and mirrors the existing shape, but as the surface grows it becomes worth a helper:

```ts
type GatedOps<K extends string> = { readonly [P in K]?: JsonbOperator_Error_… };
```

Not blocking — pure refactor — but worth noting before the shape grows further in #2885 (`jsonb()` operator expansion).

---

#### F-8 — NIT — `.changeset` says _"On SQLite the diagnostic name itself carries the recovery guidance; the runtime throws a descriptive error that mirrors hasKey."_ but the issue's acceptance text doesn't promise a runtime throw

The changeset correctly describes what landed, but future readers may wonder whether SQLite runtime emission is explicitly supported. Consider adding one sentence: _"Users hitting the runtime error on SQLite should use AND/OR composition with `hasKey`, or switch to Postgres."_ Again, a documentation polish, not a blocker.

---

## What is NOT a finding (explicitly considered and dismissed)

- **Driver array binding correctness.** porsager/postgres (`postgres` v3) binds JS `string[]` to Postgres `text[]` correctly when the position has an explicit `::text[]` cast. `arrayContains` has been shipping in this codebase WITHOUT a cast and with no known driver-binding bug report, so the explicit cast here is strictly safer. This is fine.
- **Readonly vs mutable operand.** TS widens mutable `['a','b']` to a type assignable to `readonly string[]`; positive tests confirm this works. No change needed.
- **OPERATOR_KEYS membership.** Both new keys are present in the set at `where.ts:75,76`, so `isOperatorObject` recognizes them.
- **Union payload distribution.** `JsonbKeyOf<A | B>` distributes to `keyof A | keyof B`; operand type `readonly ('a' | 'b' | 'x')[]` lets a user combine keys from different variants, which is semantically correct (the SQL runs a per-row test on the actual JSONB, which may match any variant).
- **`?&` / `?|` with `prepare: true` in porsager/postgres.** The parent `hasKey` operator already uses `?` with the same `prepare: true` setting, so any driver-level question here is pre-existing in #2868, not introduced by this PR.

## Resolution

Addressed in a follow-up commit on the same branch before PR:

- **F-2** — Short-circuit adopted (option A): `hasAllKeys: []` → `TRUE`, `hasAnyKey: []` → `FALSE`, matching the `in`/`notIn` identity convention (universal-over-empty = TRUE, existential-over-empty = FALSE). Two new unit tests lock this down (`packages/db/src/sql/__tests__/where.test.ts`). Inline comments cite the quantifier identity.
- **F-3** — Two combined-operator tests added: (a) `meta: { hasAllKeys: [...], hasAnyKey: [...] }` asserts correct `$1`/`$2` advancement on the same column, (b) mixed-with-top-level (`status: 'x', meta: { hasAllKeys: [...] }`) asserts the offset against sibling filters.
- **F-4** — Covered by the mixed-with-top-level test above.
- **F-6** — Runtime SQLite errors now name the framework-native workaround (`AND: [{ col: { hasKey: "a" } }, ...]` / `OR: [...]`). Two throw tests pin the workaround text.
- **F-1** — Cast kept; called out in the PR description.
- **F-5, F-7, F-8** — Deferred as nits (not required for the ticket; would bloat this PR with unrelated refactors).

No re-review required; blockers never existed.
