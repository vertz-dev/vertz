# Linear Clone Multi-Tenancy Redesign

## Problem

The Linear clone example uses `workspaceId` as a column on the `users` table, hardcoding each user to a single workspace. This is fundamentally wrong for multi-tenancy — users should be able to belong to multiple workspaces. The example also bypasses the framework's own access system (`defineAccess`, `rules.*`, role assignments), using hardcoded membership checks instead. As the flagship example app, this teaches bad patterns.

### Current Problems

1. **`workspaceId` on users** — a user can only belong to one workspace
2. **Raw SQL for membership checks** — `SELECT id FROM users WHERE workspace_id = ...` instead of using the framework
3. **No `defineAccess`** — the entitlements/RBAC system is completely unused
4. **No role assignments** — `auth_role_assignments` table exists but is never populated
5. **Manual `verifyMembership` / `listTenants`** — hand-written SQL queries instead of using the framework's role store
6. **Entity access rules are all `rules.authenticated()`** — no entitlement-based access

## API Surface

### 1. Access Definition (new file: `examples/linear/src/api/access.ts`)

```ts
import { defineAccess } from '@vertz/server';

export const access = defineAccess({
  entities: {
    workspace: {
      roles: ['owner', 'admin', 'member'],
    },
    project: {
      roles: ['lead', 'member'],
      inherits: {
        'workspace:owner': 'lead',
        'workspace:admin': 'lead',
        'workspace:member': 'member',
      },
    },
  },
  entitlements: {
    // Workspace-level
    'workspace:read': { roles: ['owner', 'admin', 'member'] },
    'workspace:manage': { roles: ['owner', 'admin'] },

    // Project-level
    'project:create': { roles: ['owner', 'admin', 'member'] },
    'project:read': { roles: ['lead', 'member'] },
    'project:update': { roles: ['lead'] },
    'project:delete': { roles: ['owner', 'admin'] },

    // Issue-level (inherits from project roles)
    'issue:create': { roles: ['lead', 'member'] },
    'issue:read': { roles: ['lead', 'member'] },
    'issue:update': { roles: ['lead', 'member'] },
    'issue:delete': { roles: ['lead'] },

    // Comment-level
    'comment:create': { roles: ['lead', 'member'] },
    'comment:read': { roles: ['lead', 'member'] },
    'comment:delete': { roles: ['lead'] },
  },
});
```

### 2. Entity Access Rules (updated entities)

```ts
// projects.entity.ts
import { rules } from '@vertz/server';

export const projects = entity('projects', {
  model: projectsModel,
  access: {
    list: rules.entitlement('project:read'),
    get: rules.entitlement('project:read'),
    create: rules.entitlement('project:create'),
    update: rules.all(
      rules.entitlement('project:update'),
      rules.where({ createdBy: rules.user.id }),
    ),
    delete: rules.entitlement('project:delete'),
  },
  // ...
});
```

### 3. Auth Config — Auto-Wired Tenant from Access System

Zero raw SQL, zero manual tenant callbacks, zero explicit tenant config. When `auth.access` is configured and the schema has a `.tenant()` table, the framework auto-enables tenant endpoints and wires membership from the role store. There is no "strategy" to choose — role-based is the only way multi-tenancy works.

```ts
// auth.ts
export const auth = defineAuth({
  session: { strategy: 'jwt', ttl: '15m', refreshTtl: '7d', cookie: { secure: false } },
  emailPassword: {},
  providers: [github({ /* ... */ })],

  // Access config — enables RBAC, entitlements, and role assignments.
  // Combined with a .tenant() table in the schema, this auto-enables
  // tenant endpoints (/auth/tenants, /auth/switch-tenant) with
  // membership derived from role assignments. No tenant config needed.
  access: {
    definition: access,  // from access.ts
  },

  onUserCreated: async (payload, ctx) => {
    // Create user record (no workspaceId — users are .shared())
    if (payload.provider) {
      const profile = payload.profile as Record<string, unknown>;
      await ctx.entities.users.create({
        id: payload.user.id,
        email: payload.user.email,
        name: (profile.name as string) ?? (profile.login as string),
        avatarUrl: profile.avatar_url as string,
      });
    } else {
      await ctx.entities.users.create({
        id: payload.user.id,
        email: payload.user.email,
        name: payload.user.email.split('@')[0],
        avatarUrl: null,
      });
    }

    // Assign 'member' role on seed workspace via framework API
    await ctx.roles.assign(payload.user.id, 'workspace', SEED_WORKSPACE_ID, 'member');
  },
});
```

### 4. Framework Enhancement — Auto-Wired Tenant from Access + Schema

When `auth.access` is configured and the schema has a `.tenant()` table, the framework auto-enables tenant endpoints and wires membership from the role store. No explicit `tenant` config needed — role-based is the only way multi-tenancy works. Every B2B, B2C, or marketplace app models membership as "user has a role on a tenant." There is no alternative strategy.

**Auto-detection flow:**
1. `createServer` receives `auth` (with `access` configured) and `entities` (with schema)
2. It finds the `.tenant()` root table in the schema (e.g., `workspaces`)
3. It derives the `resourceType` from the entity name (e.g., `'workspace'`)
4. It auto-wires `verifyMembership` and `listTenants` from the role store + entity proxy

```ts
// Internal implementation (inside createServer or createAuth, during wiring):
const roleStore = config.access.roleStore;
const tenantEntity = findTenantRootEntity(entityDefs);
// e.g. { resourceType: 'workspace', entityName: 'workspaces' }

tenantConfig = {
  verifyMembership: async (userId, tenantId) => {
    const roles = await roleStore.getRoles(userId, tenantEntity.resourceType, tenantId);
    return roles.length > 0;
  },
  listTenants: async (userId) => {
    const assignments = await roleStore.getRolesForUser(userId);
    const tenantIds = assignments
      .filter((a) => a.resourceType === tenantEntity.resourceType)
      .map((a) => a.resourceId);
    if (tenantIds.length === 0) return [];
    // Use entity proxy — no raw SQL
    const results = await Promise.all(tenantIds.map((id) => tenantEntity.proxy.get(id)));
    return results
      .filter(Boolean)
      .map((r) => ({ id: r.id, name: r.name }));
  },
};
```

**Escape hatch:** Custom `tenant: { verifyMembership, listTenants }` callbacks remain available for apps that integrate with external auth systems (e.g., Okta managing membership outside Vertz). To explicitly disable tenant endpoints despite having access configured: `tenant: false`.

### 5. Framework Enhancement — Role Store in Auth Callbacks

The `AuthCallbackContext` needs to expose the role assignment store so `onUserCreated` can assign roles:

```ts
// Current
export interface AuthCallbackContext {
  entities: Record<string, AuthEntityProxy>;
}

// Proposed
export interface AuthCallbackContext {
  entities: Record<string, AuthEntityProxy>;
  roles: {
    assign(userId: string, resourceType: string, resourceId: string, role: string): Promise<void>;
    revoke(userId: string, resourceType: string, resourceId: string, role: string): Promise<void>;
  };
}
```

The `roles` property is available only when `auth.access` is configured. It is wired from `config.access.roleStore` inside `createAuth()`, which already has access to `config.access`.

### 6. Framework Enhancement — Wire `AccessContext` into CRUD Pipeline

**Pre-existing framework gap.** The access enforcer supports `rules.entitlement()` via the `options.can` callback, but the CRUD pipeline never passes it. Without this wiring, all entitlement rules silently deny.

```ts
// Current (crud-pipeline.ts) — no `can` option, entitlements always deny
const accessResult = await enforceAccess('list', def.access, ctx);

// Required — pass AccessContext.can to enforceAccess
const accessContext = new AccessContext(ctx.userId, accessDef, roleStore, closureStore);
const accessResult = await enforceAccess('list', def.access, ctx, undefined, {
  can: (entitlement) => accessContext.can(entitlement, { tenantId: ctx.tenantId }),
});
```

This requires threading `auth.access` config through: `createServer` → `generateEntityRoutes` → `createCrudHandlers` → `enforceAccess` options.

### 7. Schema Changes (remove `workspaceId` from users ONLY)

**Only remove `workspaceId` from the `users` table.** Projects KEEP `workspaceId` — it is the tenant FK for automatic scoping.

```ts
// Before
export const usersTable = d.table('users', {
  id: d.text().primary(),
  workspaceId: d.text().default(''),  // WRONG: locks user to one workspace
  name: d.text(),
  email: d.text().unique(),
  avatarUrl: d.text().nullable(),
  // ...
});

export const usersModel = d.model(usersTable, {
  workspace: d.ref.one(() => workspacesTable, 'workspaceId'),  // REMOVE
});

// After
export const usersTable = d.table('users', {
  id: d.text().primary(),
  name: d.text(),
  email: d.text().unique(),
  avatarUrl: d.text().nullable(),
  // ...
}).shared();  // Users are cross-tenant — membership via role assignments

export const usersModel = d.model(usersTable, {
  // No workspace relation — membership is via auth_role_assignments
});
```

Projects retain `workspaceId` — it IS the tenant FK:

```ts
// projectsTable — UNCHANGED, keeps workspaceId
export const projectsTable = d.table('projects', {
  id: d.text().primary(),
  workspaceId: d.text(),  // FK to workspaces — tenant scoping
  name: d.text(),
  // ...
}).tenant();

export const projectsModel = d.model(projectsTable, {
  workspace: d.ref.one(() => workspacesTable, 'workspaceId'),  // KEEP
  creator: d.ref.one(() => usersTable, 'createdBy'),
});
```

### 8. Server Wiring

```ts
// server.ts
import { createServer } from '@vertz/server';
import { auth } from './auth';    // auth includes access config — tenant auto-wired
import { db } from './db';
import { entities } from './entities';

export const app = createServer({
  basePath: '/api',
  entities,
  db,
  auth,
  // No tenant config needed — auto-detected from auth.access + .tenant() table
});
```

## Manifesto Alignment

### Principles Applied

- **"One way to do things"** — Tenant membership uses the same role assignment system as entity access. No separate membership table, no custom columns, no raw SQL. One system for "who can do what."
- **"If it builds, it works"** — `rules.entitlement('project:update')` is type-checked against `defineAccess`. If the entitlement doesn't exist, the compiler catches it (future goal for type-level validation).
- **"AI agents are first-class users"** — `defineAccess` is a single declarative config. Tenant membership is auto-wired — zero config. An LLM can read the full auth setup and understand the permission model. No scattered role checks or raw SQL.
- **"Explicit over implicit"** — Role assignments are explicit records, not derived from a column relationship. You can see exactly who has what role on what resource.

### Tradeoffs

- **Role assignments as membership** vs **dedicated membership table** — We chose role assignments because they already exist in the framework and carry more information (the role itself, not just "is member"). A dedicated table would duplicate the concept.
- **`shared()` users** vs **tenant-scoped users** — Users are inherently cross-tenant (a person exists independently of their workspaces). The `shared()` marker makes this explicit. User data that IS workspace-specific (display name override, preferences) would go in a separate tenant-scoped table if needed.
- **Auto-wired tenant** vs **custom callbacks** — Auto-wiring from `auth.access` + `.tenant()` table is more opinionated than custom callbacks, but eliminates raw SQL and teaches the right pattern. Custom callbacks (`{ verifyMembership, listTenants }`) remain available as an escape hatch for external auth systems.

## Non-Goals

- **Workspace invite flow** — UI for inviting users to workspaces. This is a feature, not an architectural concern.
- **Role management UI** — Admin panel for changing roles. The Linear clone can seed roles.
- **Plan/billing integration** — Adding plan-gated entitlements to the Linear clone. Keep it role-based for now.
- **Type-level entitlement validation** — Making `rules.entitlement('typo')` a compile error. Valuable but separate work.
- **`rules.where()` push to DB** — Layer 6 evaluation. Already tracked separately.
- **Per-request role caching** — The Linear clone is a demo app. Production apps should implement per-request memoization. Not in scope here.

## Resolved Unknowns

1. **`roleStore` availability in tenant callbacks** — **Resolved: auto-wired tenant.** No manual callbacks needed. When `auth.access` is configured + schema has a `.tenant()` table, the framework auto-wires `verifyMembership` and `listTenants` from the role store + entity proxy. Custom callbacks remain as an escape hatch for external auth systems.

2. **`sql.list()` for IN clauses** — **Resolved: no raw SQL at all.** The auto-wired tenant uses `roleStore.getRolesForUser()` + `entityProxy.get()` to fetch workspace details. No SQL is written by the developer.

3. **Seed data migration** — Update seed + E2E tests in the same phase. Remove `workspaceId` from seed user creation, add role assignment seeding instead.

4. **CRUD pipeline `can` hook gap** — **Resolved: wire it in Phase 1.** The access enforcer already supports `options.can` but the CRUD pipeline never passes it. Phase 1 includes wiring `AccessContext` into the pipeline so `rules.entitlement()` actually works.

5. **`access` placement in config** — **Resolved: nested inside `auth`.** `access` is NOT a top-level `ServerConfig` param. It lives at `auth.access` as `AuthAccessConfig`.

## Type Flow Map

```
defineAccess()
  ├─ entities: { workspace: { roles: ['owner', 'admin', 'member'] } }
  │   └─ AccessDefinition.roles['workspace'] → string[]
  ├─ entitlements: { 'project:create': { roles: ['owner', 'admin', 'member'] } }
  │   └─ AccessDefinition.entitlements['project:create'] → EntitlementDef
  └─ inherits: { 'workspace:owner': 'lead' }
      └─ AccessDefinition.inheritance['project'] → Record<string, string>

Auto-wired tenant (auth.access + .tenant() table):
  createServer({ auth, entities, db })
    → detects auth.access is configured
    → finds .tenant() root table in schema (e.g. workspaces)
    → derives resourceType from entity name (e.g. 'workspace')
    → auto-wires verifyMembership: roleStore.getRoles(userId, resourceType, tenantId).length > 0
    → auto-wires listTenants: roleStore.getRolesForUser(userId) → entityProxy.get(id) per tenant
    → auto-enables /auth/tenants and /auth/switch-tenant endpoints

Entity access rule:
  rules.entitlement('project:create')
    → AccessRule { type: 'entitlement', entitlement: 'project:create' }
    → enforceAccess() calls options.can('project:create')
    → AccessContext.can('project:create', resource)
    → Layer 2 (RBAC): roleStore.getEffectiveRole(userId, 'workspace', tenantId, accessDef, closureStore)
    → returns role → checks if role is in entitlement.roles
    → boolean

CRUD pipeline wiring (NEW — Phase 1):
  createCrudHandlers(def, accessConfig)
    → enforceAccess('list', def.access, ctx, undefined, {
        can: (e) => accessContext.can(e, { tenantId: ctx.tenantId }),
      })
    → options.can is now defined → entitlement rules evaluate

Role assignment (in onUserCreated):
  ctx.roles.assign(userId, 'workspace', workspaceId, 'member')
    → roleStore.assign(userId, 'workspace', workspaceId, 'member')
    → INSERT INTO auth_role_assignments (user_id, resource_type, resource_id, role)
    → auto-wired tenant: getRoles(userId, 'workspace', workspaceId) → ['member']
    → verifyMembership: roles.length > 0 → true
```

## E2E Acceptance Test

```ts
describe('Feature: Multi-tenancy with role-based membership', () => {
  describe('Given a user with "member" role on workspace "ws-acme"', () => {
    describe('When listing tenants via GET /api/auth/tenants', () => {
      it('Then returns ws-acme in the tenant list', () => {
        // GET /api/auth/tenants
        // expect response.tenants to contain { id: 'ws-acme', name: 'Acme Corp' }
      });
    });

    describe('When switching to ws-acme via POST /api/auth/switch-tenant', () => {
      it('Then succeeds and returns new session with tenantId', () => {
        // POST /api/auth/switch-tenant { tenantId: 'ws-acme' }
        // expect response.ok === true
        // expect new JWT to contain tenantId: 'ws-acme'
      });
    });

    describe('When switching to ws-other (no role)', () => {
      it('Then returns 403 Forbidden', () => {
        // POST /api/auth/switch-tenant { tenantId: 'ws-other' }
        // expect 403
      });
    });
  });

  describe('Given a user with "member" role on workspace "ws-acme"', () => {
    describe('When creating a project (entitlement: project:create)', () => {
      it('Then succeeds because member role grants project:create', () => {
        // POST /api/projects { name: 'New Project', key: 'NP' }
        // expect 201
      });
    });

    describe('When deleting a project (entitlement: project:delete)', () => {
      it('Then returns 403 because member role does NOT grant project:delete', () => {
        // DELETE /api/projects/proj-1
        // expect 403
      });
    });
  });

  describe('Given a new user signs up via OAuth', () => {
    describe('When onUserCreated fires', () => {
      it('Then user record is created without workspaceId', () => {
        // users table row has no workspaceId column
      });

      it('Then user is assigned "member" role on seed workspace', () => {
        // auth_role_assignments has row: (userId, 'workspace', SEED_WORKSPACE_ID, 'member')
      });
    });
  });

  describe('Given the users table schema', () => {
    it('Then does NOT have a workspaceId column', () => {
      // usersTable.columns should not contain 'workspaceId'
    });

    it('Then projects table STILL has workspaceId column (tenant FK)', () => {
      // projectsTable.columns should contain 'workspaceId'
    });
  });

  describe('Given auth.access is configured and workspaces table is .tenant()', () => {
    describe('When the server starts', () => {
      it('Then auto-enables /auth/tenants and /auth/switch-tenant endpoints', () => {
        // No explicit tenant config needed — auto-detected from access + schema
      });
    });

    describe('When the framework handles verifyMembership', () => {
      it('Then checks role assignments — no raw SQL, no custom callbacks', () => {
        // Internal: roleStore.getRoles(userId, 'workspace', tenantId).length > 0
      });
    });

    describe('When the framework handles listTenants', () => {
      it('Then uses role store + entity proxy — no raw SQL, no custom callbacks', () => {
        // Internal: roleStore.getRolesForUser(userId) → entityProxy.workspaces.get(id)
      });
    });
  });
});
```

## Implementation Plan

### Phase 1: Framework — Wire access system into entity pipeline + auth callbacks + auto-tenant

**Three framework enhancements that make the Linear clone's ideal implementation possible.**

**Changes:**
1. **Wire `AccessContext` into CRUD pipeline** — Thread `auth.access` config through `createServer` → `generateEntityRoutes` → `createCrudHandlers`. Pass `{ can: (e) => accessContext.can(e, resource) }` to `enforceAccess()` so `rules.entitlement()` actually evaluates instead of silently denying.
2. **Extend `AuthCallbackContext` with `roles`** — When `auth.access` is configured, expose `roles.assign()` and `roles.revoke()` on the callback context. Wired from `config.access.roleStore` inside `createAuth()`.
3. **Auto-wired tenant from access + schema** — When `auth.access` is configured and the schema has a `.tenant()` table, auto-enable tenant endpoints (`/auth/tenants`, `/auth/switch-tenant`) and auto-wire `verifyMembership` and `listTenants` from the role store + entity proxy. No explicit `tenant` config needed. Custom `tenant: { ... }` callbacks remain as an escape hatch. `tenant: false` to explicitly disable.

**Acceptance criteria:**
- `rules.entitlement('x')` in entity access rules evaluates correctly (not always-deny)
- `onUserCreated` can call `ctx.roles.assign(userId, 'workspace', wsId, 'member')`
- Tenant endpoints auto-enabled when `auth.access` + `.tenant()` table are present — zero explicit tenant config
- Custom `tenant: { verifyMembership, listTenants }` still works as escape hatch
- `tenant: false` disables auto-tenant even when access + `.tenant()` are present

### Phase 2: Linear clone — Access definition + schema changes

**Changes:**
- Create `examples/linear/src/api/access.ts` with `defineAccess`
- Remove `workspaceId` from `usersTable` and mark as `.shared()`
- Remove `workspace` relation from `usersModel`
- **Keep** `workspaceId` on `projectsTable` — it is the tenant FK for automatic scoping
- Update entity access rules to use `rules.entitlement()` instead of `rules.authenticated()`
- Pass `access` inside `auth.access`

**Acceptance criteria:**
- `defineAccess` compiles with workspace and project entity roles
- Users table has no `workspaceId` column, users model has no `workspace` relation
- Projects table still has `workspaceId` column and `workspace` relation (tenant FK)
- Entity access rules use `rules.entitlement()` instead of `rules.authenticated()`

### Phase 3: Linear clone — Auth config + seed migration

**Changes:**
- Delete all manual `verifyMembership`/`listTenants` callbacks and raw SQL — tenant auto-wired from `auth.access` + `.tenant()` table
- Update `onUserCreated` to use `ctx.roles.assign()` instead of setting `workspaceId`
- Update seed data: remove `workspaceId` from user creation, add role assignment seeding
- Update E2E tests for new membership model

**Acceptance criteria:**
- Auth config has no explicit `tenant` — auto-wired from `auth.access` + `.tenant()` table, zero raw SQL
- New user signup assigns `member` role on seed workspace via `ctx.roles.assign()`
- Seed data creates role assignments instead of setting `workspaceId`
- All E2E tests pass with the new membership model

### Phase 4: Entitlement enforcement E2E

**Changes:**
- Write E2E tests that verify entitlement-based access (member can create project, member cannot delete project, etc.)
- Verify role inheritance works (workspace owner inherits project lead)

**Acceptance criteria:**
- E2E test: member can create projects but cannot delete them
- E2E test: owner/admin can delete projects
- E2E test: role inheritance from workspace to project works
