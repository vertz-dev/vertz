# Phase B: Type Gating — Adversarial Review

- **Author:** claude (TDD loop)
- **Reviewer:** claude (adversarial pass)
- **Commit:** 04a8f1256
- **Date:** 2026-04-19

## CI Status
- [x] Quality gates green (test + typecheck + lint) at 04a8f1256
- Measured `tsgo --noEmit -p tsconfig.typecheck.json`: 0.82s user / 0.36s wall. Perf claim honest.

## Findings

### BLOCKERS

**B1. The diagnostic does NOT actually surface the recovery sentence.**
The whole premise of `JsonbPathFilterGuard` is that TS will quote the long-named key verbatim. Reproduction: commented out the `@ts-expect-error` on `src/client/__tests__/jsonb-filter-gate.test-d.ts:38` and ran `tsgo`. The error TypeScript emits is:

```
error TS2353: Object literal may only specify known properties,
and 'eq' does not exist in type 'JsonbPathFilterGuard'.
```

The key `'meta->displayName'` is *accepted* by the mapped type (it matches `JsonbPathKey<TColumns>`), so the excess-property check fires on the **value** (`{ eq: 'Acme' }`) against `JsonbPathFilterGuard`, not on the key. The long sentence only appears if the user tries `where: { 'meta->x': {} as JsonbPathFilterGuard }`, which nobody writes. The developer sees a cryptic "`eq` does not exist in type `JsonbPathFilterGuard`" and must grep for that type name.

The design doc's whole justification for the keyed-never brand ("key name IS the diagnostic, excess-property check quotes the key verbatim") is incorrect as implemented. The commit message repeats this false claim. Needs one of: (a) make the path **key** resolve to `never` on SQLite (so the key itself becomes the excess-property diagnostic), or (b) embed the sentence in the operand type via `{ [K in '…sentence…']: never }` such that the excess-property check fires on the well-known `eq`/`ne` keys and quotes the sentence-key, or (c) update JSDoc on `FilterType` to tell devs to look up `JsonbPathFilterGuard`.

**B2. `FilterType<TColumns>` stragglers bypass the gate entirely.**
`grep 'FilterType<'` shows the following call sites still use the 1-arg form (TDialect defaults to `DialectName`, which is the permissive union):

- `src/query/aggregate.ts:200, 325` — aggregate `where` types
- `src/query/crud.ts:90, 138, 361, 418, 473, 551, 582` — internal CRUD arg types used by adapters
- `src/schema/inference.ts:377` — second `IncludeOption`-adjacent `where?` (outside the main threading)
- `src/types/adapter.ts:40` — adapter-facing `FilterType<TCols>`

With default `TDialect = DialectName` (union), `JsonbPathValue` distributes to `unknown | ComparisonOperators<unknown> | JsonbPathFilterGuard` — the `unknown` member makes the value slot accept **anything**. I verified: `const f: FilterType<Cols> = { 'meta->x': { eq: 'v' } }` compiles with zero error. `createDb` narrows correctly, but any code that touches the internal `crud.ts`/`aggregate.ts`/adapter types (reasonable for framework extensions) gets no gating. This is the same "default masks the gate" failure mode the commit message itself warns about for `Db<…>` consumers.

**B3. Default `TDialect = DialectName` on `DatabaseClient`/`TransactionClient` silently disables gating for users who write explicit type annotations.**
`DatabaseClient<TModels>` (1-arg) — as exported publicly and widely used (e.g. `DatabaseClient<typeof models>` in app code, dependency injection, service constructors) — defaults to `DialectName`, permissive. If a developer writes `const db: DatabaseClient<TModels>` and assigns `createDb({ dialect: 'sqlite', … })` to it, the instantiation site narrows, but the variable's declared type widens, and subsequent `db.install.list({ where: { 'meta->x': … } })` calls compile cleanly. The runtime throw catches it, but the "compile-time rejection" promise is broken by the natural way TypeScript users write code. Consider making the generic required (no default) or defaulting to `'postgres'` (stricter: legacy Postgres-only users are the status quo; SQLite users opted into the new world and narrow via inference).

### SHOULD-FIX

**S1. `JsonbPathValue<'postgres'>` operand is `unknown | ComparisonOperators<unknown>`.** `unknown` in a union absorbs every other member — `{ eq: 123 }`, `{ notACmp: 'x' }`, `'raw'`, `null`, everything is assignable. This is a regression vs the prior strict `InferColumnType<T> | ColumnFilterOperators<…>` typing (which rejected garbage). Use `ComparisonOperators<unknown> & StringOperators` or `unknown` alone (not a union — the union has no effect). Agreed #2868 handles the typed-path story, but don't ship a worse default.

**S2. Array-ops deferral is a silent retreat from goal #3 of the design doc.** Design doc explicitly lists "Array operators are type-gated to Postgres" alongside jsonb path gating. Commit defers it. This should either be a documented non-goal delta back-linked to the design doc, or a P1 follow-up in the feature PR description. Hiding it in the commit body is not enough; the retro/PR description must surface it.

**S3. Postgres positive test `_queryFn: (async () => …) as never`.** Not a test hole per se — `_queryFn` is `@internal` — but the `as never` cast hides that the type of `QueryFn` vs the async arrow mismatch is not obvious. Use `as QueryFn` (exported from the same module) so the test doubles as a contract check.

### NITS

**N1.** `DialectName` export is good; `Dialect.name` references it. Consider narrowing the type alias location (currently at `dialect/types.ts`, adjacent to the `Dialect` interface) — fine, noted.

**N2.** Excess-property-check caveat in `jsonb-filter-brand.ts` JSDoc is accurate and calls out the widened-variable case. Good self-awareness. Pair it with a doc line in `sql/where.ts:102-108` pointing back at the TS gate so the runtime/typelevel relationship is discoverable.

**N3.** `IncludeOption._Depth extends readonly unknown[] = []` depth cap: TDialect inserted before `_Depth` with a default of `DialectName`, positional inference keeps working — verified by the nested-include test. No regression.

**N4.** Test file stacks 20 models and calls `.list({ where: { title: 'x' } })` twice. Not an inference stress test in the failure sense — it'd still compile if threading broke. Add a `FilterType<Cols20, 'sqlite'>` assignment to actually exercise the big-model case.

## Verdict
CHANGES REQUESTED

The feature's core promise — "self-describing TS diagnostic on SQLite misuse" — is not delivered as advertised (B1). The gate has widespread holes through default generics (B2, B3) that let the natural Postgres code path through on SQLite at the type level, leaving the runtime throw as the only real enforcement. Runtime backstop at `sql/where.ts:102-108` does fire, so this is not a correctness regression — but the design doc's Phase B success criteria are not met. Fix B1 (diagnostic location) and at minimum one of B2/B3 (the internal-FilterType leak OR the default-generic leak) before merging.

---

## Re-review @ 0604e1c8d

- **B1 — RESOLVED.** Reproduced by flipping `@ts-expect-error` lines in `jsonb-filter-gate.test-d.ts`. TS now emits:
  `'eq' does not exist in type 'JsonbPathFilter_Error_Requires_Dialect_Postgres_On_SQLite_Use_list_And_Filter_In_JS'`
  on all three negative sites (direct, nested-include, aggregate). Recovery sentence is in the diagnostic. The `unique symbol` brand + named `interface` (not `type` alias wrapping `never`) is the correct fix — TS retains the interface name because the optional `?` no longer collapses it to `undefined`.
- **B2 — RESOLVED.** `grep 'FilterType<[^,>]+>'` (1-arg form) returns zero matches across `packages/db/src`. All CRUD, aggregate, FindOptions, and ModelDelegate sites now thread `TDialect`. New aggregate positive+negative tests lock the gate in.
- **B3 — ACCEPTED as documented caveat.** `DatabaseClient<TModels>` still defaults to `DialectName`, so the widened-annotation case bypasses the type gate. Author's call is reasonable: changing the default breaks every existing `Db<...>` reference in user code, and the runtime throw at `sql/where.ts:102-108` catches the slip. Same equivalence class as `const dialect: DialectName = '…'`. Not a blocker.
- **S1 — RESOLVED.** Probed `FilterType<C, 'postgres'>` with `{ 'meta->x': { foo: 1 } }` — TS rejects with "'foo' does not exist in type 'ComparisonOperators<unknown>'". Operand no longer absorbs-anything.
- **S2 (array ops) — acknowledged, tracked in #2868.**
- **types/adapter.ts scope cut — acknowledged.** `EntityDbAdapter` ripple into `@vertz/server` is real. Fine as a follow-up; surface in the feature PR description.

Typecheck wall: 0.25s. No regressions.

**Updated verdict: APPROVED.**
