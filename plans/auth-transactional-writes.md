# Design Doc: Auth Transactional Writes

**Status:** Draft — Rev 3 (full model delegates + transaction-per-request convention)
**Author:** ben
**Feature:** Make auth plan writes transactional on PostgreSQL (#1159)
**Parent:** [Package Runtime Hardening](./package-runtime-hardening.md) — Phase 3

## 1. API Surface

### 1.1 `DatabaseClient.transaction()` — new method on `@vertz/db`

```ts
import { createDb } from 'vertz/db';

const db = createDb({
  url: process.env.DATABASE_URL,
  models: { users: usersModel, tasks: tasksModel },
});

// Full model delegates available inside transaction — same API as db.*
const result = await db.transaction(async (tx) => {
  const user = await tx.users.create({ data: { name: 'Alice', email: 'alice@co.io' } });
  if (!user.ok) throw new Error('Failed to create user');

  await tx.tasks.create({ data: { title: 'Onboarding', assigneeId: user.data.id } });
  return user.data;
});
// If any operation fails or the callback throws, everything is rolled back.
```

Type signature added to `DatabaseClient`:

```ts
export type DatabaseClient<TModels extends Record<string, ModelEntry>> = {
  readonly [K in keyof TModels]: ModelDelegate<TModels[K]>;
} & {
  query<T = Record<string, unknown>>(fragment: SqlFragment): Promise<Result<QueryResult<T>, ReadError>>;
  transaction<T>(fn: (tx: TransactionClient<TModels>) => Promise<T>): Promise<T>;
  close(): Promise<void>;
  isHealthy(): Promise<boolean>;
  readonly _internals: DatabaseInternals<TModels>;
};
```

### 1.2 `TransactionClient` — full typed client scoped to a transaction

```ts
/**
 * Scoped client for use within a transaction callback.
 * Provides the same model delegates and raw query as DatabaseClient —
 * all operations execute within a single atomic transaction.
 *
 * Auto-commits on success, auto-rolls-back on error.
 */
export type TransactionClient<TModels extends Record<string, ModelEntry>> = {
  readonly [K in keyof TModels]: ModelDelegate<TModels[K]>;
} & {
  query<T = Record<string, unknown>>(
    fragment: SqlFragment,
  ): Promise<Result<QueryResult<T>, ReadError>>;
};
```

`TransactionClient` mirrors `DatabaseClient` — same model delegates, same `query()`. It omits `close()`, `isHealthy()`, `_internals`, and `transaction()` (no nesting).

`tx.users.create()`, `tx.tasks.list()`, `tx.query(sql`...`)` all work inside a transaction using the exact same API developers already use with `db.*`.

**Implementation:** Extract the delegate-building logic from `createDb` into a `buildDelegates(queryFn, models, dialectObj, modelsRegistry)` helper. The outer `createDb` calls it with the top-level `queryFn`; inside `transaction()`, it's called again with the transaction-scoped `queryFn`. Same code, different connection scope.

### 1.3 `AuthDbClient` — updated to include `transaction`

```ts
export type AuthDbClient = Pick<
  DatabaseClient<AuthModels>,
  'auth_sessions' | 'query' | '_internals' | 'transaction'
>;
```

### 1.4 `DbPlanStore` — internal change, same public API

`DbPlanStore.assignPlan()`, `removePlan()`, and `updateOverrides()` wrap their multi-statement operations in `this.db.transaction()`. No public API change.

```ts
// Before (non-atomic):
async assignPlan(orgId, planId, startedAt, expiresAt) {
  await this.db.query(sql`INSERT INTO auth_plans ... ON CONFLICT ...`);
  await this.db.query(sql`DELETE FROM auth_overrides ...`);
}

// After (atomic):
async assignPlan(orgId, planId, startedAt, expiresAt) {
  await this.db.transaction(async (tx) => {
    await tx.query(sql`INSERT INTO auth_plans ... ON CONFLICT ...`);
    await tx.query(sql`DELETE FROM auth_overrides ...`);
  });
}
```

### 1.5 Transaction-per-request convention

For use cases where every write in a request should be atomic (all succeed or all fail), the framework documents an explicit wrapping pattern:

```ts
import { service } from 'vertz/server';
import { createDb, type TransactionClient } from 'vertz/db';

const db = createDb({ url: process.env.DATABASE_URL, models });

// Wrap the handler body in db.transaction() — all writes are atomic
const transferService = service('transfer', {
  method: 'POST',
  path: '/transfer',
  handler: async (ctx) => {
    return db.transaction(async (tx) => {
      await tx.accounts.update({
        where: { id: ctx.body.fromId },
        data: { balance: { decrement: ctx.body.amount } },
      });
      await tx.accounts.update({
        where: { id: ctx.body.toId },
        data: { balance: { increment: ctx.body.amount } },
      });
      return { success: true };
    });
  },
});
```

Reusable helper for multiple services:

```ts
// Helper — wrap any async fn in a transaction
function withTransaction<TResult>(
  fn: (tx: TransactionClient<typeof models>) => Promise<TResult>,
): Promise<TResult> {
  return db.transaction(fn);
}

// Usage in any service handler
handler: async (ctx) => withTransaction(async (tx) => {
  await tx.orders.create({ data: { ... } });
  await tx.inventory.update({ ... });
  return { orderId: '...' };
}),
```

**Not in scope for this PR:** Framework-level `transactionPerRequest` config in `createServer()`. This would require changes to the entity route generator and CRUD pipeline to inject a transaction-scoped db client into `EntityContext`. That's a larger design that should be planned separately once the transaction primitive lands. The docs will explain the manual pattern above.

## 2. Manifesto Alignment

**Explicit over implicit:** The transaction boundary is declared in code and enforced by the runtime. Before this change, atomicity was implicit (SQLite serializes, so it happened to be safe). After this change, the contract is explicit — `transaction()` means atomic or nothing.

**Compile-time over runtime:** `AuthDbClient` now requires `transaction` in the `Pick`. If the DB client doesn't provide it, TypeScript catches it. The type flow is: `DatabaseClient.transaction` → `AuthDbClient` Pick → `DbPlanStore` constructor → compile-time guarantee.

**If it builds, it works:** The transaction surface is typed end-to-end. `tx.users.create()` has the exact same types as `db.users.create()` — no lossy casts, no separate API to learn.

**One way to do things:** `TransactionClient` has the same model delegate API as `DatabaseClient`. Developers don't learn a different query API for transactional code.

**Predictability over convenience:** We chose not to auto-wrap every request in a transaction. Only the operations that are explicitly transactionalized use `transaction()`. The developer sees the boundary. Framework-level transaction-per-request is deferred until the primitive is proven.

### Rejected Alternatives

1. **Savepoints instead of transactions** — Overkill for this scope. Auth plan writes are top-level operations, not nested.

2. **Transaction-per-query default** — Some ORMs auto-wrap every query in a transaction. This is implicit and hides the actual semantics. We want explicit boundaries.

3. **`TransactionClient` with only `query()`** — Rev 1 design. Rejected because it forces developers to drop down to raw SQL inside transactions, breaking the "one way to do things" principle. If you use `db.users.create()` outside a transaction, you should use `tx.users.create()` inside one.

4. **Middleware/plugin-based transaction injection** — Adding a `@vertz/db/plugin` that intercepts queries. Overly indirect, hard to reason about, and violates the explicitness principle.

5. **`BEGIN`/`COMMIT`/`ROLLBACK` via `queryFn` for PostgreSQL** — Rejected because `queryFn` uses `sql.unsafe()` which grabs a connection from the pool per call. Consecutive calls may hit different connections. PostgreSQL **must** use `sql.begin()` from postgres.js, which reserves a single connection for the entire callback.

## 3. Non-Goals

- Nested transactions / savepoints — re-entrant `db.transaction()` calls will throw a clear error
- Transactionalizing `DbClosureStore` — same pattern applies but is out of scope for this issue (follow-up issue to be filed)
- Framework-level `transactionPerRequest` config in `createServer()` — deferred until the primitive is proven; the manual wrapping pattern is documented instead
- Distributed transactions / two-phase commit
- Retry logic for serialization failures
- Read-only transaction mode
- D1 (Cloudflare Workers) transaction support — D1 does not support interactive transactions (`BEGIN`/`COMMIT`/`ROLLBACK`). `transaction()` on a D1-backed client will throw `"Transactions are not supported on D1. Use D1Database.batch() for atomic operations."` Auth plan stores run on the server (PostgreSQL), not on edge workers.

## 4. Unknowns

1. **postgres.js transaction API** — **Resolved**
   - `postgres` (porsager/postgres) provides `sql.begin(async sql => { ... })` for transactions.
   - Inside the callback, `sql` is a scoped connection that runs all queries within `BEGIN`/`COMMIT`.
   - On error or callback rejection, it runs `ROLLBACK` automatically.
   - We'll expose a `beginTransaction` method on `PostgresDriver` that wraps `sql.begin()` and returns a transaction-scoped `QueryFn`.
   - **Critical:** Cannot use `BEGIN`/`COMMIT`/`ROLLBACK` via `queryFn` for PostgreSQL because connection pooling means separate `queryFn` calls may hit different connections.

2. **SQLite transaction behavior** — **Resolved**
   - SQLite serializes writes and has a single connection, so `BEGIN`/`COMMIT`/`ROLLBACK` via `queryFn` is safe.
   - bun:sqlite supports these commands natively via `rawDb.run()`.
   - The test helper's `queryFn` will be updated to detect transaction control statements and route them through `rawDb.run()` explicitly.

3. **Delegate reuse in transactions** — **Resolved**
   - The `implGet`, `implList`, `implCreate`, etc. functions in `createDb` close over `queryFn` from the outer scope.
   - Extract into a `buildDelegates(queryFn, models, dialectObj, modelsRegistry)` function.
   - Top-level: `buildDelegates(queryFn, ...)` → `DatabaseClient` delegates.
   - Transaction: `buildDelegates(txQueryFn, ...)` → `TransactionClient` delegates.
   - Same logic, same types, different connection scope.

4. **Lazy driver initialization** — **Resolved**
   - The postgres driver in `createDb` is lazily initialized via `initPostgres()` inside the `queryFn` IIFE.
   - Solution: hoist `initPostgres` out of the IIFE so both `queryFn` and `transaction()` can call it.

5. **Re-entrant transactions** — **Resolved**
   - Nested `db.transaction()` calls are not supported. postgres.js silently uses savepoints for nested `sql.begin()`, which contradicts our stated non-goal.
   - Solution: track an `inTransaction` boolean. If `transaction()` is called while `inTransaction` is true, throw `"Nested transactions are not supported."`.

## 5. POC Results

No POC required. The postgres.js `sql.begin()` API is well-documented. The delegate extraction is a mechanical refactor — all impl functions take `queryFn` as their first dependency. Unknown #2 from the parent design doc is resolved by inspection.

## 6. Type Flow Map

```txt
PostgresDriver.beginTransaction(callback)
  → uses sql.begin(async txSql => { txQueryFn wraps txSql.unsafe(); callback(txQueryFn) })
    → createDb().transaction(fn)
      → dispatches to driver.beginTransaction() for postgres, BEGIN/COMMIT for sqlite
        → buildDelegates(txQueryFn, models, dialect, registry)
          → TransactionClient<TModels> with tx.users, tx.tasks, tx.query()
            → fn(tx) where tx.users.create() has the same type as db.users.create()

DatabaseClient<TModels>.transaction<T>(fn: (tx: TransactionClient<TModels>) => Promise<T>): Promise<T>
                 ↓
     AuthDbClient (Pick includes 'transaction')
                 ↓
     DbPlanStore(db: AuthDbClient)
                 ↓
     store.assignPlan() → db.transaction(tx => tx.query(...))
```

### Implementation Detail: Two Codepaths in `createDb().transaction()`

```ts
client.transaction = async <T>(fn: (tx: TransactionClient<TModels>) => Promise<T>): Promise<T> => {
  if (inTransaction) {
    throw new Error('Nested transactions are not supported.');
  }
  inTransaction = true;
  try {
    if (driver) {
      // PostgreSQL: use driver.beginTransaction() which calls sql.begin()
      await initPostgres();
      return await driver.beginTransaction(async (txQueryFn) => {
        const txDelegates = buildDelegates(txQueryFn, models, dialectObj, modelsRegistry);
        const tx = {
          ...txDelegates,
          query: buildQueryMethod(txQueryFn),
        } as TransactionClient<TModels>;
        return fn(tx);
      });
    }
    // SQLite / testing fallback: BEGIN/COMMIT/ROLLBACK via queryFn (single connection — safe)
    await queryFn('BEGIN', []);
    try {
      // SQLite is single-connection, so reuse top-level delegates
      const tx = {
        ...topLevelDelegates,
        query: client.query,
      } as TransactionClient<TModels>;
      const result = await fn(tx);
      await queryFn('COMMIT', []);
      return result;
    } catch (e) {
      await queryFn('ROLLBACK', []);
      throw e;
    }
  } finally {
    inTransaction = false;
  }
};
```

### Verification Points

1. `DatabaseClient<TModels>` includes `transaction` in its intersection type
2. `TransactionClient<TModels>` has the same model delegates as `DatabaseClient<TModels>`
3. `tx.users.create()` has the same type signature as `db.users.create()`
4. `AuthDbClient` Pick type includes `'transaction'`
5. `DbPlanStore` constructor accepts `AuthDbClient` which provides `transaction`
6. Failure injection test proves rollback reaches the consumer-observable plan state
7. Re-entrant `transaction()` call throws a clear error

## 7. E2E Acceptance Test

```ts
describe('Feature: Database transactions with model delegates', () => {
  describe('Given a database with users and tasks models', () => {
    describe('When db.transaction() with model delegates succeeds', () => {
      it('Then tx.users.create() commits the row', () => {});
      it('Then tx.tasks.create() commits the row', () => {});
      it('Then the callback return value is returned from transaction()', () => {});
    });

    describe('When the transaction callback throws after tx.users.create()', () => {
      it('Then the user is not visible (rolled back)', () => {});
      it('Then the error propagates to the caller', () => {});
    });

    describe('When tx.query(sql`...`) is used alongside model delegates', () => {
      it('Then raw queries and delegate operations are in the same transaction', () => {});
    });

    describe('When db.transaction() is called inside db.transaction()', () => {
      it('Then it throws "Nested transactions are not supported"', () => {});
    });
  });
});

describe('Feature: Auth plan write atomicity', () => {
  describe('Given a tenant with an existing plan and overrides', () => {
    describe('When assignPlan() fails mid-write (after plan upsert, before override clear)', () => {
      it('Then the plan remains unchanged (rolled back)', () => {});
      it('Then the overrides remain unchanged (rolled back)', () => {});
    });

    describe('When assignPlan() succeeds', () => {
      it('Then the new plan is persisted', () => {});
      it('Then overrides are cleared', () => {});
    });
  });

  describe('Given a tenant with a plan', () => {
    describe('When removePlan() fails mid-write (after plan delete, before override delete)', () => {
      it('Then the plan remains unchanged (rolled back)', () => {});
      it('Then the overrides remain unchanged (rolled back)', () => {});
    });
  });

  describe('Given a tenant with a plan and existing overrides', () => {
    describe('When updateOverrides() fails mid-write (after plan check, before override upsert)', () => {
      it('Then the overrides remain unchanged (rolled back)', () => {});
    });
  });

  describe('Given a DbPlanStore with a non-transactional DB client', () => {
    describe('When constructing the store', () => {
      // @ts-expect-error — AuthDbClient requires 'transaction'
      it('Then TypeScript rejects the client at compile time', () => {});
    });
  });
});
```

## 8. Implementation Plan

### Phase 1: Transaction surface on `@vertz/db`

**Goal:** Add `transaction()` to `DatabaseClient` with full model delegates, wire through both drivers.

**Files:**
- `packages/db/src/client/database.ts` — extract `buildDelegates()`, add `TransactionClient` type, add `transaction` to `DatabaseClient` type + `createDb` impl, add `'transaction'` to `RESERVED_MODEL_NAMES`, hoist `initPostgres`
- `packages/db/src/client/postgres-driver.ts` — add `beginTransaction` to `PostgresDriver`
- `packages/db/src/client/driver.ts` — add optional `beginTransaction` to `DbDriver`
- `packages/db/src/index.ts` — export `TransactionClient`
- `packages/db/src/client/__tests__/transaction.test.ts` — new test file

**TDD cycles:**

1. **RED:** `db.transaction(async (tx) => tx.query(...))` — method doesn't exist on `DatabaseClient`
   **GREEN:** Add `transaction` to the type. Implement in `createDb` with two codepaths: `driver.beginTransaction()` for postgres, `BEGIN`/`COMMIT`/`ROLLBACK` via `queryFn` for SQLite/testing. Add `beginTransaction` to `PostgresDriver` wrapping `sql.begin()`. Extract `buildDelegates()` helper to build transaction-scoped delegates.

2. **RED:** `tx.users.create()` inside transaction — model delegates not available on `TransactionClient`
   **GREEN:** `buildDelegates(txQueryFn, ...)` creates delegates scoped to the transaction. `TransactionClient` type includes mapped model delegates.

3. **RED:** Transaction callback that throws rolls back — test asserts writes via `tx.users.create()` are not visible after error
   **GREEN:** postgres path: `sql.begin()` auto-rolls-back. SQLite path: catch → `ROLLBACK` → re-throw.

4. **RED:** Transaction callback returns a value — test asserts the value is returned from `db.transaction()`
   **GREEN:** Return the callback's result after commit.

5. **RED:** Re-entrant `db.transaction()` throws — test calls `db.transaction()` inside a `db.transaction()` callback
   **GREEN:** Track `inTransaction` boolean, throw on nested call.

6. **RED:** Type test — `TransactionClient` has model delegates and `query` but not `close`, `isHealthy`, `_internals`, or `transaction`
   **GREEN:** Define `TransactionClient` type correctly.

7. **RED:** D1-backed client throws on `transaction()` — test creates a D1 client and calls `transaction()`
   **GREEN:** Detect D1 dialect and throw `"Transactions are not supported on D1"`.

**Phase gate:**
- `bun test packages/db/src/client/__tests__/transaction.test.ts`
- `bun run --filter @vertz/db typecheck`
- `bunx biome check packages/db/src`

### Phase 2: Auth store transactionalization + failure injection

**Goal:** Update `DbPlanStore` to use transactions and add failure-injection tests.

**Files:**
- `packages/server/src/auth/db-types.ts` — add `'transaction'` to `AuthDbClient` Pick
- `packages/server/src/auth/db-plan-store.ts` — wrap multi-statement methods in `transaction()`
- `packages/server/src/auth/__tests__/db-plan-store.test.ts` — failure injection tests
- `packages/server/src/auth/__tests__/test-db-helper.ts` — update queryFn to handle `BEGIN`/`COMMIT`/`ROLLBACK`, add `transaction` method

**TDD cycles:**

1. **RED:** `AuthDbClient` type error — `'transaction'` not in Pick
   **GREEN:** Add `'transaction'` to the Pick type

2. **RED:** Failure injection — `assignPlan()` with a failing second query leaves plan upserted but overrides not cleared
   **GREEN:** Wrap `assignPlan()` in `db.transaction()`

3. **RED:** Failure injection — `removePlan()` with a failing second query leaves plan deleted but overrides intact
   **GREEN:** Wrap `removePlan()` in `db.transaction()`

4. **RED:** Failure injection — `updateOverrides()` with a failing write leaves stale data
   **GREEN:** Wrap `updateOverrides()` in `db.transaction()`

5. **RED:** Successful `assignPlan()` still clears overrides (regression check)
   **GREEN:** Existing behavior preserved inside transaction

**Phase gate:**
- `bun test packages/server/src/auth/__tests__/plan-store.test.ts`
- `bun test packages/server/src/auth/__tests__/shared-plan-store.tests.ts`
- `bun run --filter @vertz/server typecheck`
- `bun run --filter @vertz/db typecheck`
- `bunx biome check packages/server/src/auth packages/db/src`

### Phase 3: Documentation

**Goal:** Document the transaction API and transaction-per-request convention.

**Files to update:**
- `packages/docs/guides/db/queries.mdx` — add **"Transactions"** section covering:
  - Basic `db.transaction()` usage with model delegates (`tx.users.create()`, `tx.tasks.update()`)
  - Raw SQL via `tx.query(sql`...`)`
  - Auto-commit on success, auto-rollback on throw
  - Error handling pattern (throw inside callback to trigger rollback)
  - Limitations: no nesting, no D1 support
- `packages/docs/guides/db/overview.mdx` — add transactions to the feature list
- `packages/docs/guides/server/services.mdx` — add **"Atomic request handling"** section covering:
  - Wrapping service handlers in `db.transaction()` for transaction-per-request
  - Reusable `withTransaction()` helper pattern
  - When to use it (multi-table writes, financial operations) vs when not to (read-heavy handlers)

**Phase gate:**
- Docs build: `cd packages/docs && bun run build`
- Review: code examples compile, content matches implementation

## 9. Review Sign-Offs

### Rev 1 Reviews (2026-03-11)

- **DX (josh): APPROVED** — suggestions incorporated (JSDoc, RESERVED_MODEL_NAMES)
- **Product/Scope: APPROVED** — gaps addressed (updateOverrides scenario, DbClosureStore follow-up)
- **Technical: CHANGES REQUESTED** — all issues resolved:
  - (#1) PostgreSQL must use `sql.begin()` — two codepaths in design
  - (#3) Lazy driver init — `initPostgres` hoisted
  - (#7) D1 non-support — explicit non-goal with error message
  - (#6) Re-entrant guard — `inTransaction` boolean
  - (#9) RESERVED_MODEL_NAMES — included in Phase 1
  - (#2) Test helper queryFn — explicit transaction command handling

### Rev 2 → Rev 3 Changes (user feedback)

- **Full model delegates in TransactionClient** — `tx.users.create()` works, not just `tx.query()`. `TransactionClient` type mirrors `DatabaseClient` minus lifecycle methods. Achieved by extracting `buildDelegates()` helper from `createDb`. Rejected alternative #3 documents why query-only was insufficient.
- **Transaction-per-request convention** — documented pattern for wrapping service handlers in `db.transaction()`, including reusable `withTransaction()` helper. Framework-level `transactionPerRequest` config deferred as non-goal.
- **Docs phase added** — Phase 3 covers `queries.mdx` (transactions section), `overview.mdx` (feature list), and `services.mdx` (transaction-per-request pattern).
