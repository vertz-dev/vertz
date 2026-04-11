# Replace `bun:sqlite` with `@vertz/sqlite`

**Issue:** #2496
**Status:** Reviewed — awaiting human sign-off
**Date:** 2026-04-11

## API Surface

The `@vertz/sqlite` package provides TypeScript type declarations and runtime stubs for the vtz native SQLite bindings. It follows the same pattern as `@vertz/test` — types come from the npm package, runtime implementation comes from the vtz synthetic module.

### Developer-facing API

```typescript
import { Database } from '@vertz/sqlite';

// Constructor — file path or :memory:
const db = new Database(':memory:');
const fileDb = new Database('./data/app.db');

// DDL / PRAGMA — exec() runs raw SQL (supports multi-statement)
db.exec('CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT)');
db.exec('PRAGMA journal_mode = WAL');

// Shorthand run — prepare + run, returns { changes }
// Note: db.run() is a Vertz convenience method (not in bun:sqlite's official API)
const info = db.run('INSERT INTO users (id, name) VALUES (?, ?)', 1, 'Alice');
// info = { changes: 1 }

// Prepared statements with type generics
const stmt = db.prepare<{ id: number; name: string }, [number]>(
  'SELECT * FROM users WHERE id = ?',
);
const rows = stmt.all(1);          // => [{ id: 1, name: 'Alice' }]
const row = stmt.get(1);           // => { id: 1, name: 'Alice' } | null
const result = stmt.run(2, 'Bob'); // => { changes: 1 }

// Transactions — wraps callback in BEGIN/COMMIT, ROLLBACK on error
const insertMany = db.transaction(() => {
  stmt.run(3, 'Carol');
  stmt.run(4, 'Dave');
});
insertMany(); // Atomic

// Cleanup
db.close();
```

### Type Declarations

```typescript
declare module '@vertz/sqlite' {
  export class Database {
    constructor(path: string);
    exec(sql: string): void;
    run(sql: string, ...params: unknown[]): { changes: number };
    prepare<TRow = Record<string, unknown>, TParams extends unknown[] = unknown[]>(
      sql: string,
    ): Statement<TRow, TParams>;
    /**
     * Wraps `fn` in BEGIN/COMMIT. If `fn` throws, issues ROLLBACK and re-throws.
     * Returns a callable that executes the transaction when invoked.
     *
     * Note: argument forwarding is not supported — the returned function takes
     * no arguments. This covers all current codebase usage. bun:sqlite's
     * `.deferred()`, `.immediate()`, `.exclusive()` modifiers are also omitted.
     */
    transaction<T>(fn: () => T): () => T;
    close(): void;
  }

  /** Use `db.prepare()` to create statements. Exported for type annotations only. */
  export class Statement<TRow = Record<string, unknown>, TParams extends unknown[] = unknown[]> {
    all(...params: TParams): TRow[];
    get(...params: TParams): TRow | null;
    run(...params: TParams): { changes: number };
  }

  export default Database;
}
```

### Module Resolution

| Import specifier | Resolves to | Context |
|-----------------|-------------|---------|
| `@vertz/sqlite` | `vertz:sqlite` synthetic module | vtz runtime (synthetic intercept runs before node_modules lookup) |
| `vertz:sqlite` | `vertz:sqlite` synthetic module | vtz runtime (canonical) |
| `bun:sqlite` | `vertz:sqlite` synthetic module | vtz runtime (compat, unchanged) |
| `@vertz/sqlite` | Stubs that throw helpful error | Non-vtz runtime (npm package) |

**Safety note:** The synthetic module intercept in `module_loader.rs` runs before filesystem resolution, so the npm package's stubs are never loaded when running under vtz. This is the same mechanism used by `@vertz/test`.

### SQLite → JavaScript Type Mapping

| SQLite type | JS type | Notes |
|-------------|---------|-------|
| INTEGER | `number` | Values > 2^53 lose precision |
| REAL | `number` | |
| TEXT | `string` | |
| NULL | `null` | |
| BLOB | Not supported | No BLOB usage in codebase |

### Stub Error Message

When `@vertz/sqlite` is imported outside the vtz runtime, stubs throw:

```
@vertz/sqlite: this module requires the vtz runtime. Run your app with `vtz dev` or `vtz run <script>` to use the built-in SQLite driver. For Node.js, use better-sqlite3 instead.
```

## `transaction()` Implementation

This is **new functionality** added to the synthetic module as part of this work. The original #2070 design listed `transaction()` as a non-goal, but the agents' `sqlite-store.ts` uses it. The implementation is pure JavaScript — no new Rust ops required.

### Pseudocode (added to synthetic module in `module_loader.rs`)

```javascript
// Added to Database class in the VERTZ_SQLITE_MODULE string
transaction(fn) {
  this.#assertOpen();
  const self = this;
  return function transactionWrapper() {
    self.exec('BEGIN');
    try {
      const result = fn();
      self.exec('COMMIT');
      return result;
    } catch (e) {
      self.exec('ROLLBACK');
      throw e;
    }
  };
}
```

### Edge cases

- **Nested transactions:** Not supported. Calling `exec('BEGIN')` inside an already-begun transaction triggers SQLite's own error: `"cannot start a transaction within a transaction"`. This matches `bun:sqlite` behavior.
- **Async callbacks:** Not supported. `transaction()` is synchronous (like all SQLite ops). If the callback returns a Promise, the transaction commits before the Promise resolves. This matches `bun:sqlite`.
- **Non-Error throws:** The `catch` block catches any thrown value and re-throws after ROLLBACK. Works with non-Error values.
- **Argument forwarding:** Not supported. `bun:sqlite`'s `transaction()` forwards arguments from the wrapper to the callback; ours does not. The codebase only uses zero-arg callbacks (see `sqlite-store.ts` line 174), so this is acceptable. Documented in the type declaration JSDoc.
- **`.deferred()` / `.immediate()` / `.exclusive()`:** Omitted. Not used in the codebase. These `bun:sqlite` modifiers change the transaction isolation level.

## Manifesto Alignment

### Principle 2: One way to do things
Today there are two ways to import SQLite: `bun:sqlite` and `vertz:sqlite`. This migration establishes `@vertz/sqlite` as the single canonical import, eliminating the ambiguity. The `bun:sqlite` compat alias remains in the runtime for gradual migration of external code, but framework code uses one path.

### Principle 3: AI agents are first-class users
`@vertz/sqlite` is an npm package with standard TypeScript types. LLMs can discover it via `package.json` and get autocomplete. `bun:sqlite` requires knowing about `bun-types` — an extra cognitive step that trips up agents.

### Principle 8: No Ceilings
Decoupling from Bun's type system removes a ceiling — packages no longer need `bun-types` just for SQLite, and the API surface is controlled by Vertz.

### Tradeoff: `bun:sqlite` compat alias stays
We keep the runtime compat alias (`bun:sqlite` → `vertz:sqlite`) to avoid breaking external code or examples that haven't migrated. The alias is zero-cost (a string comparison in module resolution). Framework code migrates fully; the alias can be deprecated later.

## Non-Goals

- **Removing `bun-types` globally** — Many packages use `bun-types` for APIs beyond `bun:sqlite` (`Bun.serve()`, `Bun.file()`, etc.). Phase 2 includes an audit of the 5 affected packages to determine if any can drop `bun-types` now that `bun:sqlite` types come from `@vertz/sqlite`. Even if the answer is "none can be removed," the audit will be documented.
- **New Rust ops** — `transaction()` is implemented purely in JavaScript (BEGIN/COMMIT/ROLLBACK via existing `exec()` op). No new native ops needed.
- **Full `bun:sqlite` API parity** — We implement only what the codebase uses. Same decision as #2070. Specifically omitted: `transaction()` argument forwarding, `.deferred()`/`.immediate()`/`.exclusive()`, `db.query()`, `stmt.first()`, `stmt.values()`, named parameters.
- **BLOB support** — No BLOB usage in the codebase.

## Unknowns

- **`transaction()` is new runtime behavior** — While the import migration is purely a TypeScript-side change, `transaction()` adds ~15 lines of JavaScript to the synthetic module. The implementation is straightforward (BEGIN/COMMIT/ROLLBACK wrapper), but it requires testing as new functionality, not just a migration. This is covered in Phase 1 acceptance criteria.

## Type Flow Map

```
@vertz/sqlite package (types)
  └─ Database class
       ├─ prepare<TRow, TParams>(sql) → Statement<TRow, TParams>
       │    ├─ .all(...params: TParams) → TRow[]
       │    ├─ .get(...params: TParams) → TRow | null
       │    └─ .run(...params: TParams) → { changes: number }
       ├─ exec(sql) → void
       ├─ run(sql, ...params) → { changes: number }
       ├─ transaction<T>(fn: () => T) → () => T
       └─ close() → void

Consumer flow (agents sqlite-store):
  import { Database } from '@vertz/sqlite'
    → const db = new Database(path)
    → db.prepare<SessionRow, [string]>(sql)  // TRow = SessionRow, TParams = [string]
    → stmt.get(sessionId)                     // returns SessionRow | null ✓
    → stmt.all(sessionId)                     // returns SessionRow[] ✓
    → db.transaction(() => { ... })           // returns () => void ✓

Consumer flow (db sqlite-driver):
  import('@vertz/sqlite')
    → const db = new Database(path)
    → db.prepare(sql).all(...params)          // returns Record<string, unknown>[] ✓
    → db.prepare(sql).run(...params)          // returns { changes: number } ✓
    → db.exec(sql)                            // void ✓
    → db.close()                              // void ✓
  Note: resolveLocalSqliteDatabase error flow changes — import('@vertz/sqlite')
  succeeds (npm stubs exist) but new Database() throws. The catch block handles
  both "module not found" and "stub threw" errors identically.

Consumer flow (cli load-db-context):
  await import('@vertz/sqlite')
    → const db = new Database(path)
    → db.prepare(sql).all(...params)          // returns Record<string, unknown>[] ✓
    → db.close()                              // void ✓
```

## E2E Acceptance Test

```typescript
import { describe, expect, it } from '@vertz/test';
import { Database, Statement } from '@vertz/sqlite';

describe('Feature: @vertz/sqlite replaces bun:sqlite', () => {
  describe('Given the @vertz/sqlite package', () => {
    describe('When importing Database and Statement', () => {
      it('Then both are available as named exports', () => {
        expect(Database).toBeDefined();
        expect(Statement).toBeDefined();
      });
    });
  });

  describe('Given a new Database(":memory:")', () => {
    describe('When using the full CRUD cycle', () => {
      it('Then exec, prepare, all, get, run, and close all work', () => {
        const db = new Database(':memory:');
        db.exec('CREATE TABLE t (id INTEGER PRIMARY KEY, name TEXT)');

        const insert = db.prepare('INSERT INTO t (id, name) VALUES (?, ?)');
        insert.run(1, 'Alice');
        insert.run(2, 'Bob');

        const all = db.prepare('SELECT * FROM t ORDER BY id').all();
        expect(all).toEqual([
          { id: 1, name: 'Alice' },
          { id: 2, name: 'Bob' },
        ]);

        const one = db.prepare('SELECT * FROM t WHERE id = ?').get(1);
        expect(one).toEqual({ id: 1, name: 'Alice' });

        const missing = db.prepare('SELECT * FROM t WHERE id = ?').get(999);
        expect(missing).toBeNull();

        db.close();
      });
    });
  });

  describe('Given db.transaction()', () => {
    describe('When the callback succeeds', () => {
      it('Then all operations are committed atomically', () => {
        const db = new Database(':memory:');
        db.exec('CREATE TABLE t (id INTEGER PRIMARY KEY, name TEXT)');

        const tx = db.transaction(() => {
          db.run('INSERT INTO t (id, name) VALUES (?, ?)', 1, 'A');
          db.run('INSERT INTO t (id, name) VALUES (?, ?)', 2, 'B');
        });
        tx();

        const rows = db.prepare('SELECT * FROM t ORDER BY id').all();
        expect(rows.length).toBe(2);
        db.close();
      });
    });

    describe('When the callback throws', () => {
      it('Then all operations are rolled back', () => {
        const db = new Database(':memory:');
        db.exec('CREATE TABLE t (id INTEGER PRIMARY KEY, name TEXT)');

        const tx = db.transaction(() => {
          db.run('INSERT INTO t (id, name) VALUES (?, ?)', 1, 'A');
          throw new Error('fail');
        });

        expect(() => tx()).toThrow('fail');

        const rows = db.prepare('SELECT * FROM t ORDER BY id').all();
        expect(rows.length).toBe(0);
        db.close();
      });
    });
  });

  describe('Given the agents sqlite-store', () => {
    describe('When importing from @vertz/sqlite instead of bun:sqlite', () => {
      it('Then all store operations work identically', () => {
        // Validated by existing sqlite-store.test.ts passing after migration
      });
    });
  });

  describe('Given invalid constructor arguments', () => {
    describe('When passing a non-string to Database()', () => {
      // @ts-expect-error — Database requires a string path
      it('Then TypeScript rejects the call', () => { new Database(123); });
    });
  });

  describe('Given direct Statement construction', () => {
    describe('When trying to construct Statement without db.prepare()', () => {
      // @ts-expect-error — Statement constructor is not public in type declarations
      it('Then TypeScript rejects the call', () => { new Statement(); });
    });
  });
});
```

## Files Affected

### New files

| File | Purpose |
|------|---------|
| `packages/sqlite/package.json` | Package manifest |
| `packages/sqlite/tsconfig.json` | TypeScript config |
| `packages/sqlite/tsconfig.typecheck.json` | Typecheck config |
| `packages/sqlite/bunup.config.ts` | Build config |
| `packages/sqlite/src/index.ts` | Type declarations + runtime stubs |

### Source files migrating `bun:sqlite` → `@vertz/sqlite`

| File | Change |
|------|--------|
| `packages/agents/src/stores/sqlite-store.ts` | `bun:sqlite` → `@vertz/sqlite` |
| `packages/cli/src/commands/load-db-context.ts` | `await import('bun:sqlite')` → `await import('@vertz/sqlite')`, update error message |
| `packages/db/src/client/sqlite-driver.ts` | `import('bun:sqlite')` → `import('@vertz/sqlite')` in `resolveLocalSqliteDatabase()`, update error messages |

### Test files migrating `bun:sqlite` → `@vertz/sqlite`

| File | Change |
|------|--------|
| `packages/agents/src/stores/d1-store.test.ts` | `bun:sqlite` → `@vertz/sqlite` |
| `packages/server/src/auth/__tests__/test-db-helper.ts` | `bun:sqlite` → `@vertz/sqlite` |
| `packages/server/src/auth/__tests__/server-instance.test.ts` | `bun:sqlite` → `@vertz/sqlite` |
| `packages/server/src/auth/__tests__/auth-model-validation.test.ts` | `bun:sqlite` → `@vertz/sqlite` |
| `packages/server/src/auth/__tests__/auth-initialize.test.ts` | `bun:sqlite` → `@vertz/sqlite` |
| `packages/server/src/auth/__tests__/auth-entity-session.test.ts` | `bun:sqlite` → `@vertz/sqlite` |
| `packages/integration-tests/src/__tests__/auth-db-stores.test.ts` | `bun:sqlite` → `@vertz/sqlite` |
| `packages/db/src/client/__tests__/transaction.test.ts` | `bun:sqlite` → `@vertz/sqlite` |
| `packages/db/src/migration/__tests__/introspect.test.ts` | `bun:sqlite` → `@vertz/sqlite` |
| `packages/db/src/client/__tests__/local-sqlite-driver.test.ts` | Update mock to use `@vertz/sqlite` |
| `packages/cli/src/commands/__tests__/load-db-context.test.ts` | `bun:sqlite` → `@vertz/sqlite` |

### Package dependencies (add `@vertz/sqlite` as `dependency`)

| File | Change |
|------|--------|
| `packages/agents/package.json` | Add `"@vertz/sqlite": "workspace:*"` to `dependencies` |
| `packages/cli/package.json` | Add `"@vertz/sqlite": "workspace:*"` to `dependencies` |
| `packages/db/package.json` | Add `"@vertz/sqlite": "workspace:*"` to `dependencies` |
| `packages/server/package.json` | Add `"@vertz/sqlite": "workspace:*"` to `devDependencies` (test-only usage) |
| `packages/integration-tests/package.json` | Add `"@vertz/sqlite": "workspace:*"` to `devDependencies` (test-only usage) |

Note: `@vertz/sqlite` must be in `dependencies` (not `devDependencies`) for packages that import it in production source files, because the types need to resolve during typecheck and the package needs to be available for non-vtz runtimes' fallback stubs.

### Build configs (add `@vertz/sqlite` as external)

Unlike `bun:sqlite` (protocol-prefixed, auto-externalized by bundlers), `@vertz/sqlite` is a standard scoped package that bundlers will try to inline. It MUST be marked as external to prevent the stubs from being bundled into dist.

| File | Change |
|------|--------|
| `packages/cli/bunup.config.ts` | Replace `bun:sqlite` with `@vertz/sqlite` in externals |
| `packages/agents/bunup.config.ts` | Add `@vertz/sqlite` to externals (currently has no explicit externals — `bun:sqlite` was auto-externalized as a protocol import) |

Note: `packages/db/bunup.config.ts` uses dynamic `import()` for SQLite (not static import), so bundlers should leave it alone. Verify during implementation.

### Native runtime

| File | Change |
|------|--------|
| `native/vtz/src/runtime/module_loader.rs` | Add `@vertz/sqlite` to the specifier intercept at line 1784 (alongside `vertz:sqlite` and `bun:sqlite`); add `transaction()` to the VERTZ_SQLITE_MODULE string |
| `native/vtz/tests/fixtures/sqlite-test/` | Add test fixture for `@vertz/sqlite` import; update integration test to cover all three import paths |
| `native/vtz/src/compiler/import_rewriter.rs` | Ensure `@vertz/sqlite` is treated as a runtime builtin for import rewriting (test at line 1165) |
| `native/vtz/src/server/module_server.rs` | Consider adding `@vertz/sqlite` to `is_runtime_builtin()`. However, since SQLite is server-only and the npm stubs would correctly throw in browser context, this is acceptable as-is. Document the decision. |

### Documentation and comments

| File | Change |
|------|--------|
| `examples/entity-todo/src/api/db-d1.ts` | Update comment referencing `bun:sqlite` |
| `packages/mint-docs/` | Update any code examples showing `bun:sqlite` to use `@vertz/sqlite` |

### `bun-types` audit

After migration, audit these 5 packages to check if `bun-types` can be removed:
- `packages/agents/` — check if any non-SQLite `bun:*` APIs are used
- `packages/cli/` — check if any non-SQLite `bun:*` APIs are used
- `packages/db/` — check if any non-SQLite `bun:*` APIs are used
- `packages/server/` — check if any non-SQLite `bun:*` APIs are used
- `packages/integration-tests/` — check if any non-SQLite `bun:*` APIs are used

Document results. Remove `bun-types` from any package that no longer needs it.

## Implementation Plan

### Phase 1: `@vertz/sqlite` type package + runtime changes

**Goal:** Create the npm package with types and stubs, add `@vertz/sqlite` module resolution to the runtime, add `transaction()` to the synthetic module. No import migration yet.

**Acceptance Criteria:**
```typescript
describe('Phase 1: @vertz/sqlite package and runtime', () => {
  describe('Given the @vertz/sqlite package', () => {
    describe('When importing Database and Statement', () => {
      it('Then TypeScript resolves types correctly', () => {});
      it('Then prepare<TRow, TParams> generic flows to all/get/run', () => {});
      it('Then default export is Database', () => {});
    });
    describe('When running outside vtz', () => {
      it('Then stubs throw with message mentioning vtz and better-sqlite3', () => {});
    });
  });

  describe('Given the vtz runtime', () => {
    describe('When importing from @vertz/sqlite', () => {
      it('Then resolves to the vertz:sqlite synthetic module', () => {});
    });
    describe('When importing from vertz:sqlite', () => {
      it('Then resolves to the vertz:sqlite synthetic module', () => {});
    });
    describe('When importing from bun:sqlite', () => {
      it('Then still resolves to the vertz:sqlite synthetic module', () => {});
    });
    describe('When using db.transaction()', () => {
      it('Then successful callbacks are committed', () => {});
      it('Then throwing callbacks are rolled back', () => {});
      it('Then nested transactions throw SQLite error', () => {});
    });
  });
});
```

### Phase 2: Migrate all imports + build configs + bun-types audit

**Goal:** Migrate ALL files (source + test) from `bun:sqlite` to `@vertz/sqlite`. Update build configs, package dependencies, error messages, comments, and docs. Audit `bun-types`. Zero `bun:sqlite` imports remain in framework packages.

**Acceptance Criteria:**
```typescript
describe('Phase 2: Full migration', () => {
  describe('Given @vertz/agents sqlite-store', () => {
    describe('When importing from @vertz/sqlite', () => {
      it('Then all existing sqlite-store tests pass', () => {});
      it('Then transaction-based appendMessages works', () => {});
    });
  });

  describe('Given @vertz/cli load-db-context', () => {
    describe('When dynamically importing @vertz/sqlite', () => {
      it('Then SQLite connections work for migrations', () => {});
      it('Then error message references @vertz/sqlite', () => {});
    });
  });

  describe('Given @vertz/db sqlite-driver', () => {
    describe('When resolveLocalSqliteDatabase tries @vertz/sqlite first', () => {
      it('Then local SQLite driver tests pass', () => {});
      it('Then error message lists @vertz/sqlite and better-sqlite3', () => {});
    });
  });

  describe('Given all test files', () => {
    describe('When importing from @vertz/sqlite', () => {
      it('Then all auth tests pass', () => {});
      it('Then all db tests pass', () => {});
      it('Then all integration tests pass', () => {});
      it('Then all agent tests pass', () => {});
      it('Then all CLI tests pass', () => {});
    });
  });

  describe('Given build configs', () => {
    describe('When @vertz/sqlite is listed as external', () => {
      it('Then CLI build succeeds', () => {});
      it('Then agents build succeeds', () => {});
    });
  });

  describe('Given the entire packages/ directory', () => {
    describe('When searching for bun:sqlite imports in .ts files', () => {
      it('Then zero matches remain', () => {});
    });
  });

  describe('Given the native test fixtures', () => {
    describe('When a @vertz/sqlite import fixture exists', () => {
      it('Then the integration test passes', () => {});
    });
  });

  describe('Given the bun-types audit', () => {
    describe('When checking each migrated package for non-SQLite bun:* usage', () => {
      it('Then audit results are documented', () => {});
      it('Then bun-types is removed from packages that no longer need it', () => {});
    });
  });
});
```

## Review History

### Rev 1 → Rev 2 (2026-04-11)

Addressed feedback from DX, Product/Scope, and Technical reviews:

| Finding | Source | Resolution |
|---------|--------|-----------|
| Missing files: docs, import_rewriter, module_server, test fixtures | Product (Blocker) | Added to Files Affected: mint-docs, import_rewriter.rs, module_server.rs, existing test fixtures |
| Missing `@vertz/sqlite` in agents bunup.config.ts externals | Technical (Blocker) | Added Build Configs section explaining auto-externalization difference between protocol imports and scoped packages |
| Missing `@vertz/sqlite` as dependency in consumer packages | Technical (Blocker) | Added Package Dependencies section with `dependencies` vs `devDependencies` guidance |
| `transaction()` is new functionality, not acknowledged | Product (Should-Fix) | Added dedicated "transaction() Implementation" section with pseudocode and edge cases; updated Unknowns section |
| Import rewriter + dev server need `@vertz/sqlite` handling | Product (Should-Fix) | Added import_rewriter.rs and module_server.rs to Files Affected with analysis |
| `bun-types` audit dismissed without investigation | Product (Should-Fix) | Updated Non-Goals; added `bun-types` audit as Phase 2 deliverable |
| `transaction()` return type doesn't forward arguments | DX (Should-Fix) | Documented as intentional limitation in JSDoc and edge cases section |
| `resolveLocalSqliteDatabase` error flow change | Technical (Should-Fix) | Added note in Type Flow Map about behavioral difference |
| `transaction()` JS implementation needs pseudocode | Technical (Should-Fix) | Added full pseudocode to new section |
| Dev server import rewriter consideration | Technical (Should-Fix) | Documented reasoning: stubs package serves correct browser behavior |
| Missing `export default Database` in type declarations | DX (Nit) | Added to type declarations |
| JSDoc on Statement class | DX (Nit) | Added JSDoc noting it's for type annotations only |
| Error message should mention better-sqlite3 | DX (Nit) | Added exact error message text in Stub Error Message section |
| Phases 2+3 could merge | Product (Nit) | Merged into single Phase 2 — mechanical migration doesn't warrant separate phases |
| BDD format inconsistency in E2E test | Product (Nit) | Wrapped `@ts-expect-error` tests in Given/When/Then describes |
| Statement constructor intentionally omitted from types | Technical (Nit) | Covered by JSDoc on Statement class |
