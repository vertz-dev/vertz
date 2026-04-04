# Phase 4: Tenant Chain — Composite-PK Entity as Chain Origin

## Context

Issue [#1776](https://github.com/vertz-dev/vertz/issues/1776). Phases 1-3 implemented composite PK support in the DB adapter, CRUD pipeline, and route generator. This phase verifies that `resolveTenantChain()` works correctly when the entity itself has a composite PK, and clarifies error messages for unsupported cases.

Design doc: `plans/composite-pk-entity-support.md`

**Key insight from the design doc:** The entity's own PK is NOT resolved during chain BFS. `resolvePrimaryKey()` is only called for target tables of each hop (the tables referenced by `ref.one` FKs). So a composite-PK entity works as a chain origin as long as its targets have single PKs. This phase is primarily about verification and error message improvement — no algorithm changes needed.

## Tasks

### Task 1: Verify chain resolution for composite-PK entity origins

**Files:**
- `packages/server/src/entity/__tests__/tenant-chain.test.ts` (modified)

**What to implement:**

Add tests that verify `resolveTenantChain()` works when the starting entity has a composite PK:

```ts
describe('resolveTenantChain — composite PK entity as origin', () => {
  // Schema:
  // organizations(id) — tenant root
  // projects(id, organizationId) — directly scoped
  // project_members(projectId, userId, role) — composite PK, indirectly scoped
  //   ref.one: projectId → projects

  const organizations = d.table('organizations', {
    id: d.uuid().primary(),
    name: d.text(),
  });

  const projects = d.table('projects', {
    id: d.uuid().primary(),
    name: d.text(),
    organizationId: d.uuid(),
  });

  const projectMembers = d.table('project_members', {
    projectId: d.uuid(),
    userId: d.uuid(),
    role: d.text().default('member'),
  }, { primaryKey: ['projectId', 'userId'] });

  // Models with relations
  const orgModel = d.model(organizations);
  const projectModel = d.model(projects, {
    organization: d.ref.one(() => orgModel, 'organizationId'),
  });
  const memberModel = d.model(projectMembers, {
    project: d.ref.one(() => projectModel, 'projectId'),
  });

  it('resolves chain from composite-PK entity to root', () => {
    const chain = resolveTenantChain('projectMember', tenantGraph, registry);
    expect(chain).not.toBeNull();
    expect(chain!.hops).toHaveLength(2);
    // First hop: project_members.projectId → projects.id
    expect(chain!.hops[0]).toEqual({
      tableName: 'projects',
      foreignKey: 'projectId',
      targetColumn: 'id',
    });
    // Chain reaches root: tenantColumn is the FK to organizations
    expect(chain!.tenantColumn).toBe('organizationId');
  });

  it('chain hops target single-PK tables only', () => {
    const chain = resolveTenantChain('projectMember', tenantGraph, registry);
    // All hops target tables with single PK — no composite targets
    for (const hop of chain!.hops) {
      expect(typeof hop.targetColumn).toBe('string');
    }
  });
});
```

Build the `registry` and `tenantGraph` fixtures using the same patterns as the existing tests in `tenant-chain.test.ts`. Look at how the existing tests set up `ModelRegistryEntry` objects and `TenantGraph` structures.

**Acceptance criteria:**
- [ ] `resolveTenantChain()` succeeds for composite-PK entity as chain origin
- [ ] Chain hops correctly connect entity → directly-scoped → root
- [ ] Target columns are all single strings (single-PK targets)
- [ ] Works with both single-hop and multi-hop chains

---

### Task 2: Clarify error message for composite-PK targets in chain

**Files:**
- `packages/server/src/entity/tenant-chain.ts` (modified)
- `packages/server/src/entity/__tests__/tenant-chain.test.ts` (modified)

**What to implement:**

Update the error message in `resolvePrimaryKey()` (line 227-232) to explain WHY composite-PK tables can't be chain targets:

```ts
if (pkCols.length > 1) {
  throw new Error(
    `Tenant chain resolution encountered composite primary key on table "${tableName}" ` +
    `[${pkCols.join(', ')}]. A composite-PK table cannot be an intermediate hop in the ` +
    `tenant chain because ref.one() creates single-column foreign keys, which cannot ` +
    `reference a composite primary key. The composite-PK table itself CAN be the chain ` +
    `origin (entity). To fix: use a surrogate single-column PK on "${tableName}", or ` +
    `restructure the relation chain to avoid traversing through this table.`,
  );
}
```

Add a test that verifies this error message when a chain traversal hits a composite-PK intermediate table:

```ts
describe('resolveTenantChain — composite PK as intermediate hop', () => {
  // Schema:
  // organizations(id) — root
  // team_members(teamId, userId) — composite PK
  // comments(id, teamMemberTeamId, teamMemberUserId) — refs team_members
  //
  // This scenario requires composite FKs which ref.one doesn't support,
  // but we can simulate it by having ref.one point to one column

  it('throws clear error when traversing through composite-PK table', () => {
    // Set up a registry where BFS reaches a composite-PK table as a target
    // The resolvePrimaryKey call on the target table should throw
    expect(() => resolveTenantChain('comment', tenantGraph, registry))
      .toThrow('cannot be an intermediate hop');
  });

  it('error message explains ref.one single-column FK limitation', () => {
    try {
      resolveTenantChain('comment', tenantGraph, registry);
    } catch (e) {
      expect((e as Error).message).toContain('ref.one() creates single-column foreign keys');
    }
  });
});
```

**Acceptance criteria:**
- [ ] Error message explains WHY composite-PK targets aren't supported
- [ ] Error message suggests fix (surrogate PK or restructure)
- [ ] Error message mentions that the entity CAN be a composite-PK chain origin
- [ ] Existing composite-PK error test updated to match new message

---

### Task 3: End-to-end integration test

**Files:**
- `packages/server/src/entity/__tests__/tenant-chain.test.ts` (modified) OR a new `__tests__/composite-pk-tenant-integration.test.ts` (new, max 1 file)

**What to implement:**

Write a comprehensive integration test combining tenant chain resolution with the CRUD pipeline for a composite-PK entity. This tests the full vertical slice:

```ts
describe('E2E: composite-PK entity with tenant chain', () => {
  // project_members(projectId, userId) — composite PK, indirectly scoped
  // projects(id, organizationId) — directly scoped
  // organizations(id) — tenant root

  it('resolves tenant chain for composite-PK entity', () => {
    const chain = resolveTenantChain('projectMember', tenantGraph, registry);
    expect(chain).not.toBeNull();
    expect(chain!.hops[0]!.foreignKey).toBe('projectId');
  });

  it('CRUD handlers accept composite PK with tenant chain', () => {
    // Verify createCrudHandlers doesn't throw
    const handlers = createCrudHandlers(projectMemberDef, mockDb, {
      tenantChain: chain,
      queryParentIds: mockQueryParentIds,
    });
    expect(handlers).toBeDefined();
  });

  it('create verifies parent project belongs to tenant', async () => {
    const result = await handlers.create(tenantCtx, {
      projectId: validProjectId,
      userId: 'user-1',
    });
    expect(result.ok).toBe(true);
  });

  it('create rejects parent project from other tenant', async () => {
    const result = await handlers.create(tenantCtx, {
      projectId: otherTenantProjectId,
      userId: 'user-1',
    });
    expect(result.ok).toBe(false);
  });

  it('list filters by tenant via chain', async () => {
    const result = await handlers.list(tenantCtx);
    expect(result.ok).toBe(true);
    // All returned items should have projectIds belonging to the tenant
  });

  it('get with composite ID and tenant filtering', async () => {
    const result = await handlers.get(tenantCtx, {
      projectId: validProjectId,
      userId: 'user-1',
    });
    expect(result.ok).toBe(true);
  });
});
```

**Acceptance criteria:**
- [ ] Full chain: composite-PK entity → single-PK table → root
- [ ] CRUD handlers initialized with tenant chain
- [ ] Create validates parent FK through chain
- [ ] List filters by tenant
- [ ] Get with composite ID works with tenant context
