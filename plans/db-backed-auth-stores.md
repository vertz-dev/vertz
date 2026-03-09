# DB-Backed Auth Stores

**Issue:** [#1059](https://github.com/vertz-dev/vertz/issues/1059)
**Status:** Draft — awaiting approval

## Problem

`createAuth()` defaults all stores to in-memory implementations. Data that must survive a server restart (users, sessions, roles, plans) disappears when the process dies. The server already has a `db`, but auth doesn't use it.

## API Surface

### Infrastructure lives at the framework root

`db` and `cloud` are framework-level concerns — auth is just one consumer. Tomorrow it could be KV stores, file storage, analytics, etc. Both belong on `createServer()`:

```ts
import { createDb } from '@vertz/db';
import { createServer, authModels } from '@vertz/server';

const db = createDb({
  models: { ...authModels, ...myModels },
  dialect: 'postgres',
  connectionString: process.env.DATABASE_URL,
});

const app = createServer({
  db,                                         // framework-level — all subsystems use it
  cloud: process.env.VERTZ_CLOUD_KEY,         // framework-level — managed services
  auth: {                                     // auth-specific config only
    session: { strategy: 'jwt', ttl: '60s' },
    emailPassword: { enabled: true },
  },
  entities: [/* ... */],
});
```

`createServer` owns the infrastructure. Auth, entities, and future services all receive `db` and `cloud` from the server context.

### How auth receives `db`

`createServer` passes `db` to the internal `createAuth()` call. The developer never passes `db` to auth directly — it flows through the framework:

```
createServer({ db, auth: { ... } })
  └─ internally: createAuth({ ...auth, db })
       └─ db present? → DB-backed stores for persistent data
       └─ db absent?  → in-memory stores (prototyping/testing)
```

### Store selection logic

When `db` is provided via `createServer`:
- **Persistent stores auto-switch to DB**: UserStore, SessionStore, OAuthAccountStore, RoleAssignmentStore, ClosureStore, PlanStore, WalletStore
- **Ephemeral stores stay in-memory**: RateLimitStore, EmailVerificationStore, PasswordResetStore, MFAStore, FlagStore
- Explicit store overrides always win: passing `userStore` in auth config uses the custom store

When `db` is omitted:
- All stores default to in-memory (current behavior, for prototyping/testing)

### Vertz Cloud integration (future, not this PR)

When `cloud` is provided via `createServer`:
- OAuth providers with no explicit credentials → routed through Vertz Cloud proxy
- Email operations with no `onSend` → routed through Vertz Cloud email relay
- KV stores, file storage, etc. → future cloud-managed services
- Ephemeral stores (rate limiting, etc.) could optionally use cloud-managed Redis

This design doc covers only the `db` wiring. Cloud integration is a separate feature.

### Auth Models Export

```ts
// @vertz/server exports pre-defined auth table models
import { authModels } from '@vertz/server';

// authModels = {
//   auth_users: d.model(authUsersTable),
//   auth_sessions: d.model(authSessionsTable),
//   auth_oauth_accounts: d.model(authOAuthAccountsTable),
//   auth_role_assignments: d.model(authRoleAssignmentsTable),
//   auth_closure: d.model(authClosureTable),
//   auth_plans: d.model(authPlansTable),
//   auth_wallet: d.model(authWalletTable),
// }
```

All auth tables prefixed with `auth_` to avoid collision with user entity tables.

### Standalone `createAuth()` still works

For testing or apps that don't use `createServer`:

```ts
// Direct usage — pass db explicitly
const auth = createAuth({
  session: { strategy: 'jwt', ttl: '60s' },
  db, // optional — same behavior as when createServer passes it
});

// No db — fully in-memory (tests, prototyping)
const auth = createAuth({
  session: { strategy: 'jwt', ttl: '60s' },
});
```

### ServerConfig changes

```ts
export interface ServerConfig {
  db?: DatabaseClient<Record<string, ModelEntry>> | EntityDbAdapter;
  cloud?: string;  // Vertz Cloud API key — future
  auth?: AuthConfig; // NEW — auth config (without db, stores, etc.)
  entities?: EntityDefinition[];
  services?: ServiceDefinition[];
  // ...existing fields
}
```

Note: `auth` on `ServerConfig` is the config object, not an `AuthInstance`. `createServer` creates the auth instance internally with the shared `db`.

## Table Schemas

### auth_users

| Column | Type | Notes |
|--------|------|-------|
| id | uuid | PK |
| email | text | unique, indexed |
| password_hash | text | nullable (OAuth-only users) |
| role | text | default 'user' |
| email_verified | boolean | default false |
| created_at | timestamp | |
| updated_at | timestamp | |

### auth_sessions

| Column | Type | Notes |
|--------|------|-------|
| id | uuid | PK |
| user_id | uuid | indexed |
| refresh_token_hash | text | indexed |
| previous_refresh_hash | text | nullable |
| ip_address | text | |
| user_agent | text | |
| created_at | timestamp | |
| last_active_at | timestamp | |
| expires_at | timestamp | |
| revoked_at | timestamp | nullable |

### auth_oauth_accounts

| Column | Type | Notes |
|--------|------|-------|
| id | uuid | PK |
| user_id | uuid | indexed |
| provider | text | |
| provider_id | text | |
| email | text | nullable |
| created_at | timestamp | |
| **unique** | | (provider, provider_id) |

### auth_role_assignments

| Column | Type | Notes |
|--------|------|-------|
| id | uuid | PK |
| user_id | uuid | indexed |
| resource_type | text | |
| resource_id | text | |
| role | text | |
| created_at | timestamp | |
| **unique** | | (user_id, resource_type, resource_id, role) |

### auth_closure

| Column | Type | Notes |
|--------|------|-------|
| id | uuid | PK |
| ancestor_type | text | |
| ancestor_id | text | |
| descendant_type | text | |
| descendant_id | text | |
| depth | integer | |
| **index** | | (descendant_type, descendant_id) for getAncestors |
| **index** | | (ancestor_type, ancestor_id) for getDescendants |

### auth_plans

| Column | Type | Notes |
|--------|------|-------|
| id | uuid | PK |
| org_id | text | unique, indexed |
| plan_id | text | |
| started_at | timestamp | |
| expires_at | timestamp | nullable |
| overrides | text | JSON-serialized Record<string, LimitOverride> |

### auth_wallet

| Column | Type | Notes |
|--------|------|-------|
| id | uuid | PK |
| org_id | text | |
| entitlement | text | |
| period_start | timestamp | |
| period_end | timestamp | |
| consumed | integer | default 0 |
| created_at | timestamp | |
| updated_at | timestamp | |
| **unique** | | (org_id, entitlement, period_start) |

## Manifesto Alignment

### Explicit over implicit
- `db` is configured once at the framework level — visible, not hidden
- Auth models must be explicitly included in `createDb({ models: { ...authModels } })`
- In-memory fallback only when `db` is absent (prototyping)

### One way to do things
- One recommended path: `createServer({ db, auth: { ... } })` — db flows to auth automatically
- No second config path for db (don't also accept `db` on auth config when using createServer)

### If it builds, it works
- Auth models are typed via `d.table()` — column types checked at compile time
- DB-backed stores use the typed query builder

### Convention over configuration
- Table names, column names, indexes all predefined
- No config needed beyond passing `db` to `createServer`

## Non-Goals

- **Custom auth table names** — auth tables are always `auth_*`. Custom naming adds complexity for zero benefit pre-v1.
- **Migration system** — `initialize()` creates tables if they don't exist. Schema migrations are a future concern (post-v1).
- **Multi-database support per store** — all auth stores use the same `db`. A store that uses Redis while others use Postgres is out of scope.
- **Making ephemeral stores DB-backed** — RateLimitStore, EmailVerificationStore, PasswordResetStore, MFAStore, FlagStore stay in-memory. The issue explicitly calls these acceptable as ephemeral.
- **Vertz Cloud integration** — `cloud` key is reserved on `ServerConfig` but not implemented in this feature.

## Unknowns

1. **Does `DatabaseClient` support creating tables at runtime?** The current `createDb()` assumes tables exist. `auth.initialize()` needs to create tables. Need to verify if the query builder supports DDL or if we need raw SQL.
   - **Resolution**: Needs POC — check if dialect adapters expose a `query()` or `exec()` method for raw DDL.

2. **JSON column support across dialects** — `auth_plans.overrides` needs JSON storage. PostgreSQL has `jsonb`, SQLite stores JSON as text natively.
   - **Resolution**: Use `text` column with JSON serialization/deserialization in the store implementation. Avoids dialect-specific column types.

3. **Atomic wallet consume across DB** — `InMemoryWalletStore.consume()` uses an atomic check-and-increment. The DB version needs `UPDATE ... WHERE consumed < limit` or transactions.
   - **Resolution**: Use `UPDATE auth_wallet SET consumed = consumed + :amount WHERE ... AND consumed + :amount <= :limit` with affected-rows check. Single-statement atomicity, no explicit transaction needed.

## POC Results

### 1. DDL Support — Confirmed

**Question:** Does `DatabaseClient` support creating tables at runtime?

**What was tried:** Explored `packages/db/src/client/database.ts` and dialect adapters. The `DatabaseClient` exposes a public `query()` method that accepts `SqlFragment` objects created via the `sql` tagged template.

**Result:** DDL is fully supported through `db.query(sql\`CREATE TABLE IF NOT EXISTS ...\`)`. Both PostgreSQL and SQLite dialect adapters route `query()` to their underlying drivers. No raw SQL escape hatch needed — the existing `sql` tagged template handles it.

**Usage in auth:**
```ts
await db.query(sql`
  CREATE TABLE IF NOT EXISTS auth_users (
    id TEXT PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT,
    role TEXT NOT NULL DEFAULT 'user',
    email_verified INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )
`);
```

### 2. JSON Column Support — Text with Serialization

**Resolution confirmed:** Use `text` column type with `JSON.stringify()` on write and `JSON.parse()` on read. This avoids dialect-specific column types (`jsonb` in PostgreSQL vs native text in SQLite). The `auth_plans.overrides` column stores `Record<string, LimitOverride>` as serialized JSON text.

### 3. Atomic Wallet Consume — Single UPDATE

**Resolution confirmed:** Use a single `UPDATE` statement with a `WHERE` clause that checks capacity:

```sql
UPDATE auth_wallet
SET consumed = consumed + :amount, updated_at = :now
WHERE org_id = :orgId AND entitlement = :entitlement
  AND period_start = :periodStart
  AND consumed + :amount <= :limit
```

Check `affectedRows` — if 0, the limit was exceeded. Single-statement atomicity, no explicit transaction needed. Both SQLite and PostgreSQL guarantee this.

## Type Flow Map

```
authModels (table defs via d.table())
  ↓ spread into createDb({ models: { ...authModels, ...userModels } })
DatabaseClient<{ auth_users: AuthUserEntry, auth_sessions: ..., ... }>
  ↓ passed to createServer({ db, auth: { ... } })
createServer passes db to createAuth internally
  ↓ createAuth extracts model delegates: db.auth_users, db.auth_sessions, ...
  ↓ creates DbUserStore(db.auth_users), DbSessionStore(db.auth_sessions), ...
Each DbXxxStore implements XxxStore interface
  ↓ used by auth handlers (signUp, signIn, etc.)
Same async interface as InMemoryXxxStore
```

No dead generics — `DatabaseClient<TModels>` flows the model types through to store implementations.

## E2E Acceptance Test

```ts
import { createDb } from '@vertz/db';
import { authModels, createServer } from '@vertz/server';

// 1. Create DB with auth models
const db = createDb({
  models: { ...authModels },
  dialect: 'sqlite',
});

// 2. Create server with db + auth
const app = createServer({
  db,
  auth: {
    session: { strategy: 'jwt', ttl: '60s' },
    emailPassword: { enabled: true },
  },
});

// 3. Initialize (creates auth tables)
await app.initialize();

// 4. Sign up persists to DB
const signUp = await app.auth.api.signUp({
  email: 'test@example.com',
  password: 'Password123!',
});
expect(signUp.ok).toBe(true);

// 5. User survives "restart" — create fresh server with same db
const app2 = createServer({
  db,
  auth: {
    session: { strategy: 'jwt', ttl: '60s' },
    emailPassword: { enabled: true },
  },
});
await app2.initialize(); // tables already exist, no-op

// 6. Sign in works with previous user's data
const signIn = await app2.auth.api.signIn({
  email: 'test@example.com',
  password: 'Password123!',
});
expect(signIn.ok).toBe(true);

// 7. Standalone createAuth still works (for tests)
import { createAuth } from '@vertz/server';
const testAuth = createAuth({
  session: { strategy: 'jwt', ttl: '60s' },
  // no db → fully in-memory
});
```

## Implementation Phases

### Phase 1: Auth table definitions + DDL support

- Define all 7 auth table schemas using `d.table()`
- Export `authModels` from `@vertz/server`
- Implement DDL in `initialize()` — create tables if not exist
- Acceptance: `auth.initialize()` creates all 7 tables in SQLite

### Phase 2: DbUserStore + DbSessionStore

- Implement DB-backed UserStore and SessionStore
- Wire into `createAuth()` — auto-select DB store when `db` is present
- Wire `createServer` to pass `db` to auth
- Acceptance: sign-up → restart → sign-in works (E2E test above)

### Phase 3: DbRoleAssignmentStore + DbClosureStore

- Implement DB-backed role and closure stores
- Wire into `createAuth()` access config
- Acceptance: role assignments and hierarchy lookups persist

### Phase 4: DbPlanStore + DbWalletStore + DbOAuthAccountStore

- Implement remaining DB-backed stores
- Wire into `createAuth()` for plan/wallet/OAuth
- Acceptance: plan assignments, wallet consumption, OAuth accounts persist

### Phase 5: Integration tests + docs update

- Full E2E integration test with all stores
- Update auth docs to show `createServer({ db, auth })` as the recommended pattern
- Changeset

## Definition of Done

- [ ] All 7 DB-backed store implementations
- [ ] `authModels` exported from `@vertz/server`
- [ ] `createServer({ db, auth })` auto-wires DB stores
- [ ] Standalone `createAuth({ db })` still works
- [ ] Explicit store overrides still work
- [ ] `initialize()` creates tables (idempotent)
- [ ] E2E acceptance test passing
- [ ] All existing auth tests pass (in-memory path unchanged)
- [ ] Docs updated
- [ ] Changeset added
