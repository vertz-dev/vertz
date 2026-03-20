# Tenant Declaration on Root Table

**Evolves:** [#955 — Move Tenant to Model](./955-move-tenant-to-model.md) (already landed)
**Status:** Draft v2 — all review findings addressed, awaiting human sign-off

## Problem

After #955, tenant scoping is declared per-model via a third options argument:

```ts
const usersModel = d.model(
  usersTable,
  { workspace: d.ref.one(() => workspacesTable, 'workspaceId') },
  { tenant: 'workspace' },
);

const projectsModel = d.model(
  projectsTable,
  { workspace: d.ref.one(() => workspacesTable, 'workspaceId') },
  { tenant: 'workspace' },
);
```

Three issues, ordered by impact:

1. **Silent misconfiguration.** If a developer adds a new model with a `ref.one` to the tenant root but forgets `{ tenant: 'workspace' }`, the model is silently unscoped. No compile error, no warning. This is the most important problem — it's an entire class of bugs that the framework could prevent but doesn't.

2. **Wrong abstraction level.** `{ tenant: 'workspace' }` says "this model is tenant-scoped via its workspace relation." But the developer's actual intent is simpler: "workspaces is the tenant root." Everything else is derivable from the relation graph. The per-model declaration encodes a *consequence* of the design, not the *decision*.

3. **Redundant with the relation graph.** `computeTenantGraph` already walks the relation graph for indirect scoping. Direct scoping could use the exact same mechanism — if the framework knows which table is the root, it can find all models that relate to it. The repetitive `{ tenant: 'workspace' }` on every directly-scoped model is the framework asking the developer to do its job.

## Proposed Direction

Declare the tenant root on the table definition itself, like `.shared()`:

```ts
// BEFORE — per-model annotation
const workspacesTable = d.table('workspaces', { ... });
const usersModel = d.model(usersTable, {
  workspace: d.ref.one(() => workspacesTable, 'workspaceId'),
}, { tenant: 'workspace' });

// AFTER — one declaration on the root table
const workspacesTable = d.table('workspaces', { ... }).tenant();
const usersModel = d.model(usersTable, {
  workspace: d.ref.one(() => workspacesTable, 'workspaceId'),
});
```

The framework derives all scoping from the relation graph:
- **Tenant root**: the table with `._tenant === true`
- **Directly scoped**: models with a `ref.one` relation targeting the tenant root
- **Indirectly scoped**: models with a relation chain reaching a scoped model
- **Shared**: tables with `._shared === true` (already exists)
- **Unscoped**: models with no path to the tenant root and not shared → warning

### Why `.tenant()` on the root table (not on relations, not per-model)

#955 evaluated three options. This is a fourth that wasn't considered:

| Approach | Abstraction level | Repetition | Derivable? |
|----------|------------------|------------|------------|
| `.tenant()` on column (original) | Column — too low | Once per FK column | No — scans column metadata |
| `{ tenant: 'relation' }` on model (#955) | Model — OK but redundant | Once per directly-scoped model | Partially — still need explicit per-model |
| `.tenant()` on relation (rejected by #955) | Relation — wrong | Once per directly-scoped model | No — leaks to ref.many, wrong abstraction |
| **`.tenant()` on root table (this proposal)** | **Table — correct** | **Once per app** | **Yes — fully from relation graph** |

The tenant root is a property of the *table* that IS the organizational boundary. It's the same abstraction level as `.shared()` (a table-level data isolation policy). Declaring it once on the root and deriving everything else is the natural conclusion of #955's direction.

#955's reasons for rejecting `.tenant()` on relations don't apply here:
- **"Wrong abstraction level"** → `.tenant()` on the root table IS the right level
- **"Type system leak to ref.many"** → No change to `RelationDef` at all
- **"Blocks composite tenants"** → Composite tenants would mean multiple root tables, handled by allowing `.tenant()` on multiple tables (future, YAGNI for now)

## API Surface

### d.table().tenant() — marks the tenant root

```ts
const workspacesTable = d.table('workspaces', {
  id: d.text().primary(),
  name: d.text(),
}).tenant();
```

Returns a new `TableDef` with `_tenant: true`, exactly like `.shared()` returns one with `_shared: true`.

Combining `.tenant()` and `.shared()` on the same table is invalid — `computeTenantGraph` throws a runtime error: "Table 'workspaces' is marked as both .tenant() and .shared(). A tenant root cannot be shared."

### TableDef — new `_tenant` field

```ts
interface TableDef<TColumns extends ColumnRecord> {
  readonly _name: string;
  readonly _columns: TColumns;
  readonly _indexes: readonly IndexDef[];
  readonly _shared: boolean;
  readonly _tenant: boolean;  // NEW

  shared(): TableDef<TColumns>;
  tenant(): TableDef<TColumns>;  // NEW
  // ... $infer, $insert, etc.
}
```

Note: `_tenant: boolean` does not affect derived types (`$infer`, `$insert`, `$update`, `$response`, etc.) — those are computed purely from `TColumns`.

### d.model() — remove third argument

```ts
// BEFORE — three overloads
d.model(table): ModelDef<TTable, {}>;
d.model(table, relations): ModelDef<TTable, TRelations>;
d.model(table, relations, options): ModelDef<TTable, TRelations>;  // REMOVED

// AFTER — two overloads
d.model(table): ModelDef<TTable, {}>;
d.model(table, relations): ModelDef<TTable, TRelations>;
```

### ModelDef — remove `_tenant` field

```ts
interface ModelDef<TTable, TRelations> {
  readonly table: TTable;
  readonly relations: TRelations;
  readonly schemas: ModelSchemas<TTable>;
  // _tenant removed — derived from table._tenant + relation graph
}
```

### ModelOptions — removed entirely

`ModelOptions` only contained `tenant`. With that gone, the type and the third `d.model()` argument are both removed. If future model-level configuration is needed (e.g., soft deletes, versioning), a new `ModelOptions` can be re-introduced — pre-v1 breaking changes are acceptable.

### computeTenantGraph — fully auto-derived

```ts
function computeTenantGraph(registry: ModelRegistry): TenantGraph {
  // Step 1: Find the tenant root — the table with _tenant === true
  for (const [key, entry] of entries) {
    if (entry.table._tenant) {
      if (root !== null) throw new Error('Multiple .tenant() tables');
      root = key;
    }
  }

  // Step 2: Find directly scoped models — any model with ref.one → root table
  // Only ref.one relations are checked. ref.many is never a scoping relation.
  for (const [key, entry] of entries) {
    const refsToRoot = [];
    for (const [relName, rel] of Object.entries(entry.relations)) {
      if (rel._type === 'one' && rel._target()._name === rootTableName) {
        refsToRoot.push(relName);
      }
    }
    if (refsToRoot.length === 1) {
      directlyScoped.push(key);
    } else if (refsToRoot.length > 1) {
      throw new Error(
        `Model "${key}" has ${refsToRoot.length} relations to tenant root ` +
        `"${root}" (${refsToRoot.join(', ')}). Mark the table as .shared() ` +
        `if it's cross-tenant and handle scoping manually in your access rules.`
      );
    }
  }

  // Step 3: Indirect scoping — walk relation chains (same fixed-point algorithm as today)
  // ...
}
```

### resolveTenantChain — BFS shortest-path resolution

`resolveTenantChain` resolves the relation chain from an indirectly scoped entity back to a directly-scoped model or the tenant root. When multiple valid paths exist, **the shortest path wins** — fewer hops means fewer JOINs for tenant filtering.

The algorithm uses BFS (breadth-first search), not DFS:

```ts
function resolveTenantChain(
  entityKey: string,
  tenantGraph: TenantGraph,
  registry: ModelRegistry,
): TenantChain | null {
  // BFS queue: each entry tracks the full path taken to reach it
  const queue: Array<{ key: string; hops: TenantChainHop[] }> = [];
  const visited = new Set<string>();

  // Seed: all ref.one relations from the entity
  const entityEntry = registry[entityKey];
  for (const [, rel] of Object.entries(entityEntry.relations)) {
    if (rel._type !== 'one' || !rel._foreignKey) continue;
    const targetName = rel._target()._name;
    const targetKey = tableNameToKey.get(targetName);
    if (!targetKey) continue;
    // Skip shared and unscoped targets
    if (!isScoped(targetKey)) continue;

    const hop = { tableName: targetName, foreignKey: rel._foreignKey, targetColumn: resolvePk(targetKey) };

    // If target is directly scoped or root → shortest path found (1 hop)
    if (isDirectlyScoped(targetKey)) {
      return { hops: [hop], tenantColumn: deriveTenantFk(targetKey) };
    }
    if (targetKey === tenantGraph.root) {
      return { hops: [hop], tenantColumn: rel._foreignKey };
    }

    // Otherwise, enqueue for further exploration
    queue.push({ key: targetKey, hops: [hop] });
  }

  // BFS: expand level by level — guarantees shortest path
  visited.add(entityKey);
  while (queue.length > 0) {
    const { key: currentKey, hops } = queue.shift()!;
    if (visited.has(currentKey)) continue;
    visited.add(currentKey);

    const entry = registry[currentKey];
    for (const [, rel] of Object.entries(entry.relations)) {
      if (rel._type !== 'one' || !rel._foreignKey) continue;
      const targetName = rel._target()._name;
      const targetKey = tableNameToKey.get(targetName);
      if (!targetKey || visited.has(targetKey)) continue;
      if (!isScoped(targetKey)) continue;

      const hop = { tableName: targetName, foreignKey: rel._foreignKey, targetColumn: resolvePk(targetKey) };
      const newHops = [...hops, hop];

      if (isDirectlyScoped(targetKey)) {
        return { hops: newHops, tenantColumn: deriveTenantFk(targetKey) };
      }
      if (targetKey === tenantGraph.root) {
        return { hops: newHops, tenantColumn: rel._foreignKey };
      }

      queue.push({ key: targetKey, hops: newHops });
    }
  }

  return null; // No path found
}
```

**Why BFS matters:** Consider `Reactions` with relations to both `Comments` and `Tasks`:
- Path 1: Reactions → Comments → Projects → Root (2 hops)
- Path 2: Reactions → Tasks → Root (1 hop, Tasks is directly scoped)

DFS with insertion-order would pick whichever relation is defined first. BFS explores all 1-hop targets before any 2-hop targets, guaranteeing the shortest chain regardless of relation definition order.

**Shared tables are excluded.** A `ref.one` to a `.shared()` table is skipped during BFS — shared tables are not in `directlyScoped` or `indirectlyScoped`, so `isScoped()` returns false. Even if a shared table has its own relation back to the tenant root, that path is never followed.

### resolveTenantColumn — moved to createServer level

Currently, `entity.ts` has a `resolveTenantColumn(model)` function that reads `model._tenant` to find the FK. With `_tenant` removed from `ModelDef`, this function can no longer work at the entity level.

**Resolution:** Move tenant column resolution to `createServer`, where the full context is available (tenant graph + registry). For each entity, `createServer` scans its model's `ref.one` relations for one targeting the root table, reads `_foreignKey`, and injects `tenantColumn` into the entity definition. This is straightforward because `createServer` already has access to both the tenant graph and the model registry.

### .shared() — unchanged

`.shared()` continues to opt a table out of tenant scoping. The framework skips shared tables during graph traversal.

## Diagnostics

### Warning: Unscoped model

When a tenant root exists but a model has no path to the root and is not shared:

```
[vertz/db] Model "audit_logs" has no tenant path and is not marked .shared().
It will not be automatically scoped to a tenant.
If this table should be tenant-scoped, add a relation:
  d.ref.one(() => workspacesTable, 'workspaceId')
If cross-tenant access is intentional, mark it as .shared().
```

### Error: Multiple `.tenant()` tables

```
Multiple tables marked as .tenant(): "workspaces" and "organizations".
Only one tenant root is supported per application.
```

### Error: Ambiguous relations to tenant root

```
Model "transfers" has 2 relations to tenant root "workspaces" (fromWorkspace, toWorkspace).
Mark the table as .shared() if it's cross-tenant and handle scoping manually in your access rules.
```

Note: The ambiguity check only inspects `ref.one` relations, not columns. A denormalized `workspaceId` column without a corresponding relation does not trigger ambiguity.

### Error: `.tenant()` + `.shared()` on same table

```
Table "workspaces" is marked as both .tenant() and .shared().
A tenant root cannot be shared — it defines the tenant boundary.
```

## Manifesto Alignment

- **If it builds, it works**: The framework derives scoping automatically. There's no way to "forget" to add `{ tenant: 'workspace' }` on a model — if it has a `ref.one` to the root, it's scoped. An entire class of silent misconfiguration bugs is eliminated.
- **One way to do things**: Tenant is declared in exactly one place — `d.table(...).tenant()`. No per-model repetition.
- **Explicit over implicit**: The root table is explicitly marked. The derivation from the relation graph is deterministic and inspectable (via `computeTenantGraph` output). A developer reads `.tenant()` on the table and knows "this is the organizational boundary."
- **Compile-time over runtime**: The relation graph is statically analyzable. `.tenant()` + `.shared()` are compile-time declarations.
- **AI agents are first-class users**: One declaration vs N is easier for LLMs. No string repetition to get wrong. The relation graph does the work.

## Edge Case: Multiple Relations to Tenant Root

If a model has two `ref.one` relations targeting the tenant root:

```ts
const transfersModel = d.model(transfersTable, {
  fromWorkspace: d.ref.one(() => workspacesTable, 'fromWorkspaceId'),
  toWorkspace: d.ref.one(() => workspacesTable, 'toWorkspaceId'),
});
```

The framework cannot determine which relation defines the tenant scope. `computeTenantGraph` throws a clear error (see Diagnostics above).

**Important clarification:** The ambiguity check only inspects `ref.one` relations in the model's relations record, not columns on the table. A denormalized `workspaceId` column without a corresponding `ref.one` relation does not count. This means the common pattern of keeping a `workspaceId` column on indirectly-scoped tables for query performance does not trigger ambiguity — only a defined `ref.one` relation does.

## Non-Goals

- **Composite / hierarchical tenants**: Single tenant root only. `d.table().tenant()` is called on exactly one table. Multiple roots → error. Hierarchical scoping (org → team → project) uses the same single root with indirect scoping via relation chains.
- **Runtime auto-scoping**: This change is about WHERE tenant is declared. Auto-filtering queries by tenant is a separate feature that builds on the graph output.
- **Table/model unification (#953)**: This design works with the current `d.table()` + `d.model()` two-step.
- **Removing denormalized tenant FK columns**: Tables like `issues` may keep a `workspaceId` column for query performance (direct WHERE without JOINs). This design does not require or remove those columns — it only changes how scoping is *declared*, not how data is *stored*.

## Unknowns

None identified. The approach follows the exact same pattern as `.shared()`, which is already established and working.

## Type Flow Map

```
d.table('workspaces', { ... }).tenant()
  → TableDef with _tenant: true
  → passed to d.model() — no tenant option needed

d.model(usersTable, { workspace: d.ref.one(() => workspacesTable, 'workspaceId') })
  → ModelDef with table, relations — no _tenant field

createDb({ models: { workspaces, users, tasks, ... } })
  → computeTenantGraph reads:
    1. table._tenant for each model → finds root
    2. relations._target()._name for all ref.one → finds directly scoped
    3. transitive relation walk → finds indirectly scoped
    4. table._shared → finds shared
  → TenantGraph { root, directlyScoped, indirectlyScoped, shared }

createServer reads TenantGraph + registry
  → for directly scoped entities: scans model.relations for ref.one targeting root
    → derives tenantColumn from that relation's _foreignKey
  → for indirectly scoped entities: resolveTenantChain uses BFS
    → explores all ref.one relations level-by-level (skipping .shared() tables)
    → returns shortest hop chain to a directly-scoped model or root
  → injects tenantColumn into entity definition
```

## E2E Acceptance Test

```ts
describe('Feature: Tenant root declaration on table', () => {
  const workspaces = d.table('workspaces', {
    id: d.uuid().primary(),
    name: d.text(),
  }).tenant();

  const users = d.table('users', {
    id: d.uuid().primary(),
    workspaceId: d.uuid(),
    name: d.text(),
  });

  const projects = d.table('projects', {
    id: d.uuid().primary(),
    workspaceId: d.uuid(),
    name: d.text(),
  });

  const issues = d.table('issues', {
    id: d.uuid().primary(),
    projectId: d.uuid(),
    title: d.text(),
  });

  const featureFlags = d.table('feature_flags', {
    id: d.uuid().primary(),
    name: d.text(),
  }).shared();

  describe('Given a tenant root table and models with relations', () => {
    describe('When createDb computes the tenant graph', () => {
      it('Then the root is the table marked .tenant()', () => {
        const db = createDb({
          url: 'postgres://...',
          models: {
            workspaces: d.model(workspaces),
            users: d.model(users, {
              workspace: d.ref.one(() => workspaces, 'workspaceId'),
            }),
            projects: d.model(projects, {
              workspace: d.ref.one(() => workspaces, 'workspaceId'),
            }),
            issues: d.model(issues, {
              project: d.ref.one(() => projects, 'projectId'),
            }),
            featureFlags: d.model(featureFlags),
          },
        });

        expect(db._internals.tenantGraph.root).toBe('workspaces');
      });

      it('Then models with ref.one to root are directly scoped', () => {
        expect(db._internals.tenantGraph.directlyScoped).toContain('users');
        expect(db._internals.tenantGraph.directlyScoped).toContain('projects');
      });

      it('Then models with transitive relations are indirectly scoped', () => {
        expect(db._internals.tenantGraph.indirectlyScoped).toContain('issues');
      });

      it('Then .shared() tables are classified as shared', () => {
        expect(db._internals.tenantGraph.shared).toContain('featureFlags');
      });
    });
  });

  describe('Given no .tenant() table', () => {
    describe('When createDb computes the tenant graph', () => {
      it('Then root is null and no models are scoped', () => {
        // no .tenant() → single-tenant mode, no scoping
      });
    });
  });

  describe('Given a model with two ref.one to tenant root', () => {
    describe('When createDb computes the tenant graph', () => {
      it('Then throws an error explaining the ambiguity', () => {
        // framework cannot auto-derive which relation to use
      });
    });
  });

  describe('Given two tables marked .tenant()', () => {
    describe('When createDb computes the tenant graph', () => {
      it('Then throws an error about multiple tenant roots', () => {
        // only one root allowed
      });
    });
  });

  describe('Given a model with multiple paths to the tenant root', () => {
    // reactions → tasks (directly scoped, 1 hop)
    // reactions → comments → projects (directly scoped, 2 hops)
    const reactions = d.table('reactions', {
      id: d.uuid().primary(),
      commentId: d.uuid(),
      taskId: d.uuid(),
      emoji: d.text(),
    });

    const comments = d.table('comments', {
      id: d.uuid().primary(),
      projectId: d.uuid(),
      body: d.text(),
    });

    const tasks = d.table('tasks', {
      id: d.uuid().primary(),
      workspaceId: d.uuid(),
      title: d.text(),
    });

    describe('When resolving the tenant chain', () => {
      it('Then picks the shortest path (fewest hops)', () => {
        const db = createDb({
          url: 'postgres://...',
          models: {
            workspaces: d.model(workspaces),
            projects: d.model(projects, {
              workspace: d.ref.one(() => workspaces, 'workspaceId'),
            }),
            tasks: d.model(tasks, {
              workspace: d.ref.one(() => workspaces, 'workspaceId'),
            }),
            comments: d.model(comments, {
              project: d.ref.one(() => projects, 'projectId'),
            }),
            reactions: d.model(reactions, {
              comment: d.ref.one(() => comments, 'commentId'),
              task: d.ref.one(() => tasks, 'taskId'),
            }),
          },
        });

        const chain = resolveTenantChain('reactions', db._internals.tenantGraph, db._internals.registry);
        // Should pick reactions → tasks (1 hop) over reactions → comments → projects (2 hops)
        expect(chain!.hops).toHaveLength(1);
        expect(chain!.hops[0].tableName).toBe('tasks');
      });
    });
  });

  describe('Given a model related to both a scoped model and a shared table', () => {
    // The shared table has its own relation to the tenant root,
    // but that path must NOT be followed for scoping.
    const templates = d.table('templates', {
      id: d.uuid().primary(),
      name: d.text(),
    }).shared();

    const taskItems = d.table('task_items', {
      id: d.uuid().primary(),
      projectId: d.uuid(),
      templateId: d.uuid(),
      title: d.text(),
    });

    describe('When resolving the tenant chain', () => {
      it('Then ignores the shared table path and scopes through the non-shared relation', () => {
        const db = createDb({
          url: 'postgres://...',
          models: {
            workspaces: d.model(workspaces),
            projects: d.model(projects, {
              workspace: d.ref.one(() => workspaces, 'workspaceId'),
            }),
            templates: d.model(templates),
            taskItems: d.model(taskItems, {
              project: d.ref.one(() => projects, 'projectId'),
              template: d.ref.one(() => templates, 'templateId'),
            }),
          },
        });

        const chain = resolveTenantChain('taskItems', db._internals.tenantGraph, db._internals.registry);
        // Should scope through projects, NOT through templates (shared)
        expect(chain!.hops[0].tableName).toBe('projects');
      });
    });
  });
});

// Type-level: d.model() no longer accepts a third argument
// @ts-expect-error — ModelOptions removed, no third argument
d.model(users, { workspace: d.ref.one(() => workspaces, 'workspaceId') }, { tenant: 'workspace' });

// Type-level: .tenant() is available on TableDef
const t: typeof workspaces._tenant = true; // boolean
```

## Implementation Phases

### Phase 1: Add `.tenant()` to `TableDef`, remove `ModelOptions`

**Changes:**
- `packages/db/src/schema/table.ts`: Add `_tenant: boolean` to `TableDef`. Add `tenant(): TableDef<TColumns>` method (mirrors `.shared()`). Initialize `_tenant: false` in `createTable`.
- `packages/db/src/schema/model.ts`: Remove `ModelOptions` interface. Remove `ValidateOneRelationFKs` usage on options overload (already on relations param). Remove `_tenant` from `ModelDef`. Update `createModel` to two-arg only.
- `packages/db/src/d.ts`: Remove 3-arg `d.model()` overload. Remove `ModelOptions` import.
- `packages/db/src/index.ts`: Remove `ModelOptions` export.

**Acceptance criteria:**
```ts
describe('Given d.table().tenant()', () => {
  it('Then _tenant is true', () => {
    const t = d.table('workspaces', { id: d.uuid().primary() }).tenant();
    expect(t._tenant).toBe(true);
  });

  it('Then _tenant defaults to false', () => {
    const t = d.table('users', { id: d.uuid().primary() });
    expect(t._tenant).toBe(false);
  });
});

describe('Given d.model() without third argument', () => {
  it('Then compiles with two arguments', () => {
    d.model(usersTable, {
      workspace: d.ref.one(() => workspacesTable, 'workspaceId'),
    });
  });

  // @ts-expect-error — third argument no longer accepted
  it('Then rejects third argument', () => {
    d.model(usersTable, { workspace: d.ref.one(() => workspacesTable, 'workspaceId') }, {});
  });
});
```

### Phase 2: Rewrite `computeTenantGraph` to derive from `table._tenant`

**Changes:**
- `packages/db/src/client/tenant-graph.ts`: Rewrite to:
  1. Find root: scan for `entry.table._tenant === true` (error if multiple)
  2. Direct scoping: scan all models for `ref.one` relations targeting root table name (error if ambiguous — two `ref.one` to root on same model)
  3. Indirect scoping: fixed-point walk of all `ref.one` relations (same algorithm as today)
  4. Shared: `entry.table._shared` (unchanged)
  5. Validate: error if `table._tenant && table._shared` on same table
  - Remove `_tenant` from `ModelRegistryEntry` interface
- `packages/db/src/client/__tests__/tenant-graph.test.ts`: Update all tests to use `.tenant()` on root table instead of `{ tenant: 'relation' }` on models.

**Acceptance criteria:**
```ts
describe('Given models with relations to a .tenant() table', () => {
  it('Then auto-detects directly scoped models', () => {});
  it('Then auto-detects indirectly scoped models via relation chains', () => {});
  it('Then classifies .shared() tables correctly', () => {});
  it('Then throws on multiple .tenant() tables', () => {});
  it('Then throws on ambiguous relations (two ref.one to root)', () => {});
  it('Then returns null root when no .tenant() table exists', () => {});
  it('Then throws if a table is both .tenant() and .shared()', () => {});
});
```

### Phase 3: Update `resolveTenantChain` and server entity system

**Changes:**
- `packages/server/src/entity/tenant-chain.ts`: Rewrite `resolveTenantChain` to use **BFS (breadth-first search)** for shortest-path chain resolution. Find the tenant FK by scanning `entry.relations` for a `ref.one` whose `_target()._name` matches the root table name, then returning its `_foreignKey`. Remove `resolveTenantFk` helper (no longer needs `_tenant`). Skip `.shared()` tables during traversal.
  - Remove `_tenant` from `ModelRegistryEntry` interface
- `packages/server/src/entity/entity.ts`: Remove `resolveTenantColumn()` function that reads `model._tenant`. Move tenant column resolution to `createServer` (see Type Flow Map above).
- `packages/server/src/create-server.ts`: After computing tenant graph, iterate entities and resolve `tenantColumn` by scanning each model's relations for `ref.one` targeting root table.
- `packages/server/src/entity/__tests__/tenant-chain.test.ts`: Update fixtures to use `.tenant()` on root table
- `packages/server/src/entity/__tests__/tenant-chain-edge-cases.test.ts`: Update fixtures (uses `{ tenant: 'organization' }` and `{ tenant: 'org' }`)
- `packages/server/src/entity/__tests__/entity.test.ts`: Update tenant FK resolution tests — now tested at `createServer` level
- `packages/server/src/__tests__/create-server.test.ts`: Update tenant-related test models

**Acceptance criteria:**
```ts
describe('Given an indirectly scoped entity', () => {
  it('Then resolveTenantChain returns the correct hop chain', () => {});
  it('Then the tenant column is derived from the direct relation FK', () => {});
});

describe('Given an entity with multiple paths to tenant root', () => {
  it('Then resolveTenantChain picks the shortest path (BFS)', () => {
    // reactions has ref.one to tasks (1 hop to directly-scoped) AND
    // ref.one to comments (2 hops via comments → projects)
    // BFS guarantees reactions → tasks is picked regardless of relation definition order
  });
});

describe('Given an entity related to a shared table and a scoped model', () => {
  it('Then resolveTenantChain ignores the shared table path', () => {
    // taskItems has ref.one to projects (scoped) AND ref.one to templates (shared)
    // shared tables are skipped during BFS — only the projects path is followed
  });
});
```

### Phase 4: Update examples, integration tests, final verification

**Changes:**
- `examples/linear/src/api/schema.ts`: Replace `{ tenant: 'workspace' }` with `.tenant()` on `workspacesTable`
- `packages/integration-tests/`: Update any tenant-related integration tests
- `packages/db/src/__tests__/e2e.test.ts`, `prisma-style-api.test.ts`, `database.test.ts`, etc.: Update to new pattern
- `packages/cli/src/commands/__tests__/load-db-context.test.ts`: Update fake `ModelDef` fixtures that include `_tenant: null`
- Run full quality gates across all packages
- Verify `.d.ts` type preservation test still passes

**Acceptance criteria:**
- All tests pass across all packages
- Typecheck passes across all packages
- No references to `ModelOptions` or `{ tenant: }` remain in the codebase

## Review Sign-offs

### DX (josh) — APPROVED WITH SUGGESTIONS ✅
- [x] API is intuitive — `.tenant()` follows `.shared()` pattern
- [x] Auto-derivation is clear, not surprising
- [x] LLM-friendly: one declaration, no string repetition
- Suggestions incorporated: actionable warning text, improved error messages, safety-first Problem framing

### Product/Scope — APPROVED WITH SUGGESTIONS ✅
- [x] Fits roadmap — natural evolution of #955
- [x] Non-goals are correct (added: denormalized FK columns)
- [x] Single tenant root constraint is not too limiting
- Suggestions incorporated: denormalized column non-goal, `ModelOptions` tradeoff acknowledged, `resolveTenantChain` algorithm specified, ambiguity check clarified

### Technical — APPROVED WITH SUGGESTIONS ✅
- [x] Can be built as designed
- [x] `_tenant: boolean` does not affect derived types
- [x] Lazy thunks have no evaluation order issues
- [x] Performance is fine (same fixed-point iteration)
- Suggestions incorporated: `entity.ts` resolution moved to `createServer`, missing files added to phases, `index.ts` export removal added
