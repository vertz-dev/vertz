# RLS Pipeline — Integrate Policies with Migrations, Wire tenant_id Per-Request

**Issue:** [#1756](https://github.com/vertz-dev/vertz/issues/1756)

## Motivation

The Vertz framework has all the building blocks for Row Level Security but they aren't connected end-to-end. Four critical gaps prevent multi-tenant applications from achieving database-level tenant isolation:

1. **RLS policies are not integrated with `vertz db migrate`** — the codegen RLS generator outputs standalone SQL, never included in migrations.
2. **`app.tenant_id` and `app.user_id` are never set per-request** — RLS policies reference `current_setting()` but the pipeline never calls `SET LOCAL`.
3. **No per-request transaction scoping** — without a transaction, `SET LOCAL` has no effect with connection pooling.
4. **No tenant isolation analysis** — the RLS compiler doesn't distinguish hard isolation policies (tenant, ownership) from dynamic policies (plan-gated, feature flags) that can't be expressed as static Postgres policies.

## Prerequisites

- `defineAccess()` with `rules.where()` conditions — implemented
- Access analyzer (`access-analyzer.ts`) extracts where clauses into `AccessIR` — implemented
- RLS policy generator (`rls-policy-generator.ts`) outputs `CREATE POLICY` SQL — implemented
- `db.transaction()` with Postgres driver using `sql.begin()` — implemented
- Entity `tenantScoped` auto-detection from model — implemented
- CRUD pipeline with tenant filtering and `extractWhereConditions()` — implemented
- Session middleware extracting `userId`/`tenantId` into request context — implemented

## API Surface

### 1. Developer experience (zero-touch)

Developers interact with `defineAccess()` and `rules.*` — exactly as they do today. RLS is fully automatic:

```ts
// Developer defines access rules (unchanged from today):
const access = defineAccess({
  entities: { workspace: { roles: ['owner', 'member'] } },
  entitlements: {
    'task:read': { roles: ['member'] },
    'task:update': (r) => ({
      roles: ['member'],
      rules: [r.where({ createdBy: r.user.id })],
    }),
  },
});

// Developer creates entities (unchanged):
const tasksEntity = entity('tasks', {
  model: tasksModel, // has tenantId column → tenantScoped: true auto
  access: {
    list: rules.entitlement('task:read'),
    update: rules.all(
      rules.entitlement('task:update'),
      rules.where({ createdBy: rules.user.id }),
    ),
  },
});

// Developer creates server (unchanged):
const server = createServer({
  entities: [tasksEntity],
  db: createDb({ url: process.env.DATABASE_URL, models }),
  auth: { access, /* ... */ },
});

// Developer runs: vertz db migrate
// → Codegen reads defineAccess() + entity definitions
// → Generates RLS policy specs from rules.where() + tenantScoped
// → Feeds specs to migrateDev() internally
// → Migration SQL includes both schema DDL and RLS policies
// → Developer writes ZERO SQL. Zero configuration.

// At runtime: request pipeline automatically wraps Postgres entity
// operations in transactions with SET LOCAL for session variables.
// Developer code is unchanged.
```

### 2. Internal: RLS migration integration

The `migrateDev()` function accepts an optional `rlsPolicies` parameter (constructed by codegen, never by developers):

```ts
// Internal interface — constructed by codegen pipeline, consumed by migrateDev()
interface RlsPolicyInput {
  tables: Record<string, {
    enableRls: true;
    policies: RlsPolicy[];
  }>;
}

interface RlsPolicy {
  name: string;
  for: 'ALL' | 'SELECT' | 'INSERT' | 'UPDATE' | 'DELETE';
  using: string;
  withCheck?: string; // For INSERT/UPDATE — validates new row values
}
```

### 3. Internal: RLS policy snapshot and diffing

```ts
// RLS snapshot captures current policy state (like schema snapshot):
interface RlsSnapshot {
  version: 1;
  tables: Record<string, {
    rlsEnabled: boolean;
    policies: RlsPolicy[];
  }>;
}

// Diff detects: added/removed/changed policies, RLS enable/disable
// Generates: CREATE POLICY, DROP POLICY, ALTER TABLE ... ENABLE/DISABLE ROW LEVEL SECURITY
// A missing/undefined RlsSnapshot is treated as empty (no policies) — not as "unknown state"
```

### 4. Internal: Policy classification in the codegen pipeline

```ts
// The RLS generator classifies policies by source:
//
// 1. TENANT ISOLATION (always RLS) — from tenantScoped entities
//    → USING: tenant_id = current_setting('app.tenant_id')::UUID
//    → WITH CHECK: tenant_id = current_setting('app.tenant_id')::UUID (for INSERT)
//    → Generated as FOR ALL (Postgres uses USING as implicit WITH CHECK for FOR ALL)
//
// 2. OWNERSHIP (RLS for defense-in-depth) — from rules.where({ ownerId: rules.user.id })
//    → Per-operation policies when different operations have different where rules
//    → e.g., FOR SELECT vs FOR UPDATE with different conditions
//
// 3. DYNAMIC (application-layer only, NOT RLS) — plan/entitlement checks
//    → Skipped in RLS generation (depend on runtime state)
//    → Codegen emits diagnostic: "Skipped: plan-gated entitlement 'x' — not suitable for RLS"

// Codegen output:
interface ClassifiedPolicy {
  kind: 'tenant_isolation' | 'ownership';
  table: string;  // From entity.model.table._name (NOT inferred from entitlement string)
  name: string;
  for: 'ALL' | 'SELECT' | 'INSERT' | 'UPDATE' | 'DELETE';
  using: string;
  withCheck?: string;
}
```

### 5. Internal: Per-request transaction scoping

```ts
// DatabaseClient gains a withSessionVars method (Postgres-only).
// This is an internal API — not called by developers.
interface DatabaseClient {
  // ... existing methods ...

  /**
   * Creates a request-scoped transaction with SET LOCAL for session variables.
   * Uses sql.unsafe() for SET LOCAL (Postgres does not support parameterized SET).
   * Values are UUID-validated before interpolation to prevent SQL injection.
   * Returns a pass-through for non-Postgres databases (no-op).
   */
  withSessionVars(ctx: {
    tenantId?: string | null;
    userId?: string | null;
  }): RequestScopedDb;
}

interface RequestScopedDb {
  /** Execute a callback within the request transaction. */
  execute<T>(fn: (queryFn: QueryFn) => Promise<T>): Promise<T>;
}
```

### 6. Integration with bridge adapter lifecycle

The current architecture creates bridge adapters once at startup. For RLS, we need per-request transaction scoping. The approach:

```ts
// In route-generator.ts, when dialect is Postgres and entity has RLS policies:
//
// 1. The route handler receives the request context (tenantId, userId)
// 2. It calls db.withSessionVars({ tenantId, userId })
// 3. The returned RequestScopedDb wraps sql.begin() with SET LOCAL
// 4. Inside the transaction, a per-request bridge adapter is created
//    from the transaction-scoped QueryFn (same as db.transaction() today)
// 5. CrudHandlers are called with this per-request adapter

// Simplified flow:
async function handleListRequest(ctx: EntityContext) {
  const scoped = dbClient.withSessionVars({
    tenantId: ctx.tenantId,
    userId: ctx.userId,
  });

  return scoped.execute(async (txQueryFn) => {
    // Per-request bridge adapter from transaction QueryFn
    const txAdapter = createDatabaseBridgeAdapter(txQueryFn, modelKey);
    const handlers = createCrudHandlers(entityDef, txAdapter, options);
    return handlers.list(ctx, listOptions);
  });
}

// For non-Postgres or non-RLS entities: existing path unchanged.
// The route generator conditionally uses the scoped path.
```

**Tradeoff:** Each CRUD operation gets its own transaction + SET LOCAL. If a request handler calls multiple entity operations (e.g., via `ctx.entities`), each gets a separate transaction. This is correct for isolation but adds per-operation overhead. Batching multiple operations into a single transaction is a future optimization.

## Manifesto Alignment

- **If it builds, it works** — RLS policies are derived from the same `defineAccess()` + `rules.*` descriptors that govern application-layer access. If the code compiles and the access rules are defined, the database enforces them. No manual SQL to keep in sync.

- **One way to do things** — One access definition (`defineAccess()`) drives both application-layer enforcement AND database-level RLS. Developers don't write SQL policies separately. One source of truth.

- **AI agents are first-class users** — The RLS pipeline is fully automatic: define access rules → run migration → policies applied. No manual steps for an LLM agent to forget. `rules.*` descriptors are the same API regardless of whether enforcement is app-level or DB-level.

- **If you can't test it, don't build it** — Every component is testable in isolation: policy generation (unit tests with SQL assertions), policy diffing (snapshot comparison), session variable injection (transaction integration tests), end-to-end tenant isolation (cross-tenant query tests).

- **Performance is not optional** — `SET LOCAL` scoped to transactions is the standard Postgres RLS pattern. Per-request overhead is 1x `BEGIN` + 2x `SET LOCAL` + 1x `COMMIT` (~2-4ms on localhost, ~5-20ms over network). Connection pooling works correctly because `SET LOCAL` is transaction-scoped. Only Postgres + RLS-enabled entities pay this cost.

## Non-Goals

- **Dynamic policy management at runtime** — Policies are static, deployed via migrations. No runtime `CREATE POLICY` or policy hot-reloading.
- **SQLite RLS** — SQLite does not support RLS. Tenant isolation on SQLite remains application-layer only (existing WHERE clause injection). This design is Postgres-only for the RLS pipeline.
- **Cloudflare D1 RLS** — D1 has no RLS support. Same as SQLite — application-layer only.
- **RLS for entitlement/plan checks** — Dynamic policies (plan-gated features, runtime entitlements) are application-layer concerns. RLS handles hard isolation (tenant, ownership) only.
- **Bypass user for migrations** — The migration runner uses a superuser role. RLS policies don't apply to table owners. This is standard Postgres practice.
- **Custom RLS policy SQL** — Developers don't write raw SQL policies. All policies are derived from `defineAccess()` + `rules.*` descriptors.

## Unknowns

1. **Hyperdrive compatibility** — Cloudflare Hyperdrive pools connections. `SET LOCAL` is transaction-scoped, so it should be safe. But we need to verify Hyperdrive doesn't interfere with `sql.begin()` transaction boundaries. **Resolution: investigate during Phase 4, document if limitations exist.**

2. **Policy naming conflicts** — Multiple entities can reference the same table (admin entity pattern). Policy names are derived from table name + entitlement. Need to ensure uniqueness. **Resolution: use `{table}_{entitlement}_{operation}` pattern, dedup in generator.**

## Type Flow Map

```
defineAccess({ entitlements: { 'task:update': (r) => ({ roles: ['member'], rules: [r.where({ createdBy: r.user.id })] }) } })
  ↓
AccessAnalyzer.analyze()
  ↓
AccessIR.whereClauses: [{ entitlement: 'task:update', conditions: [{ kind: 'marker', column: 'createdBy', marker: 'user.id' }] }]
  ↓
RlsPolicyGenerator.generate(ir)
  ↓
RlsPolicySpec: { table: 'tasks', name: 'tasks_owner_update', using: "created_by = current_setting('app.user_id')::UUID" }
  ↓
migrateDev({ rlsPolicies: RlsPolicySpec })
  ↓
RlsDiffer.diff(previousSnapshot.rls, currentPolicies)
  ↓
DiffChange[]: [{ type: 'policy_added', table: 'tasks', policy: { name: 'tasks_owner_update', ... } }]
  ↓
generateRlsMigrationSql(changes)
  ↓
SQL: "ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;\nCREATE POLICY tasks_owner_update ON tasks FOR ALL USING (created_by = current_setting('app.user_id')::UUID);"

--- Request flow ---

Request with JWT { userId: 'u1', tenantId: 't1' }
  ↓
SessionMiddleware → ctx.userId = 'u1', ctx.tenantId = 't1'
  ↓
CRUD pipeline: entity.tenantScoped === true && dialect === 'postgres' && hasRlsPolicies
  ↓
db.withSessionVars({ tenantId: 't1', userId: 'u1' })
  ↓
UUID validation: /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  ↓
postgres sql.begin(async (txSql) => {
  // MUST use txSql.unsafe() — Postgres does not support parameterized SET statements.
  // Values are UUID-validated before interpolation to prevent SQL injection.
  await txSql.unsafe(`SET LOCAL app.tenant_id = '${tenantId}'`)
  await txSql.unsafe(`SET LOCAL app.user_id = '${userId}'`)
  // All queries in this callback run on the same transaction-scoped connection.
  // SET LOCAL is automatically cleared on COMMIT/ROLLBACK.
  // ... entity query executes with RLS active ...
})
```

## E2E Acceptance Test

```ts
describe('Feature: RLS pipeline — end-to-end tenant isolation', () => {
  describe('Given a Postgres database with tasks entity (tenantScoped)', () => {
    describe('When RLS migration is generated from defineAccess()', () => {
      it('Then migration SQL includes ALTER TABLE tasks ENABLE ROW LEVEL SECURITY', () => {
        // Generate migration from access rules
        // Assert SQL contains ENABLE ROW LEVEL SECURITY
      });

      it('Then migration SQL includes tenant isolation policy', () => {
        // Assert CREATE POLICY with tenant_id = current_setting('app.tenant_id')
      });
    });

    describe('When migration is applied and request is made as tenant-A user', () => {
      it('Then SET LOCAL app.tenant_id is called with tenant-A ID', () => {
        // Spy on transaction to verify SET LOCAL is issued
      });

      it('Then SELECT returns only tenant-A rows (RLS enforced)', () => {
        // Insert tasks for tenant-A and tenant-B
        // Query as tenant-A user
        // Assert only tenant-A tasks returned
        // This is enforced by Postgres RLS, not application WHERE
      });
    });

    describe('When tenant-A user tries to access tenant-B task by ID', () => {
      it('Then returns null/404 (RLS prevents row access)', () => {
        // Direct SELECT by ID is blocked by RLS policy
      });
    });
  });

  describe('Given policy diffing', () => {
    describe('When an access rule is added', () => {
      it('Then diff generates CREATE POLICY', () => {});
    });

    describe('When an access rule is removed', () => {
      it('Then diff generates DROP POLICY', () => {});
    });

    describe('When an access rule condition changes', () => {
      it('Then diff generates DROP + CREATE POLICY', () => {});
    });

    describe('When no access rules change', () => {
      it('Then diff generates no policy SQL', () => {});
    });
  });

  describe('Given SET LOCAL per-request scoping', () => {
    describe('When request has both tenantId and userId', () => {
      it('Then both app.tenant_id and app.user_id are set in transaction', () => {});
    });

    describe('When request has no tenantId (unauthenticated or no tenant)', () => {
      it('Then SET LOCAL is not called (no transaction wrapping)', () => {});
    });

    describe('When entity is not tenantScoped', () => {
      it('Then no RLS transaction wrapping occurs', () => {});
    });
  });

  describe('Given entity with rules.where({ ownerId: rules.user.id })', () => {
    describe('When RLS policies are generated', () => {
      it('Then includes ownership policy: owner_id = current_setting("app.user_id")', () => {});
    });

    describe('When non-owner queries the entity', () => {
      it('Then RLS blocks access (defense-in-depth with app-layer check)', () => {});
    });
  });

  describe('Given entity with plan-gated entitlement', () => {
    describe('When RLS policies are generated', () => {
      it('Then plan-gated conditions are NOT included in RLS (app-layer only)', () => {});
    });
  });
});
```

## Security

### SQL injection prevention for SET LOCAL

`SET LOCAL` does not support parameterized queries (`$1` placeholders). The session variable values (tenantId, userId) must be string-interpolated. To prevent SQL injection:

1. **UUID validation** — Both `tenantId` and `userId` are validated against `/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i` before interpolation. Any value that doesn't match is rejected with an error — the `SET LOCAL` is never issued.
2. **Single-quote escaping** — As defense-in-depth, values are passed through `value.replace(/'/g, "''")` before interpolation.
3. **`txSql.unsafe()` usage** — `SET LOCAL` is issued via `txSql.unsafe()` (postgres.js raw SQL), not via tagged template (which would fail with a Postgres syntax error).

### RLS bypass role detection

Postgres RLS policies are silently ignored for table owners (they have implicit `BYPASSRLS`). If the application's database connection role owns the tables, RLS provides zero protection — a false sense of security.

The framework detects this at startup:
1. On first `withSessionVars()` call, query `SELECT rolbypassrls FROM pg_roles WHERE rolname = current_user`.
2. If `rolbypassrls = true`, emit a **warning**: `"[vertz] WARNING: Database role '<role>' has BYPASSRLS privilege. RLS policies will NOT be enforced. Create a separate application role without BYPASSRLS."`
3. This check is cached (once per DatabaseClient lifetime).

This is documented in the RLS guide with instructions for creating a separate application role.

### SET LOCAL must be inside a transaction

`SET LOCAL` only takes effect within a transaction. Outside a transaction, it silently does nothing. The `withSessionVars()` implementation enforces this invariant by always using `sql.begin()` — there is no code path where `SET LOCAL` is issued without a transaction.

## Developer-Facing Errors

| Scenario | Error/Warning | When |
|----------|---------------|------|
| DB role has BYPASSRLS | Warning at startup: "RLS policies will NOT be enforced. Create separate application role." | First `withSessionVars()` call |
| `tenantId`/`userId` fails UUID validation | Error: "Invalid UUID for SET LOCAL: '<value>'. Session variables must be valid UUIDs." | Per-request, before SET LOCAL |
| `defineAccess()` where condition references non-existent column | Codegen error: "Column '<col>' in rules.where() not found in entity '<entity>' model." | `vertz db migrate` / codegen time |
| Policy skipped (plan-gated) | Codegen info: "Skipped RLS for entitlement '<x>': plan-gated conditions are app-layer only." | Codegen time |
| RLS migration applied | CLI output: "Adding tenant isolation policy to '<table>'. Adding ownership policy '<name>' to '<table>'." | `vertz db migrate` |

## Implementation Plan

### Phase 1: RLS policy snapshot and diffing

**Goal:** Introduce `RlsSnapshot` type and a differ that computes add/remove/change for RLS policies. Generate SQL for policy changes.

**Changes:**
- `packages/db/src/migration/rls-snapshot.ts` — `RlsSnapshot` type, `RlsTablePolicies`, `RlsPolicy`
- `packages/db/src/migration/rls-differ.ts` — `diffRlsPolicies(previous, current)` → `RlsDiffChange[]`
- `packages/db/src/migration/rls-sql-generator.ts` — `generateRlsMigrationSql(changes)` → SQL string
- Extend `SchemaSnapshot` to optionally include `rls?: RlsSnapshot`

**Acceptance criteria:**
```ts
describe('Feature: RLS policy diffing', () => {
  describe('Given no previous RLS snapshot and a current snapshot with tenant policy', () => {
    describe('When diffRlsPolicies() is called', () => {
      it('Then returns rls_enabled change for the table', () => {});
      it('Then returns policy_added change with correct policy definition', () => {});
    });
  });

  describe('Given previous and current snapshots with same policies', () => {
    describe('When diffRlsPolicies() is called', () => {
      it('Then returns empty changes array', () => {});
    });
  });

  describe('Given previous snapshot with policy removed in current', () => {
    describe('When diffRlsPolicies() is called', () => {
      it('Then returns policy_removed change', () => {});
    });
  });

  describe('Given policy with changed USING clause', () => {
    describe('When diffRlsPolicies() is called', () => {
      it('Then returns policy_changed change (drop + create)', () => {});
    });
  });

  describe('Given RLS diff changes', () => {
    describe('When generateRlsMigrationSql() is called', () => {
      it('Then generates ALTER TABLE ... ENABLE ROW LEVEL SECURITY for new tables', () => {});
      it('Then generates CREATE POLICY with correct USING clause', () => {});
      it('Then generates DROP POLICY for removed policies', () => {});
      it('Then generates ALTER TABLE ... DISABLE ROW LEVEL SECURITY when all policies removed', () => {});
    });
  });
});
```

### Phase 2: Integrate RLS policies into `migrateDev()`

**Goal:** `migrateDev()` accepts RLS policy definitions and generates combined schema + RLS migrations. This phase defines the `RlsPolicyInput` interface that Phase 3's codegen generator will produce.

**Depends on:** Phase 1 (uses RLS snapshot types and differ)

**Changes:**
- `packages/db/src/cli/migrate-dev.ts` — extend `MigrateDevOptions` with `rlsPolicies?: RlsPolicyInput`, call RLS differ, append RLS SQL to migration
- `packages/db/src/migration/rls-snapshot.ts` — export `RlsPolicyInput` type (the contract between codegen and migration system)
- `packages/db/src/migration/snapshot.ts` — extend `SchemaSnapshot` to persist `rls?: RlsSnapshot` section. A missing `rls` field is treated as empty (no policies), ensuring backward compatibility with existing snapshots.
- Extend snapshot write/read to include RLS state

**Acceptance criteria:**
```ts
describe('Feature: RLS integration in migrateDev', () => {
  describe('Given schema changes + RLS policies', () => {
    describe('When migrateDev() is called', () => {
      it('Then generated SQL includes both DDL and RLS statements', () => {});
      it('Then snapshot includes RLS policy state', () => {});
    });
  });

  describe('Given only RLS policy changes (no schema changes)', () => {
    describe('When migrateDev() is called', () => {
      it('Then generates migration with only RLS statements', () => {});
    });
  });

  describe('Given schema changes but no RLS policies', () => {
    describe('When migrateDev() is called', () => {
      it('Then behaves exactly as before (no RLS SQL)', () => {});
    });
  });

  describe('Given previous snapshot without rls field (old format)', () => {
    describe('When migrateDev() is called with rlsPolicies', () => {
      it('Then treats previous RLS state as empty and generates all policies as new', () => {});
    });
  });
});
```

### Phase 3: Enhanced RLS policy generator with classification

**Goal:** The codegen RLS generator classifies policies by source (tenant isolation vs ownership) and outputs structured `RlsPolicyInput` (defined in Phase 2) for the migration system.

**Depends on:** Phase 2 (implements the `RlsPolicyInput` interface defined in Phase 2)

**Changes:**
- `packages/codegen/src/generators/rls-policy-generator.ts` — refactor to output structured `RlsPolicyInput` (not just raw SQL), classify policies, skip dynamic/plan-gated conditions, emit diagnostic for skipped policies
- `packages/codegen/src/types.ts` — add `RlsPolicyInput` to `GeneratedFile` or as separate output
- **Table names from model**: use `entity.model.table._name` for the policy table name, NOT the naive `toSnakeCase(entity) + 's'` pattern from the current generator
- Auto-generate tenant isolation policies for entities with `tenantScoped: true` even if no explicit `rules.where()` is defined
- Generate per-operation policies (e.g., `FOR SELECT`, `FOR UPDATE`) when different operations have different where rules, rather than always `FOR ALL`
- Validate that where condition columns exist in the entity model at codegen time (emit error if column not found)

**Acceptance criteria:**
```ts
describe('Feature: RLS policy classification', () => {
  describe('Given entity with tenantScoped: true', () => {
    describe('When RLS policies are generated', () => {
      it('Then includes tenant_isolation policy for the table', () => {});
      it('Then policy kind is "tenant_isolation"', () => {});
      it('Then table name comes from model.table._name (not inferred from entitlement)', () => {});
    });
  });

  describe('Given defineAccess with rules.where({ ownerId: rules.user.id })', () => {
    describe('When RLS policies are generated', () => {
      it('Then includes ownership policy', () => {});
      it('Then policy kind is "ownership"', () => {});
    });
  });

  describe('Given different where rules on list vs update', () => {
    describe('When RLS policies are generated', () => {
      it('Then generates separate per-operation policies (FOR SELECT, FOR UPDATE)', () => {});
    });
  });

  describe('Given defineAccess with plan-gated entitlement', () => {
    describe('When RLS policies are generated', () => {
      it('Then plan-gated conditions are excluded from RLS output', () => {});
      it('Then emits diagnostic message explaining why it was skipped', () => {});
    });
  });

  describe('Given entitlement inside rules.any()', () => {
    describe('When RLS policies are generated', () => {
      it('Then where conditions inside any() are excluded (false positives)', () => {});
    });
  });

  describe('Given where condition referencing non-existent column', () => {
    describe('When RLS policies are generated', () => {
      it('Then emits codegen error with column and entity names', () => {});
    });
  });
});
```

### Phase 4: Per-request transaction scoping with SET LOCAL

**Goal:** The CRUD pipeline wraps Postgres entity operations in a transaction with `SET LOCAL app.tenant_id` and `SET LOCAL app.user_id`. Includes UUID validation, `txSql.unsafe()` for SET LOCAL, bypass role detection, and bridge adapter integration.

**Depends on:** None (independent of Phase 1-3)

**Changes:**
- `packages/db/src/client/database.ts` — add `withSessionVars()` method on `DatabaseClient` that returns a request-scoped transaction wrapper. Postgres-only; returns pass-through for SQLite/D1.
- `packages/db/src/client/request-scope.ts` — new file: UUID validation, `createRequestScope()` that wraps `sql.begin()` + `txSql.unsafe('SET LOCAL ...')` + callback. Also implements bypass role detection (cached per client lifetime).
- `packages/db/src/adapters/database-bridge-adapter.ts` — add factory overload that accepts a `QueryFn` (from transaction) to create per-request adapters
- `packages/server/src/entity/route-generator.ts` — when dialect is Postgres and entity is tenant-scoped, route handler calls `db.withSessionVars()`, creates per-request bridge adapter from the transaction QueryFn, and runs CRUD handlers within that scope

**Acceptance criteria:**
```ts
describe('Feature: Per-request SET LOCAL scoping', () => {
  describe('Given a Postgres DatabaseClient', () => {
    describe('When withSessionVars({ tenantId, userId }) is called', () => {
      it('Then execute() wraps operations in BEGIN/SET LOCAL/COMMIT', () => {});
      it('Then app.tenant_id is set via txSql.unsafe() (not parameterized)', () => {});
      it('Then app.user_id is set via txSql.unsafe() (not parameterized)', () => {});
    });

    describe('When the operation throws', () => {
      it('Then ROLLBACK is called and error is propagated', () => {});
    });

    describe('When tenantId is null', () => {
      it('Then SET LOCAL app.tenant_id is not called', () => {});
    });

    describe('When tenantId is not a valid UUID', () => {
      it('Then throws Error with message about invalid UUID', () => {});
      it('Then SET LOCAL is never issued (SQL injection prevention)', () => {});
    });
  });

  describe('Given a SQLite DatabaseClient', () => {
    describe('When withSessionVars() is called', () => {
      it('Then returns a pass-through (no SET LOCAL for SQLite)', () => {});
    });
  });

  describe('Given database role has BYPASSRLS', () => {
    describe('When withSessionVars() is called for the first time', () => {
      it('Then emits a warning about RLS not being enforced', () => {});
    });
  });

  describe('Given CRUD pipeline with Postgres and tenantScoped entity', () => {
    describe('When a list() request is made with authenticated user', () => {
      it('Then the DB query runs inside a transaction with SET LOCAL', () => {});
    });
  });

  describe('Given two concurrent requests with different tenant IDs', () => {
    describe('When both execute simultaneously', () => {
      it('Then each sees only its own tenant data (connection isolation)', () => {});
    });
  });
});
```

### Phase 5: End-to-end integration and documentation

**Goal:** Wire all pieces together: codegen → migration → request pipeline. Add documentation.

**Depends on:** Phase 1, 2, 3, 4

**Changes:**
- Integration test: define entities with access rules → run codegen → generate migration → apply to test Postgres → make requests → verify RLS enforcement
- `packages/docs/` — document the RLS workflow: define access rules → generate migration → deploy → automatic enforcement. Include guide for creating a separate application role (non-owner) for RLS.
- Changeset files for `@vertz/db` and `@vertz/codegen`

**Acceptance criteria:**
```ts
describe('Feature: End-to-end RLS pipeline', () => {
  describe('Given defineAccess() with tenant and ownership rules', () => {
    describe('When codegen → migration → apply → request flow completes', () => {
      it('Then tenant-A user only sees tenant-A data', () => {});
      it('Then direct ID access across tenants returns null', () => {});
      it('Then ownership rules restrict within tenant', () => {});
    });
  });

  describe('Given idempotent migration pipeline', () => {
    describe('When vertz db migrate is run twice with no changes', () => {
      it('Then second run produces zero diff (no new migration)', () => {});
    });

    describe('When migration is applied, snapshot saved, and diff rerun', () => {
      it('Then snapshot round-trips correctly (apply → snapshot → diff = empty)', () => {});
    });
  });

  describe('Given database with manually-created RLS policies', () => {
    describe('When vertz db migrate runs for the first time', () => {
      it('Then framework policies are additive (does not drop unmanaged policies)', () => {});
    });
  });
});
```

## Dependencies

```
Phase 1 (snapshot/differ) ──→ Phase 2 (migrateDev integration) ──→ Phase 3 (codegen generator)
                                 │ defines RlsPolicyInput type        │ implements RlsPolicyInput
                                 │                                     │
Phase 4 (SET LOCAL) ─────────────┼─────────────────────────────────────┤
  (independent)                  │                                     │
                                 └─────────────────────────────────────→ Phase 5 (E2E + docs)
```

- **Phase 1** → no dependencies (new code: RLS snapshot types, differ, SQL generator)
- **Phase 2** → Phase 1 (uses RLS snapshot/differ). **Defines** the `RlsPolicyInput` interface.
- **Phase 3** → Phase 2 (implements the `RlsPolicyInput` interface that Phase 2 defines and consumes)
- **Phase 4** → no dependencies (independent transaction/SET LOCAL work)
- **Phase 5** → Phase 2, 3, 4 (integration, E2E tests, documentation)

Phases 1→2→3 and Phase 4 can be worked on in parallel.

## Design Decisions

### D1. `SET LOCAL` over `SET` for session variables

`SET LOCAL` scopes the setting to the current transaction. This is critical for connection pooling safety. A plain `SET` would persist on the connection after the transaction ends, potentially leaking tenant context to the next request that gets the same pooled connection.

### D2. Unified migration (Option A from the issue)

We chose to integrate RLS policies into `migrateDev()` rather than a separate `vertz db policies` command. Rationale:
- **One migration = one atomic unit** — schema changes and policy changes are applied together, preventing states where the table exists but policies don't (or vice versa).
- **One command for developers** — `vertz db migrate` handles everything. No second command to remember.
- **Policy diffing uses the same snapshot pattern** — consistent with how schema changes work.

### D3. Postgres-only for RLS, application-layer for SQLite/D1

RLS is a Postgres feature. SQLite and D1 don't support it. The existing WHERE clause injection (application-layer) continues to work for all databases. RLS adds defense-in-depth for Postgres users but is not required for correctness — the application layer already enforces tenant isolation.

### D4. Classify policies: hard isolation (RLS) vs dynamic (app-only)

Not all `rules.where()` conditions should become RLS policies. Plan-gated entitlements and dynamic feature flags can't be expressed as static Postgres policies because they depend on runtime state (subscription status, feature flag evaluation). Only hard isolation (tenant_id, user_id) becomes RLS.

### D5. Separate tenant isolation from ownership policies

Tenant isolation policies (WHERE tenant_id = ...) are always generated for `tenantScoped` entities, even without explicit `rules.where()`. This mirrors the framework's auto-scoping behavior. Ownership policies (WHERE created_by = ...) are generated from explicit `rules.where()` conditions with `rules.user.id` markers.

### D6. `USING` as implicit `WITH CHECK` for `FOR ALL` policies

For `FOR ALL` policies, Postgres uses the `USING` expression as the implicit `WITH CHECK` when `WITH CHECK` is not specified. This means:
- Tenant isolation with `FOR ALL USING (tenant_id = current_setting('app.tenant_id')::UUID)` also prevents INSERT of rows with wrong tenant_id.
- Explicit `WITH CHECK` is only generated when the check condition differs from `USING` (e.g., different conditions for SELECT vs INSERT).

### D7. Transaction wrapping is opt-in per entity context

The CRUD pipeline only wraps in a transaction with SET LOCAL when:
1. The database is Postgres (dialect check)
2. The entity has RLS-relevant policies (tenant-scoped or explicit where rules)
3. The request has a user/tenant context

Non-Postgres databases, non-scoped entities, and unauthenticated requests skip the transaction wrapper entirely — zero overhead.
