# DB-Backed Auth Stores

**Issue:** [#1059](https://github.com/vertz-dev/vertz/issues/1059)
**Status:** Draft v2 — updated to align with access redesign (#1069)
**Supersedes:** Original design doc (PR #1068)

## Problem

`createAuth()` defaults all stores to in-memory implementations. Data that must survive a server restart (users, sessions, roles, plans) disappears when the process dies. The server already has a `db`, but auth doesn't use it.

## Alignment with Access Redesign

The [access redesign](./access-redesign.md) (#1069) introduces new stores and significantly changes existing ones. This design doc covers the DB persistence layer for **all** access-related stores, not just the original 7. Specifically:

- **PlanStore** — gains add-on support, effective plan computation
- **WalletStore** — gains scoped keys, batch check, multi-limit
- **FlagStore** — reclassified from ephemeral to persistent (local DB)
- **New stores** — OverrideStore, PlanVersionStore, GrandfatheringStore

The access redesign's Phase 6 (Cloud Storage) defines a data residency split:
- **Local DB** — role assignments, closure table, plan assignments, flags, overrides, add-on assignments
- **Cloud** — wallet counts, plan version snapshots, grandfathering state, billing events, audit log

This design doc covers the **local DB** stores only. Cloud stores are a separate feature.

## API Surface

### Infrastructure lives at the framework root

`db` and `cloud` are framework-level concerns — auth is just one consumer. Both belong on `createServer()`:

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
  cloud: process.env.VERTZ_CLOUD_KEY,         // framework-level — managed services (future)
  auth: {                                     // auth-specific config only
    session: { strategy: 'jwt', ttl: '60s' },
    emailPassword: { enabled: true },
  },
  access: defineAccess({ ... }),              // access control config
  entities: [/* ... */],
});
```

### How auth receives `db`

`createServer` passes `db` to internal `createAuth()` and wires access stores. The developer never passes `db` to auth directly — it flows through the framework:

```
createServer({ db, auth: { ... }, access: defineAccess({ ... }) })
  └─ internally:
       ├─ createAuth({ ...auth, db })
       │    └─ db present? → DB-backed stores (UserStore, SessionStore, OAuthAccountStore)
       │    └─ db absent?  → in-memory stores (prototyping/testing)
       └─ wire access stores with db
            └─ db present? → DB-backed stores (RoleAssignment, Closure, Plan, Flag, Override)
            └─ db absent?  → in-memory stores
```

### Internal auth config type

`createAuth()` receives an internal extended type that includes `db`. This type is **not** part of the public `AuthConfig` — it's only used inside `createServer`:

```ts
// Internal only — not exported
interface InternalAuthConfig extends AuthConfig {
  db?: DatabaseClient<Record<string, ModelEntry>>;
}
```

This avoids polluting the public `AuthConfig` type while still allowing `createAuth()` to auto-select DB stores.

### Store selection logic

When `db` is provided via `createServer`:

**Auth stores auto-switch to DB:**
- UserStore, SessionStore, OAuthAccountStore

**Access stores auto-switch to DB (local-DB category from access redesign):**
- RoleAssignmentStore, ClosureStore, PlanStore, FlagStore, OverrideStore

**Access stores remain in-memory (cloud category — future):**
- WalletStore → cloud-backed in production, in-memory for dev/test
- PlanVersionStore → cloud-backed in production, in-memory for dev/test
- GrandfatheringStore → cloud-backed in production, in-memory for dev/test

**Ephemeral stores stay in-memory always:**
- RateLimitStore, EmailVerificationStore, PasswordResetStore, MFAStore

When `db` is omitted:
- All stores default to in-memory (current behavior, for prototyping/testing)

Explicit store overrides always win.

### Auth model validation

When `createServer` receives both `db` (as `DatabaseClient`) and `auth` config, it validates that auth models are registered — same pattern as entity model validation (lines 143-157 of `create-server.ts`):

```ts
// Inside createServer, after entity validation:
if (db && isDatabaseClient(db) && config.auth) {
  const dbModels = db._internals.models;
  const requiredAuthModels = [
    'auth_users', 'auth_sessions', 'auth_oauth_accounts',
    'auth_role_assignments', 'auth_closure', 'auth_plans',
    'auth_flags', 'auth_overrides',
  ];
  const missing = requiredAuthModels.filter(m => !(m in dbModels));
  if (missing.length > 0) {
    throw new Error(
      `Auth requires models ${missing.map(m => `"${m}"`).join(', ')} in createDb(). ` +
      `Add authModels to your createDb() call: createDb({ models: { ...authModels, ...yourModels } })`
    );
  }
}
```

This produces a clear, prescriptive error message instead of inscrutable runtime failures.

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
//   auth_flags: d.model(authFlagsTable),
//   auth_overrides: d.model(authOverridesTable),
// }
```

All auth tables prefixed with `auth_` to avoid collision with user entity tables.

### How auth is exposed on the server instance

`createServer` currently returns `AppBuilder`. To expose `app.auth`, we extend the return type:

```ts
interface ServerInstance extends AppBuilder {
  auth: AuthInstance;
  initialize(): Promise<void>;
}

export function createServer(config: ServerConfig): ServerInstance;
```

`initialize()` on `ServerInstance` calls `auth.initialize()` (DDL) plus any future subsystem initialization. This keeps the return type clean and avoids polluting `AppBuilder` in `@vertz/core`.

### Standalone `createAuth()` still works

For testing or apps that don't use `createServer`:

```ts
// No db — fully in-memory (tests, prototyping)
const auth = createAuth({
  session: { strategy: 'jwt', ttl: '60s' },
});
```

Note: `createAuth({ db })` is intentionally **not supported** as a public API. The only way to wire `db` to auth is through `createServer({ db, auth })`. This enforces "one way to do things".

### ServerConfig changes

```ts
export interface ServerConfig extends Omit<AppConfig, '_entityDbFactory' | 'entities'> {
  db?: DatabaseClient<Record<string, ModelEntry>> | EntityDbAdapter;
  cloud?: string;  // Vertz Cloud API key — future
  auth?: AuthConfig;
  access?: AccessDefinition;  // from defineAccess()
  entities?: EntityDefinition[];
  services?: ServiceDefinition[];
}
```

Note: `auth` on `ServerConfig` is the config object, not an `AuthInstance`. `createServer` creates the auth instance internally with the shared `db`.

## Table Schemas

### Dialect-aware DDL

Tables must work on both SQLite and PostgreSQL. The DDL generator uses a dialect abstraction:

| Concept | SQLite | PostgreSQL |
|---------|--------|------------|
| Primary key | `TEXT PRIMARY KEY` | `TEXT PRIMARY KEY` |
| Boolean | `INTEGER NOT NULL DEFAULT 0` | `BOOLEAN NOT NULL DEFAULT false` |
| Timestamp | `TEXT NOT NULL` | `TIMESTAMPTZ NOT NULL` |
| Nullable timestamp | `TEXT` | `TIMESTAMPTZ` |
| Auto-now | Application-side (ISO string) | Application-side (ISO string) |
| JSON | `TEXT` | `TEXT` (not jsonb — simpler, portable) |

Implementation: A `dialectDDL(dialect)` helper returns the right SQL fragments per type. Each table has one `createTable()` function that uses these fragments.

```ts
function dialectDDL(dialect: 'sqlite' | 'postgres') {
  return {
    boolean: (def: boolean) => dialect === 'sqlite'
      ? `INTEGER NOT NULL DEFAULT ${def ? 1 : 0}`
      : `BOOLEAN NOT NULL DEFAULT ${def}`,
    timestamp: () => dialect === 'sqlite' ? 'TEXT NOT NULL' : 'TIMESTAMPTZ NOT NULL',
    timestampNullable: () => dialect === 'sqlite' ? 'TEXT' : 'TIMESTAMPTZ',
    // ...etc
  };
}
```

### auth_users

| Column | Type | Notes |
|--------|------|-------|
| id | text | PK |
| email | text | unique, indexed |
| password_hash | text | nullable (OAuth-only users) |
| role | text | default 'user' |
| plan | text | nullable — current plan ID |
| email_verified | boolean | default false |
| created_at | timestamp | |
| updated_at | timestamp | |

### auth_sessions

| Column | Type | Notes |
|--------|------|-------|
| id | text | PK |
| user_id | text | indexed |
| refresh_token_hash | text | indexed |
| previous_refresh_hash | text | nullable |
| current_tokens | text | nullable, JSON — cached JWT + refresh for grace period |
| ip_address | text | |
| user_agent | text | |
| created_at | timestamp | |
| last_active_at | timestamp | |
| expires_at | timestamp | |
| revoked_at | timestamp | nullable |

### auth_oauth_accounts

| Column | Type | Notes |
|--------|------|-------|
| id | text | PK |
| user_id | text | indexed |
| provider | text | |
| provider_id | text | |
| email | text | nullable |
| created_at | timestamp | |
| **unique** | | (provider, provider_id) |

### auth_role_assignments

| Column | Type | Notes |
|--------|------|-------|
| id | text | PK |
| user_id | text | indexed |
| resource_type | text | lowercase entity name |
| resource_id | text | |
| role | text | |
| created_at | timestamp | |
| **unique** | | (user_id, resource_type, resource_id, role) |

### auth_closure

| Column | Type | Notes |
|--------|------|-------|
| id | text | PK |
| ancestor_type | text | |
| ancestor_id | text | |
| descendant_type | text | |
| descendant_id | text | |
| depth | integer | |
| **unique** | | (ancestor_type, ancestor_id, descendant_type, descendant_id) |
| **index** | | (descendant_type, descendant_id) for getAncestors |
| **index** | | (ancestor_type, ancestor_id) for getDescendants |

### auth_plans

Redesigned to support add-ons from the access redesign (Phase 2).

| Column | Type | Notes |
|--------|------|-------|
| id | text | PK |
| tenant_id | text | indexed |
| plan_id | text | |
| started_at | timestamp | |
| expires_at | timestamp | nullable |
| **unique** | | (tenant_id) — one base plan per tenant |

### auth_plan_addons

New table — tracks add-on assignments per tenant.

| Column | Type | Notes |
|--------|------|-------|
| id | text | PK |
| tenant_id | text | indexed |
| addon_id | text | |
| is_one_off | boolean | default false — one-off add-ons don't reset |
| quantity | integer | default 1 — stackable one-off purchases |
| created_at | timestamp | |
| **index** | | (tenant_id, addon_id) |

### auth_flags

Reclassified from ephemeral to persistent per access redesign data residency.

| Column | Type | Notes |
|--------|------|-------|
| id | text | PK |
| tenant_id | text | indexed |
| flag | text | |
| enabled | boolean | |
| **unique** | | (tenant_id, flag) |

### auth_overrides

New table — per-tenant feature and limit overrides (access redesign Phase 3).

| Column | Type | Notes |
|--------|------|-------|
| id | text | PK |
| tenant_id | text | indexed |
| overrides | text | JSON — `{ features?: string[], limits?: Array<{ key, add?, max? }> }` |
| updated_at | timestamp | |
| **unique** | | (tenant_id) |

## Store-to-Table Mapping

| Store | Table(s) | Category | Notes |
|-------|----------|----------|-------|
| UserStore | auth_users | Auth | |
| SessionStore | auth_sessions | Auth | `current_tokens` stored as JSON text |
| OAuthAccountStore | auth_oauth_accounts | Auth | |
| RoleAssignmentStore | auth_role_assignments | Access (local) | |
| ClosureStore | auth_closure | Access (local) | UNIQUE constraint for idempotent addResource |
| PlanStore | auth_plans + auth_plan_addons | Access (local) | Two tables for base plan + add-ons |
| FlagStore | auth_flags | Access (local) | Was ephemeral, now persistent |
| OverrideStore | auth_overrides | Access (local) | New in access redesign |
| WalletStore | — | Access (cloud) | **Not DB-backed** — cloud or in-memory |
| PlanVersionStore | — | Access (cloud) | **Not DB-backed** — cloud or in-memory |
| GrandfatheringStore | — | Access (cloud) | **Not DB-backed** — cloud or in-memory |

## Manifesto Alignment

### Explicit over implicit
- `db` is configured once at the framework level — visible, not hidden
- Auth models must be explicitly included in `createDb({ models: { ...authModels } })`
- Missing models produce a prescriptive error at `createServer()` time
- In-memory fallback only when `db` is absent (prototyping)

### One way to do things
- One path: `createServer({ db, auth: { ... } })` — db flows to auth automatically
- `createAuth({ db })` is NOT a public API — prevents two competing configuration paths
- `createAuth()` without db is the only standalone option (for tests)

### If it builds, it works
- Auth models are typed via `d.table()` — column types checked at compile time
- Missing model validation at `createServer()` catches misconfig before runtime

### Convention over configuration
- Table names, column names, indexes all predefined
- No config needed beyond passing `db` to `createServer`
- DB stores auto-selected when `db` is present

## Non-Goals

- **Custom auth table names** — auth tables are always `auth_*`. Custom naming adds complexity for zero benefit pre-v1.
- **Migration system** — `initialize()` creates tables if they don't exist. Schema migrations are a future concern (post-v1).
- **Cloud-category stores in local DB** — WalletStore, PlanVersionStore, GrandfatheringStore are cloud-backed per the access redesign. When no cloud is configured, they fall back to in-memory, not local DB. This keeps the local DB lean.
- **Vertz Cloud integration** — `cloud` key is reserved on `ServerConfig` but not implemented in this feature.

## Unknowns

1. **Does `DatabaseClient` support creating tables at runtime?**
   - **Resolution**: Confirmed — `db.query(sql\`CREATE TABLE IF NOT EXISTS ...\`)` works.

2. **JSON column support across dialects**
   - **Resolution**: Use `text` column with JSON serialization/deserialization.

3. **Atomic wallet consume across DB**
   - **Resolution**: N/A for this doc — wallet is cloud-backed, not local DB.

4. **How does `createServer` return type change?**
   - **Resolution**: Return `ServerInstance extends AppBuilder` with `.auth` and `.initialize()`. Defined in `@vertz/server`, not `@vertz/core`.

## POC Results

### 1. DDL Support — Confirmed

**Question:** Does `DatabaseClient` support creating tables at runtime?

**What was tried:** Explored `packages/db/src/client/database.ts` and dialect adapters. The `DatabaseClient` exposes a public `query()` method that accepts `SqlFragment` objects created via the `sql` tagged template.

**Result:** DDL is fully supported through `db.query(sql\`CREATE TABLE IF NOT EXISTS ...\`)`. Both PostgreSQL and SQLite dialect adapters route `query()` to their underlying drivers.

### 2. JSON Column Support — Text with Serialization

**Resolution confirmed:** Use `text` column type with `JSON.stringify()` on write and `JSON.parse()` on read.

### 3. Dialect Detection

The `DatabaseClient` exposes `_internals.dialect` which returns `'sqlite'` or `'postgres'`. The DDL generator reads this to produce the right SQL.

## Type Flow Map

```
authModels (table defs via d.table())
  ↓ spread into createDb({ models: { ...authModels, ...userModels } })
DatabaseClient<{ auth_users: AuthUserEntry, auth_sessions: ..., ... }>
  ↓ passed to createServer({ db, auth: { ... }, access: defineAccess({ ... }) })
createServer validates auth models are in db (prescriptive error on missing)
  ↓ createServer creates auth instance internally
  ↓ db present? → DbUserStore(db), DbSessionStore(db), ...
  ↓ db absent?  → InMemoryUserStore(), InMemorySessionStore(), ...
  ↓ access stores wired similarly: DbRoleAssignmentStore(db), DbClosureStore(db), ...
ServerInstance { auth: AuthInstance, initialize(), ...AppBuilder }
  ↓ initialize() creates tables via dialect-aware DDL (idempotent)
  ↓ auth handlers use stores (signUp, signIn, etc.)
Same async interface for DB and InMemory stores
```

## E2E Acceptance Test

```ts
import { createDb } from '@vertz/db';
import { authModels, createServer, defineAccess } from '@vertz/server';

// 1. Create DB with auth models
const db = createDb({
  models: { ...authModels },
  dialect: 'sqlite',
});

// 2. Define access
const access = defineAccess({
  entities: {
    organization: { roles: ['owner', 'admin', 'member'] },
    project: {
      roles: ['manager', 'viewer'],
      inherits: { 'organization:admin': 'manager', 'organization:member': 'viewer' },
    },
  },
  entitlements: {
    'project:view': { roles: ['viewer', 'manager'] },
    'project:edit': { roles: ['manager'] },
  },
});

// 3. Create server with db + auth + access
const app = createServer({
  db,
  auth: {
    session: { strategy: 'jwt', ttl: '60s' },
    emailPassword: { enabled: true },
  },
  access,
});

// 4. Initialize (creates auth tables — idempotent)
await app.initialize();

// 5. Sign up persists to DB
const signUp = await app.auth.api.signUp({
  email: 'test@example.com',
  password: 'Password123!',
});
expect(signUp.ok).toBe(true);

// 6. User survives "restart" — create fresh server with same db
const app2 = createServer({
  db,
  auth: {
    session: { strategy: 'jwt', ttl: '60s' },
    emailPassword: { enabled: true },
  },
  access,
});
await app2.initialize(); // tables already exist, no-op

// 7. Sign in works with previous user's data
const signIn = await app2.auth.api.signIn({
  email: 'test@example.com',
  password: 'Password123!',
});
expect(signIn.ok).toBe(true);

// 8. Role assignments persist across restart
// (assigned in app1, checked in app2)

// 9. Feature flags persist across restart

// 10. Missing authModels produces prescriptive error
const badDb = createDb({ models: {}, dialect: 'sqlite' });
expect(() => createServer({
  db: badDb,
  auth: { session: { strategy: 'jwt', ttl: '60s' } },
})).toThrow(/Auth requires models.*authModels/);

// 11. No db — fully in-memory (standalone createAuth for tests)
import { createAuth } from '@vertz/server';
const testAuth = createAuth({
  session: { strategy: 'jwt', ttl: '60s' },
  // no db → fully in-memory
});
```

## Testing Strategy

### Shared test factories for behavioral parity

Every store with both InMemory and DB implementations shares a test factory:

```ts
// Example: shared-user-store.tests.ts
export function userStoreTests(
  name: string,
  factory: () => { store: UserStore; cleanup: () => Promise<void> },
) {
  describe(`UserStore: ${name}`, () => {
    let store: UserStore;
    let cleanup: () => Promise<void>;

    beforeEach(() => {
      const result = factory();
      store = result.store;
      cleanup = result.cleanup;
    });

    afterEach(async () => { await cleanup(); });

    it('creates and finds user by email', async () => { /* ... */ });
    it('returns null for unknown email', async () => { /* ... */ });
    // ... all UserStore behaviors
  });
}

// In user-store.test.ts:
userStoreTests('InMemory', () => ({
  store: new InMemoryUserStore(),
  cleanup: async () => {},
}));

// In db-user-store.test.ts:
userStoreTests('SQLite', () => ({
  store: new DbUserStore(testDb),
  cleanup: async () => { /* truncate tables */ },
}));
```

This guarantees DB stores behave identically to in-memory stores.

## Implementation Phases

### Phase 1: Dialect-aware DDL + auth table definitions

- Implement `dialectDDL()` helper for SQLite and PostgreSQL
- Define all 9 auth table schemas (auth_users through auth_overrides)
- Export `authModels` from `@vertz/server`
- Implement DDL in `initialize()` — create tables if not exist
- Add auth model validation in `createServer()`
- Acceptance:
  - `auth.initialize()` creates all 9 tables in SQLite
  - `auth.initialize()` creates all 9 tables in PostgreSQL
  - `initialize()` is idempotent (calling twice succeeds)
  - Missing authModels in createDb() throws prescriptive error

### Phase 2: ServerInstance + DbUserStore + DbSessionStore

- Define `ServerInstance` type extending `AppBuilder` with `.auth` and `.initialize()`
- Implement DB-backed UserStore and SessionStore
- Wire `createServer` to create auth internally and return `ServerInstance`
- Shared test factory for UserStore (InMemory + DB)
- Shared test factory for SessionStore (InMemory + DB)
- Acceptance:
  - `createServer({ db, auth })` returns `ServerInstance` with `.auth`
  - sign-up → restart → sign-in works
  - `current_tokens` persists in session (grace period works)
  - In-memory path unchanged (no db → same behavior as today)

### Phase 3: DbRoleAssignmentStore + DbClosureStore + DbFlagStore

- Implement DB-backed role assignment, closure, and flag stores
- Wire into access store auto-selection
- Shared test factories for each
- Acceptance:
  - Role assignments persist across restart
  - Closure table hierarchy queries work with DB
  - Feature flags persist across restart
  - `addResource` is idempotent (UNIQUE constraint)

### Phase 4: DbPlanStore + DbOverrideStore + DbOAuthAccountStore

- Implement DB-backed PlanStore (with add-on support via auth_plan_addons)
- Implement DB-backed OverrideStore
- Implement DB-backed OAuthAccountStore
- Shared test factories for each
- Acceptance:
  - Plan assignments + add-ons persist
  - Overrides persist
  - OAuth accounts persist
  - Add-on stacking works (one-off × N)

### Phase 5: Integration tests + docs update

- Full E2E integration test with all stores (both SQLite and PostgreSQL)
- Behavioral parity tests (shared factories) for all stores
- Update auth docs to show `createServer({ db, auth })` pattern
- Changeset

## Definition of Done

- [ ] All 8 DB-backed store implementations (UserStore, SessionStore, OAuthAccountStore, RoleAssignmentStore, ClosureStore, PlanStore, FlagStore, OverrideStore)
- [ ] 9 auth tables with dialect-aware DDL (SQLite + PostgreSQL)
- [ ] `authModels` exported from `@vertz/server`
- [ ] `createServer({ db, auth })` returns `ServerInstance` with `.auth`
- [ ] Auth model validation with prescriptive error messages
- [ ] `initialize()` creates tables (idempotent)
- [ ] Shared test factories proving behavioral parity (InMemory ↔ DB)
- [ ] Explicit store overrides still work
- [ ] In-memory fallback unchanged (no db → same behavior)
- [ ] E2E acceptance test passing (both dialects)
- [ ] All existing auth tests pass
- [ ] Docs updated
- [ ] Changeset added
