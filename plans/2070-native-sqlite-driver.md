# Native SQLite Driver (`bun:sqlite` replacement)

**Issue:** #2070
**Status:** Reviewed — awaiting human sign-off
**Date:** 2026-03-29

## API Surface

The native runtime must provide a `bun:sqlite` synthetic module that matches the subset of Bun's SQLite API actually used by the codebase. The API is synchronous (matching `bun:sqlite` behavior).

```typescript
import { Database } from 'bun:sqlite';

// Constructor — file path or :memory:
const db = new Database(':memory:');
const fileDb = new Database('./data/app.db');

// DDL / PRAGMA — exec() runs raw SQL with no return (supports multi-statement)
db.exec('CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT)');
db.exec('PRAGMA journal_mode = WAL');

// Shorthand run — prepare + run in one call, returns { changes }
const info = db.run('INSERT INTO users (id, name) VALUES (?, ?)', 1, 'Alice');
// info = { changes: 1 }

// Prepared statements
const stmt = db.prepare('SELECT * FROM users WHERE id = ?');
const rows = stmt.all(1);          // => [{ id: 1, name: 'Alice' }]
const row = stmt.get(1);           // => { id: 1, name: 'Alice' } or null
const result = stmt.run(2, 'Bob'); // => { changes: 1 }

// Cleanup
db.close();
```

### Type Declarations

```typescript
declare module 'bun:sqlite' {
  export class Database {
    constructor(path: string);
    exec(sql: string): void;
    run(sql: string, ...params: unknown[]): { changes: number };
    prepare(sql: string): Statement;
    close(): void;
  }

  export class Statement {
    all(...params: unknown[]): Record<string, unknown>[];
    get(...params: unknown[]): Record<string, unknown> | null;
    run(...params: unknown[]): { changes: number };
  }
}
```

### SQLite → JavaScript Type Mapping

| SQLite type | JS type | Notes |
|-------------|---------|-------|
| INTEGER | `number` | Matches Bun. Values > 2^53 lose precision (same as Bun). |
| REAL | `number` | |
| TEXT | `string` | |
| NULL | `null` | Null params → SQL NULL, null columns → `null` |
| BLOB | Not supported | See Non-Goals. No BLOB usage in codebase. |

### What's NOT in scope

These `bun:sqlite` APIs exist in Bun but are **not used** in the Vertz codebase:

- `db.query()` — Vertz uses `prepare()` + `all()`/`run()`
- `db.transaction()` — Vertz manually issues `BEGIN`/`COMMIT`/`ROLLBACK` via `exec()`
- `stmt.first()`, `stmt.values()`
- `db.serialize()`, `db.loadExtension()`
- Named parameters (`$param`, `:param`) — codebase only uses positional `?`

## Manifesto Alignment

### Principle 8: No Ceilings
The native runtime replaces Bun to remove its limitations. SQLite support is the critical enabler for running `@vertz/db` tests on the native runtime — without it, ~10 test files can't even load.

### Principle 7: Performance is not optional
`rusqlite` embeds SQLite's C amalgamation compiled with optimizations. Sync ops avoid async overhead for what is inherently synchronous I/O (local disk). This matches Bun's approach.

### Principle 2: One way to do things
We expose exactly the API surface that's used — no extra methods that create ambiguity.

### Tradeoff: Sync ops
SQLite is inherently synchronous (local file I/O). We use sync deno_core ops (`#[op2]`) rather than async ops. This matches `bun:sqlite`'s behavior and avoids unnecessary async overhead. The tradeoff is that a long-running query blocks the JS event loop — acceptable for dev/test workloads where SQLite is used.

## Non-Goals

- **Full `bun:sqlite` API parity** — Only implement what's actually used. Methods can be added later when needed.
- **Async SQLite** — Not needed. SQLite is single-writer, local disk. Async would add complexity for no benefit in dev/test.
- **Connection pooling** — SQLite doesn't benefit from pooling (single-writer lock). Each `new Database()` is one connection.
- **Custom SQLite extensions** — `loadExtension()` is not used.
- **Named parameters** — The codebase converts all parameters to positional `?` before calling SQLite.
- **BLOB columns** — No BLOB usage in the Vertz codebase. If needed later, would require extending the `serde_json::Value` bridge (e.g., base64 encoding).

## Unknowns

None identified — all resolved during design review.

## Type Flow Map

The design eliminates `stmt_id` — the JS `Statement` object holds the SQL string directly and passes it to each op call. This avoids an unbounded `HashMap` in Rust and removes `op_sqlite_prepare`.

```
JS: new Database(path)
  → op_sqlite_open(path: string) → db_id: u32
  → JS Database object holds db_id
  → FinalizationRegistry registered for auto-cleanup on GC

JS: db.prepare(sql)
  → No Rust op — returns JS Statement object holding (db_id, sql)

JS: stmt.all(...params)
  → op_sqlite_query_all(db_id: u32, sql: string, params: unknown[])
  → rusqlite: prepare(sql) → query_map(params) → collect rows
  → Vec<Map<String, serde_json::Value>> → Record<string, unknown>[]

JS: stmt.get(...params)
  → op_sqlite_query_get(db_id: u32, sql: string, params: unknown[])
  → rusqlite: prepare(sql) → query_row(params)
  → Option<Map<String, serde_json::Value>> → Record<string, unknown> | null

JS: stmt.run(...params)
  → op_sqlite_query_run(db_id: u32, sql: string, params: unknown[])
  → rusqlite: prepare(sql) → execute(params) → changes
  → { changes: u32 }

JS: db.exec(sql)
  → op_sqlite_exec(db_id: u32, sql: string) → void
  → rusqlite: execute_batch(sql) — supports multi-statement

JS: db.run(sql, ...params)
  → op_sqlite_query_run(db_id: u32, sql: string, params: unknown[])
  → Same op as stmt.run() — returns { changes }

JS: db.close()
  → op_sqlite_close(db_id: u32) → void
  → Drops connection from SqliteStore
  → FinalizationRegistry unregistered
```

Handle lifecycle:
- `SqliteStore` in `OpState` manages `db_id → rusqlite::Connection`
- No statement storage — statements are prepared fresh on each call (SQLite internally caches bytecode)
- `close()` removes the connection; subsequent ops on that db_id return error "database is closed"
- `FinalizationRegistry` auto-closes on GC to prevent leaks for unclosed databases

## E2E Acceptance Test

From a developer perspective, this is what must work end-to-end:

```typescript
// test-sqlite-e2e.ts — run with `vertz test`
import { describe, expect, it } from 'bun:test';
import { Database } from 'bun:sqlite';

describe('bun:sqlite on native runtime', () => {
  it('creates in-memory db, inserts, and queries', () => {
    const db = new Database(':memory:');
    db.exec('CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT NOT NULL)');

    const insert = db.prepare('INSERT INTO users (id, name) VALUES (?, ?)');
    insert.run(1, 'Alice');
    insert.run(2, 'Bob');

    const select = db.prepare('SELECT * FROM users ORDER BY id');
    const rows = select.all();

    expect(rows).toEqual([
      { id: 1, name: 'Alice' },
      { id: 2, name: 'Bob' },
    ]);

    db.close();
  });

  it('stmt.get() returns single row or undefined', () => {
    const db = new Database(':memory:');
    db.exec('CREATE TABLE items (id INTEGER PRIMARY KEY, label TEXT)');
    db.run('INSERT INTO items (id, label) VALUES (?, ?)', 1, 'test');

    const row = db.prepare('SELECT * FROM items WHERE id = ?').get(1);
    expect(row).toEqual({ id: 1, label: 'test' });

    const missing = db.prepare('SELECT * FROM items WHERE id = ?').get(999);
    expect(missing).toBeNull();

    db.close();
  });

  it('db.run() returns { changes }', () => {
    const db = new Database(':memory:');
    db.run('CREATE TABLE items (id INTEGER PRIMARY KEY, label TEXT)');

    const info = db.run('INSERT INTO items (id, label) VALUES (?, ?)', 1, 'test');
    expect(info.changes).toBe(1);

    db.close();
  });

  it('PRAGMA queries return rows', () => {
    const db = new Database(':memory:');
    db.exec('PRAGMA journal_mode = WAL');
    const rows = db.prepare('PRAGMA journal_mode').all();
    expect(rows[0]).toHaveProperty('journal_mode');

    db.close();
  });

  it('file-based database persists data', () => {
    const path = '/tmp/vertz-test-persist.db';
    const db1 = new Database(path);
    db1.exec('CREATE TABLE IF NOT EXISTS t (id INTEGER PRIMARY KEY, v TEXT)');
    db1.run('INSERT OR REPLACE INTO t (id, v) VALUES (?, ?)', 1, 'hello');
    db1.close();

    const db2 = new Database(path);
    const rows = db2.prepare('SELECT * FROM t WHERE id = ?').all(1);
    expect(rows).toEqual([{ id: 1, v: 'hello' }]);
    db2.close();
  });

  it('WAL mode works with file-based database', () => {
    const db = new Database('/tmp/vertz-test-wal.db');
    db.exec('PRAGMA journal_mode = WAL');
    db.exec('CREATE TABLE IF NOT EXISTS t (id INTEGER PRIMARY KEY)');
    db.close();
  });

  it('NULL values round-trip correctly', () => {
    const db = new Database(':memory:');
    db.exec('CREATE TABLE t (id INTEGER, v TEXT)');
    db.run('INSERT INTO t (id, v) VALUES (?, ?)', 1, null);

    const rows = db.prepare('SELECT * FROM t').all();
    expect(rows[0]).toEqual({ id: 1, v: null });

    db.close();
  });

  it('closed database throws on prepare/exec/run', () => {
    const db = new Database(':memory:');
    db.close();
    expect(() => db.prepare('SELECT 1')).toThrow();
    expect(() => db.exec('SELECT 1')).toThrow();
    expect(() => db.run('SELECT 1')).toThrow();
    // Double close is idempotent (no error)
    db.close();
  });

  // @ts-expect-error — Database requires a path argument
  it('rejects missing path', () => {
    expect(() => new Database()).toThrow();
  });
});
```

## Rust Architecture

### Dependency

Add `rusqlite` with the bundled SQLite feature (compiles SQLite from source):

```toml
# Cargo.toml
rusqlite = { version = "0.31", features = ["bundled"] }
```

### Handle Store (`SqliteStore`)

Follows the `CryptoKeyStore` pattern, simplified — no statement storage:

```rust
// ops/sqlite.rs

use std::collections::HashMap;
use rusqlite::Connection;

#[derive(Default)]
pub struct SqliteStore {
    next_db_id: u32,
    connections: HashMap<u32, Connection>,
}

impl SqliteStore {
    pub fn open(&mut self, path: &str) -> Result<u32, AnyError> {
        let conn = if path == ":memory:" {
            Connection::open_in_memory()?
        } else {
            Connection::open(path)?
        };
        let id = self.next_db_id;
        self.next_db_id = self.next_db_id.checked_add(1)
            .ok_or_else(|| anyhow!("SqliteStore: db ID overflow"))?;
        self.connections.insert(id, conn);
        Ok(id)
    }

    pub fn get(&self, id: u32) -> Result<&Connection, AnyError> {
        self.connections.get(&id)
            .ok_or_else(|| anyhow!("database is closed"))
    }

    pub fn close(&mut self, id: u32) -> Result<(), AnyError> {
        self.connections.remove(&id)
            .ok_or_else(|| anyhow!("database is closed"))?;
        Ok(())
    }
}
```

### Op Declarations

```rust
#[op2]
#[smi]
pub fn op_sqlite_open(state: &mut OpState, #[string] path: String) -> Result<u32, AnyError>;

#[op2]
#[serde]
pub fn op_sqlite_query_all(state: &mut OpState, #[smi] db_id: u32, #[string] sql: String, #[serde] params: Vec<serde_json::Value>) -> Result<Vec<serde_json::Value>, AnyError>;

#[op2]
#[serde]
pub fn op_sqlite_query_get(state: &mut OpState, #[smi] db_id: u32, #[string] sql: String, #[serde] params: Vec<serde_json::Value>) -> Result<serde_json::Value, AnyError>;

#[op2]
#[serde]
pub fn op_sqlite_query_run(state: &mut OpState, #[smi] db_id: u32, #[string] sql: String, #[serde] params: Vec<serde_json::Value>) -> Result<serde_json::Value, AnyError>;

#[op2(fast)]
pub fn op_sqlite_exec(state: &mut OpState, #[smi] db_id: u32, #[string] sql: String) -> Result<(), AnyError>;

#[op2(fast)]
pub fn op_sqlite_close(state: &mut OpState, #[smi] db_id: u32) -> Result<(), AnyError>;
```

Note: `op_sqlite_query_run` uses `#[op2]` (not `#[op2(fast)]`) because it takes `#[serde]` params. `#[op2(fast)]` is only compatible with primitives, `#[string]`, and `#[buffer]`.

### Bootstrap JS (Synthetic Module)

The `bun:sqlite` synthetic module wraps raw ops into classes:

```javascript
const BUN_SQLITE_MODULE = r#"
const _registry = new FinalizationRegistry((id) => {
  try { Deno.core.ops.op_sqlite_close(id); } catch {}
});

class Statement {
  #dbId;
  #sql;
  constructor(dbId, sql) {
    this.#dbId = dbId;
    this.#sql = sql;
  }
  all(...params) {
    return Deno.core.ops.op_sqlite_query_all(this.#dbId, this.#sql, params);
  }
  get(...params) {
    return Deno.core.ops.op_sqlite_query_get(this.#dbId, this.#sql, params);
  }
  run(...params) {
    return Deno.core.ops.op_sqlite_query_run(this.#dbId, this.#sql, params);
  }
}

class Database {
  #id;
  constructor(path) {
    if (typeof path !== 'string') throw new TypeError('Database path must be a string');
    this.#id = Deno.core.ops.op_sqlite_open(path);
    _registry.register(this, this.#id, this);
  }
  prepare(sql) {
    return new Statement(this.#id, sql);
  }
  exec(sql) {
    Deno.core.ops.op_sqlite_exec(this.#id, sql);
  }
  run(sql, ...params) {
    return Deno.core.ops.op_sqlite_query_run(this.#id, sql, params);
  }
  close() {
    _registry.unregister(this);
    Deno.core.ops.op_sqlite_close(this.#id);
  }
}

export { Database };
export default Database;
"#;
```

### Module Registration

In `module_loader.rs`, follow the `bun:test` pattern — direct check in `resolve()`:

```rust
// In resolve():
if specifier == "bun:sqlite" {
    return Ok(ModuleSpecifier::parse(BUN_SQLITE_SPECIFIER)?);
}

// In synthetic_module_source():
BUN_SQLITE_SPECIFIER => Some(BUN_SQLITE_MODULE),
```

In `js_runtime.rs`:
```rust
all_ops.extend(sqlite::op_decls());
// In op_state_fn:
state.put(sqlite::SqliteStore::default());
```

No bootstrap JS needed — the synthetic module IS the bootstrap (loaded on import, not at startup).

## Implementation Plan

### Phase 1: Rust ops + SqliteStore (core infrastructure)

**Goal:** Ops compile and pass Rust unit tests. No JS integration yet.

**Acceptance Criteria:**
```typescript
describe('Phase 1: Rust SQLite ops', () => {
  describe('Given rusqlite is added as a dependency', () => {
    describe('When the runtime is compiled', () => {
      it('Then cargo build succeeds without errors', () => {});
    });
  });

  describe('Given SqliteStore is initialized', () => {
    describe('When op_sqlite_open is called with ":memory:"', () => {
      it('Then returns a valid db_id (u32)', () => {});
    });
    describe('When op_sqlite_open is called with a file path', () => {
      it('Then creates the SQLite file and returns a db_id', () => {});
    });
  });

  describe('Given an open database', () => {
    describe('When op_sqlite_exec is called with DDL', () => {
      it('Then creates the table without error', () => {});
    });
    describe('When op_sqlite_exec is called with multi-statement SQL', () => {
      it('Then all statements execute', () => {});
    });
  });

  describe('Given a SELECT query', () => {
    describe('When op_sqlite_query_all is called', () => {
      it('Then returns rows as Vec<Map<String, Value>>', () => {});
    });
    describe('When op_sqlite_query_all is called with no matching rows', () => {
      it('Then returns empty Vec', () => {});
    });
  });

  describe('Given a SELECT query for a single row', () => {
    describe('When op_sqlite_query_get is called with a matching row', () => {
      it('Then returns the row as Map<String, Value>', () => {});
    });
    describe('When op_sqlite_query_get is called with no match', () => {
      it('Then returns null/None', () => {});
    });
  });

  describe('Given an INSERT query', () => {
    describe('When op_sqlite_query_run is called with params', () => {
      it('Then returns { changes: 1 }', () => {});
    });
  });

  describe('Given NULL params and columns', () => {
    describe('When inserting NULL and reading back', () => {
      it('Then null round-trips correctly', () => {});
    });
  });

  describe('Given an open database', () => {
    describe('When op_sqlite_close is called', () => {
      it('Then subsequent ops on that db_id return "database is closed" error', () => {});
    });
  });
});
```

### Phase 2: Synthetic module + JS integration + file-based DBs

**Goal:** `import { Database } from 'bun:sqlite'` works in JS. Full E2E including file-based databases and WAL.

**Depends on:** Phase 1

**Acceptance Criteria:**
```typescript
describe('Phase 2: bun:sqlite synthetic module', () => {
  describe('Given the native runtime', () => {
    describe('When importing { Database } from "bun:sqlite"', () => {
      it('Then the import resolves without error', () => {});
      it('Then Database is a constructor function', () => {});
    });
    describe('When using dynamic import("bun:sqlite")', () => {
      it('Then the import resolves without error', () => {});
    });
  });

  describe('Given new Database(":memory:")', () => {
    describe('When calling db.exec() with CREATE TABLE', () => {
      it('Then the table is created', () => {});
    });
    describe('When calling db.prepare() + stmt.all()', () => {
      it('Then returns rows as JS objects', () => {});
    });
    describe('When calling db.prepare() + stmt.get()', () => {
      it('Then returns a single row or undefined', () => {});
    });
    describe('When calling db.prepare() + stmt.run()', () => {
      it('Then returns { changes: N }', () => {});
    });
    describe('When calling db.run() with INSERT', () => {
      it('Then returns { changes: N }', () => {});
    });
  });

  describe('Given parameterized queries', () => {
    describe('When passing positional ? params to stmt.all()', () => {
      it('Then binds parameters correctly', () => {});
    });
    describe('When passing multiple params to stmt.run()', () => {
      it('Then binds all parameters', () => {});
    });
    describe('When calling stmt.all() with no params', () => {
      it('Then returns all rows', () => {});
    });
  });

  describe('Given PRAGMA queries', () => {
    describe('When querying PRAGMA journal_mode', () => {
      it('Then returns rows with the journal mode value', () => {});
    });
  });

  describe('Given file-based databases', () => {
    describe('When creating new Database(filePath)', () => {
      it('Then creates the SQLite file on disk', () => {});
    });
    describe('When enabling WAL mode', () => {
      it('Then PRAGMA journal_mode = WAL succeeds', () => {});
    });
    describe('When closing and reopening', () => {
      it('Then data persists', () => {});
    });
  });

  describe('Given NULL values', () => {
    describe('When inserting null and reading back', () => {
      it('Then null round-trips correctly in JS', () => {});
    });
  });

  describe('Given db.close() is called', () => {
    describe('When subsequently calling db.prepare()', () => {
      it('Then throws an error', () => {});
    });
  });
});
```

### Phase 3: @vertz/db integration validation

**Goal:** Existing `@vertz/db` test files that use `bun:sqlite` pass on the native runtime.

**Depends on:** Phase 2

**Acceptance Criteria:**
```typescript
describe('Phase 3: @vertz/db integration', () => {
  describe('Given the test-db-helper.ts pattern', () => {
    describe('When creating an in-memory db with queryFn bridge', () => {
      it('Then prepare/all/run work through the bridge', () => {});
    });
    describe('When running transaction control (BEGIN/COMMIT/ROLLBACK)', () => {
      it('Then db.exec("BEGIN") and db.exec("COMMIT") work', () => {});
    });
  });

  describe('Given the introspect.test.ts pattern', () => {
    describe('When using db.prepare(sql).all(...params)', () => {
      it('Then returns rows for PRAGMA table_info queries', () => {});
    });
  });

  describe('Given the auth test pattern', () => {
    describe('When using stmt.get() for single-row lookups', () => {
      it('Then returns the row or null', () => {});
    });
  });

  describe('Given the transaction.test.ts pattern', () => {
    describe('When using db.run() for DDL', () => {
      it('Then CREATE TABLE succeeds', () => {});
    });
    describe('When using queryFn with $N→? conversion', () => {
      it('Then INSERT + SELECT + RETURNING work', () => {});
    });
  });
});
```

## Review History

### Rev 1 → Rev 2 (2026-03-29)

Addressed feedback from DX, Product/Scope, and Technical reviews:

| Finding | Resolution |
|---------|-----------|
| DX: `stmt.get()` is used in auth-initialize.test.ts | Added `stmt.get()` and `op_sqlite_query_get` |
| DX: `db.run()` should return `{ changes }` for Bun parity | Changed return type to `{ changes: number }`, reuses `op_sqlite_query_run` |
| Technical: `#[op2(fast)]` incompatible with `#[serde]` on `op_sqlite_run` | Removed `op_sqlite_run` — `db.run()` now reuses `op_sqlite_query_run` with `#[op2]` |
| Technical: Remove `stmt_id` / simplify | Eliminated `op_sqlite_prepare`, `stmt_id`, and statement HashMap. JS Statement holds SQL string directly. |
| Technical: `export default { Database }` wrong shape | Fixed to `export default Database` |
| Technical: Add FinalizationRegistry for GC cleanup | Added to synthetic module JS |
| Technical: Clarify bun:sqlite follows bun:test resolution pattern | Updated Registration section |
| Product: Merge Phase 4 into Phase 2 | Merged — file-based DBs and WAL are now in Phase 2 |
| Product: Add PRAGMA query return scenario | Added to E2E test and Phase 2 acceptance criteria |
| Product: Document SQLite→JSON type mapping | Added type mapping table |
| DX: Document multi-statement exec() support | Noted in API surface and Phase 1 acceptance criteria |
| Technical: Document BLOB as non-goal | Added to Non-Goals |
| DX: Document error message for closed database | Specified "database is closed" error message |
