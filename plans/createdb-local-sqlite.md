# Design Doc: `createDb()` Local SQLite Support

## Problem

`createDb({ dialect: 'sqlite' })` only works with Cloudflare D1 bindings. It throws if no `d1` option is provided:

```ts
if (dialect === 'sqlite') {
  if (!options.d1) {
    throw new Error('SQLite dialect requires a D1 binding');
  }
}
```

Local file-based SQLite (`:memory:`, `./data/app.db`) is only possible through `createSqliteAdapter()` — a single-table, per-entity adapter that doesn't support multi-table schemas, relations, or the full `DatabaseClient` API. This confuses customers who expect `createDb()` to work with SQLite the same way it works with Postgres.

Once `createDb()` supports local SQLite, `createSqliteAdapter` and `createD1Adapter` can be removed from the public API.

## API Surface

### New option: `path`

```ts
import { createDb, d } from 'vertz/db';

const todosTable = d.table('todos', {
  id: d.uuid().primary({ generate: 'cuid' }),
  title: d.text(),
  completed: d.boolean().default(false),
});

const todosModel = d.model(todosTable);

// Local file-based SQLite
const db = createDb({
  models: { todos: todosModel },
  dialect: 'sqlite',
  path: './data/app.db',
});

// In-memory SQLite (tests, prototyping)
const testDb = createDb({
  models: { todos: todosModel },
  dialect: 'sqlite',
  path: ':memory:',
});
```

### D1 still works unchanged

```ts
// Cloudflare D1 — existing API, no changes
const db = createDb({
  models: { todos: todosModel },
  dialect: 'sqlite',
  d1: env.DB,
});
```

### Validation rules

```ts
// OK — local SQLite via path
createDb({ models, dialect: 'sqlite', path: ':memory:' });
createDb({ models, dialect: 'sqlite', path: './data/app.db' });

// OK — D1
createDb({ models, dialect: 'sqlite', d1: env.DB });

// ERROR — must provide path or d1
createDb({ models, dialect: 'sqlite' });
// → 'SQLite dialect requires either a "path" (local file) or "d1" (Cloudflare D1 binding)'

// ERROR — can't provide both
createDb({ models, dialect: 'sqlite', path: ':memory:', d1: env.DB });
// → 'Cannot use both "path" and "d1" — pick one SQLite backend'

// ERROR — path is sqlite-only (TypeScript catches this via discriminated union)
createDb({ models, dialect: 'postgres', path: ':memory:' });
// → '"path" is only valid with dialect: "sqlite"'

// ERROR — url is postgres-only (existing behavior)
createDb({ models, dialect: 'sqlite', url: 'postgres://...' });
// → 'SQLite dialect uses "path" or "d1", not a connection URL'
```

### Auto-migration via `migrations.autoApply`

```ts
const db = createDb({
  models: { todos: todosModel },
  dialect: 'sqlite',
  path: ':memory:',
  migrations: { autoApply: true },
});
```

`migrations.autoApply` runs `CREATE TABLE IF NOT EXISTS` and `CREATE INDEX IF NOT EXISTS` for all models on startup. **This is idempotent table creation, not schema diffing.** It will not alter existing tables, add columns, or generate migration files. For schema evolution, use `vertz db migrate` (the migration system).

This is a dev-time convenience for local SQLite — tables are created from the current schema definitions. In production, migrations should be applied via `vertz db migrate --deploy`, not at runtime.

**Lazy initialization:** Since `createDb()` is synchronous but table creation requires I/O, `autoApply` defers execution to a lazy init Promise that resolves before the first query. This follows the same pattern as the existing `initPostgres` lazy connection in `database.ts` (line 887). The `bun:sqlite` Database constructor is synchronous, but we wrap the DDL execution in the lazy init for consistency.

### Template migration (create-vertz-app)

Before:
```ts
import { createSqliteAdapter } from 'vertz/db/sqlite';
import { tasksTable } from './schema';

export const db = await createSqliteAdapter({
  schema: tasksTable,
  migrations: { autoApply: true },
});
```

After:
```ts
import { createDb } from 'vertz/db';
import { tasksModel } from './schema';

export const db = createDb({
  models: { tasks: tasksModel },
  dialect: 'sqlite',
  path: '.vertz/data/app.db',
  migrations: { autoApply: true },
});
```

Note: The implementation must `mkdirSync(dirname(path), { recursive: true })` before opening the database for file-based paths (not `:memory:`), to avoid `SQLITE_CANTOPEN` on fresh scaffolds.

## Manifesto Alignment

- **One way to do things** — eliminates the `createSqliteAdapter` / `createD1Adapter` split. One API (`createDb`) for all backends.
- **DX-first** — developers don't need to know about per-entity adapters. `createDb()` works the same for Postgres, D1, and local SQLite.
- **LLM-friendly** — fewer concepts to learn, fewer API paths to navigate.

## Non-Goals

- **Custom SQLite pragmas** — WAL mode is set for file-based paths (not `:memory:`). Configurable pragmas can come later.
- **Connection pooling for SQLite** — SQLite is single-writer. No pool config needed.
- **SQLite transaction support in `createDb()`** — D1 doesn't support transactions; local SQLite could, but we defer this. The `beginTransaction` method on DbDriver remains optional.
- **Keeping `createSqliteAdapter` / `createD1Adapter` / `createDbProvider` as public API** — once this lands, they are deleted entirely.
- **Schema diffing via `autoApply`** — `autoApply` is `CREATE TABLE IF NOT EXISTS`, not the migration system. Schema evolution uses `vertz db migrate`.

## Unknowns

1. **`bun:sqlite` vs `better-sqlite3` runtime detection** — The current `createSqliteDriver` in `sqlite-adapter.ts` uses `require('bun:sqlite')` with a fallback to `better-sqlite3`. The `client/sqlite-driver.ts` only supports D1. We need to unify these into one driver that handles both local and D1.
   - **Resolution:** Create a new `createLocalSqliteDriver()` in `client/sqlite-driver.ts` that wraps `bun:sqlite` / `better-sqlite3` behind the same `SqliteDriver` interface. Reuse the value conversion logic from the existing D1 driver.

2. **Parameter value conversion for `bun:sqlite`** — `bun:sqlite` does not accept JS booleans (`true`/`false`) as bound parameters — it expects `1`/`0`. The SQL layer passes raw JS values in params arrays.
   - **Resolution:** The local driver's `query()` and `execute()` must run `toSqliteValue()` over the params array before binding. This converts booleans to integers, Dates to ISO strings, etc.

3. **PostgreSQL-style `$N` placeholders** — The CRUD SQL generators use `$1, $2, ...` numbered placeholders. `bun:sqlite` uses `?` positional placeholders.
   - **Resolution:** The local driver converts `$N` → `?` before executing. The existing D1 driver already handles this (the D1 API also uses `?`). The existing `$N` → `?` conversion pattern is already proven in `transaction.test.ts`.

## Type Flow Map

`CreateDbOptions` becomes a discriminated union on `dialect` for type-safe option exclusivity:

```
CreateDbOptions<TModels> =
  | PostgresOptions<TModels>
  |   ├── dialect?: 'postgres'
  |   ├── url?: string
  |   ├── pool?: PoolConfig
  |   ├── path?: never           ← blocked at type level
  |   └── d1?: never             ← blocked at type level
  |
  | SqlitePathOptions<TModels>
  |   ├── dialect: 'sqlite'
  |   ├── path: string
  |   ├── d1?: never             ← blocked at type level
  |   ├── url?: never            ← blocked at type level
  |   └── migrations?: { autoApply?: boolean }   ← new
  |
  | SqliteD1Options<TModels>
      ├── dialect: 'sqlite'
      ├── d1: D1Database
      ├── path?: never           ← blocked at type level
      └── url?: never            ← blocked at type level

Common fields (all variants):
  ├── models: TModels            ← existing, unchanged
  ├── casing?: 'snake_case' | 'camelCase'
  ├── casingOverrides?: Record<string, string>
  ├── log?: (message: string) => void
  └── _queryFn?: QueryFn         ← internal, testing
```

No new generics. `TModels` flow is unchanged. The discriminated union uses `never` on mutually exclusive fields to enforce correctness at compile time.

## E2E Acceptance Test

```ts
import { createDb, d } from '@vertz/db';

describe('Feature: createDb with local SQLite', () => {
  const todosTable = d.table('todos', {
    id: d.uuid().primary({ generate: 'cuid' }),
    title: d.text(),
    completed: d.boolean().default(false),
    createdAt: d.timestamp().default('now').readOnly(),
  });

  const todosModel = d.model(todosTable);

  describe('Given createDb with dialect: sqlite and path: :memory:', () => {
    describe('When creating and querying records', () => {
      it('Then performs full CRUD with typed results', async () => {
        const db = createDb({
          models: { todos: todosModel },
          dialect: 'sqlite',
          path: ':memory:',
          migrations: { autoApply: true },
        });

        const created = await db.todos.create({
          data: { title: 'Buy milk', completed: false },
        });
        expect(created.ok).toBe(true);
        expect(created.data.title).toBe('Buy milk');

        const listed = await db.todos.list({
          where: { completed: false },
        });
        expect(listed.ok).toBe(true);
        expect(listed.data.length).toBe(1);
      });
    });
  });

  describe('Given createDb with dialect: sqlite and no path or d1', () => {
    describe('When calling createDb', () => {
      it('Then throws a descriptive error', () => {
        expect(() =>
          createDb({
            models: { todos: todosModel },
            dialect: 'sqlite',
          }),
        ).toThrow('SQLite dialect requires either a "path" (local file) or "d1" (Cloudflare D1 binding)');
      });
    });
  });

  describe('Given createDb with both path and d1', () => {
    describe('When calling createDb', () => {
      it('Then throws a mutual exclusivity error', () => {
        expect(() =>
          createDb({
            models: { todos: todosModel },
            dialect: 'sqlite',
            path: ':memory:',
            // @ts-expect-error — discriminated union blocks path + d1
            d1: {},
          }),
        ).toThrow('Cannot use both "path" and "d1"');
      });
    });
  });

  describe('Given createDb with path on postgres dialect', () => {
    describe('When calling createDb', () => {
      it('Then throws dialect mismatch error', () => {
        expect(() =>
          createDb({
            models: { todos: todosModel },
            // @ts-expect-error — discriminated union blocks path on postgres
            dialect: 'postgres',
            path: ':memory:',
          }),
        ).toThrow('"path" is only valid with dialect: "sqlite"');
      });
    });
  });
});
```

## Implementation Plan

### Phase 1: Local SQLite driver + `path` option on `createDb()`

Create a `createLocalSqliteDriver()` that wraps `bun:sqlite` / `better-sqlite3` behind the existing `SqliteDriver` interface (same as D1 driver: `query`, `execute`, `close`, `isHealthy`). The local driver must:

1. Auto-create parent directories for file-based paths (`mkdirSync`)
2. Set `PRAGMA journal_mode = WAL` for file-based paths (not `:memory:`)
3. Convert `$N` placeholders to `?` before executing
4. Run `toSqliteValue()` on input params (booleans → integers, Dates → ISO strings)
5. Run `fromSqliteValue()` on output rows (same as D1 driver)

Add `path` option to `CreateDbOptions` via discriminated union. Update validation in `createDb()` to accept `path` as alternative to `d1`. Add `migrations?: { autoApply?: boolean }` with lazy init (deferred Promise resolved before first query). Wire the new driver into the existing `queryFn` initialization path.

**Acceptance criteria:**
```ts
describe('Given createDb with path: ":memory:" and migrations: { autoApply: true }', () => {
  describe('When performing CRUD operations', () => {
    it('Then creates tables, inserts, queries, updates, and deletes with typed results', () => {});
  });
});

describe('Given createDb with path: ":memory:" and two related models', () => {
  describe('When querying with include', () => {
    it('Then loads relations across tables', () => {});
  });
});

describe('Given createDb with path and boolean/Date values', () => {
  describe('When inserting and querying', () => {
    it('Then correctly converts booleans to 1/0 and Dates to ISO strings', () => {});
  });
});

describe('Given invalid option combinations', () => {
  describe('When path and d1 are both provided', () => {
    it('Then throws mutual exclusivity error', () => {});
  });
  describe('When neither path nor d1 is provided for sqlite dialect', () => {
    it('Then throws descriptive error', () => {});
  });
  describe('When path is provided with postgres dialect', () => {
    it('Then throws dialect mismatch error (compile-time via discriminated union)', () => {});
  });
});
```

### Phase 2: Migrate examples, templates, and tests

Update `create-vertz-app` template, `entity-todo` example, and `contacts-api` example to use `createDb()` with `path`. Migrate `sqlite-adapter.test.ts` tests to exercise `createDb()` with `path: ':memory:'`. Remove `createSqliteAdapter` and `createD1Adapter` from public exports.

Validate E2E that examples work with `createDb()` + `createServer()` — the bridge adapter path (`createDb` → `DatabaseClient` → `createDatabaseBridgeAdapter` → entity pipeline) must be exercised, not just the import change.

**Acceptance criteria:**
```ts
describe('Given scaffolded app from create-vertz-app', () => {
  describe('When reading the generated db.ts', () => {
    it('Then uses createDb with dialect: sqlite and path', () => {});
    it('Then does not reference createSqliteAdapter', () => {});
  });
});

describe('Given entity-todo example with createDb', () => {
  describe('When running the server and performing CRUD', () => {
    it('Then creates, lists, updates, and deletes todos via HTTP', () => {});
  });
});

describe('Given @vertz/db public exports', () => {
  describe('When importing from @vertz/db', () => {
    it('Then createSqliteAdapter is not exported', () => {});
    it('Then createD1Adapter is not exported', () => {});
  });
});
```

### Phase 3: Clean up dead code

Remove the following:

- `packages/db/src/adapters/sqlite-adapter.ts` — old per-entity SQLite adapter
- `packages/db/src/adapters/d1-adapter.ts` — old per-entity D1 adapter
- `packages/db/src/adapters/sql-utils.ts` — `BaseSqlAdapter`, `generateCreateTableSql`, `generateIndexSql` (only used by removed adapters)
- `packages/db/src/adapters/index.ts` — deprecated `createDbProvider` facade
- `@vertz/db/sqlite` sub-path export (`packages/db/src/sqlite/index.ts`)
- `@vertz/db/d1` sub-path export (`packages/db/src/d1/index.ts`)
- All `createSqliteAdapter` / `createD1Adapter` references in README

**Explicitly retained:**
- `packages/db/src/adapters/database-bridge-adapter.ts` — bridges `DatabaseClient` to `EntityDbAdapter` for `createServer()`. This is critical infrastructure, not dead code.

**Acceptance criteria:**
```ts
describe('Given the @vertz/db package', () => {
  describe('When checking sub-path exports', () => {
    it('Then @vertz/db/sqlite does not exist', () => {});
    it('Then @vertz/db/d1 does not exist', () => {});
  });
  describe('When checking adapters directory', () => {
    it('Then sqlite-adapter.ts does not exist', () => {});
    it('Then d1-adapter.ts does not exist', () => {});
    it('Then sql-utils.ts does not exist', () => {});
    it('Then database-bridge-adapter.ts still exists', () => {});
  });
});
```

## Review Sign-offs

### DX Review — APPROVED (nits)
- `path` is the correct option name (matches `bun:sqlite`, `better-sqlite3` conventions)
- Template migration is clean, `:memory:` for tests is first-class
- Nit: auto-create directories for file paths — addressed in Phase 1 requirements
- Nit: discriminated union for type safety — addressed in Type Flow Map

### Product/Scope Review — APPROVED (should-fix items addressed)
- Clarified `autoApply` = `CREATE TABLE IF NOT EXISTS`, not schema diffing
- Added `migrations` to Type Flow Map
- Explicitly retained `database-bridge-adapter.ts` in Phase 3
- Added E2E validation of examples with `createDb()` + `createServer()` in Phase 2
- Added `createDbProvider` removal in Phase 3

### Technical Review — APPROVED (should-fix items addressed)
- Added `toSqliteValue()` input param conversion requirement to Phase 1
- Added `$N` → `?` placeholder conversion requirement to Phase 1
- Specified lazy init strategy for async `autoApply` in sync `createDb()`
- Discriminated union type specified in Type Flow Map
- Confirmed `BaseSqlAdapter` / `sql-utils.ts` safe to remove (no other consumers)
