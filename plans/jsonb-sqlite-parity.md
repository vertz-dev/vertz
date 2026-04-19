# `d.jsonb<T>()` — SQLite Parity & Filter Type Gating

**Issue:** [#2850](https://github.com/vertz-dev/vertz/issues/2850)
**Status:** Design (rev 3, post second round of reviews)

## Context & Problem

On SQLite (and Cloudflare D1), `d.jsonb<T>()` columns are stored as `TEXT`. On writes, the underlying SQLite driver (`@vertz/sqlite` / `bun:sqlite`) implicitly stringifies objects when binding — so the write path works today, but by accident of the driver, not by design. On reads, the stored `TEXT` comes back as a raw JSON string, but TypeScript claims the row field is `T`. Postgres, in contrast, returns the parsed object via `postgres.js`'s built-in JSONB type parser. Result: every consumer has to `JSON.parse(row.meta as unknown as string)` on SQLite.

### Empirical repro (verified)

```ts
const installTable = d.table('install', {
  id: d.uuid().primary({ generate: 'uuid' }),
  meta: d.jsonb<{ displayName: string }>(),
}, { indexes: [] });

const db = createDb({ dialect: 'sqlite', path: ':memory:', models: { install: d.model(installTable) } });
await db.install.create({ data: { meta: { displayName: 'Acme' } } });
const listed = await db.install.list({});
// listed.data[0].meta — TS type: { displayName: string }; runtime value: '{"displayName":"Acme"}'
```

Probe (2026-04-19): `create` succeeds (driver implicitly stringifies), `list` returns `meta: '{"displayName":"Acme"}'` as a string.

### Deeper footgun — filter operators

`packages/db/src/sql/where.ts:103` throws at **runtime** if a filter key contains `->` on a dialect where `supportsJsonbPath === false`. Array ops (`arrayContains` / `arrayContainedBy` / `arrayOverlaps`) are similarly gated at runtime only (where.ts:208–240). If we only fix parse, the next developer to write `where: { 'meta->displayName': { eq: 'Acme' } }` against SQLite hits a runtime error that types should have caught.

## Goals

1. `d.jsonb<T>()` (and `d.json<T>()`) round-trip through SQLite/D1 without any `JSON.parse` at the call site. Runtime matches TS type.
2. Write stringification is **explicit** in Vertz code (not accidental driver behavior), so it's robust across SQLite drivers and gives the future `validator` hook a known call site.
3. **If a validator is provided**, it runs on the parsed value on reads — same as the issue's acceptance criterion. (Acceptance on writes is handled by the existing validator-on-create/update work — out of scope here, tracked separately.)
4. On reads, **typed JSONB path filter keys** (`'col->key'`) and **typed array operators** are available **only when `dialect: 'postgres'`** at the type level. Calling them on SQLite is a compile error with a descriptive branded message.
5. Postgres runtime and type behavior is unchanged for existing code.

## Non-Goals

- **New JSONB operators** — type-safe `contains`, typed `path()`, containment builders. Worth adding, separate ticket (to be filed before this merges).
- **Wiring `validator` on writes** — the field is dead code on all dialects today. We wire only the read side here (where the issue asks). Full coverage tracked separately.
- **MySQL.** No driver yet.
- **Fixing `extractTableName`'s regex limitation** (sqlite-driver.ts:76–102). Latent quirk around joins/CTEs that's pre-existing; noted as known limitation but not addressed here. Any row path that today correctly passes column types to `fromSqliteValue` will keep working.

## API Surface

### 1. Reads on SQLite return parsed values

```ts
const db = createDb({
  dialect: 'sqlite',
  path: ':memory:',
  models: { install: d.model(installTable) },
});

const listed = await db.install.list({});
// listed.data[0].meta is { displayName: 'Acme' } — a real object.
```

### 2. Validator runs on the parsed value (reads)

```ts
const installTable = d.table('install', {
  meta: d.jsonb<{ displayName: string }>({
    validator: (raw): raw is { displayName: string } =>
      typeof raw === 'object' && raw !== null && typeof (raw as { displayName?: unknown }).displayName === 'string',
  }),
  // ...
});
// On read, if the stored TEXT fails validation, the row-mapper returns a typed
// error result via the existing error-as-value machinery. Parse never happens
// before the validator runs.
```

### 3. JSONB path filters are compile-gated by dialect

```ts
const sqlite = createDb({ dialect: 'sqlite', ... });
await sqlite.install.list({
  where: {
    // @ts-expect-error — see error message: `JsonbPathFilter requires dialect: "postgres"`
    'meta->displayName': { eq: 'Acme' },
  },
});

const pg = createDb({ dialect: 'postgres', ... });
await pg.install.list({
  where: { 'meta->displayName': { eq: 'Acme' } }, // ✓ compiles
});
```

The TS error at the SQLite call site resolves to a **keyed-never brand** — TS renders the key name verbatim in the diagnostic:

```ts
// Encoding: a record whose only key is a human-readable sentence, mapped to never.
// Excess-property checking forces the diagnostic to name the key — which IS the message.
type JsonbPathFilter_Error_Requires_Dialect_Postgres_On_SQLite_Use_list_And_Filter_In_JS = never;

type JsonbPathFilterGuard = {
  readonly [K in 'JsonbPathFilter_Error_Requires_Dialect_Postgres_On_SQLite_Use_list_And_Filter_In_JS']: K;
};

// In the SQLite branch of FilterType, path-shaped keys resolve to JsonbPathFilterGuard,
// so writing `'meta->x': { eq: 'y' }` yields:
//   Object literal may only specify known properties, and ''meta->x'' does not exist
//   in type 'JsonbPathFilter_Error_Requires_Dialect_Postgres_On_SQLite_Use_list_And_Filter_In_JS'.
```

The same sentence (human-readable form: "JSONB path filters require dialect: 'postgres'. On SQLite, fetch with list() and filter in application code.") appears verbatim in the `d.jsonb()` JSDoc so LLM retrieval lands on the same string regardless of entry point. A `.test-d.ts` snapshot-asserts the error text contains the recovery sentence.

### 4. Array operators gated by dialect (same branded mechanism)

```ts
await sqlite.tasks.list({
  where: {
    // @ts-expect-error — `ArrayOpFilter requires dialect: "postgres"`
    tags: { arrayContains: ['urgent'] },
  },
});
```

### 5. Writes are symmetric and explicit

```ts
// Identical on both dialects — Vertz stringifies explicitly on SQLite.
await db.install.create({ data: { meta: { displayName: 'Acme' } } });
await db.install.update({ where: { id }, data: { meta: { displayName: 'Beta' } } });
```

## Manifesto Alignment

- **"If it builds, it works."** A query that compiles against `dialect: 'sqlite'` must run at runtime. Today `where: { 'meta->k': ... }` compiles then throws in prod. We close that gap at the point it matters: the type system.
- **LLM-first.** The filter shape visible to an LLM matches dialect capabilities. Branded error messages give the LLM (and the human) the recovery path. The `d.jsonb()` JSDoc will explicitly say: *"Path-based filters are Postgres-only. On SQLite, fetch with `list()` and filter in application code, or switch dialects."*
- **Cross-dialect portability for basic CRUD.** Reads, writes, and validation of `d.jsonb<T>()` work identically on both dialects. The thing we "break" — advanced JSONB filtering on SQLite — already didn't work; we move the error earlier.

### Rejected alternatives

- **Option A — Reject `d.jsonb()` on SQLite at `createDb` time.** Forces confrontation but kills the D1 dogfood story (triagebot). Simpler, strictly worse.
- **Option B — Parse on read only (what #2850 literally asks for).** Fixes the surface bug, leaves the filter footgun. Predictable next incident.

## Type Flow Map

`CreateDbOptions` is already a **discriminated union on `dialect: 'sqlite' | 'postgres'` literal**. `createDb({ dialect: 'sqlite', ... })` narrows `TDialect` to `'sqlite'` at the call site automatically — no `as const`, no user-visible ceremony.

```
createDb<TModels, TDialect extends DialectName>(opts: CreateDbOptions<TModels> & { dialect: TDialect })
  → Db<TModels, TDialect>
  → entity delegate methods (list/get/create/update/delete) thread TDialect into options
  → FilterType<TColumns, TDialect> = BaseFilter<TColumns>
                                   & JsonbPathFilter<TColumns, TDialect>
                                   & ArrayOpsFilter<TColumns, TDialect>
```

The gated types are **additive**, not subtractive:

```ts
type JsonbPathFilter<TColumns, TDialect> = TDialect extends 'postgres'
  ? { [K in JsonbPathKey<TColumns>]?: ComparisonOperators<unknown> }
  : JsonbPathFilterGuard; // keyed-never brand — excess-property check surfaces the error sentence
```

The SQLite branch uses the keyed-never brand (see API Surface §3) so the TS error message is discoverable. Known limitation: excess-property checks only fire on fresh object literals; a developer who builds `where` indirectly (`const w = { 'meta->k': ... }; list({ where: w })`) widens `w` and bypasses the brand. The `where.ts:103` runtime throw is the backstop for that case. The `d.jsonb()` JSDoc will note: *"Inline the `where` object for best TS diagnostics on SQLite."*

Every generic introduced (`TDialect`) is consumed at a real call site and covered by type tests:
- `.test-d.ts` negative: `@ts-expect-error` on `'meta->k'` against a `sqlite` db.
- `.test-d.ts` negative: `@ts-expect-error` on `arrayContains` against a `sqlite` db.
- `.test-d.ts` positive: both succeed against a `postgres` db.
- `.test-d.ts` invariant: adding `TDialect` with a default does not break existing consumers who omit the generic.

### Known caveat — widened dialect variable

```ts
const dialect: DialectName = 'sqlite';
createDb({ dialect, ... }); // TDialect = DialectName (the union), not 'sqlite'
```

If a developer widens their dialect variable to the union type, the filter type accepts both sets of keys and the runtime throw in `where.ts` remains the backstop. This is documented in the `d.jsonb` JSDoc. The common case — `createDb({ dialect: 'sqlite', ... })` with a literal — narrows correctly.

## Implementation Plan

**Shipping discipline:** runtime parity and type-gating land as a **single PR**. No social-contract "same-release" split — reviewers called out that a bisect or revert in the interim would reintroduce the exact footgun we're closing. The phase labels below are an internal work breakdown for TDD ordering, not separate PRs.

### Phase A — Runtime parity (closes #2850's runtime bug)

Files (≤5):
- `packages/db/src/client/sqlite-value-converter.ts` (modified — read parse + write stringify)
- `packages/db/src/client/sqlite-driver.ts` (modified — extend `TableSchemaRegistry` to carry full metadata; invoke validator in row-mapper)
- `packages/db/src/client/__tests__/jsonb-parity.test.ts` (new — acceptance + exotic-type matrix)
- `packages/db/src/client/__tests__/sqlite-value-converter.test.ts` (modified — branch coverage)
- `packages/db/src/d.ts` (JSDoc on `d.jsonb` / `d.json` with recovery-path sentence)

Work:
1. **Read parse.** `fromSqliteValue` gains a branch: when `columnType` is `'jsonb'` or `'json'` and the value is a string, `JSON.parse` it.
2. **Parse-failure error surface.** Define a framework error variant:
   ```ts
   export class JsonbParseError extends Error {
     readonly table: string;
     readonly column: string;
     readonly cause: unknown;
   }
   ```
   Parse failure is **fatal** (throws inside the row-mapper). Rationale: a corrupt JSONB TEXT cell is a data-integrity problem, not an expected runtime condition. It propagates up through the driver's async `query()`, is caught by the `ModelDelegate` layer that already wraps driver results in `Result`, and surfaces as `{ ok: false, error: JsonbParseError }`. Same pattern as a `DriverError` today.
3. **Validator invocation layer.** `fromSqliteValue` stays pure (value + columnType in → value out). Validator invocation moves to the **row-mapper** in `sqlite-driver.ts:140–152` (D1) and `305–319` (local), which has access to the full column metadata via an **extended** `TableSchemaRegistry`:
   ```ts
   // Before: Map<string, Record<string, string>>
   // After:  Map<string, Record<string, ColumnMetadata>>
   ```
   The row-mapper calls `fromSqliteValue(value, meta.sqlType)` for conversion, then invokes `meta.validator?.(value)` on the parsed result. Validator failure produces a `JsonbValidationError` (same Result-wrap path).
4. **Write stringify (positive predicate).** `toSqliteValue` matches a **positive** plain-object / array-literal check:
   ```ts
   const isPlainJsonbPayload = (v: unknown): boolean =>
     Array.isArray(v) ||
     (typeof v === 'object' &&
       v !== null &&
       (v.constructor === Object || Object.getPrototypeOf(v) === null));
   ```
   `Date`, `Buffer`, all `TypedArray`s, `Map`, `Set`, `URL`, `RegExp`, class instances: **pass through unchanged** (driver layer handles binding semantics). Only plain-object/array literals get stringified. Prevents the classic "`JSON.stringify(new Map())` → `{}`" corruption.
5. **Escape-hatch documentation.** One integration test writes an object into a non-jsonb TEXT column via `as any`. Documented behavior: object is stringified (better than `[object Object]`), goes into TEXT as JSON, read path returns the raw string (since the column type isn't jsonb, no parse). This is the developer's footgun to own; test locks in the behavior.
6. **D1 coverage.** Single code path in `createSqliteDriver`. Acceptance test runs local path; one mocked-D1 binding test covers the D1 branch end-to-end.

**Exotic-type matrix (Phase A tests):**
- ✓ parse: `{ a: 1 }`, `[1, 2]`, nested, empty
- ✗ corrupt: invalid JSON string in a jsonb TEXT cell → `JsonbParseError`
- ✗ validator: parsed object fails validator → `JsonbValidationError`
- Pass-through on write (not stringified): `Date`, `Uint8Array`, `Int32Array`, `ArrayBuffer`, `Map`, `Set`, `URL`, `RegExp`
- Stringified on write (plain JSON): plain object, array, null-prototype object
- Escape hatch: object via `as any` into TEXT column — stringified, not validated

### Phase B — Type gating (filter operators)

Files (≤5):
- `packages/db/src/client/database.ts` (thread `TDialect` generic through `createDb` → `Db`)
- `packages/db/src/schema/inference.ts` (extend `FilterType`, `IncludeOption` with `TDialect` param + gated branches + keyed-never brand)
- `packages/db/src/client/__tests__/jsonb-parity.test-d.ts` (new — negative + positive type tests + 20-model inference-perf canary)
- `packages/db/src/query/crud.ts` (propagate `TDialect` to delegate method option types)

Work:
1. **`TDialect` generic.** Add to `createDb`, thread to `Db<TModels, TDialect>`, `ModelDelegate<TEntry, TModels, TDialect>`, `FilterType<TColumns, TDialect>`, `IncludeOption<..., TDialect>`. Default `DialectName` preserves back-compat for explicit `Db<...>` references. Inference from the discriminated-union `dialect` literal narrows automatically at call sites.
2. **Keyed-never brand** for the SQLite branch (see API Surface §3). Phase B commits to the exact encoding; snapshot test locks the diagnostic text.
3. **Runtime backstop.** Keep `where.ts` runtime throws unchanged — defense-in-depth for widened-variable cases.
4. **Type-inference perf canary.** `.test-d.ts` fixture with 20 models × 5 columns each × nested includes, typechecks under current budget. Fails the PR if compile time regresses measurably.

**Acceptance (Phase B):**
- `.test-d.ts` negatives on SQLite: path key, array op, **nested include path key**.
- `.test-d.ts` positives on Postgres: same three shapes compile.
- Keyed-never brand renders the recovery-path sentence in the TS diagnostic (asserted by `@ts-expect-error` comments matching the text).
- All existing consumers compile unchanged (generic defaults cover them).

### Phase C — Release checklist (not a separate phase; bullets on the PR)

- `packages/mint-docs/` — "JSONB across dialects" section with the recovery-path sentence verbatim.
- Changeset entry: `@vertz/db` patch. Body: reads parse on SQLite/D1; writes explicit-stringify; validator wired on reads; filter keys type-gated; `TableSchemaRegistry` shape changed (internal).
- Follow-up issues **filed before this PR merges** — issue numbers recorded in DoD.

## E2E Acceptance Test

```ts
// packages/db/src/client/__tests__/jsonb-parity.test.ts
import { createDb, d } from '@vertz/db';
import { describe, expect, it } from '@vertz/test';

const installTable = d.table('install', {
  id: d.uuid().primary({ generate: 'uuid' }),
  tenantId: d.uuid(),
  meta: d.jsonb<{ displayName: string }>(),
}, { indexes: [] });

describe('Feature: d.jsonb<T>() SQLite parity', () => {
  describe('Given an install table with meta: d.jsonb<{ displayName: string }>()', () => {
    describe('When the meta column is written and read back on SQLite', () => {
      it('then the returned value is a parsed object, not a JSON string', async () => {
        const db = createDb({
          dialect: 'sqlite',
          path: ':memory:',
          models: { install: d.model(installTable) },
          migrations: { autoApply: true },
        });
        const created = await db.install.create({
          data: { tenantId: 't1', meta: { displayName: 'Acme' } },
        });
        expect(created.ok).toBe(true);
        const listed = await db.install.list({});
        expect(listed.ok).toBe(true);
        if (!listed.ok) throw new Error('list failed');
        expect(listed.data).toHaveLength(1);
        expect(typeof listed.data[0]!.meta).toBe('object');
        expect(listed.data[0]!.meta.displayName).toBe('Acme');
      });
    });
  });
});
```

```ts
// jsonb-parity.test-d.ts — type-gate tests (Phase B work)
import { createDb, d } from '@vertz/db';

const installTable = d.table('install', {
  id: d.uuid().primary({ generate: 'uuid' }),
  meta: d.jsonb<{ displayName: string }>(),
}, { indexes: [] });
const models = { install: d.model(installTable) };

const sqlite = createDb({ dialect: 'sqlite', path: ':memory:', models });
const pg = createDb({ dialect: 'postgres', url: 'postgres://u:p@localhost/db', models });

pg.install.list({ where: { 'meta->displayName': { eq: 'Acme' } } }); // ✓

sqlite.install.list({
  where: {
    // @ts-expect-error — JsonbPathFilter requires dialect: "postgres"
    'meta->displayName': { eq: 'Acme' },
  },
});

sqlite.install.list({
  include: {
    // @ts-expect-error — nested include path filter also gated
    related: { where: { 'meta->k': { eq: 'v' } } },
  },
});
```

## Unknowns

*(None remaining — prior Unknowns resolved by code-reads and the 2026-04-19 probe.)*

Resolved in rev 2:
- **Write-side behavior on SQLite.** Probed: `@vertz/sqlite`/`bun:sqlite` implicitly stringify objects; writes work today. We move to explicit `JSON.stringify` in `toSqliteValue` for robustness, not to unblock writes.
- **D1 converter path.** Shared with local SQLite via `createSqliteDriver` (sqlite-driver.ts:128–157). Single fix covers both.
- **Postgres double-parse risk.** No `JSON.parse` call exists in the Postgres read path; `postgres.js` handles JSONB natively. Safe.
- **`TDialect` default behavior.** Discriminated union on `dialect` literal already narrows at call sites. The generic default is a fallback for explicit `Db<...>` references only.

## POC Results

**No POC required.** Both mechanisms already exist:
- `fromSqliteValue` handles type-specific conversion (`boolean`, `timestamp`). `jsonb`/`json` branches are a trivial extension.
- Runtime dialect feature flags (`supportsJsonbPath`, `supportsArrayOps`) already gate the same operations. Lifting them into the type layer uses TS features already in use elsewhere in the codebase.
- The discriminated-union call-site inference for `dialect` literal is already proven by the existing `CreateDbOptions` shape.

## Definition of Done

Runtime (Phase A):
- [ ] Round-trip test passes on local SQLite: `d.jsonb<T>()` reads return parsed `T`.
- [ ] Round-trip test passes on D1 (mocked binding) — same `createSqliteDriver` code path.
- [ ] `TableSchemaRegistry` extended to carry `ColumnMetadata`; row-mapper layer invokes `validator` on reads.
- [ ] Validator hook invoked on reads (acceptance criterion from #2850).
- [ ] `JsonbParseError` thrown on corrupt JSONB TEXT cell; surfaces as `{ ok: false, error }` via existing Result-wrap.
- [ ] `JsonbValidationError` on validator failure; same surface.
- [ ] Writes use a **positive** plain-object / array-literal predicate in `toSqliteValue`.
- [ ] Exotic-type test matrix covers: plain object, array, null-prototype object → stringified; `Date`, `Uint8Array`, `Int32Array`, `ArrayBuffer`, `Map`, `Set`, `URL`, `RegExp`, class instance → pass through.
- [ ] Escape-hatch test: object-via-`as any` into TEXT column — stringified on write, returned raw on read; behavior locked.

Types (Phase B):
- [ ] `TDialect` generic threaded through `createDb` → `Db` → `ModelDelegate` → `FilterType` → `IncludeOption`.
- [ ] `.test-d.ts` negatives on SQLite: direct path key, array op, **nested include path key**.
- [ ] `.test-d.ts` positives on Postgres: all three shapes compile.
- [ ] Keyed-never brand snapshot — `.test-d.ts` assertion that the diagnostic contains the recovery-path sentence verbatim.
- [ ] 20-model inference-perf canary typechecks under the current budget.

Release (Phase C):
- [ ] `d.jsonb()` / `d.json()` JSDoc contains the recovery-path sentence verbatim (same string as the keyed-never brand).
- [ ] `packages/mint-docs/` updated — "JSONB across dialects" section.
- [ ] Changeset added — `@vertz/db` patch.
- [ ] Postgres behavior unchanged — all existing tests pass.

Process:
- [x] Follow-up issue filed: `validator` hook on writes (all dialects). → #2867
- [x] Follow-up issue filed: typed JSONB operators (contains, path builder, containment). → #2868
