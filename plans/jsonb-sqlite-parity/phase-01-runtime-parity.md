# Phase A — Runtime Parity (closes #2850 runtime bug)

## Context

Design doc: [`plans/jsonb-sqlite-parity.md`](../jsonb-sqlite-parity.md). Approved rev 3.

Issue: [#2850](https://github.com/vertz-dev/vertz/issues/2850) — `d.jsonb<T>()` on SQLite/D1 returns raw JSON strings on reads (TS type says `T`, runtime is a string). Writes happen to work because `@vertz/sqlite` / `bun:sqlite` implicitly stringify, but that's fragile across drivers.

This phase delivers runtime parity: reads parse, writes explicitly stringify, validator runs on parsed read values.

## Tasks

### Task 1: `fromSqliteValue` parses jsonb + `toSqliteValue` stringifies plain objects

**Files (≤5):**
- `packages/db/src/client/sqlite-value-converter.ts` (modified)
- `packages/db/src/client/__tests__/sqlite-value-converter.test.ts` (modified)
- `packages/db/src/client/errors.ts` (new — `JsonbParseError`, `JsonbValidationError`)

**What to implement:**

1. **Read parse branch** in `fromSqliteValue(value, columnType)`:
   ```ts
   if ((columnType === 'jsonb' || columnType === 'json') && typeof value === 'string') {
     try {
       return JSON.parse(value);
     } catch (cause) {
       throw new JsonbParseError({ columnType, cause });
     }
   }
   ```
   `fromSqliteValue` stays pure (no column name, no table — that's invoker's context). The error carries what this layer knows; the row-mapper enriches with `table` / `column` before rethrowing.

2. **Write stringify branch** in `toSqliteValue(value)` using a **positive** plain-object / array-literal predicate:
   ```ts
   const isPlainJsonPayload = (v: unknown): boolean => {
     if (v === null || typeof v !== 'object') return false;
     if (Array.isArray(v)) return true;
     const proto = Object.getPrototypeOf(v);
     return proto === Object.prototype || proto === null;
   };
   if (isPlainJsonPayload(value)) return JSON.stringify(value);
   ```
   Order matters: existing branches (`true` / `false` / `Date`) fire first. Everything else passes through (driver handles binding).

3. **New error classes** in `packages/db/src/client/errors.ts`:
   - `JsonbParseError` — carries `columnType`, `cause`; row-mapper adds `table`, `column` when rethrowing.
   - `JsonbValidationError` — carries `table`, `column`, `value`, `cause` (for validator failures, used by Task 2).

**Acceptance criteria:**
- [ ] `fromSqliteValue` parses `'{"a":1}'` with `columnType='jsonb'` → `{ a: 1 }`.
- [ ] `fromSqliteValue` parses with `columnType='json'` identically.
- [ ] `fromSqliteValue` throws `JsonbParseError` on invalid JSON in a jsonb cell.
- [ ] `fromSqliteValue` returns non-string values and non-jsonb columns unchanged.
- [ ] `toSqliteValue({ a: 1 })` → `'{"a":1}'`; `toSqliteValue([1, 2])` → `'[1,2]'`; `toSqliteValue(Object.create(null))` → string of `{}`.
- [ ] `toSqliteValue(new Date('2026-01-01'))` → ISO string (unchanged).
- [ ] `toSqliteValue(new Map())` / `Set` / `Uint8Array` / `Int32Array` / `URL` / `RegExp` / class instance → **pass through** unchanged.
- [ ] `toSqliteValue(true)` / `false` → `1` / `0` (unchanged).
- [ ] `toSqliteValue(null)` / `undefined` / primitives → pass through.

---

### Task 2: Row-mapper wires validator + enriches parse errors

**Files (≤5):**
- `packages/db/src/client/sqlite-driver.ts` (modified — extend `TableSchemaRegistry`, invoke validator in row-mapper)
- `packages/db/src/schema/column.ts` (export `JsonbValidator<T>` type if not already)
- `packages/db/src/client/__tests__/sqlite-driver.test.ts` (modified or new — validator invocation coverage)

**What to implement:**

1. Change `TableSchemaRegistry` shape:
   ```ts
   // Before
   type TableSchemaRegistry = Map<string, Record<string, string>>;
   // After
   type TableSchemaRegistry = Map<string, Record<string, ColumnMetadata>>;
   ```
2. Update `buildTableSchema` to store the full `ColumnMetadata`, not just `sqlType`.
3. Row-mapper (both `createSqliteDriver` D1 branch at lines ~140–152 and `createLocalSqliteDriver` at ~305–319):
   - Call `fromSqliteValue(value, meta.sqlType)` for conversion.
   - If `fromSqliteValue` throws `JsonbParseError`, catch it and rethrow with `{ table, column }` enriched.
   - If `meta.validator` is present and the converted value is non-null, invoke it. On validator failure (thrown or returns `false`), throw `JsonbValidationError { table, column, value, cause? }`.
4. The thrown errors propagate through `query()` / `execute()` — caught by the existing `ModelDelegate` Result-wrap layer, surfacing as `{ ok: false, error: JsonbParseError }` / `{ ok: false, error: JsonbValidationError }`.

**Acceptance criteria:**
- [ ] `TableSchemaRegistry` carries full `ColumnMetadata`; existing callers updated.
- [ ] `buildTableSchema` populates metadata.
- [ ] Validator invoked on reads when present; parsed value is the input.
- [ ] `JsonbParseError` from `fromSqliteValue` is rethrown with `table` / `column` context.
- [ ] `JsonbValidationError` thrown on validator failure (both throw and returns-false conventions).
- [ ] Both D1 and local SQLite code paths exercise validator invocation (one test for each).

---

### Task 3: E2E acceptance test + JSDoc

**Files (≤5):**
- `packages/db/src/client/__tests__/jsonb-parity.test.ts` (new)
- `packages/db/src/d.ts` (JSDoc update on `d.jsonb` and `d.json`)

**What to implement:**

1. E2E round-trip test matching the design doc's E2E acceptance test (describe/when/then BDD form, covers: object round-trip on SQLite, array round-trip, nested, null handling).
2. Exotic-type matrix tests verifying the positive predicate:
   - Pass-through: `Date`, `Uint8Array`, `Int32Array`, `ArrayBuffer`, `Map`, `Set`, `URL`, `RegExp`, class instance.
   - Stringified: plain object, array, null-prototype object.
3. Corrupt-data test: manually seed a malformed JSON TEXT cell via raw SQL, confirm read surfaces `{ ok: false, error: JsonbParseError }`.
4. Validator-fails-on-read test: write a row, validator accepts; write a row via raw SQL that violates validator on read, confirm `{ ok: false, error: JsonbValidationError }`.
5. D1 mocked-binding smoke test: exercise the D1 path with a fake `D1Database` implementation that stores rows in memory, verify parsing + validator firing.
6. Escape-hatch test: `create({ data: { textCol: { a: 1 } as unknown as string } })` — verify object stringifies on write, reads back as raw string (column is TEXT, not jsonb), no validator. Locks the footgun as documented behavior.
7. JSDoc on `d.jsonb<T>()`:
   ```
   /**
    * JSONB column — stores a typed payload.
    *
    * On Postgres, uses the native JSONB type and filter operators (path syntax,
    * array ops) are available. On SQLite/D1, stored as TEXT with automatic
    * JSON.parse on read.
    *
    * Path-based filters (e.g. `where: { 'meta->k': ... }`) are Postgres-only.
    * On SQLite, fetch with list() and filter in application code.
    * Inline the `where` object for the best TS diagnostic when the gate triggers.
    */
   ```
   Same JSDoc on `d.json<T>()`.

**Acceptance criteria:**
- [ ] `vtz test packages/db/src/client/__tests__/jsonb-parity.test.ts` passes.
- [ ] All exotic-type matrix cases covered and green.
- [ ] D1 mocked-binding test exercises D1 code path end-to-end.
- [ ] Escape-hatch test locks documented behavior.
- [ ] JSDoc updated on `d.jsonb` and `d.json` with recovery-path sentence verbatim.

---

## Phase A exit criteria

- All three tasks complete; their acceptance criteria met.
- `vtz test && vtz run typecheck && vtz run lint` clean in `packages/db/`.
- No Postgres test regressions.
- Adversarial review written at `reviews/jsonb-sqlite-parity/phase-01-runtime-parity.md` and resolved.
