# SQLite Dialect & Database Abstraction — Design Doc

**Author:** Mika (VP Engineering)
**Date:** 2026-02-20
**Status:** Draft v3 (review feedback addressed)
**Related:** [ID Generation](db-id-generation.md), [Entity-First Architecture](decisions/2026-02-20-entity-first-architecture.md)

---

## 1. Problem

`@vertz/db` is currently Postgres-only. Every SQL generator, migration tool, and driver assumes PostgreSQL syntax. This blocks:

- **Cloudflare D1 deployment** (SQLite-based) — our primary deploy target
- **Edge computing** (SQLite is the only embedded DB option)
- **Local development without Postgres** (SQLite is zero-config)
- **Cost-effective free tiers** (D1 free tier is generous)

## 2. Goals

1. **Dialect abstraction** — A `Dialect` interface encapsulating SQL syntax differences
2. **SQLite dialect** — Full SQLite support in query builders, schema, and migrations
3. **D1 compatibility** — SQLite dialect works with Cloudflare D1's API
4. **Zero schema changes** — `d.table()` definitions stay the same regardless of dialect
5. **Migration support** — CREATE TABLE DDL for both dialects (ALTER deferred for SQLite)

## 3. Non-Goals

- Database-specific optimizations (Postgres JSONB operators, SQLite FTS) — later
- Multi-database within one app
- SQLite ALTER TABLE migrations — v0.2 (SQLite's ALTER support is too limited)
- Local SQLite driver (better-sqlite3) — v0.2. D1 is the target for v0.1.
- Binary UUID storage in SQLite — TEXT for v0.1

## 4. ID Generation — Already Handled

ID generation is implemented in `@vertz/db` via `.primary({ generate })`. See `plans/db-id-generation.md`. This design does NOT duplicate ID generation.

## 5. Dialect Interface

```typescript
// packages/db/src/dialect/types.ts

export type IdStrategy = 'cuid' | 'uuid' | 'nanoid'; // re-exported from id/

export interface Dialect {
  readonly name: 'postgres' | 'sqlite';

  /** Parameter placeholder: $1 (postgres) or ? (sqlite) */
  param(index: number): string;

  /** SQL function for current timestamp */
  now(): string;

  /** Map a vertz column sqlType to the dialect's SQL type */
  mapColumnType(sqlType: string, meta?: ColumnTypeMeta): string;

  /** Whether the dialect supports RETURNING clause */
  readonly supportsReturning: boolean;

  /** Whether the dialect supports array operators (@>, <@, &&) */
  readonly supportsArrayOps: boolean;

  /** Whether the dialect supports JSONB path operators (->>, ->) */
  readonly supportsJsonbPath: boolean;
}

export interface ColumnTypeMeta {
  enumName?: string;
  enumValues?: readonly string[];
  length?: number;
  precision?: number;
  scale?: number;
}
```

**Why the dialect is minimal:** The dialect provides primitives (param format, type mapping, feature flags). The SQL builders use these primitives. The dialect does NOT own the full SQL generation — that stays in the existing builder files. This keeps the refactor surgical.

## 6. Dialect Propagation Path

**This is how `Dialect` flows from `createDb()` to SQL generation:**

```
createDb({ dialect: 'sqlite', d1: env.DB })
  → stores dialect on DbInstance
    → crud.ts reads dialect from DbInstance
      → passes dialect to buildInsert(options, dialect)
        → buildInsert calls dialect.param(), dialect.now()
          → buildWhere(filter, offset, overrides, dialect)
            → WHERE builder calls dialect.param()
```

Concretely:

1. **`createDb()`** creates a `Dialect` instance and stores it on the db object
2. **`crud.ts`** functions receive `dialect` via a new field on the options or via the db instance passed through `queryFn`
3. **SQL builders** (`buildInsert`, `buildSelect`, `buildUpdate`, `buildDelete`) accept `dialect` as a parameter (defaults to `PostgresDialect` for backward compat)
4. **`buildWhere()`** accepts `dialect` as a parameter — this is the deepest call site

**Implementation:** The cleanest path is extending the existing `queryFn` pattern. `createDb()` already passes `queryFn` through to CRUD functions. We add `dialect` as a sibling:

```typescript
// In crud.ts, functions already receive queryFn and table.
// Add dialect as a parameter:
export async function create<T>(
  queryFn: QueryFn,
  table: TableDef<ColumnRecord>,
  options: CreateArgs,
  dialect: Dialect = defaultPostgresDialect,
): Promise<T> { ... }
```

`database.ts` passes the dialect when calling CRUD functions internally.

## 7. PostgresDialect

Extracted from existing behavior — no functional change:

```typescript
// packages/db/src/dialect/postgres.ts

export class PostgresDialect implements Dialect {
  readonly name = 'postgres';
  readonly supportsReturning = true;
  readonly supportsArrayOps = true;
  readonly supportsJsonbPath = true;

  param(index: number): string {
    return `$${index}`;
  }

  now(): string {
    return 'NOW()';
  }

  mapColumnType(sqlType: string, meta?: ColumnTypeMeta): string {
    switch (sqlType) {
      case 'uuid': return 'UUID';
      case 'text': return 'TEXT';
      case 'integer': return 'INTEGER';
      case 'serial': return 'SERIAL';
      case 'boolean': return 'BOOLEAN';
      case 'timestamp': return 'TIMESTAMPTZ';
      case 'float': return 'DOUBLE PRECISION';
      case 'json': return 'JSONB';
      case 'decimal': return meta?.precision ? `NUMERIC(${meta.precision},${meta.scale ?? 0})` : 'NUMERIC';
      case 'varchar': return meta?.length ? `VARCHAR(${meta.length})` : 'VARCHAR';
      case 'enum': return meta?.enumName ?? 'TEXT';
      default: return 'TEXT';
    }
  }
}

export const defaultPostgresDialect = new PostgresDialect();
```

## 8. SqliteDialect

```typescript
// packages/db/src/dialect/sqlite.ts

export class SqliteDialect implements Dialect {
  readonly name = 'sqlite';
  readonly supportsReturning = true; // SQLite 3.35+ (D1 supports this)
  readonly supportsArrayOps = false;
  readonly supportsJsonbPath = false; // SQLite uses json_extract() instead

  param(_index: number): string {
    return '?'; // SQLite uses positional ? params
  }

  now(): string {
    return "datetime('now')";
  }

  mapColumnType(sqlType: string, _meta?: ColumnTypeMeta): string {
    switch (sqlType) {
      case 'uuid': return 'TEXT';
      case 'text': return 'TEXT';
      case 'integer': return 'INTEGER';
      case 'serial': return 'INTEGER'; // INTEGER PRIMARY KEY auto-increments in SQLite
      case 'boolean': return 'INTEGER'; // 0/1
      case 'timestamp': return 'TEXT'; // ISO 8601
      case 'float': return 'REAL';
      case 'json': return 'TEXT';
      case 'decimal': return 'REAL';
      case 'varchar': return 'TEXT';
      case 'enum': return 'TEXT'; // + CHECK constraint in DDL
      default: return 'TEXT';
    }
  }
}
```

### Unsupported Operations on SQLite

When a query uses Postgres-specific operators on SQLite, the WHERE builder throws a clear error:

```typescript
// In where.ts, when building array operators:
if (operators.arrayContains !== undefined) {
  if (!dialect.supportsArrayOps) {
    throw new Error(
      'Array operators (arrayContains, arrayContainedBy, arrayOverlaps) are not supported on SQLite. ' +
      'Use a different filter strategy or switch to Postgres.'
    );
  }
  // ... existing Postgres code
}

// In where.ts, when resolving JSONB path:
if (key.includes('->')) {
  if (!dialect.supportsJsonbPath) {
    throw new Error(
      'JSONB path operators (->>, ->) are not supported on SQLite. ' +
      'Use json_extract() via raw SQL or switch to Postgres.'
    );
  }
  // ... existing Postgres code
}
```

This fails fast with a clear message instead of generating invalid SQL.

## 9. SQL Builder Refactor

Each builder gets a `dialect` parameter (defaults to `PostgresDialect`):

### where.ts — The deepest change

Every `$${idx + 1}` becomes `dialect.param(idx + 1)`. The function signature changes:

```typescript
export function buildWhere(
  filter: WhereFilter | undefined,
  paramOffset = 0,
  overrides?: CasingOverrides,
  dialect: Dialect = defaultPostgresDialect,
): WhereResult { ... }
```

And internally `buildFilterClauses` and `buildOperatorCondition` thread `dialect` through. Every `$${idx + 1}` → `dialect.param(idx + 1)`.

Array operators (`@>`, `<@`, `&&`) and JSONB path (`->`, `->>`) get feature-flag guards as shown above.

### insert.ts
- `$${allParams.length}` → `dialect.param(allParams.length)`
- `'NOW()'` → `dialect.now()`
- ON CONFLICT: SQLite 3.24+ uses same `ON CONFLICT ... DO UPDATE SET` syntax. The `EXCLUDED` pseudo-table also works in SQLite. No change needed here.

### select.ts
- `$${allParams.length}` → `dialect.param(allParams.length)` (via `buildWhere`)
- `COUNT(*) OVER()` — SQLite supports window functions since 3.25. D1 supports them. No change needed.

### update.ts
- `$${allParams.length}` → `dialect.param(allParams.length)`
- `'NOW()'` → `dialect.now()`

### delete.ts
- `$${allParams.length}` → `dialect.param(allParams.length)` (via `buildWhere`)

### Backward Compatibility

All builder functions default to `PostgresDialect`. Existing callers (both internal and any external) produce identical SQL without changes. The new parameter is always last and optional.

## 10. Value Conversion Layer

SQLite stores booleans as 0/1 and timestamps as TEXT. The driver converts transparently.

**How it knows which columns need conversion:** The `createDb()` call already receives `tables` (the table registry). The SQLite driver uses the column metadata (`_meta.sqlType`) to know which columns are booleans and timestamps:

```typescript
// packages/db/src/client/sqlite-value-converter.ts

export interface ValueConverter {
  toDb(columnName: string, value: unknown): unknown;
  fromDb(columnName: string, value: unknown): unknown;
}

export function createValueConverter(tables: TableRegistry): ValueConverter {
  // Build a lookup: { tableName: { columnName: sqlType } }
  // On write: boolean true → 1, false → 0; Date → ISO string
  // On read: INTEGER for boolean columns → true/false; TEXT for timestamp columns → Date
  
  return {
    toDb(columnName, value) {
      const sqlType = lookupType(columnName);
      if (sqlType === 'boolean') return value ? 1 : 0;
      if (sqlType === 'timestamp' && value instanceof Date) return value.toISOString();
      return value;
    },
    fromDb(columnName, value) {
      const sqlType = lookupType(columnName);
      if (sqlType === 'boolean') return value === 1 || value === true;
      if (sqlType === 'timestamp' && typeof value === 'string') return new Date(value);
      return value;
    },
  };
}
```

**Table registry is already available** — `createDb()` receives `tables` today. The SQLite driver just needs it passed through:

```typescript
const db = createDb({
  dialect: 'sqlite',
  d1: env.DB,
  tables,  // ← already required
});
```

## 11. SQLite/D1 Driver

```typescript
// packages/db/src/client/sqlite-driver.ts

import type { DbDriver } from './driver';
import type { QueryFn } from '../query/executor';
import { createValueConverter } from './sqlite-value-converter';

export interface SqliteDriverOptions {
  binding: D1Database;
  tables: TableRegistry;
}

export function createSqliteDriver(options: SqliteDriverOptions): DbDriver {
  const converter = createValueConverter(options.tables);

  const queryFn: QueryFn = async (sql, params) => {
    // Convert params (booleans, dates) before sending to D1
    const convertedParams = params.map((p, i) => converter.toDb('param', p));
    
    const isRead = sql.trimStart().toUpperCase().startsWith('SELECT');
    const stmt = options.binding.prepare(sql).bind(...convertedParams);

    if (isRead) {
      const result = await stmt.all();
      const rows = (result.results ?? []).map(row => 
        convertRowFromDb(row, converter)
      );
      return { rows, rowCount: rows.length };
    } else {
      // INSERT/UPDATE/DELETE — use .run() for writes
      const result = await stmt.run();
      // D1 .run() returns { results, meta } — results has RETURNING data
      const rows = (result.results ?? []).map(row =>
        convertRowFromDb(row, converter)
      );
      return { rows, rowCount: result.meta?.changes ?? rows.length };
    }
  };

  return {
    queryFn,
    async close() { /* D1 connections managed by Workers runtime */ },
    async isHealthy() { return true; },
  };
}
```

**Note on D1 API:**
- `.all()` for reads — returns `{ results: Row[], success, meta }`
- `.run()` for writes — returns `{ results: Row[], success, meta: { changes, ... } }`
- `.first()` for single-row reads — optimization, but `.all()` works fine for v0.1

## 12. createDb() — Dialect Selection

```typescript
export interface CreateDbOptions<TTables extends Record<string, TableEntry>> {
  // Existing (unchanged):
  readonly url?: string;
  readonly tables: TTables;
  readonly pool?: PoolConfig;
  readonly casing?: 'snake_case' | 'camelCase';
  readonly casingOverrides?: Record<string, string>;
  readonly log?: (message: string) => void;
  readonly _queryFn?: QueryFn;

  // New:
  readonly dialect?: 'postgres' | 'sqlite';
  readonly d1?: D1Database;
}
```

**Validation:**
- `dialect: 'sqlite'` without `d1` → throws: `"SQLite dialect requires a D1 binding. Pass d1: env.DB to createDb()."`
- `dialect: 'sqlite'` with `url` → throws: `"SQLite dialect uses D1, not a connection URL. Remove url or use dialect: 'postgres'."`
- No `dialect` + `url` → Postgres (backward compatible)
- No `dialect` + no `url` + no `d1` → throws (existing behavior)

## 13. Driver Interface Rename

```typescript
// packages/db/src/client/driver.ts

export interface DbDriver {
  readonly queryFn: QueryFn;
  close(): Promise<void>;
  isHealthy(): Promise<boolean>;
}

// Backward compat alias:
/** @deprecated Use DbDriver */
export type PostgresDriver = DbDriver;
```

## 14. Migration Generator — SQLite Support

### Scope for v0.1: CREATE TABLE only

SQLite's ALTER TABLE is severely limited (no DROP COLUMN before 3.35, no ALTER COLUMN type, no ADD CONSTRAINT). For v0.1:

- ✅ **CREATE TABLE** — full support with SQLite types
- ✅ **CREATE INDEX** — same syntax, works on both
- ✅ **DROP TABLE** — same syntax
- ❌ **ALTER TABLE** — deferred to v0.2 (would need table recreation strategy)

This is sufficient for the Cloudflare demo (fresh database). Migration diffs for existing SQLite databases come later.

### DDL Generation

```typescript
// sql-generator.ts accepts dialect:
function generateCreateTable(table: TableSnapshot, dialect: Dialect): string {
  const columns = Object.entries(table.columns).map(([name, col]) => {
    const sqlType = dialect.mapColumnType(col.type, {
      enumName: col.enumName,
      enumValues: col.enumValues,
      length: col.length,
      precision: col.precision,
      scale: col.scale,
    });
    
    const parts = [`"${camelToSnake(name)}" ${sqlType}`];
    if (col.primary) parts.push('PRIMARY KEY');
    if (!col.nullable) parts.push('NOT NULL');
    if (col.unique) parts.push('UNIQUE');
    
    // Enum CHECK constraint for SQLite
    if (col.type === 'enum' && col.enumValues && dialect.name === 'sqlite') {
      const values = col.enumValues.map(v => `'${v}'`).join(', ');
      parts.push(`CHECK("${camelToSnake(name)}" IN (${values}))`);
    }
    
    return parts.join(' ');
  });
  
  return `CREATE TABLE "${table.name}" (\n  ${columns.join(',\n  ')}\n);`;
}
```

For Postgres, enum DDL (`CREATE TYPE ... AS ENUM`) is generated separately as today.

## 15. Entity Integration

**No changes.** The dialect is below the entity layer:

```
entity('todos', { model })
  → EntityDbAdapter.create(data)
    → CRUD pipeline (fillGeneratedIds adds ID)
      → buildInsert(options, dialect) generates SQL
        → Driver executes on Postgres or SQLite
```

## 16. File Structure

```
packages/db/src/
  dialect/
    types.ts                     # Dialect interface
    postgres.ts                  # PostgresDialect (+ defaultPostgresDialect)
    sqlite.ts                    # SqliteDialect
    index.ts                     # Barrel
  client/
    driver.ts                    # DbDriver interface (renamed)
    database.ts                  # Updated createDb()
    postgres-driver.ts           # Existing (implements DbDriver)
    sqlite-driver.ts             # New D1 driver
    sqlite-value-converter.ts    # Boolean/timestamp conversion
  sql/
    insert.ts                    # Refactored: dialect param
    select.ts                    # Refactored: dialect param
    update.ts                    # Refactored: dialect param
    delete.ts                    # Refactored: dialect param
    where.ts                     # Refactored: dialect param + feature guards
  migration/
    sql-generator.ts             # Refactored: dialect-aware DDL
  id/
    generators.ts                # Already exists
    index.ts                     # Already exists
```

## 17. Test Plan

### Dialect Unit Tests (14 tests)
1. PostgresDialect.param(1) → `$1`
2. PostgresDialect.param(5) → `$5`
3. SqliteDialect.param(1) → `?`
4. SqliteDialect.param(5) → `?`
5. PostgresDialect.now() → `NOW()`
6. SqliteDialect.now() → `datetime('now')`
7. PostgresDialect.mapColumnType — all types
8. SqliteDialect.mapColumnType — uuid→TEXT, boolean→INTEGER, timestamp→TEXT, json→TEXT
9. PostgresDialect.supportsArrayOps → true
10. SqliteDialect.supportsArrayOps → false
11. PostgresDialect.supportsJsonbPath → true
12. SqliteDialect.supportsJsonbPath → false
13. PostgresDialect feature completeness (all fields defined)
14. SqliteDialect feature completeness (all fields defined)

### SQL Builder Regression — Postgres (4 tests)
15. buildInsert with PostgresDialect → same SQL as before
16. buildSelect with PostgresDialect → same SQL as before
17. buildUpdate with PostgresDialect → same SQL as before
18. buildDelete with PostgresDialect → same SQL as before

### SQL Builder — SQLite (8 tests)
19. buildInsert with SqliteDialect → ? params, datetime('now')
20. buildSelect with SqliteDialect → ? params
21. buildUpdate with SqliteDialect → ? params, datetime('now')
22. buildDelete with SqliteDialect → ? params
23. buildWhere with SqliteDialect → ? params for all standard operators
24. buildWhere arrayContains on SQLite → throws descriptive error
25. buildWhere JSONB path on SQLite → throws descriptive error
26. buildInsert ON CONFLICT with SqliteDialect → valid syntax

### Value Converter (6 tests)
27. toDb: boolean true → 1
28. toDb: boolean false → 0
29. toDb: Date → ISO string
30. fromDb: 1 → true (boolean column)
31. fromDb: 0 → false (boolean column)
32. fromDb: ISO string → Date (timestamp column)

### D1 Driver (5 tests)
33. SELECT via D1 mock → correct rows returned
34. INSERT with RETURNING via D1 mock → uses .run()
35. Empty result set handling
36. Parameter binding with ? placeholders
37. Boolean/timestamp conversion end-to-end

### createDb() Integration (4 tests)
38. Default (no dialect) → Postgres (backward compat)
39. `dialect: 'sqlite'` + `d1` → SQLite driver created
40. `dialect: 'sqlite'` without `d1` → throws clear error
41. `dialect: 'sqlite'` + `url` → throws clear error

### Migration Generator (5 tests)
42. CREATE TABLE with Postgres types (regression)
43. CREATE TABLE with SQLite types (uuid→TEXT, boolean→INTEGER)
44. Enum: CREATE TYPE for Postgres
45. Enum: CHECK constraint for SQLite
46. CREATE INDEX — same for both dialects

**Total: 46 tests**

## 18. Implementation Phases

### Phase 1: Dialect Interface + PostgresDialect Extraction
- Create `Dialect` interface and `PostgresDialect`
- Refactor all SQL builders to accept `dialect` param (default: PostgresDialect)
- Refactor `where.ts` to use `dialect.param()`
- **All existing tests must pass unchanged** — pure refactor
- ~15 new tests (dialect unit + Postgres regression)

### Phase 2: SqliteDialect + Feature Guards
- Implement `SqliteDialect`
- Add feature guards in `where.ts` for array/JSONB operators
- ~10 new tests

### Phase 3: D1 Driver + Value Converter + createDb()
- `sqlite-driver.ts`, `sqlite-value-converter.ts`
- Update `createDb()` with `dialect` option and validation
- Rename `PostgresDriver` → `DbDriver`
- ~12 new tests

### Phase 4: Migration Generator
- Make `sql-generator.ts` dialect-aware (CREATE TABLE only for SQLite)
- ~5 new tests

### Phase 5: Integration Testing
- Entity CRUD end-to-end on SQLite (via D1 mock)
- Regression on Postgres

## 19. Open Questions

1. **D1 type definitions:** Need `@cloudflare/workers-types` for D1 types. Add as devDependency. Users on Cloudflare already have it.

## 20. Effort Estimate

| Phase | Estimate |
|-------|----------|
| Phase 1: Dialect interface + Postgres extraction | 1.5 days |
| Phase 2: SqliteDialect | 0.5 days |
| Phase 3: D1 driver + createDb | 1.5 days |
| Phase 4: Migration generator | 0.5 days |
| Phase 5: Integration tests | 1 day |
| **Total** | **~5 days** |

With parallel agent execution: **2-3 days.**
