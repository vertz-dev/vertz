# Tenant Isolation & Entity Access Descriptors

## Motivation

Two gaps exist in the current entity system:

1. **Entity access rules use raw functions** — the `rules.*` DSL exists (`@vertz/auth/rules`) with pure data descriptors (`RoleRule`, `EntitlementRule`, `WhereRule`, etc.), but entity access config still accepts `(ctx, row) => boolean` callbacks. Functions are opaque — they can't be inspected, serialized for the UI, or mapped to database-level policies.

2. **No automatic tenant isolation** — the CRUD pipeline does not auto-filter by tenant. `ctx.tenant()` only checks presence of `tenantId` (not match). A developer who writes `list: (ctx) => ctx.tenant()` unknowingly exposes all tenants' data. There is no `WHERE tenantId = ?` added automatically.

This design bridges the entity system to the `rules.*` descriptor infrastructure and adds automatic tenant scoping.

## Prerequisites

- `rules.*` builders exist in `packages/server/src/auth/rules.ts` (implemented)
- `defineAccess()` entity-centric redesign ~95% implemented — Layers 1-5 (flags, RBAC, plans, limits, roles) working. **Layer 6 (attribute rule evaluation — `where` descriptors) NOT yet implemented.** Layer 7 (FVA) partially stubbed. See `plans/access-redesign.md`.
- All stores implemented: ClosureStore, WalletStore, PlanStore, FlagStore, RoleAssignmentStore, OverrideStore (InMemory + DB variants)
- `createAccessContext()` with `can()`, `check()`, `authorize()`, `canBatch()`, `canAndConsume()` — all working
- Entity system with `enforceAccess()` in `packages/server/src/entity/access-enforcer.ts` (implemented — but only evaluates functions + PublicRule, NOT the full `rules.*` descriptor tree)
- CRUD pipeline in `packages/server/src/entity/crud-pipeline.ts` (implemented)

## API Surface

### Entity access with descriptors

```ts
import { rules } from '@vertz/auth/rules';

const usersEntity = entity('users', {
  model: usersModel,
  access: {
    list: rules.entitlement('user:read'),
    get: rules.entitlement('user:read'),
    create: rules.entitlement('user:create'),
    update: rules.all(
      rules.entitlement('user:update'),
      rules.where({ id: rules.user.id }), // own profile only
    ),
    delete: rules.entitlement('user:delete'),
  },
});
```

### Automatic tenant scoping

```ts
// Entity with tenantId field → tenantScoped: true by default
const tasksEntity = entity('tasks', {
  model: tasksModel, // has tenantId column
  // tenantScoped: true is inferred when model has tenantId field
  access: {
    list: rules.entitlement('task:read'),
    // Framework auto-adds: rules.where({ tenantId: rules.user.tenantId })
    // to ALL operations. Developer doesn't write it.
  },
});

// Explicit opt-out for cross-tenant entities
const templatesEntity = entity('system-templates', {
  model: templatesModel,
  tenantScoped: false, // explicitly cross-tenant
  access: {
    list: rules.public,
  },
});
```

### Admin entities (separate definitions, same table)

```ts
const adminUsersEntity = entity('admin-users', {
  table: 'users', // same underlying table
  basePath: '/admin/users',
  tenantScoped: false, // admin sees all tenants
  access: {
    list: rules.entitlement('admin:user:read'),
    get: rules.entitlement('admin:user:read'),
    update: rules.entitlement('admin:user:update'),
    delete: rules.all(
      rules.entitlement('admin:user:delete'),
      rules.fva(600), // require recent MFA for destructive admin actions
    ),
  },
});
```

### Session revalidation on tenant switch

```ts
// Client calls on tenant switch
const result = await api.auth.switchTenant({ tenantId: 'tenant-b' });
// → Server verifies membership, issues new JWT scoped to tenant-b
// → Client replaces token
// → Entity store is fully cleared (store.clear())
// → All active queries re-fetch with new tenant context
```

## Manifesto Alignment

- **If it builds, it works** — tenant isolation is automatic when `tenantId` exists. Forgetting to add tenant scoping is impossible; forgetting to opt OUT is caught immediately during testing (missing data).
- **Compiler sees everything** — access rules are data, not functions. The framework can inspect, compose, and optimize them.
- **Convention over configuration** — `tenantId` field → tenant-scoped. No config needed. Explicit `tenantScoped: false` for the exception.

## Non-Goals

- **RLS generation** — this design evaluates rules at the application layer. Compiling `where` rules to Postgres RLS policies is a future optimization, not a requirement.
- **Cross-entity access rules in entity config** — entity access rules are scoped to one entity. Cross-entity checks (e.g., "user is admin in the parent organization") are resolved by `defineAccess()` entitlements via role inheritance.
- **Billing/plans integration** — this design focuses on access descriptors and tenant isolation. Plan-gated entitlements are handled by the `defineAccess()` system (Phases 2+ of access-redesign.md).

## Type Flow Map

```
rules.entitlement('task:update')
  → { type: 'entitlement', entitlement: 'task:update' }
    → stored in EntityConfig.access.update
      → enforceAccess() receives the descriptor
        → evaluateRule() dispatches by type
          → type 'entitlement' → accessContext.can('task:update')
            → defineAccess() resolves role + plan + limits

rules.where({ createdBy: rules.user.id })
  → { type: 'where', conditions: { createdBy: { __marker: 'user.id' } } }
    → evaluateRule() receives descriptor + row + ctx
      → resolves markers: user.id → ctx.userId
      → checks: row.createdBy === ctx.userId

tenantScoped: true (inferred)
  → framework wraps ALL access rules with:
    rules.all(originalRule, rules.where({ tenantId: rules.user.tenantId }))
  → for 'list': adds WHERE tenantId = ? to the DB query directly
  → for 'get'/'update'/'delete': adds tenantId to the query + post-fetch check
```

## Design Decisions

### D1. Tenant filter is a query-level WHERE, not just a post-fetch check

For `list()` and `get()`, the tenant filter is added as a `WHERE` clause to the database query — not evaluated after fetching all rows. This is critical for performance and security:

- **Performance** — fetching all rows and filtering is O(n) where n = all tenants' data. WHERE clause with an indexed `tenantId` is O(log n) for the correct tenant only.
- **Security** — rows from other tenants never leave the database. Even if the access rule evaluation has a bug, the data was never fetched.

For `update()` and `delete()`, the tenant filter is added to the WHERE clause of the UPDATE/DELETE statement itself, ensuring atomicity.

### D2. `tenantScoped` is inferred from schema, not required as config

If the entity's model has a `tenantId` column, `tenantScoped` defaults to `true`. The developer doesn't need to write `tenantScoped: true`. This prevents the "I have a tenantId field but forgot to enable scoping" gap.

If the model does NOT have a `tenantId` column, `tenantScoped` defaults to `false` (there's nothing to scope by).

Setting `tenantScoped: false` on an entity WITH a `tenantId` field is the explicit opt-out for cross-tenant entities.

### D3. Access rules accept BOTH descriptors and functions (backward compatible)

The `AccessRule` type becomes a union:

```ts
type EntityAccessRule =
  | false                                  // disabled
  | AuthAccessRule                         // from @vertz/auth/rules (descriptor)
  | ((ctx: BaseContext, row: Record<string, unknown>) => boolean | Promise<boolean>);  // legacy
```

Functions continue to work for complex business logic that can't be expressed declaratively. But the convention (`.claude/rules/entity-access-rules.md`) strongly prefers descriptors.

### D4. `enforceAccess()` evaluates descriptors via recursive dispatch

The evaluator pattern-matches on the `type` discriminant:

```ts
function evaluateRule(rule: AuthAccessRule, ctx: BaseContext, row: Record<string, unknown>): boolean {
  switch (rule.type) {
    case 'public': return true;
    case 'authenticated': return ctx.authenticated();
    case 'role': return ctx.role(...rule.roles);
    case 'entitlement': return ctx.can(rule.entitlement);
    case 'where': return evaluateWhere(rule.conditions, ctx, row);
    case 'all': return rule.rules.every(r => evaluateRule(r, ctx, row));
    case 'any': return rule.rules.some(r => evaluateRule(r, ctx, row));
    case 'fva': return ctx.fvaValid(rule.maxAge);
  }
}
```

### D5. `where` rules on `list()` become DB query conditions

When a `list()` operation has a `where` rule (either from `tenantScoped` or from the access config), the conditions are pushed to the database query as WHERE clauses — not evaluated post-fetch.

The `UserMarker` values (`rules.user.id`, `rules.user.tenantId`) are resolved to actual values from the request context before building the query.

```ts
// rules.where({ tenantId: rules.user.tenantId })
// → resolved to: WHERE tenant_id = 'tenant-abc' (from JWT)
```

For non-list operations that fetch by ID, the where conditions are added to the SELECT query:
```sql
-- get() with tenant scoping
SELECT * FROM tasks WHERE id = $1 AND tenant_id = $2
-- If no row returned → 404 (not 403 — don't reveal existence)
```

### D6. Session revalidation on tenant switch

When a user switches tenants:
1. Client calls `POST /auth/switch-tenant` with `{ tenantId }`.
2. Server verifies user still has membership in that tenant (DB check).
3. Server issues new JWT scoped to the new tenant (new `tenantId`, new roles, new entitlements).
4. Client replaces token and clears entity store completely (`store.clear()`).
5. All active queries re-fetch with the new tenant context.

The JWT always carries exactly one `tenantId`. Multi-tenant users switch context; they don't hold multiple contexts simultaneously.

## E2E Acceptance Test

```ts
describe('Feature: Tenant-scoped entity access', () => {
  describe('Given a tasks entity with tenantId field', () => {
    describe('When tenant-A user calls list()', () => {
      it('Then returns only tenant-A tasks', () => {
        // Create tasks in tenant-A and tenant-B
        // Authenticate as tenant-A user
        // GET /tasks → only tenant-A tasks returned
      });
    });

    describe('When tenant-A user calls get() with tenant-B task ID', () => {
      it('Then returns 404 (not 403)', () => {
        // Authenticate as tenant-A user
        // GET /tasks/:tenantBTaskId → 404
      });
    });

    describe('When tenant-A user calls update() on tenant-B task', () => {
      it('Then returns 404', () => {
        // PATCH /tasks/:tenantBTaskId → 404
      });
    });
  });

  describe('Given a system-templates entity with tenantScoped: false', () => {
    describe('When any authenticated user calls list()', () => {
      it('Then returns templates from all tenants', () => {
        // GET /system-templates → all templates
      });
    });
  });

  describe('Given entity access with rules.entitlement()', () => {
    describe('When user has the entitlement', () => {
      it('Then access is granted', () => {
        // User with 'task:update' entitlement
        // PATCH /tasks/:ownTaskId → 200
      });
    });

    describe('When user does not have the entitlement', () => {
      it('Then access is denied with 403', () => {
        // User without 'task:delete' entitlement
        // DELETE /tasks/:id → 403
      });
    });
  });

  describe('Given entity access with rules.where()', () => {
    describe('When row matches the condition', () => {
      it('Then access is granted', () => {
        // User updates own task (createdBy matches userId)
        // PATCH /tasks/:ownTaskId → 200
      });
    });

    describe('When row does not match the condition', () => {
      it('Then access is denied', () => {
        // User updates another user's task
        // PATCH /tasks/:otherTaskId → 404 (tenant-scoped hides it)
      });
    });
  });
});

describe('Feature: Session revalidation on tenant switch', () => {
  describe('Given a user with access to tenant-A and tenant-B', () => {
    describe('When user switches from tenant-A to tenant-B', () => {
      it('Then receives a new JWT scoped to tenant-B', () => {
        // POST /auth/switch-tenant { tenantId: 'tenant-b' }
        // → new JWT with tenantId: 'tenant-b'
      });

      it('Then subsequent queries return tenant-B data', () => {
        // GET /tasks → only tenant-B tasks
      });
    });

    describe('When user switches to a tenant they are not a member of', () => {
      it('Then returns 403', () => {
        // POST /auth/switch-tenant { tenantId: 'tenant-c' }
        // → 403 Forbidden
      });
    });
  });
});

describe('Feature: Admin entities (cross-tenant)', () => {
  describe('Given admin-users entity with tenantScoped: false', () => {
    describe('When super-admin calls list()', () => {
      it('Then returns users from all tenants', () => {
        // GET /admin/users → all users across tenants
      });
    });

    describe('When regular user calls list()', () => {
      it('Then returns 403', () => {
        // Regular user → no admin:user:read entitlement → 403
      });
    });
  });
});
```

## Unknowns

1. **`tenantId` column naming convention** — is it always `tenantId`? Or configurable per entity? The entity schema knows its columns, so detection should be straightforward. If customization is needed, `tenantField: 'organizationId'` on the entity config.

2. **Relationship between this work and access-redesign.md Phase 1** — the access redesign Phase 1 covers `defineAccess()` restructuring + entitlement evaluation. This design depends on entitlement evaluation being functional (`ctx.can('task:update')` must work). The two can be implemented together or sequenced (access-redesign Phase 1 first, then this).

## Implementation Plan

### Phase 1: Descriptor evaluation in `enforceAccess()`

**Goal:** `enforceAccess()` evaluates `rules.*` descriptors alongside existing function rules.

**Changes:**
- `packages/server/src/entity/types.ts` — extend `AccessRule` type to accept `AuthAccessRule` from `@vertz/auth/rules`
- `packages/server/src/entity/access-enforcer.ts` — add `evaluateRule()` dispatcher that handles all descriptor types
- Resolve `UserMarker` values (`rules.user.id`, `rules.user.tenantId`) from request context

**Acceptance criteria:**
```ts
describe('Given entity access with rules.entitlement()', () => {
  describe('When user has the entitlement via defineAccess()', () => {
    it('Then enforceAccess() grants access', () => {});
  });
  describe('When user lacks the entitlement', () => {
    it('Then enforceAccess() denies access', () => {});
  });
});

describe('Given entity access with rules.where()', () => {
  describe('When row matches the where condition', () => {
    it('Then enforceAccess() grants access', () => {});
  });
  describe('When row does not match', () => {
    it('Then enforceAccess() denies access', () => {});
  });
});

describe('Given entity access with rules.all()', () => {
  describe('When all sub-rules pass', () => {
    it('Then enforceAccess() grants access', () => {});
  });
  describe('When one sub-rule fails', () => {
    it('Then enforceAccess() denies access', () => {});
  });
});

describe('Given entity access with rules.any()', () => {
  describe('When at least one sub-rule passes', () => {
    it('Then enforceAccess() grants access', () => {});
  });
});

describe('Given legacy function rule', () => {
  it('Then enforceAccess() still evaluates it correctly', () => {});
});
```

### Phase 2: Automatic tenant scoping

**Goal:** Entities with `tenantId` field are automatically scoped. Tenant filter added at query level.

**Changes:**
- `packages/server/src/entity/entity.ts` — detect `tenantId` column in model, set `tenantScoped` default
- `packages/server/src/entity/crud-pipeline.ts` — inject `WHERE tenantId = ?` for all operations when `tenantScoped: true`
  - `list()`: add to query WHERE clause
  - `get()`: add to SELECT WHERE clause
  - `update()`: add to UPDATE WHERE clause
  - `delete()`: add to DELETE WHERE clause
- `packages/server/src/entity/types.ts` — add `tenantScoped?: boolean` and `table?: string` to entity config
- `create()`: auto-set `tenantId` from context on the created row

**Acceptance criteria:**
```ts
describe('Given entity with tenantId column', () => {
  it('Then tenantScoped defaults to true', () => {});
  describe('When list() is called', () => {
    it('Then query includes WHERE tenantId = ctx.tenantId', () => {});
  });
  describe('When get() is called with cross-tenant ID', () => {
    it('Then returns 404', () => {});
  });
  describe('When create() is called', () => {
    it('Then tenantId is auto-set from context', () => {});
  });
});

describe('Given entity with tenantScoped: false', () => {
  describe('When list() is called', () => {
    it('Then no tenant filter is applied', () => {});
  });
});

describe('Given entity without tenantId column', () => {
  it('Then tenantScoped defaults to false', () => {});
});
```

### Phase 3: `table` property for admin entities

**Goal:** Multiple entity definitions can point at the same underlying table.

**Changes:**
- `packages/server/src/entity/entity.ts` — accept `table` property, use it for DB operations instead of entity name when provided
- `packages/server/src/entity/crud-pipeline.ts` — use `def.table ?? def.entityName` for all DB queries

**Acceptance criteria:**
```ts
describe('Given admin-users entity with table: "users"', () => {
  describe('When list() is called by super-admin', () => {
    it('Then queries the users table (not admin-users)', () => {});
    it('Then returns cross-tenant data', () => {});
  });
});
```

### Phase 4: Session revalidation on tenant switch

**Goal:** Users switching tenants get a new JWT with the target tenant's context.

**Changes:**
- Add `POST /auth/switch-tenant` endpoint
- Verify user membership in target tenant
- Issue new JWT with target tenant's `tenantId`, roles, entitlements
- Client SDK: `switchTenant()` method that replaces token and clears entity store

**Acceptance criteria:**
```ts
describe('Given multi-tenant user switching tenants', () => {
  describe('When switch-tenant is called with valid tenant', () => {
    it('Then new JWT is issued with target tenantId', () => {});
    it('Then old JWT no longer works for the old tenant context', () => {});
  });
  describe('When switch-tenant is called with unauthorized tenant', () => {
    it('Then returns 403', () => {});
  });
});
```

### Phase 5: `where` rules pushed to DB query (query-level enforcement)

**Goal:** `rules.where()` conditions on `list()` are pushed to the DB query as WHERE clauses, not evaluated post-fetch.

**Changes:**
- `packages/server/src/entity/crud-pipeline.ts` — extract `where` rules from access config, resolve markers, add to query builder
- Handle nested `all`/`any` compositions of `where` rules

**Acceptance criteria:**
```ts
describe('Given access rule: rules.where({ createdBy: rules.user.id })', () => {
  describe('When list() is called', () => {
    it('Then DB query includes WHERE created_by = userId', () => {});
    it('Then only matching rows are returned (not fetched and filtered)', () => {});
  });
});
```

## Dependencies

- **Phase 1** → no external dependencies (just extending the evaluator)
- **Phase 2** → depends on Phase 1 (tenant scoping uses `where` descriptor evaluation)
- **Phase 3** → depends on Phase 2 (admin entities need tenant scoping decisions)
- **Phase 4** → independent (auth layer change, can parallel Phase 2-3)
- **Phase 5** → depends on Phase 1 (extends `where` evaluation to query level)

**Relationship to access-redesign.md:**
- Phase 1 of this design aligns with access-redesign Phase 1 (entitlement evaluation). They can be implemented together.
- Phases 2-5 of this design are orthogonal to access-redesign Phases 2-7 (plans, limits, billing).
