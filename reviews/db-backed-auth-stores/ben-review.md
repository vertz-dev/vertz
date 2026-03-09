# Ben's Adversarial Review: DB-Backed Auth Stores

**PR:** #1068
**Issue:** #1059
**Reviewer:** ben (Core Engineer -- types, correctness, compile-time guarantees)

---

## Blockers

### B1. `auth_users` table missing `plan` column

`AuthUser` (in `types.ts`) has `plan?: string`. The `UserStore.findByEmail()` returns `{ user: AuthUser; passwordHash: string | null }` and `findById()` returns `AuthUser | null`. The `AuthUser.plan` field is used in access-set computation (`access-set.ts` line 224: `plan: user.plan ?? null`) and is part of the JWT claims flow.

The design doc's `auth_users` table schema has no `plan` column. A `DbUserStore.findByEmail()` or `findById()` would return an `AuthUser` with `plan` always `undefined`, silently breaking plan-based access control for DB-backed deployments.

**Fix:** Add `plan TEXT` (nullable) to the `auth_users` table schema.

### B2. `currentTokens` storage not addressed in session table or design

The `SessionStore` interface has `getCurrentTokens(sessionId)` and both `createSessionWithId()` and `updateSession()` accept `currentTokens?: AuthTokens`. The in-memory store uses a separate `Map<string, AuthTokens>` for this.

The `auth_sessions` table schema has no columns for `currentTokens` (jwt + refreshToken). This is actively used during refresh token rotation grace periods -- when a previous refresh token is reused, the server returns the cached current tokens instead of issuing new ones. Without this, the grace period logic in `createAuth` (lines ~551-572) would break: `getCurrentTokens()` would always return `null`, causing the server to either error or issue duplicate tokens.

The DB store needs either:
- Two additional columns (`current_jwt TEXT`, `current_refresh_token TEXT`) on `auth_sessions`, or
- A separate `auth_session_tokens` table, or
- Explicit documentation that `currentTokens` will stay in-memory as a cache (acceptable since they're ephemeral and the grace window is short -- but this design choice needs to be stated).

**Fix:** Add a section addressing `currentTokens` persistence strategy. If kept in-memory, document why and note that multi-instance deployments will have degraded grace-period behavior.

### B3. `authModels` uses `d.model()` in comments but `createDb()` expects `ModelEntry`, not `ModelDef`

The design doc says:

```ts
// authModels = {
//   auth_users: d.model(authUsersTable),
//   ...
// }
```

`d.model()` returns `ModelDef<TTable, TRelations>` which has `{ table, relations, schemas, _tenant }`. `createDb()` expects `Record<string, ModelEntry>` where `ModelEntry` is `{ table, relations }`. While `ModelDef` is structurally compatible with `ModelEntry` (it has the required fields plus extras), the existing codebase uses `d.model()` in all tests and it works. However, the `d` namespace also exposes `d.entry()` which returns a bare `ModelEntry`.

This is not actually a type error -- `ModelDef` satisfies `ModelEntry` structurally. But the design doc should be explicit about which function is used, because the choice affects whether the migration system (which reads `ModelDef.schemas`) can introspect auth tables. Using `d.model()` is the correct choice -- just clarify it's intentional.

**Downgraded to Should-fix:** Not a type error, but the design doc should be explicit. See S1.

### B4. `ServerConfig.db` type vs. design doc's `ServerConfig` type

The design doc proposes:

```ts
export interface ServerConfig {
  db?: DatabaseClient<Record<string, ModelEntry>> | EntityDbAdapter;
  // ...
}
```

The actual `ServerConfig` already has `db?: DatabaseClient<Record<string, ModelEntry>> | EntityDbAdapter`. So this is not a new addition. But the design doc proposes `auth?: AuthConfig` on `ServerConfig`, and this IS new. The current `ServerConfig` has no `auth` field.

The problem: `AuthConfig` (in `types.ts`) includes `sessionStore?`, `userStore?`, `rateLimitStore?`, etc. -- all the store override fields. The design doc says "auth-specific config only" on `ServerConfig.auth`, implying the store overrides still work. But it also says "No second config path for db (don't also accept `db` on auth config when using createServer)."

Currently, `createAuth(config: AuthConfig)` takes `AuthConfig` which has no `db` field. The design says `createAuth` will gain an optional `db` parameter for standalone usage. This means `AuthConfig` needs a new `db?` field. But the "one way" principle says `createServer` shouldn't expose the store overrides on the top-level `auth` config -- or does it?

The type flow needs clarification: when `createServer({ db, auth })` calls `createAuth({ ...auth, db })` internally, what is the exact type? Is it `AuthConfig & { db?: DatabaseClient }` or a new `InternalAuthConfig`? The design doc must specify this to avoid the type system allowing contradictory configurations (e.g., `createServer({ db, auth: { db: differentDb } })`).

**Fix:** Define the exact internal type that `createAuth` receives. Decide whether `AuthConfig` gains a `db?` field (which opens the "two paths" door) or whether there's a separate internal type.

### B5. DDL `email_verified INTEGER` -- wrong type for PostgreSQL

The POC section shows:

```sql
email_verified INTEGER NOT NULL DEFAULT 0
```

This is SQLite-flavored DDL (SQLite has no native boolean; integers 0/1 are used). PostgreSQL has a native `BOOLEAN` type. If the DDL is meant to be dialect-agnostic, the implementation needs dialect-specific DDL generation -- or at minimum, the design doc needs to acknowledge this.

The `d.boolean()` column builder maps to `'boolean'` as its column type. The `auth_users` table schema says `boolean` for `email_verified`. But the DDL example in the POC uses `INTEGER`. This inconsistency will cause the DDL to fail on PostgreSQL if INTEGER is used, or cause type mismatches on SQLite if BOOLEAN is used (SQLite treats BOOLEAN as INTEGER anyway, but column type names matter for the migration snapshot system).

**Fix:** The DDL must be dialect-aware. Document whether `initialize()` will generate dialect-specific DDL or use a shared subset. If using raw SQL strings, you need two DDL strings per table (one for each dialect) or use the table definitions themselves to generate DDL.

---

## Should-Fix

### S1. Use `d.model()` explicitly, not `d.entry()`

As noted in B3, clarify that `authModels` uses `d.model()` (not `d.entry()`). `d.model()` produces `ModelDef` which includes `schemas` (derived Zod-like schemas for insert/update validation) and `_tenant` metadata. The migration system reads `ModelDef.schemas`, so if auth tables ever need migrations, they need to be `ModelDef`s. Since the entire test suite uses `d.model()`, this is the right call -- just be explicit.

### S2. `RoleAssignmentStore` and `ClosureStore` live inside `AuthAccessConfig`, not top-level `AuthConfig`

The design doc says "Wire into `createAuth()` access config" for Phase 3. But `roleStore` and `closureStore` are properties of `AuthAccessConfig` (nested under `AuthConfig.access`), not top-level on `AuthConfig`.

This means the auto-wiring logic ("db present -> DB-backed stores") needs to handle the nesting correctly. If the user passes `auth: { access: { definition, roleStore, closureStore } }`, the explicit stores should win. If the user passes `auth: { access: { definition } }` without stores, and `db` is present, the framework should inject DB-backed role and closure stores.

The design doc's "Store selection logic" section doesn't mention this nesting. It lists `RoleAssignmentStore` and `ClosureStore` in the flat list of stores that auto-switch to DB. The implementation will need special handling for `access.roleStore` and `access.closureStore` vs. top-level stores like `userStore`.

**Fix:** Update the store selection logic section to address the `access.roleStore` / `access.closureStore` nesting.

### S3. Similarly, `planStore` and `walletStore` live in `AccessContextConfig`, not `AuthConfig`

`planStore` and `walletStore` don't appear in `AuthConfig` at all. They're parameters to `createAccessContext()`, which is called independently from `createAuth()`. The design doc lists `PlanStore` and `WalletStore` as stores that auto-switch to DB when `db` is present via `createServer`, but doesn't explain how `createServer` would wire them.

Options:
1. Add `planStore?` and `walletStore?` to `AuthAccessConfig` (breaking change to the type, but pre-v1 so acceptable)
2. Have `createServer` also inject them into `createAccessContext` calls -- but `createAccessContext` is called by user code, not by the framework

This is a design gap. The plan/wallet stores are not framework-managed in the same way session/user stores are. The design needs to either:
- Add them to `AuthConfig` (or `AuthAccessConfig`) so `createAuth` can manage them
- Export pre-built DB store factories that users instantiate themselves
- Provide a `createAccessContext` wrapper that reads from the server context

**Fix:** Decide and document how plan/wallet stores are wired when `db` is provided. The current design says they auto-switch, but there's no mechanism for that.

### S4. `auth_closure` table missing `unique` constraint on (ancestor, descendant)

The `InMemoryClosureStore.addResource()` unconditionally pushes rows. If `addResource` is called twice for the same resource (idempotency), it creates duplicate rows. The in-memory version tolerates this (queries just return duplicates). But the DB version should have a UNIQUE constraint on `(ancestor_type, ancestor_id, descendant_type, descendant_id)` to prevent duplicates and enable `INSERT ... ON CONFLICT DO NOTHING` for idempotent `addResource`.

The design doc's `auth_closure` table has indexes but no UNIQUE constraint on the full path tuple.

**Fix:** Add `UNIQUE (ancestor_type, ancestor_id, descendant_type, descendant_id)` to `auth_closure`.

### S5. `db.query()` returns `Result<QueryResult<T>, ReadError>` -- DDL error handling

The POC shows `await db.query(sql`CREATE TABLE IF NOT EXISTS ...`)` as a plain `await`. But `db.query()` returns a `Result` wrapper -- you get `{ ok: true, data: ... }` or `{ ok: false, error: ... }`. The DDL calls in `initialize()` need to unwrap the Result and handle failures.

The design doc should show the actual pattern:

```ts
const result = await db.query(sql`CREATE TABLE IF NOT EXISTS ...`);
if (!result.ok) throw new Error(`Failed to create auth_users: ${result.error.message}`);
```

Or use the `ok()` unwrapper pattern used elsewhere in the codebase.

### S6. Atomic wallet consume: `rowCount` vs. `affectedRows`

The design doc's atomic wallet consume pattern relies on checking affected rows:

```sql
UPDATE auth_wallet SET consumed = consumed + :amount ... WHERE consumed + :amount <= :limit
```

"Check `affectedRows` -- if 0, the limit was exceeded."

`db.query()` returns `QueryResult<T>` which has `rowCount`, not `affectedRows`. For UPDATE statements, `rowCount` reflects affected rows in both PostgreSQL (`pg` driver) and SQLite. This is fine, but the design doc uses the term `affectedRows` which doesn't match the API. Minor, but could cause confusion during implementation.

### S7. `auth_wallet` consume needs upsert, not just UPDATE

The atomic consume pattern assumes the wallet row already exists:

```sql
UPDATE auth_wallet SET consumed = consumed + :amount WHERE ...
```

But what if this is the first consumption for that (org, entitlement, period)? The row doesn't exist yet. The `InMemoryWalletStore` handles this with "lazy init" -- it creates the entry if it doesn't exist.

The DB version needs either:
1. An INSERT followed by UPDATE (race-prone without transactions)
2. An `INSERT ... ON CONFLICT DO UPDATE` (upsert) -- but this needs to include the limit check atomically
3. Two-step: INSERT IF NOT EXISTS with consumed=0, then the atomic UPDATE

Option 3 is safest:

```sql
INSERT INTO auth_wallet (id, org_id, entitlement, period_start, period_end, consumed, created_at, updated_at)
VALUES (:id, :orgId, :entitlement, :periodStart, :periodEnd, 0, :now, :now)
ON CONFLICT (org_id, entitlement, period_start) DO NOTHING;

UPDATE auth_wallet SET consumed = consumed + :amount, updated_at = :now
WHERE org_id = :orgId AND entitlement = :entitlement AND period_start = :periodStart
AND consumed + :amount <= :limit;
```

The design doc should document this two-step approach.

### S8. DDL column types: `uuid` vs. `TEXT` for primary keys

The table schemas say `id` is `uuid` type. PostgreSQL has a native `UUID` type, but SQLite does not. The POC example shows `id TEXT PRIMARY KEY` for SQLite. The design needs to specify:
- PostgreSQL DDL uses `UUID` (or `TEXT` with UUID values?)
- SQLite DDL uses `TEXT`

This ties back to B5 -- the DDL must be dialect-aware. The `d.uuid()` column builder maps to type `'uuid'`, and the dialect layer converts this to the appropriate SQL type. But since `initialize()` uses raw `sql` tagged templates (not the table definitions), the raw DDL strings need to be correct for each dialect.

---

## Nits

### N1. `auth_plans.overrides` as TEXT -- consider naming it `overrides_json`

Since this column stores serialized JSON but uses the `text` type, naming it `overrides_json` would make the storage format obvious to anyone reading the schema directly (e.g., via `\d auth_plans` in psql).

### N2. Design doc says `d.table()` in comments but the `authModels` comments show `d.model()`

Line 78 says `d.model(authUsersTable)` in the authModels comment. The table itself would be defined with `d.table()`. This is correct but could be confused by someone unfamiliar with the two-step pattern (table definition -> model wrapping). A small clarifying note would help.

### N3. `auth_role_assignments` table has `id` UUID PK but the `RoleAssignment` interface has no `id`

The `RoleAssignment` interface in `role-assignment-store.ts` has `{ userId, resourceType, resourceId, role }` -- no `id` field. The store interface methods (`assign`, `revoke`, `getRoles`) don't use `id`. The table schema adds `id UUID PK`, which is fine for the DB (every row should have a PK) but means the DB store must generate `id` on insert and ignore it in the interface methods. Just noting that this is intentional and correct.

### N4. Phase ordering: Phase 3 (roles/closure) depends on Phase 2's wiring

Phase 2 wires `createServer -> createAuth({ ...auth, db })`. Phase 3 needs the same wiring for `access.roleStore` and `access.closureStore`. Make sure Phase 2's wiring is generic enough to handle the nested access config, or Phase 3 will need to refactor Phase 2's work.

---

## Verdict

**Request changes.**

Two hard blockers must be resolved before implementation:

1. **B1** (`plan` column missing) -- will silently break plan-based access control for every DB-backed deployment.
2. **B2** (`currentTokens` not addressed) -- will break refresh token grace period logic, which is security-critical.

Additionally, **B4** (type flow for `createAuth` internal config) and **B5** (dialect-specific DDL) need resolution to avoid implementation rework.

The should-fix items (S2, S3 especially) reveal that the store wiring for `access.roleStore`, `access.closureStore`, `planStore`, and `walletStore` is not as straightforward as the flat list in the design doc implies. The nesting of these stores in `AuthAccessConfig` and `AccessContextConfig` respectively means the auto-wiring logic needs careful design -- not just "if db present, use DB store."

The overall architecture is sound. The `DatabaseClient -> ModelDelegate -> Store` type flow works. The `authModels` spread pattern aligns with existing entity usage. The DDL-via-`sql`-tag approach is validated by the codebase. The issues are at the edges -- missing columns, missing persistence for ephemeral-but-important data, and dialect-specific DDL generation.
