# Indirect Tenant Scoping

**Status:** Design Draft
**Depends on:** PR #1120 (Tenant Isolation & Entity Access Descriptors — merged)
**Related:** `955-move-tenant-to-model.md` (model-level `{ tenant }` — implemented), `tenant-isolation-and-entity-access.md` (direct tenant scoping — implemented)

## Problem

Direct tenant scoping works: entities with a `tenantId` column are auto-filtered. But many entities are tenant-scoped *indirectly* through relation chains:

```
organizations (tenant root)
  └── projects (has organizationId → directly scoped ✅)
        └── tasks (has projectId, NO tenantId → NOT auto-scoped ❌)
              └── comments (has taskId, NO tenantId → NOT auto-scoped ❌)
```

Today, `tasks` and `comments` have no automatic tenant filtering. A user from org-A can read org-B's tasks and comments unless the developer manually adds filtering. This is a security gap — the framework already *knows* the relation chain (via `computeTenantGraph`), but doesn't act on it.

Asking developers to denormalize `tenantId` onto every table is wrong — it forces schema redundancy, creates consistency risks, and defeats the purpose of having relation-based tenant graph computation.

## Proposed Direction

The framework traces the relation chain from each indirectly scoped entity back to the tenant root and automatically generates subquery-based WHERE filters at query time.

### Developer Experience

```ts
const organizations = d.table('organizations', {
  id: d.uuid().primary(),
  name: d.text(),
});

const projects = d.table('projects', {
  id: d.uuid().primary(),
  organizationId: d.uuid(),
  name: d.text(),
});

const tasks = d.table('tasks', {
  id: d.uuid().primary(),
  projectId: d.uuid(),
  title: d.text(),
});

const comments = d.table('comments', {
  id: d.uuid().primary(),
  taskId: d.uuid(),
  body: d.text(),
});

const db = createDb({
  url: 'postgres://...',
  models: {
    organizations: d.model(organizations),
    projects: d.model(projects, {
      organization: d.ref.one(() => organizations, 'organizationId'),
    }, { tenant: 'organization' }),
    tasks: d.model(tasks, {
      project: d.ref.one(() => projects, 'projectId'),
    }),
    comments: d.model(comments, {
      task: d.ref.one(() => tasks, 'taskId'),
    }),
  },
});

// Developer writes NO tenant filtering code:
const tasksEntity = entity('tasks', {
  model: tasksModel,
  access: {
    list: rules.authenticated(),
    get: rules.authenticated(),
    create: rules.authenticated(),
  },
});

// Framework automatically:
// - Detects tasks is indirectly scoped via: tasks → projects → organizations
// - Generates: WHERE project_id IN (SELECT id FROM projects WHERE organization_id = $1)
// - Applies to list(), get(), update(), delete()
// - Validates on create() that the referenced project belongs to the tenant
```

**Zero config for the developer.** The framework detects the relation chain from the tenant graph and enforces it automatically.

### Generated SQL

**Single-hop (tasks → projects → organizations):**
```sql
-- list() for tasks
SELECT * FROM tasks
WHERE project_id IN (
  SELECT id FROM projects WHERE organization_id = $1
)
AND /* other where conditions */

-- get() for tasks
SELECT * FROM tasks
WHERE id = $1 AND project_id IN (
  SELECT id FROM projects WHERE organization_id = $2
)
```

**Multi-hop (comments → tasks → projects → organizations):**
```sql
-- list() for comments
SELECT * FROM comments
WHERE task_id IN (
  SELECT id FROM tasks WHERE project_id IN (
    SELECT id FROM projects WHERE organization_id = $1
  )
)
```

**Performance:** Subqueries with `IN (SELECT id FROM ... WHERE indexed_col = ?)` are well-optimized by Postgres — the query planner converts them to semi-joins. With indexes on FK columns (standard practice), this is O(log n) per hop.

## API Surface

### TenantChain — internal data structure

```ts
/** One hop in the relation chain from entity to tenant root. */
interface TenantChainHop {
  /** Target table name (e.g., 'projects') */
  readonly tableName: string;
  /** FK column on the current table (e.g., 'projectId') */
  readonly foreignKey: string;
  /** PK column on the target table (e.g., 'id') */
  readonly targetColumn: string;
}

/** Full chain from an indirectly scoped entity to the tenant root. */
interface TenantChain {
  /** Ordered hops from entity → ... → directly-scoped table */
  readonly hops: readonly TenantChainHop[];
  /** The tenant FK column on the final hop's target table (e.g., 'organizationId') */
  readonly tenantColumn: string;
}
```

For comments → tasks → projects → organizations:
```ts
{
  hops: [
    { tableName: 'tasks', foreignKey: 'taskId', targetColumn: 'id' },
    { tableName: 'projects', foreignKey: 'projectId', targetColumn: 'id' },
  ],
  tenantColumn: 'organizationId',
}
```

### EntityDefinition — extended

```ts
interface EntityDefinition<TModel extends ModelDef = ModelDef> {
  // ... existing fields ...
  readonly tenantScoped: boolean;
  /** Relation chain for indirect tenant scoping. Null for direct or unscoped. */
  readonly tenantChain: TenantChain | null;
}
```

### EntityDbAdapter — extended with tenant subquery support

```ts
interface ListOptions {
  where?: Record<string, unknown>;
  orderBy?: Record<string, 'asc' | 'desc'>;
  limit?: number;
  after?: string;
  /** Tenant subquery filter for indirectly scoped entities */
  tenantSubquery?: TenantSubquery;
}

interface TenantSubquery {
  /** The chain of hops to follow */
  chain: TenantChain;
  /** The resolved tenant ID value */
  tenantId: string;
}
```

### No changes to developer-facing API

The developer writes the same `entity()` definition. The framework detects and applies indirect scoping automatically. The only new config is an explicit opt-out:

```ts
entity('audit-logs', {
  model: auditLogsModel,
  tenantScoped: false, // explicit: this entity is intentionally cross-tenant
});
```

## Manifesto Alignment

- **If it builds, it works** — indirect tenant isolation is automatic when relations exist. The developer can't accidentally expose cross-tenant data.
- **Convention over configuration** — relation chain → auto-scoped. No config needed. `tenantScoped: false` for explicit opt-out.
- **Compiler sees everything** — the tenant graph is computed from relation metadata at startup. The framework knows the full path before any request is served.

## Non-Goals

- **RLS generation** — application-level enforcement only. RLS is a future optimization.
- **Cross-database tenant chains** — all tables in the chain must be in the same database.
- **Many-to-many relation chains** — tenant chains follow `ref.one` relations only (FK ownership). Many-to-many through join tables are not valid tenant paths.
- **Dynamic tenant chains** — the chain is computed at startup from static schema metadata. It doesn't change at runtime.

## Unknowns

1. **Performance of deep chains (3+ hops)** — nested subqueries are well-optimized by Postgres for indexed FKs, but should be validated with a benchmark on a realistic dataset. **Resolution:** POC in Phase 2 with a 3-hop chain and 100k rows per table.

2. **In-memory DB adapter** — the simple `EntityDbAdapter` used in tests doesn't execute SQL. Indirect filtering for in-memory adapters needs a JS-level implementation that walks the chain. **Resolution:** The in-memory adapter follows FK references in-memory (lookup by ID). Phase 2 covers this.

## Type Flow Map

```
createDb({ models: { tasks: d.model(tasks, { project: d.ref.one(...) }) } })
  ↓ computeTenantGraph()
  ↓ tenantGraph.indirectlyScoped = ['tasks']
createServer({ entities: [tasksEntity], db })
  ↓ resolveTenantChain(entityDef, db._internals.tenantGraph, db._internals.models)
  ↓ tenantChain = { hops: [{ tableName: 'projects', foreignKey: 'projectId', targetColumn: 'id' }], tenantColumn: 'organizationId' }
  ↓ stored on entityDef.tenantChain
createDatabaseBridgeAdapter(db, 'tasks', tenantChain)
  ↓ list({ where, tenantSubquery: { chain, tenantId: ctx.tenantId } })
  ↓ buildTenantSubquery(chain, tenantId)
  ↓ SQL: WHERE project_id IN (SELECT id FROM projects WHERE organization_id = $1)
```

## E2E Acceptance Test

```ts
describe('Feature: Indirect tenant scoping', () => {
  // Schema: organizations → projects → tasks → comments
  // Only projects has { tenant: 'organization' }
  // Tasks and comments are indirectly scoped

  describe('Given tasks entity (indirect via projects)', () => {
    describe('When org-A user lists tasks', () => {
      it('Then returns only tasks whose project belongs to org-A', () => {
        // Create: org-A → project-A → task-A
        //         org-B → project-B → task-B
        // GET /tasks as org-A user → only task-A
      });
    });

    describe('When org-A user GETs a task from org-B project', () => {
      it('Then returns 404 (not 403)', () => {});
    });

    describe('When org-A user creates a task on org-A project', () => {
      it('Then succeeds', () => {});
    });

    describe('When org-A user creates a task on org-B project', () => {
      it('Then returns 403 (parent entity not in tenant)', () => {});
    });
  });

  describe('Given comments entity (multi-hop: comments → tasks → projects)', () => {
    describe('When org-A user lists comments', () => {
      it('Then returns only comments on tasks in org-A projects', () => {});
    });
  });

  describe('Given entity with tenantScoped: false and indirect relations', () => {
    describe('When listing', () => {
      it('Then no tenant filtering applied despite relation chain existing', () => {});
    });
  });
});
```

## Implementation Plan

### Phase 1: TenantChain resolution at entity registration

**Goal:** Compute the relation chain from each indirectly scoped entity back to the tenant root. Store on EntityDefinition.

**Changes:**
- `packages/server/src/entity/tenant-chain.ts` (new) — `resolveTenantChain(entityName, tenantGraph, modelRegistry)` function
  - Walks from the entity's model through relations until it reaches a directly-scoped or root table
  - Returns `TenantChain | null`
  - Throws if entity is `indirectlyScoped` but chain can't be resolved (broken relation)
- `packages/server/src/entity/types.ts` — add `TenantChain` and `TenantChainHop` types, add `tenantChain: TenantChain | null` to `EntityDefinition`
- `packages/server/src/entity/entity.ts` — accept `tenantChain` in entity construction (set by createServer, not by developer)
- `packages/server/src/create-server.ts` — when `db` is a DatabaseClient, resolve tenant chains for all entities and pass to entity construction

**Acceptance criteria:**
```ts
describe('Given tasks model with project relation to directly-scoped projects', () => {
  describe('When resolveTenantChain is called', () => {
    it('Then returns chain with one hop: tasks.projectId → projects.id', () => {});
    it('Then tenantColumn is organizationId', () => {});
  });
});

describe('Given comments model (multi-hop through tasks)', () => {
  describe('When resolveTenantChain is called', () => {
    it('Then returns chain with two hops', () => {});
  });
});

describe('Given directly-scoped entity', () => {
  describe('When resolveTenantChain is called', () => {
    it('Then returns null (handled by existing direct scoping)', () => {});
  });
});

describe('Given entity with tenantScoped: false', () => {
  describe('When resolveTenantChain is called', () => {
    it('Then returns null (explicitly opted out)', () => {});
  });
});
```

### Phase 2: List filtering via subquery in bridge adapter

**Goal:** The bridge adapter generates nested IN subqueries for list operations on indirectly scoped entities.

**Changes:**
- `packages/db/src/types/adapter.ts` — add `tenantSubquery?: TenantSubquery` to `ListOptions`
- `packages/db/src/sql/tenant-subquery.ts` (new) — `buildTenantSubquery(chain, tenantId)` generates the nested `IN (SELECT ...)` SQL
- `packages/db/src/adapters/database-bridge-adapter.ts` — when `tenantSubquery` is provided, merge the subquery SQL into the WHERE clause
- `packages/server/src/entity/crud-pipeline.ts` — for indirectly scoped entities, pass `tenantSubquery` in list options

**Acceptance criteria:**
```ts
describe('Given indirectly scoped tasks entity', () => {
  describe('When list() is called with tenant context', () => {
    it('Then DB query includes subquery: project_id IN (SELECT id FROM projects WHERE organization_id = $1)', () => {});
    it('Then only tasks from the current tenant are returned', () => {});
  });
});

describe('Given multi-hop comments entity', () => {
  describe('When list() is called', () => {
    it('Then DB query includes nested subquery through tasks and projects', () => {});
  });
});
```

### Phase 3: Get/Update/Delete with subquery verification

**Goal:** Single-row operations on indirectly scoped entities verify tenant ownership via the relation chain.

**Changes:**
- `packages/db/src/types/adapter.ts` — add optional `tenantSubquery` to get/update/delete methods (or use the existing WHERE clause pattern)
- `packages/server/src/entity/crud-pipeline.ts` — for `get()`, `update()`, `delete()` on indirectly scoped entities:
  - **Option A (subquery):** Add subquery to the SELECT/UPDATE/DELETE WHERE clause — single DB round trip
  - **Option B (verify after fetch):** Fetch the row, then follow one hop to verify parent belongs to tenant — two DB round trips but simpler
  - **Decision:** Option A for performance. The bridge adapter adds the subquery to all queries.

**Acceptance criteria:**
```ts
describe('Given indirectly scoped tasks entity', () => {
  describe('When get() is called for a task in another tenant', () => {
    it('Then returns 404', () => {});
  });
  describe('When update() is called for a task in another tenant', () => {
    it('Then returns 404', () => {});
  });
  describe('When delete() is called for a task in another tenant', () => {
    it('Then returns 404', () => {});
  });
});
```

### Phase 4: Create validation

**Goal:** On create for indirectly scoped entities, verify the referenced parent belongs to the current tenant.

**Changes:**
- `packages/server/src/entity/crud-pipeline.ts` — before `db.create()`:
  1. Read the first hop of the tenant chain (e.g., `projectId`)
  2. Fetch the parent entity (e.g., `SELECT * FROM projects WHERE id = $input.projectId`)
  3. Verify the parent belongs to the tenant (e.g., `projects.organizationId === ctx.tenantId`)
  4. If not, return 403 ("Referenced project does not belong to your tenant")

**Acceptance criteria:**
```ts
describe('Given indirectly scoped tasks entity', () => {
  describe('When creating a task with projectId belonging to current tenant', () => {
    it('Then succeeds', () => {});
  });
  describe('When creating a task with projectId belonging to another tenant', () => {
    it('Then returns 403 with clear error message', () => {});
  });
  describe('When creating a task with non-existent projectId', () => {
    it('Then returns 404 for the parent entity', () => {});
  });
});
```

### Phase 5: Startup warnings and in-memory adapter support

**Goal:** Warn developers about misconfigured entities. Support indirect filtering in test adapters.

**Changes:**
- `packages/server/src/create-server.ts` — at entity registration:
  - If entity is `indirectlyScoped` per tenant graph but has no tenant chain (broken relations), log: `[vertz] Entity "tasks" is reachable from tenant root via relations but relation chain could not be resolved. Check that all FK relations are defined.`
  - If entity has relations to scoped entities but is NOT in the tenant graph and has no `tenantScoped: false`, log: `[vertz] Entity "audit-logs" has no tenant scoping. Add tenantScoped: false if cross-tenant access is intentional.`
- In-memory adapter (`EntityDbAdapter` used in tests) — add JS-level chain traversal for `tenantSubquery` option. The in-memory adapter follows FK references in-memory.

**Acceptance criteria:**
```ts
describe('Given entity with broken relation chain', () => {
  it('Then logs warning at startup', () => {});
});
describe('Given unscoped entity with relation to scoped entity', () => {
  it('Then logs warning at startup', () => {});
});
describe('Given in-memory adapter with tenant subquery', () => {
  it('Then correctly filters indirectly scoped entities', () => {});
});
```

## Dependencies

- **Phase 1** → depends on `computeTenantGraph` (implemented in `@vertz/db`)
- **Phase 2** → depends on Phase 1 (needs tenant chain)
- **Phase 3** → depends on Phase 2 (same subquery mechanism)
- **Phase 4** → depends on Phase 1 (needs tenant chain for create validation)
- **Phase 5** → depends on Phases 1-4 (warnings reference all scoping modes)

## Design Decisions

### D1. Subquery WHERE, not JOINs

JOINs change the result set shape (duplicated rows for one-to-many) and complicate pagination. Subqueries (`WHERE fk IN (SELECT id FROM ...)`) preserve the flat result set and compose cleanly with existing WHERE conditions, pagination, and ordering.

### D2. Chain resolved at startup, not per-request

The relation chain is static — it comes from schema metadata. Computing it once at `createServer()` time and storing it on the entity definition avoids per-request overhead.

### D3. 403 on create, 404 on get/update/delete

For get/update/delete, cross-tenant rows return 404 (consistent with direct tenant scoping — no information leakage). For create, the developer explicitly provides a `projectId` — returning 404 would be confusing. Instead, 403 with a message like "Referenced project does not belong to your tenant" is clearer.

### D4. In-memory adapter support via JS traversal

Integration tests use in-memory adapters. Rather than forcing all tests to use a real DB, the in-memory adapter implements chain traversal in JS. This keeps tests fast while still exercising the tenant scoping logic.

## Integration Tests

Security-critical features require integration tests that exercise the full pipeline (schema → model → entity → server → HTTP). These live in `packages/integration-tests/src/__tests__/indirect-tenant-isolation.test.ts` using only public imports (`@vertz/server`, `@vertz/db`).

### Test Schema

```
organizations (tenant root)
  └── projects (organizationId → directly scoped, { tenant: 'organization' })
        └── tasks (projectId → indirectly scoped, 1-hop)
              └── comments (taskId → indirectly scoped, 2-hop)

feature-flags (.shared() — cross-tenant)
audit-logs (no tenant path — unscoped)
```

Two organizations seeded: `org-a` and `org-b`, each with projects, tasks, and comments.

### Single-hop indirect scoping (tasks → projects → organizations)

```ts
describe('Feature: Single-hop indirect tenant scoping (tasks)', () => {
  // --- LIST isolation ---
  describe('Given tasks in org-A projects and org-B projects', () => {
    describe('When org-A user lists tasks', () => {
      it('Then returns only tasks whose project belongs to org-A', () => {});
      it('Then org-B tasks are NOT visible', () => {});
    });
    describe('When org-B user lists tasks', () => {
      it('Then returns only tasks in org-B projects', () => {});
    });
  });

  // --- GET cross-tenant ---
  describe('Given a task in an org-B project', () => {
    describe('When org-A user GETs it by ID', () => {
      it('Then returns 404 (not 403) — no information leakage', () => {});
    });
    describe('When org-B user GETs it by ID', () => {
      it('Then returns 200 with the task', () => {});
    });
  });

  // --- UPDATE cross-tenant ---
  describe('Given a task in an org-B project', () => {
    describe('When org-A user tries to UPDATE it', () => {
      it('Then returns 404', () => {});
    });
    describe('When org-B user updates it', () => {
      it('Then returns 200 with updated data', () => {});
    });
  });

  // --- DELETE cross-tenant ---
  describe('Given a task in an org-B project', () => {
    describe('When org-A user tries to DELETE it', () => {
      it('Then returns 404', () => {});
    });
    describe('When org-B user deletes it', () => {
      it('Then returns 204', () => {});
    });
  });

  // --- CREATE validation ---
  describe('Given org-A user creating a task', () => {
    describe('When projectId belongs to org-A', () => {
      it('Then succeeds with 201', () => {});
    });
    describe('When projectId belongs to org-B', () => {
      it('Then returns 403 — parent entity not in tenant', () => {});
    });
    describe('When projectId does not exist', () => {
      it('Then returns 404 for the parent', () => {});
    });
  });

  // --- LIST with additional where filters ---
  describe('Given tasks with different statuses in org-A projects', () => {
    describe('When org-A user lists with where[status]=open', () => {
      it('Then returns only open tasks from org-A projects', () => {});
      it('Then total count reflects filtered results', () => {});
    });
  });

  // --- LIST with pagination ---
  describe('Given 5 tasks in org-A projects', () => {
    describe('When org-A user lists with limit=2', () => {
      it('Then returns 2 tasks with hasNextPage=true', () => {});
      it('Then nextCursor allows fetching the next page', () => {});
    });
  });

  // --- LIST with rules.where() access + indirect scoping ---
  describe('Given tasks with rules.all(authenticated(), where({ createdBy: user.id }))', () => {
    describe('When org-A user-1 lists tasks', () => {
      it('Then returns only tasks created by user-1 in org-A projects', () => {});
      it('Then tasks created by user-2 in org-A projects are NOT visible', () => {});
      it('Then tasks created by user-1 in org-B projects are NOT visible', () => {});
    });
  });
});
```

### Multi-hop indirect scoping (comments → tasks → projects → organizations)

```ts
describe('Feature: Multi-hop indirect tenant scoping (comments)', () => {
  describe('Given comments on tasks in org-A and org-B projects', () => {
    describe('When org-A user lists comments', () => {
      it('Then returns only comments on tasks in org-A projects', () => {});
      it('Then comments on org-B tasks are NOT visible', () => {});
    });
  });

  describe('Given a comment on an org-B task', () => {
    describe('When org-A user GETs it by ID', () => {
      it('Then returns 404', () => {});
    });
    describe('When org-A user tries to UPDATE it', () => {
      it('Then returns 404', () => {});
    });
    describe('When org-A user tries to DELETE it', () => {
      it('Then returns 404', () => {});
    });
  });

  describe('Given org-A user creating a comment', () => {
    describe('When taskId belongs to an org-A project', () => {
      it('Then succeeds', () => {});
    });
    describe('When taskId belongs to an org-B project', () => {
      it('Then returns 403', () => {});
    });
  });
});
```

### Mixed scoping modes (direct + indirect + unscoped + shared)

```ts
describe('Feature: Mixed scoping modes in same app', () => {
  // All entity types coexist in the same createServer() call

  describe('Given projects (direct), tasks (indirect), flags (shared), logs (unscoped)', () => {
    describe('When org-A user lists projects', () => {
      it('Then returns only org-A projects (direct scoping)', () => {});
    });
    describe('When org-A user lists tasks', () => {
      it('Then returns only tasks in org-A projects (indirect scoping)', () => {});
    });
    describe('When org-A user lists feature-flags', () => {
      it('Then returns ALL flags across tenants (shared)', () => {});
    });
    describe('When org-A user lists audit-logs (tenantScoped: false)', () => {
      it('Then returns ALL logs (explicitly unscoped)', () => {});
    });
  });
});
```

### Admin entity (tenantScoped: false) over indirectly scoped table

```ts
describe('Feature: Admin entity bypasses indirect tenant scoping', () => {
  describe('Given admin-tasks entity with tenantScoped: false, table: "tasks"', () => {
    describe('When admin user lists admin-tasks', () => {
      it('Then returns ALL tasks across all tenants', () => {});
    });
    describe('When regular tasks entity lists', () => {
      it('Then returns only tasks in current tenant projects', () => {});
    });
  });
});
```

### Edge cases and security scenarios

```ts
describe('Feature: Indirect tenant scoping edge cases', () => {
  // --- Null/missing tenant context ---
  describe('Given unauthenticated request (no tenantId in context)', () => {
    describe('When listing indirectly scoped tasks', () => {
      it('Then returns 403 (access denied, not unfiltered data)', () => {});
    });
  });

  // --- Orphaned rows (FK points to deleted parent) ---
  describe('Given a task whose project was deleted', () => {
    describe('When listing tasks', () => {
      it('Then orphaned task is NOT returned (subquery finds no matching parent)', () => {});
    });
    describe('When GETting the orphaned task by ID', () => {
      it('Then returns 404 (parent chain broken)', () => {});
    });
  });

  // --- FK spoofing on create ---
  describe('Given org-A user creating a task', () => {
    describe('When request body contains projectId from org-B', () => {
      it('Then returns 403 — FK validation catches cross-tenant reference', () => {});
    });
  });

  // --- Concurrent tenant data (interleaved creates) ---
  describe('Given concurrent creates from org-A and org-B users', () => {
    it('Then each task is only visible to its own tenant', async () => {
      // Create tasks from both tenants
      // List as org-A → only org-A tasks
      // List as org-B → only org-B tasks
      // No cross-contamination
    });
  });

  // --- Tenant switch with indirect entities ---
  describe('Given user switches from org-A to org-B', () => {
    describe('When listing tasks after switch', () => {
      it('Then returns only tasks in org-B projects', () => {});
      it('Then org-A tasks are no longer visible', () => {});
    });
  });

  // --- Deep chain with empty intermediate level ---
  describe('Given org-A has projects but no tasks', () => {
    describe('When org-A user lists comments', () => {
      it('Then returns empty list (not an error)', () => {});
    });
  });

  // --- Multiple relations to scoped tables ---
  describe('Given entity with two FK relations (e.g., assigneeId, reporterId both ref users)', () => {
    describe('When tenant chain follows the correct relation', () => {
      it('Then scoping uses the relation declared in the tenant path, not arbitrary FK', () => {});
    });
  });
});
```

### Full lifecycle integration test

```ts
describe('Feature: Multi-tenant lifecycle with indirect scoping', () => {
  it('Full lifecycle: create org → create project → create task → create comment → verify isolation', async () => {
    // 1. Create org-A project, org-B project (using shared DB)
    // 2. As org-A: create task on org-A project → 201
    // 3. As org-B: create task on org-B project → 201
    // 4. As org-A: create comment on org-A task → 201
    // 5. As org-B: create comment on org-B task → 201
    // 6. As org-A: list tasks → only org-A tasks
    // 7. As org-A: list comments → only comments on org-A tasks
    // 8. As org-A: GET org-B task → 404
    // 9. As org-A: GET org-B comment → 404
    // 10. As org-A: UPDATE org-B task → 404
    // 11. As org-A: DELETE org-B comment → 404
    // 12. As org-A: create task on org-B project → 403
    // 13. As org-A: create comment on org-B task → 403
    // 14. As org-A: update own task → 200
    // 15. As org-A: delete own comment → 204
    // 16. Verify org-B data is unaffected by org-A operations
  });
});
```
