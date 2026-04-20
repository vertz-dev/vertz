# `@vertz/db` — Typed JSONB Operators (`jsonContains`, `hasKey`, typed `path()`)

**Issue:** [#2868](https://github.com/vertz-dev/vertz/issues/2868)
**Status:** Design (rev 2, post three-agent review)
**Builds on:** [#2850](https://github.com/vertz-dev/vertz/issues/2850) / [plans/jsonb-sqlite-parity.md](./jsonb-sqlite-parity.md) — **already shipped** (PR #2870, merged 2026-04-19). #2850 delivered the `TDialect` thread, the keyed-never brand file (`jsonb-filter-brand.ts`), and the string-key path filter type-gate this design extends.

**Open naming question (flagged for user sign-off):** `path` is a short, natural name but collides with Node.js's `path` module and with common user locals. Alternative: `jsonbPath`, which matches `d.jsonb()` + `jsonContains` + `jsonContainedBy` naming. Product review flagged this as "not a blocker given the typed chain disambiguates usage" but worth confirming before implementation. This doc uses `path` throughout; a rename is a mechanical s/path/jsonbPath/ on code occurrences (prose uses of "path" as a concept stay).

## Changes since rev 1

- **`path<T>(sel)` + `path.for(col, sel)` — both dropped as primary.** Rev 2 uses the parameter-annotation form: `path((m: InstallMeta) => m.settings.theme).eq('dark')`. TS infers `T` from the selector parameter annotation, so no explicit generic *and* no column handle at query time. A column handle usually isn't in scope at query time (the `path.for` form was a paper feature — DX review blocker). The explicit generic form remains available via TS's normal `path<T>(...)` syntax but isn't documented — it's the same function.
- **Array-operator type gating removed from scope.** Rev 1 pulled `arrayContains`/`arrayContainedBy`/`arrayOverlaps` into this ticket based on a line in `inference.ts`. The #2868 ticket body never mentioned array ops; this change expanded the array-column filter surface for every user of `d.textArray()` / `d.integerArray()` / `d.vector()` for reasons unrelated to JSONB. Tracked separately — **filed as #2885 before this PR merges** (Definition of Done item below).
- **`hasAllKeys` / `hasAnyKey` deferred.** Rev 1 proposed five payload operators. 80/20 is `jsonContains` + `hasKey` + `path()`; the plural-key helpers have no cited consumer. Filed as follow-up — **#2886 before this PR merges**. Users can compose `hasAllKeys` with `AND: [{ meta: { hasKey: 'a' } }, { meta: { hasKey: 'b' } }]` in the meantime.
- **Array-index emission corrected.** Rev 1 claimed `->'0'` worked on Postgres for array indexing; it doesn't. Rev 2 emits integer segments unquoted (`->0`) when a selector records a positive-integer key, and the path recorder preserves integer vs. string distinctions.
- **`hasKey` operand type constrained.** Rev 1 used `keyof T & string`, which distributes over unions and collapses to `never`. Rev 2 uses a dedicated `JsonbKeyOf<T>` helper that handles union payloads and rejects non-object `T` at the type level.
- **Proxy selector guards expanded.** Rev 1 only guarded `'then'`. Rev 2 guards the full set of JS-internal keys (`Symbol.toPrimitive`, `Symbol.iterator`, `'toString'`, `'valueOf'`, etc.) to prevent garbage segments from `m.a + m.b` and from await/spread.
- **String `contains` on JSONB clarified.** `ColumnFilterOperators` already gates `contains` behind `[TType] extends [string]` (inference.ts:51–53). For `d.jsonb<T>()` with non-string `T`, string `contains` is unavailable — no ambiguity with `jsonContains`. Documented verbatim.
- **`jsonContainedBy` binding spelled out** — `$N::jsonb` on the operand, same as `jsonContains`.
- **Descriptor branch ordering locked** — `_tag: 'JsonbPathDescriptor'` check runs **before** `isOperatorObject` in `buildFilterClauses`.
- **Error-sentence snapshot test added** — the `.test-d.ts` asserts the exact rendered TS error text, not just that it contains the recovery sentence.
- **`FilterType` backcompat regression guard** — `.test-d.ts` covers payloads whose natural keys collide with operator names (`d.jsonb<{ jsonContains: string }>()`).
- **Changeset will name the break explicitly** — "Users with custom helpers over `FilterType<TColumns>` may need to thread `TDialect`" (same guidance as #2850, plus the new JSONB/array branches).
- **String-key path vs typed `path()` — preference stated.** Prefer `path()` for static paths; reach for `'col->k'` only when the path is computed at runtime.

## Context & Problem

`d.jsonb<T>()` carries a typed payload `T`, but the filter surface exposes almost none of it:

- **Whole-payload equality** against `T` works today, but is untyped against sub-shapes.
- **Path filters via string keys** (`'meta->displayName'`) compile on Postgres only, emit SQL for any depth, but the **operand type** is `ComparisonOperators<unknown> | string | number | boolean | null` — **`T` is lost at the leaf** (inference.ts:90 comment explicitly defers leaf typing to #2868). A `number` leaf can be assigned a `Date` and it compiles.
- **Common JSONB operations** missing entirely: whole-payload containment (`@>`), reverse containment (`<@`), key existence (`?`).

The runtime already does most of this for the string-key path. The gap is at the type layer, plus three new SQL operators to emit.

## Goals

1. **Typed path builder** — `path((m: T) => m.x).eq(value)` preserves `T` through the selector's leaf. Operator availability is conditional on leaf type.
2. **Typed payload operators** on JSONB columns: `jsonContains`, `jsonContainedBy`, `hasKey`.
3. **Dialect gating is uniform.** All new operators compile on `dialect: 'postgres'`; on `dialect: 'sqlite'` they resolve to a keyed-never brand whose type name IS the recovery sentence. Same mechanism as #2850's `JsonbPathFilter_Error_…`.
4. **No regressions.** Existing string-key path filters keep working exactly as today. Runtime SQL for every existing operator is unchanged. The typed path is additive.
5. **LLM-first discovery.** No explicit `<T>` generic at call sites when the selector carries a typed parameter annotation.

## Non-Goals

- **Replacing the string-key path filter.** It stays as an escape hatch for dynamic paths. `path()` is preferred for static paths.
- **Array operator type gating.** Tracked as **#2885** — filed before this PR merges. The #2868 ticket body never mentioned array ops; scope is JSONB-only here.
- **`hasAllKeys` / `hasAnyKey`.** Tracked as **#2886** — filed before this PR merges. Users can compose with `AND: [{ meta: { hasKey: 'a' } }, …]`.
- **Typed reverse payload writes.** `jsonContainedBy` accepts a query-side value; we don't round-trip to column types.
- **MySQL JSON operators.** No driver.
- **Modifying reads.** `#2850` owns read-side parse + validator.
- **Deep-partial at unbounded depth.** `DeepPartial<T>` caps at 5 levels to bound TS inference work. Types with cyclic references degrade to `T`.
- **Path builder as a runtime AST surface.** The descriptor returned by `path(...).op(...)` is internal; not documented for user composition.

## API Surface

### 1. Typed path builder — `path((m: T) => leaf).op(value)`

```ts
import { path } from '@vertz/db';

interface InstallMeta {
  displayName: string;
  settings: { theme: 'light' | 'dark'; locale: string };
  tags: readonly string[];
  capacity: number | null;
  createdAt: Date;
}

const installTable = d.table('install', {
  id: d.uuid().primary({ generate: 'uuid' }),
  meta: d.jsonb<InstallMeta>(),
}, { indexes: [] });

const pg = createDb({ dialect: 'postgres', url: '…', models: { install: d.model(installTable) } });

// Parameter annotation drives T inference:
await pg.install.list({
  where: {
    meta: path((m: InstallMeta) => m.settings.theme).eq('dark'),   // ✓
  },
});

await pg.install.list({
  where: {
    // @ts-expect-error — 'foggy' is not assignable to 'light' | 'dark'
    meta: path((m: InstallMeta) => m.settings.theme).eq('foggy'),
  },
});

await pg.install.list({
  where: {
    // @ts-expect-error — `.contains` isn't available on non-string leaves
    meta: path((m: InstallMeta) => m.settings).contains('theme'),
  },
});

// Nullable leaf gets isNull:
await pg.install.list({
  where: { meta: path((m: InstallMeta) => m.capacity).isNull(true) },
});

// Numeric array indexing emits integer segment unquoted on Postgres:
await pg.install.list({
  where: { meta: path((m: InstallMeta) => m.tags[0]).eq('urgent') },
  //            emits:  "meta"->'tags'->>0 = $1    (integer index, not text)
});
```

On SQLite, the same call fails at the filter slot because the `meta` column's filter value narrows to the keyed-never brand:

```ts
const sqlite = createDb({ dialect: 'sqlite', path: ':memory:', models });
await sqlite.install.list({
  where: {
    // @ts-expect-error — JsonbOperator_Error_Requires_Dialect_Postgres_…
    meta: path((m: InstallMeta) => m.settings.theme).eq('dark'),
  },
});
```

**Why no `path.for(column, sel)` overload.** Rev 1 proposed this but the column handle is usually not in scope at query time — the delegate pattern hides the schema behind `db.install.*`. `path.for` was a paper feature. Dropped.

**Operator availability per leaf type:**

| Leaf type                             | Available terminal operators                                              |
| ------------------------------------- | ------------------------------------------------------------------------- |
| `string` / string-literal / union     | `eq`, `ne`, `in`, `notIn`, `contains`, `startsWith`, `endsWith`, `isNull` |
| `number` / `bigint`                   | `eq`, `ne`, `gt`, `gte`, `lt`, `lte`, `in`, `notIn`, `isNull`             |
| `Date`                                | `eq`, `ne`, `gt`, `gte`, `lt`, `lte`, `isNull`                            |
| `boolean`                             | `eq`, `ne`, `isNull`                                                      |
| object / non-string array (no op)     | `isNull` only — descend further through the selector                      |

`isNull(true)` maps to `IS NULL`; `isNull(false)` to `IS NOT NULL`. Non-nullable leaves still expose `isNull` — it's always-false/true but cheap, matches the existing column-level `ColumnFilterOperators` shape.

### 2. Whole-payload JSONB operators — `jsonContains`, `jsonContainedBy`, `hasKey`

```ts
// @> — subset containment. Operand is DeepPartial<T>.
await pg.install.list({
  where: {
    meta: { jsonContains: { settings: { theme: 'dark' } } },
  },
});

// <@ — reverse containment. Operand is a structural superset.
await pg.install.list({
  where: {
    meta: { jsonContainedBy: { displayName: 'Acme', settings: { theme: 'dark', locale: 'en' }, tags: [], capacity: null, createdAt: new Date() } },
  },
});

// ? — top-level key existence.
await pg.install.list({
  where: {
    meta: { hasKey: 'displayName' },  // keyof InstallMeta
  },
});

// @ts-expect-error — 'bogus' not in keyof InstallMeta
await pg.install.list({ where: { meta: { hasKey: 'bogus' } } });
```

`hasKey` accepts `JsonbKeyOf<T>` — an **internal** helper type (not exported from `@vertz/db`; consumers who thread `TDialect` through custom `FilterType` helpers should compose from `JsonbKeyOf`-equivalent logic inline, not import it). It resolves as follows:
- If `T extends object` (and not an array), resolves to `keyof T & string`.
- If `T` is a union of objects, distributes over the union via the outer conditional (naked `T` in a distributive conditional) and yields the union of each variant's top-level keys.
- Otherwise (primitive / array `T`), resolves to `never` — `hasKey` is not meaningful on non-object JSONB payloads, and the type surface rejects the call.

```ts
// JsonbKeyOf shape — internal. Distribution happens because `T` is naked in the
// outer conditional, not because of `keyof` (keyof of a union intersects by
// default; we want the union).
type JsonbKeyOf<T> = [T] extends [object]
  ? T extends readonly unknown[]
    ? never
    : T extends object
      ? (keyof T) & string
      : never
  : never;
```

**String `contains` on JSONB is not exposed.** `ColumnFilterOperators` already gates `contains`/`startsWith`/`endsWith` behind `[TType] extends [string]` (inference.ts:51). `d.jsonb<T>()` with `T = object` fails that branch, so string operators are already absent from the JSONB column slot — no ambiguity with `jsonContains`. For the edge case `d.jsonb<string>()` (a JSONB column storing a JSON-encoded string), the column slot exposes both string `contains` and `jsonContains`; JSDoc on `jsonContains` documents this and says: *"If your payload is a string, `contains` does a text-level LIKE match on the raw JSON representation. `jsonContains` tests whole-payload containment. For string payloads, prefer `contains`."*

SQLite branch: same column slot resolves to the keyed-never brand for `jsonContains` / `jsonContainedBy` / `hasKey`, so assigning any of these keys on SQLite gives the recovery-sentence diagnostic.

### 3. Error message — new keyed-never brand

One new brand interface extending the pattern from #2850:

```ts
// packages/db/src/schema/jsonb-filter-brand.ts (extended)
declare const __JsonbOperatorBrand: unique symbol;

export interface JsonbOperator_Error_Requires_Dialect_Postgres_On_SQLite_Fetch_And_Filter_In_JS {
  readonly [__JsonbOperatorBrand]: 'jsonb-operator-requires-postgres';
}
```

The same sentence is duplicated verbatim in:
- The `d.jsonb` JSDoc.
- `packages/mint-docs/` — "JSONB across dialects" subsections for path / containment / keys.

A `.test-d.ts` **snapshot-asserts the exact rendered TS error text** for `meta: { jsonContains: {...} }` on SQLite, rather than asserting "contains the sentence" — the sentence resolution in an operator value slot is not as crisp as in an excess-property-check context, and snapshotting locks the actual diagnostic.

## Manifesto Alignment

- **"If it builds, it works."** #2850 closed this gap for path-key filters; #2868 closes it for the JSONB payload/key/path-preservation surface. Every filter shape that compiles against a `sqlite` DB runs; every shape that wants Postgres semantics fails at compile time with the recovery sentence in the diagnostic.
- **LLM-first.** Parameter-annotation inference (`(m: InstallMeta) => …`) means the LLM reads the payload type from the column declaration and pastes it into the selector parameter — no new generic token to remember. `jsonContains: DeepPartial<T>` means the LLM sees the same shape it would write for the column.
- **Typed by construction.** Every operand narrows from the column's `T` via conditional types — no `as` casts, no `unknown` leaks.
- **Cross-dialect portability.** String-key path stays for SQLite fallbacks / dynamic paths; typed `path()` is additive. SQLite users get the same diagnostic mechanism for the new ops.

### Rejected alternatives

- **Mandatory `path<T>(sel)` generic.** Rev 1 proposed this; DX review flagged it as an LLM-first regression — the user already named `T` at `d.jsonb<T>()`. Rev 2 uses parameter-annotation inference, which sidesteps the issue. Explicit `<T>` is still available (it's the same function) but unpromoted.
- **`path.for(column, sel)` overload.** Column object usually isn't in scope at query time (the delegate pattern hides it). Paper feature — dropped.
- **Top-level path builder with pure contextual inference from the `where` slot.** TS commits to inferences left-to-right across method chains; the selector callback is evaluated before the slot, so contextual typing doesn't flow. Verified against the TS 5.4+ inference algorithm — parameter annotation is the only reliable path.
- **Nested object form `{ path: (m) => m.x, eq: 'y' }`.** DX-adjacent but the real issue is runtime: building path descriptors programmatically (`for`/`reduce`) is awkward when `path` is a key. The chain lets users stash a descriptor in a variable and reuse it. Chain wins on composability.
- **Dropping the string-key path in favor of only `path()`.** Breaks #2850 and kills the dynamic-path case. Rejected.
- **Per-column helpers on the table handle** (`installTable.meta.path(...)`). Same "column not in scope" problem as `path.for`. Rejected.

## Type Flow Map

All new types piggy-back on the existing `TDialect` thread from #2850. No new top-level generics.

```
createDb<TModels, TDialect>(…)
  → Db<TModels, TDialect>
  → ModelDelegate<TEntry, TModels, TDialect>
  → FilterType<TColumns, TDialect>
    ├─ existing: ColumnFilterOperators<T, TNullable>        (non-JSONB columns)
    ├─ existing: JsonbPathKey/JsonbPathValue<TDialect>       (string-key path; #2850)
    └─ NEW:      JsonbColumnValue<T, TDialect>               (for d.jsonb<T>() slots)
                  ├─ direct T / ComparisonOperators<T>       (pre-existing equality, retained)
                  ├─ JsonbPayloadOperators<T, TDialect>      (jsonContains, jsonContainedBy, hasKey)
                  └─ JsonbPathDescriptor<TLeaf, TDialect>    (from path((m: T) => leaf).op(v))

Array columns: unchanged in this ticket. Array-op type gating is #2885 (separate).
```

### Generics, from definition to consumer

- **`T` (JSONB payload)** — originates at `d.jsonb<T>()` (d.ts:81–83), carried on `ColumnBuilder<T, DefaultMeta<'jsonb'>>`. Consumed by:
  - `InferColumnType<TColumns[K]>` in `FilterType` (inference.ts:114) for direct-value / `ComparisonOperators` slots — already works, retained.
  - **NEW:** `JsonbColumnValue<InferColumnType<TColumns[K]>, TDialect>` branch, active when `TColumns[K]` has `{ sqlType: 'jsonb' | 'json' }` metadata (same predicate as `JsonbColumnKeys` at inference.ts:68–74).
  - `JsonbPayloadOperators<T, TDialect>.jsonContains` narrows to `DeepPartial<T>`.
  - `JsonbPayloadOperators<T, TDialect>.jsonContainedBy` narrows to `unknown` structurally above `T` — typed as `DeepPartial<T> | object` (the server payload must be ⊆ operand; the operand is at least `T`-shaped but can have extra keys).
  - `JsonbPayloadOperators<T, TDialect>.hasKey` narrows to `JsonbKeyOf<T>`.
  - `path((m: T) => TLeaf)` captures `T` from the selector's parameter annotation and flows it into the return-type inference for `TLeaf`.

- **`TLeaf` (path terminal type)** — inferred from the selector's return type. Consumed by the chain's terminal methods. Conditional branches on `TLeaf`:
  - `[NonNullable<TLeaf>] extends [string]` → exposes `contains`/`startsWith`/`endsWith` + comparison.
  - `[NonNullable<TLeaf>] extends [number | bigint]` → exposes `gt`/`gte`/`lt`/`lte`.
  - `[NonNullable<TLeaf>] extends [Date]` → exposes `gt`/`gte`/`lt`/`lte`.
  - `null extends TLeaf` → exposes `isNull`.

- **`TDialect`** — already threaded by #2850. `JsonbPathDescriptor<TLeaf, TDialect>` is dialect-branded: `TDialect extends 'postgres'` returns the usable descriptor; `TDialect` default of the union returns the same, but the SQLite branch of `FilterType` for JSONB columns still resolves to the keyed-never brand, so the descriptor is structurally rejected in a SQLite filter slot regardless of what it carries. Two-layer defense: descriptor dialect brand + column-slot brand.

### Dead-generic check

- `T` → reaches `DeepPartial<T>` (jsonContains), `JsonbKeyOf<T>` (hasKey), `(m: T) => …` (path). ✓
- `TLeaf` → reaches every terminal operator on `PathChain<TLeaf>`. ✓
- `TDialect` → every new operator branch conditionals on it. ✓

### `.test-d.ts` coverage

```
packages/db/src/schema/__tests__/jsonb-typed-operators.test-d.ts
  ├─ path leaf typing                       (string / number / enum-union / object leaves / Date)
  ├─ path leaf operator availability        (contains only on strings, gt/lt only on numeric+Date)
  ├─ path nullable leaf                     (string | null leaf exposes isNull AND string ops together)
  ├─ path numeric index                     (numeric segment inferred correctly)
  ├─ jsonContains DeepPartial               (nested partial, primitive leaf, array-shape)
  ├─ hasKey — keyof T                       (unknown key rejected; top-level only)
  ├─ hasKey — union payloads                (JsonbKeyOf spans variants)
  ├─ hasKey — non-object payload rejected   (d.jsonb<string>() → hasKey never)
  ├─ FilterType backcompat — operator-name-collision
  │    (d.jsonb<{ jsonContains: string }>() — natural keys NOT confused with operators)
  ├─ SQLite brand diagnostics               (snapshot on exact rendered error text)
  ├─ inference-perf canary                  (20 models × jsonb column within #2850's budget)
```

### Inference-performance caveat

`DeepPartial<T>` can be costly for deeply nested types. Hard-coded decrement tuple, cap at 5:

```ts
type Decrement<D extends number> = [never, 0, 1, 2, 3, 4][D];

type DeepPartial<T, D extends number = 5> =
  [D] extends [never] ? T
  : T extends readonly (infer U)[] ? readonly DeepPartial<U, Decrement<D>>[]
  : T extends object ? { readonly [K in keyof T]?: DeepPartial<T[K], Decrement<D>> }
  : T;
```

Beyond depth 5, the operand falls back to `T` (autocomplete still works at the leaf, just without partialization beyond depth). JSDoc on `jsonContains` documents the depth cap. Canary test locks in the budget.

### `FilterType` backcompat — operator-name collision

A JSONB payload whose natural keys collide with operator names (e.g., `d.jsonb<{ jsonContains: string; hasKey: boolean }>()`) would be ambiguous if the filter slot mixed payload keys with operator keys. `JsonbColumnValue<T, TDialect>` resolves this with a union ordering:

```ts
type JsonbColumnValue<T, TDialect extends DialectName> =
  TDialect extends 'postgres'
    ? T                                  // direct payload equality (full T)
      | ComparisonOperators<T>           // eq/ne against full T
      | JsonbPayloadOperators<T, 'postgres'>  // jsonContains / hasKey / …
      | JsonbPathDescriptor<unknown, 'postgres'>
    : JsonbOperator_Error_Requires_Dialect_Postgres_On_SQLite_Fetch_And_Filter_In_JS;
```

TS's excess-property checking on a literal `{ jsonContains: … }` prefers `JsonbPayloadOperators` since every key in the literal is an operator key; a literal that mixes operator + non-operator keys fails on the operator branch and falls through to direct payload equality (`T`), which accepts any `T`-shaped object. **Union ordering caveat:** TS's resolution of overlapping union members across excess-property checks is not fully deterministic across compiler versions. The `.test-d.ts` collision snapshot is the source of truth — if it flips on a TS upgrade, the fallback is to add explicit `& {}` marker intersections or reorder `JsonbColumnValue` members to re-establish preference. The JSDoc on `JsonbColumnValue` will carry this warning.

## Implementation Plan

**Shipping discipline:** single PR, `@vertz/db` patch. Type additions + runtime additions together (new runtime operators and the `JsonbPathDescriptor` handler). No array-op work in this PR (#2885 tracks that separately). #2850's infrastructure is already on `main`.

### Phase A — Runtime additions

Files (≤5):
- `packages/db/src/sql/where.ts` (modified — add handlers for `jsonContains`, `jsonContainedBy`, `hasKey`; add `JsonbPathDescriptor` branch in `buildFilterClauses`; fix numeric-segment emission in `resolveColumnRef`)
- `packages/db/src/sql/__tests__/where-jsonb-ops.test.ts` (new — SQL emission + param binding per operator; numeric array index emission; dialect gate runtime throws)
- `packages/db/src/path.ts` (new — `path(selector)` factory, Proxy-based segment recorder with full JS-internal guards, terminal-operator chain, `JsonbPathDescriptor` descriptor)
- `packages/db/src/__tests__/path.test.ts` (new — selector records segments; numeric vs string segments; JS-internal guards; terminal ops produce descriptors; `m.a + m.b` produces an empty/rejected descriptor, not garbage)
- `packages/db/src/index.ts` (modified — export `path` from the package root)

Work:

1. **`path(selector)` runtime.** Proxy-based recorder with comprehensive guards:
   ```ts
   const INTERNAL_STRING_KEYS = new Set([
     'then', 'toString', 'valueOf', 'toJSON',
     'constructor', 'Symbol(Symbol.toPrimitive)',
   ]);
   function path<T, TLeaf>(selector: (m: T) => TLeaf): PathChain<TLeaf> {
     const segments: PathSegment[] = [];
     const handler: ProxyHandler<object> = {
       get(_, key) {
         if (typeof key === 'symbol') return undefined;       // Symbol.toPrimitive, iterator, etc.
         if (INTERNAL_STRING_KEYS.has(key)) return undefined; // JS internals and thenables
         // Integer-index keys are kept as numbers; string keys stay strings.
         const isInt = /^(?:0|[1-9]\d*)$/.test(key);
         segments.push(isInt ? { kind: 'index', value: Number(key) } : { kind: 'key', value: key });
         return new Proxy({}, handler);  // fresh proxy so each access is isolated
       },
     };
     const proxy = new Proxy({} as object, handler) as T;
     selector(proxy);
     return makeChain(segments);
   }
   ```
   `PathSegment` is a tagged type so emission can distinguish integer-index vs text-key (B1 fix).
2. **`makeChain(segments)`** returns an object with `eq`/`ne`/`in`/`notIn`/`gt`/`gte`/`lt`/`lte`/`contains`/`startsWith`/`endsWith`/`isNull` — each returns a descriptor:
   ```ts
   interface JsonbPathDescriptor {
     readonly _tag: 'JsonbPathDescriptor';
     readonly segments: readonly PathSegment[];
     readonly op: FilterOperator;   // { eq: v } | { gt: v } | { contains: s } | …
   }
   ```
3. **`resolveColumnRef` — integer-segment emission.** Extend to accept `PathSegment[]` and emit integer segments unquoted:
   ```ts
   // '0' → ->0  (integer index on array)
   // 'settings' → ->'settings'  (text key on object)
   // final:  ->>0 or ->>'settings'
   ```
4. **`buildFilterClauses` — descriptor branch, BEFORE `isOperatorObject`.** Locked ordering:
   ```ts
   for (const [key, value] of Object.entries(filter)) {
     if (key === 'OR' || key === 'AND' || key === 'NOT') continue;
     if (isPathDescriptor(value)) {
       const columnRef = resolveColumnRefFromSegments(key, value.segments, overrides, dialect);
       const result = buildOperatorCondition(columnRef, value.op, idx, dialect);
       // …
       continue;
     }
     const columnRef = resolveColumnRef(key, overrides, dialect);
     if (value === null) { /* IS NULL */ }
     else if (isOperatorObject(value)) { /* existing */ }
     else { /* direct eq */ }
   }
   ```
5. **where.ts — new operator handlers.** Added to `buildOperatorCondition`, parallel to existing array-op handlers:
   ```ts
   if (operators.jsonContains !== undefined) {
     if (!dialect.supportsJsonbPath) throw new Error('jsonContains requires dialect: postgres. On SQLite, fetch with list() and filter in application code.');
     clauses.push(`${columnRef} @> ${dialect.param(idx + 1)}::jsonb`);
     params.push(JSON.stringify(operators.jsonContains));
     idx++;
   }
   if (operators.jsonContainedBy !== undefined) {
     if (!dialect.supportsJsonbPath) throw new Error('jsonContainedBy requires dialect: postgres. …');
     clauses.push(`${columnRef} <@ ${dialect.param(idx + 1)}::jsonb`);   // same ::jsonb cast as @>
     params.push(JSON.stringify(operators.jsonContainedBy));
     idx++;
   }
   if (operators.hasKey !== undefined) {
     if (!dialect.supportsJsonbPath) throw new Error('hasKey requires dialect: postgres. …');
     clauses.push(`${columnRef} ? ${dialect.param(idx + 1)}`);
     params.push(operators.hasKey);
     idx++;
   }
   ```
6. **`OPERATOR_KEYS` set** extended with: `jsonContains`, `jsonContainedBy`, `hasKey`.
7. **Dialect gate reuses `supportsJsonbPath`** — same capability as the path filter. No new flag.
8. **Error messages** — throw sentences match the type-brand name verbatim.

### Phase B — Type layer

Files (≤5):
- `packages/db/src/schema/jsonb-filter-brand.ts` (modified — add `JsonbOperator_Error_…` interface)
- `packages/db/src/schema/inference.ts` (modified — extend `FilterType` column-value branch to include `JsonbColumnValue<T, TDialect>`; retain existing `JsonbPathValue` branch for string-key paths)
- `packages/db/src/schema/path-chain.ts` (new — `PathChain<TLeaf>`, `JsonbPathDescriptor<TLeaf, TDialect>`, operator-availability conditional types, `DeepPartial<T, D>`, `JsonbKeyOf<T>`)
- `packages/db/src/schema/__tests__/jsonb-typed-operators.test-d.ts` (new — leaf-type flow, brand diagnostics snapshot, hasKey union handling, backcompat collision, canary)
- `packages/db/src/path.ts` (modified — typed signature for the `path` function; shared with Phase A)

Work:

1. **New brand interface** — `JsonbOperator_Error_…` exported from `jsonb-filter-brand.ts`.
2. **`JsonbColumnValue<T, TDialect>`** — see type flow section. Union ordering + backcompat test locks collision behavior.
3. **`PathChain<TLeaf>`** — operator availability narrows per leaf type, matching the table in §1. Each terminal method returns `JsonbPathDescriptor<TLeaf, 'postgres'>` (descriptor is dialect-branded).
4. **`JsonbKeyOf<T>`** — distributed-union + object-guard helper (see §2). Rejects non-object `T`.
5. **`DeepPartial<T, D>`** — tuple-based `Decrement<D>`, cap 5. Handles `readonly` and mutable arrays via `readonly (infer U)[]` match.
6. **`FilterType<TColumns, TDialect>`** — column-value branch: if column is JSONB (`{ sqlType: 'jsonb' | 'json' }`) → `JsonbColumnValue<T, TDialect>`; else existing `InferColumnType | ColumnFilterOperators`.
7. **20-model canary** — `.test-d.ts` fixture with 20 tables, each with one `d.jsonb<{ a: string; b: { c: number } }>()` and standard columns plus a one-level include. Typechecks under #2850's budget.

### Phase C — Release checklist (bullets on the PR)

- `packages/mint-docs/` — "JSONB across dialects" extended:
  - New section: "Typed path filters with `path()`" (parameter-annotation form).
  - New section: "Whole-payload operators (`jsonContains`, `jsonContainedBy`, `hasKey`)".
  - Preference note: *"Prefer `path()` for static paths; reach for `'col->k'` string keys only when the path is computed at runtime."*
- Changeset: `@vertz/db` patch. Body includes:
  - New operators: `jsonContains`, `jsonContainedBy`, `hasKey`.
  - New export: `path` from `@vertz/db`.
  - **Callout:** *"Users with custom helpers over `FilterType<TColumns>` may need to thread `TDialect` through their helper signatures. JSONB column filter values are now typed as `JsonbColumnValue<T, TDialect>`; adapt accordingly."*
- `d.jsonb` JSDoc — new paragraph pointing at `path()` + the whole-payload operators + the `contains` vs `jsonContains` note for `d.jsonb<string>()` payloads.

## E2E Acceptance Test

```ts
// packages/db/src/schema/__tests__/jsonb-typed-operators.test.ts
import { createDb, d, path } from '@vertz/db';
import { describe, expect, it } from '@vertz/test';

interface InstallMeta {
  displayName: string;
  settings: { theme: 'light' | 'dark'; locale: string };
  tags: readonly string[];
}

const installTable = d.table('install', {
  id: d.uuid().primary({ generate: 'uuid' }),
  meta: d.jsonb<InstallMeta>(),
}, { indexes: [] });

const models = { install: d.model(installTable) };

describe('Feature: Typed JSONB operators', () => {
  describe('Given a Postgres db and an install row with meta: { settings: { theme: "dark" }, tags: ["urgent"] }', () => {
    describe('When filtering with path((m: InstallMeta) => m.settings.theme).eq("dark")', () => {
      it('then emits "meta"->\'settings\'->>\'theme\' = $1 and returns the row', async () => {
        const result = await pg.install.list({
          where: { meta: path((m: InstallMeta) => m.settings.theme).eq('dark') },
        });
        expect(result.ok).toBe(true);
        if (!result.ok) throw new Error('list failed');
        expect(result.data).toHaveLength(1);
      });
    });

    describe('When filtering with path((m: InstallMeta) => m.tags[0]).eq("urgent")', () => {
      it('then emits "meta"->\'tags\'->>0 (integer index) and returns the row', async () => {
        const result = await pg.install.list({
          where: { meta: path((m: InstallMeta) => m.tags[0]).eq('urgent') },
        });
        expect(result.ok).toBe(true);
      });
    });

    describe('When filtering with { jsonContains: { settings: { theme: "dark" } } }', () => {
      it('then emits "meta" @> $1::jsonb and returns the row', async () => {
        const result = await pg.install.list({
          where: { meta: { jsonContains: { settings: { theme: 'dark' } } } },
        });
        expect(result.ok).toBe(true);
      });
    });

    describe('When filtering with { hasKey: "settings" }', () => {
      it('then emits "meta" ? $1 and returns the row', async () => {
        const result = await pg.install.list({ where: { meta: { hasKey: 'settings' } } });
        expect(result.ok).toBe(true);
      });
    });
  });
});
```

```ts
// jsonb-typed-operators.test-d.ts (Phase B)
import { createDb, d, path } from '@vertz/db';

interface InstallMeta {
  displayName: string;
  settings: { theme: 'light' | 'dark'; count: number };
  tags: readonly string[];
}

type UnionPayload = { a: 1; x: string } | { b: 2; x: number };
type PrimitivePayload = string;
type CollisionPayload = { jsonContains: string; hasKey: boolean };

const installTable = d.table('install', {
  id: d.uuid().primary({ generate: 'uuid' }),
  meta: d.jsonb<InstallMeta>(),
  union: d.jsonb<UnionPayload>(),
  prim: d.jsonb<PrimitivePayload>(),
  coll: d.jsonb<CollisionPayload>(),
}, { indexes: [] });
const models = { install: d.model(installTable) };

const pg = createDb({ dialect: 'postgres', url: 'postgres://u:p@localhost/db', models });
const sqlite = createDb({ dialect: 'sqlite', path: ':memory:', models });

// Positive — Postgres
pg.install.list({ where: { meta: path((m: InstallMeta) => m.settings.theme).eq('dark') } });
pg.install.list({ where: { meta: path((m: InstallMeta) => m.tags[0]).eq('urgent') } });
pg.install.list({ where: { meta: { jsonContains: { settings: { theme: 'dark' } } } } });
pg.install.list({ where: { meta: { hasKey: 'settings' } } });

// Union payload — hasKey spans variants
pg.install.list({ where: { union: { hasKey: 'a' } } });  // ✓
pg.install.list({ where: { union: { hasKey: 'x' } } });  // ✓ (in both variants)

// Non-object payload — hasKey is never
pg.install.list({
  where: {
    // @ts-expect-error — hasKey unavailable on primitive JSONB payloads
    prim: { hasKey: 'anything' },
  },
});

// Collision — natural keys collide with operator names; direct equality still works
pg.install.list({
  where: {
    coll: { jsonContains: 'str', hasKey: true },  // ← direct T-shape equality, NOT operator
  },
});

// Negative — leaf type
pg.install.list({
  where: {
    // @ts-expect-error — 'foggy' not assignable to 'light' | 'dark'
    meta: path((m: InstallMeta) => m.settings.theme).eq('foggy'),
  },
});

// Negative — leaf operator availability
pg.install.list({
  where: {
    // @ts-expect-error — .contains not available on number leaf
    meta: path((m: InstallMeta) => m.settings.count).contains('1'),
  },
});

// Negative — unknown key
pg.install.list({
  where: {
    // @ts-expect-error — 'bogus' not in keyof InstallMeta
    meta: { hasKey: 'bogus' },
  },
});

// Negative — DeepPartial shape
pg.install.list({
  where: {
    meta: {
      // @ts-expect-error — settings.theme not assignable to 'light' | 'dark'
      jsonContains: { settings: { theme: 'fog' } },
    },
  },
});

// Negative — SQLite path builder
sqlite.install.list({
  where: {
    // @ts-expect-error — JsonbOperator_Error_Requires_Dialect_Postgres_…
    meta: path((m: InstallMeta) => m.settings.theme).eq('dark'),
  },
});

// Negative — SQLite jsonContains
sqlite.install.list({
  where: {
    // @ts-expect-error — JsonbOperator_Error_Requires_Dialect_Postgres_…
    meta: { jsonContains: { settings: { theme: 'dark' } } },
  },
});
```

## Unknowns

*None remaining.* Open questions resolved during design:

- **Can `T` flow from the `where` slot into `path()`?** No — TS commits left-to-right. Parameter-annotation form is the reliable path.
- **Array indexing on Postgres JSONB.** `->'0'` (text) on an array returns NULL. Rev 2 emits integer segments unquoted (`->0`), matching Postgres JSONB semantics.
- **`jsonContains` cast.** `$N::jsonb` required because `postgres.js` binds text. Same cast for `jsonContainedBy`.
- **Operator-name collision with payload keys.** Handled via union ordering + backcompat `.test-d.ts`.
- **Proxy selector hostile callbacks.** All JS internals guarded (Symbol keys, `then`, `toString`, `valueOf`, etc.). `m.a + m.b` produces an empty or mis-segmented descriptor; runtime behavior is "undefined segments → runtime error at SQL construction" — documented.

## POC Results

No POC required. All mechanisms exist or are trivially extendable:
- Proxy-based selector path recording — verified by a 20-line spike including the internal-key guards.
- `@>`, `<@`, `?` SQL emission — standard Postgres; `$N::jsonb` cast verified against `packages/db/src/dialect/postgres.ts` param binding.
- Conditional operator availability by leaf type — direct adaptation of existing `ColumnFilterOperators<TType, TNullable>` (inference.ts:51–54).
- Keyed-never brand diagnostics — shipped by #2850.
- Parameter-annotation `T` inference — standard TS, stable since 4.x.
- Integer vs text JSONB path emission — `packages/db/src/sql/where.ts:117` already concatenates segments; extending the segment representation is a small change.

## Definition of Done

Dependencies:
- [x] **#2850 shipped** (PR #2870, merged 2026-04-19) — provides `TDialect` thread and brand file.
- [x] **#2885 filed** (array-operator type gating — deferred from this ticket).
- [x] **#2886 filed** (`hasAllKeys` / `hasAnyKey` — deferred from this ticket).

Runtime (Phase A):
- [ ] `path(selector)` records segments via Proxy with full JS-internal guards; terminal ops return `JsonbPathDescriptor`.
- [ ] Integer segments preserved as `{ kind: 'index' }` and emitted unquoted in SQL.
- [ ] `where.ts` emits `@> $N::jsonb`, `<@ $N::jsonb`, `? $N` for the new operators.
- [ ] `buildFilterClauses` handles `JsonbPathDescriptor` values BEFORE `isOperatorObject` branch.
- [ ] Dialect gate runtime throws carry sentences matching the brand name verbatim.
- [ ] `OPERATOR_KEYS` extended with `jsonContains`, `jsonContainedBy`, `hasKey`.
- [ ] Integration tests pass on Postgres; runtime-throw tests pass on SQLite.
- [ ] Proxy-selector hostile-callback tests: `m.a + m.b`, `await path(...)`, `...path(...)` all produce safe outcomes (no thrown TypeError, no garbage segments).

Types (Phase B):
- [ ] `JsonbOperator_Error_…` brand interface exported.
- [ ] `JsonbColumnValue<T, TDialect>` replaces the current column-value branch for JSONB columns.
- [ ] `PathChain<TLeaf>` operator availability narrows per leaf type (string / number / bigint / Date / boolean / nullable / object).
- [ ] `JsonbKeyOf<T>` — union-safe, non-object `T` → `never`.
- [ ] `DeepPartial<T, D>` — depth cap 5, tuple-based `Decrement`.
- [ ] `.test-d.ts` negatives: path leaf type, path leaf operator, unknown `hasKey`, `DeepPartial` shape mismatch, `hasKey` on non-object payload, SQLite path builder, SQLite `jsonContains`.
- [ ] `.test-d.ts` positives: every Postgres shape above, union-payload `hasKey`, integer path index.
- [ ] `.test-d.ts` backcompat: operator-name-collision payload accepts direct-equality only, not operator-shape.
- [ ] `.test-d.ts` snapshot: SQLite diagnostic text for `meta: { jsonContains: {...} }` asserted verbatim.
- [ ] 20-model × JSONB canary typechecks under the existing budget.

Release (Phase C):
- [ ] `d.jsonb` JSDoc updated — new paragraph, `contains` vs `jsonContains` clarification.
- [ ] `packages/mint-docs/` — two new JSONB subsections + preference note.
- [ ] Changeset: `@vertz/db` patch, including the `FilterType` helper callout.
- [ ] Postgres behavior unchanged for existing code; all existing tests pass.

Process:
- [x] Three agent sign-offs on this design doc: DX, Product/scope, Technical. (Rev 1 reviews complete; rev 2 to be re-reviewed.)
- [ ] Human sign-off before implementation begins.
