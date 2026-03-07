# Move Tenant Scoping to Model-Level (d.model)

**Issue:** [#955](https://github.com/vertz-dev/vertz/issues/955)
**Related:** [#954](https://github.com/vertz-dev/vertz/issues/954) (derive FK from relations — converges with this work)
**Status:** v2 — revised after adversarial review

## Problem

Tenant scoping is currently defined as a column annotation via `d.tenant()`:

```ts
const users = d.table('users', {
  organizationId: d.tenant(organizations),
  name: d.text(),
});
```

This mixes concerns:

1. **Cohesion violation** (internal): `d.tenant(organizations)` bundles three things into one column call: (a) UUID type, (b) FK reference, (c) tenant scoping key. These are at different abstraction levels. The framework maintainer pays for this when `computeTenantGraph` must scan column internals to discover scoping.

2. **Inconsistency with relations** (DX): Relations are defined separately from columns (via `d.model(table, { relations })`). Tenant scoping is a relationship concern — it should follow the same pattern.

3. **Blocks request-level auto-scoping**: Future runtime behavior (inject `tenantId` on the request context → all queries auto-scoped) requires a clean tenant graph derived from explicit declarations, not column metadata scanning. The graph must know the full path from any entity back to the tenant root — through both direct and indirect relations.

## Proposed Direction

Move tenant declaration to `d.model()` as a model-level option that references a relation by name. The column becomes a plain UUID; the model declares which relation is the tenant boundary.

### Before

```ts
const organizations = d.table('organizations', {
  id: d.uuid().primary(),
  name: d.text(),
});

const users = d.table('users', {
  id: d.uuid().primary(),
  organizationId: d.tenant(organizations),
  name: d.text(),
});

const usersModel = d.model(users);
```

### After

```ts
const organizations = d.table('organizations', {
  id: d.uuid().primary(),
  name: d.text(),
});

const users = d.table('users', {
  id: d.uuid().primary(),
  organizationId: d.uuid(),    // plain FK column
  name: d.text(),
});

const usersModel = d.model(users, {
  organization: d.ref.one(() => organizations, 'organizationId'),
}, { tenant: 'organization' });
```

The `{ tenant: 'organization' }` option references the relation by name. The model declares: "this model is tenant-scoped via its 'organization' relation."

### Why model-level `{ tenant }` (not `.tenant()` on the relation)

Three options were evaluated:

**Option A: `.tenant()` on the relation** (rejected after adversarial review)
```ts
d.ref.one(() => organizations, 'organizationId').tenant()
```
Problems:
- Wrong abstraction level. Tenant scoping is a property of the **model** (how the model's data is partitioned), not of the **relation** (how two tables connect). Compare: `.shared()` lives on the table because "cross-tenant" is a table-level policy. "Scoped by X" is a model-level policy.
- Type system leak. Adding `.tenant()` to `RelationDef` makes it available on `ref.many` with FK (returns `RelationDef<T, 'many'>`), and on `.through()` chains. Restricting it requires a new `OneRelationDef` type — unnecessary complexity.
- Blocks future extensibility. Composite tenants (`{ tenant: ['organization', 'region'] }`) or hierarchical scoping have no natural expression on a single relation.

**Option B: Model-level string referencing the FK column** (rejected)
```ts
d.model(users, relations, { tenant: 'organizationId' })
```
Rejected: Duplicates information (the relation already declares the FK) and references a column name as a string — not type-safe against the model's relations.

**Option C: Model-level string referencing the relation name** (chosen)
```ts
d.model(users, {
  organization: d.ref.one(() => organizations, 'organizationId'),
}, { tenant: 'organization' })
```
- Correct abstraction: "this model is tenant-scoped via its 'organization' relation."
- Type-safe: `'organization'` is constrained to `keyof TRelations` — typos are compile errors.
- No duplication: the relation carries the FK and target table; `tenant` just points to which relation.
- Extensible: composite tenants could become `{ tenant: ['organization', 'region'] }`.
- Reads naturally alongside `.shared()`: shared is table-level, scoped is model-level. Both are data isolation policies at the appropriate abstraction level.

### Convergence with #954 (Derive FK from Relations)

Issue #954 proposes that `.references()` on columns should be deprecated — relations should be the single source of truth for FK constraints.

After BOTH #955 and #954 land:
- Columns are pure data types + constraints. No FK metadata, no tenant metadata.
- Relations are the single source of truth for: FK constraints, eager loading, AND tenant scoping.
- `computeTenantGraph` reads ENTIRELY from relations — no column scanning at all.

This change takes a critical step: it makes `computeTenantGraph` read both direct AND indirect scoping from relations (see "Indirect scoping from relations" below). This means #954 does not need to land first — the tenant graph is fully relation-derived after this change.

## API Surface

### d.model() — new optional third argument

```ts
// Current signature (unchanged for 0-arg and 2-arg overloads)
d.model<TTable>(table: TTable): ModelDef<TTable, {}>;
d.model<TTable, TRelations>(table: TTable, relations: TRelations): ModelDef<TTable, TRelations>;

// New: 3-arg overload with model options
d.model<TTable, TRelations>(
  table: TTable,
  relations: TRelations,
  options: ModelOptions<TRelations>,
): ModelDef<TTable, TRelations>;
```

### ModelOptions type

```ts
interface ModelOptions<TRelations extends Record<string, RelationDef>> {
  /**
   * The relation that defines the tenant boundary for this model.
   * Must reference a key in the relations record. The referenced relation's
   * target table is the tenant root.
   *
   * When set, all queries on this model will be automatically scoped to the
   * current tenant (once request-level auto-scoping is implemented).
   */
  readonly tenant?: Extract<keyof TRelations, string>;
}
```

The `tenant` value is constrained to `Extract<keyof TRelations, string>` — only valid relation names accepted. Typos are compile-time errors.

### ModelDef — new optional `_tenant` field

```ts
interface ModelDef<TTable, TRelations> {
  readonly table: TTable;
  readonly relations: TRelations;
  readonly schemas: ModelSchemas<TTable>;
  readonly _tenant: string | null;  // NEW — the relation name, or null
}
```

### RelationDef — unchanged

No changes to `RelationDef`, `ManyRelationDef`, or `createOneRelation`. The relation types stay clean.

### computeTenantGraph — fully relation-derived

Both direct and indirect scoping read from `entry.relations`:

```ts
// Step 1: Find directly scoped models (those with _tenant set)
for (const [key, entry] of entries) {
  if (entry._tenant) {
    const tenantRel = entry.relations[entry._tenant];
    // tenantRel._target()._name → tenant root table name
    // tenantRel._foreignKey → FK column name
    directlyScoped.push(key);
    root = tableNameToKey.get(tenantRel._target()._name);
  }
}

// Step 2: Find indirectly scoped models (via relation chains)
// Walk ALL relations (not just tenant ones) to find tables
// that reference a scoped table.
for (const [relKey, rel] of Object.entries(entry.relations)) {
  const targetName = rel._target()._name;
  if (scopedTableNames.has(targetName)) {
    // This table is indirectly scoped
  }
}
```

**Key change from v1:** Indirect scoping now also reads from relations instead of column `.references()`. This eliminates the hybrid state (direct from relations, indirect from columns) that the adversarial review flagged as a blocker. The tenant graph is fully derived from the relation layer.

**Implication:** Every table that participates in indirect tenant scoping must have a relation defined for its FK to the scoped table. Without a relation, `computeTenantGraph` cannot see the FK chain. This is consistent with the direction of #954 (relations as the single source of truth for FK relationships).

### Column builder — d.tenant() removed

`d.tenant()` and the `TenantMeta` type are removed. The `isTenant` flag is removed from `ColumnMetadata`.

### .shared() on TableDef — preserved as-is

`.shared()` marks a table as cross-tenant. This is correctly a table-level concern:
- `.shared()` on the table → "this table's data is NOT partitioned" (table-level policy)
- `{ tenant: 'relation' }` on the model → "this model's data IS partitioned via this relation" (model-level policy)

Both are data isolation policies at the appropriate abstraction level. `.shared()` doesn't need relations (shared tables have no tenant boundary to reference).

## Manifesto Alignment

- **One way to do things**: Tenant scoping is declared in exactly one place — the `tenant` model option. No duplication between column and model. The full tenant graph (direct + indirect) is derived from a single data source (relations).
- **Explicit over implicit**: `{ tenant: 'organization' }` is explicit. The developer declares "this model is tenant-scoped via its organization relation." The system doesn't infer it from column names or conventions.
- **Compile-time over runtime**: The `tenant` option is type-checked against relation keys — a typo is a compile error. The relation itself uses variable references (`() => organizations`), not strings.
- **Predictability over convenience**: The model declaration tells the full story: columns for data types, relations for relationships, `tenant` for scoping policy. A developer reading the model knows everything about the entity's data behavior.

## Diagnostics and Error Messages

### Warning: Relation to tenant root without `{ tenant }` declaration

When `computeTenantGraph` finds a model with a relation pointing to the tenant root table but no `{ tenant }` option set, it emits a warning:

```
[vertz/db] Model "invoices" has a relation to tenant root "organizations" via "organizationId"
but is not declared as tenant-scoped. Add { tenant: 'organization' } to d.model() options,
or mark the table as .shared() if cross-tenant access is intentional.
```

This catches the "forgot to add `{ tenant }` " case — currently a silent misconfiguration.

### Warning: Unscoped table (preserved from current behavior)

When a tenant root exists but a model is neither scoped, shared, nor the root itself:

```
[vertz/db] Table "audit_logs" has no tenant path and is not marked .shared().
It will not be automatically scoped to a tenant.
```

## Non-Goals

- **Runtime auto-scoping**: This change moves WHERE tenant is declared and ensures the graph is fully relation-derived. The runtime behavior (auto-filter queries by tenant, auto-inject tenant ID on create) is a separate feature that builds on this foundation.
- **Multi-tenant root**: Single tenant root only. All `{ tenant }` declarations across models must ultimately point to the same root table. This is the current behavior, preserved.
- **Table/model unification (#953)**: This design works with the current `d.table()` + `d.model()` two-step. When #953 lands (`.relations()` on table), the model options can be chained similarly.

## Unknowns

No unknowns remaining. All items resolved during adversarial review:

1. **Abstraction level** → Resolved: model-level `{ tenant }` option, not relation-level `.tenant()`.
2. **Indirect scoping without column `.references()`** → Resolved: `computeTenantGraph` reads both direct and indirect scoping from relations. No column scanning.
3. **Type restriction (ref.one only)** → Resolved: `tenant` references a relation name, and the type constraint `Extract<keyof TRelations, string>` accepts any relation. The system validates at `computeTenantGraph` time that the referenced relation is `_type: 'one'` (runtime error if a many relation is referenced as tenant). Future: could add type-level constraint to only accept keys whose values are `RelationDef<_, 'one'>`.
4. **`.tenant()` leaking to ManyRelationDef/through** → Resolved: no `.tenant()` on relations at all. Model option only.

## Type Flow Map

```
d.model(users, { organization: d.ref.one(() => orgs, 'orgId') }, { tenant: 'organization' })
  ↓  ModelDef._tenant = 'organization'
  ↓  ModelDef.relations.organization._target = () => orgs
createDb({ models: { users: usersModel, tasks: tasksModel, ... } })
  ↓  computeTenantGraph reads:
  ↓    - _tenant from each model (direct scoping)
  ↓    - relations._target()._name from all models (indirect scoping)
TenantGraph { root: 'organizations', directlyScoped: ['users'], indirectlyScoped: ['tasks'], shared: [...] }
  ↓  exposed via db._internals.tenantGraph
Server entity system / request middleware reads tenantGraph for auto-scoping
  ↓  tenantId injected per-request → all queries scoped automatically
```

## E2E Acceptance Test

```ts
// Tenant declared at model level, NOT on column
const organizations = d.table('organizations', {
  id: d.uuid().primary(),
  name: d.text(),
});

const users = d.table('users', {
  id: d.uuid().primary(),
  organizationId: d.uuid(),  // plain column — no .tenant()
  name: d.text(),
});

const tasks = d.table('tasks', {
  id: d.uuid().primary(),
  userId: d.uuid(),  // plain column — no .references() needed
  title: d.text(),
});

const featureFlags = d.table('feature_flags', {
  id: d.uuid().primary(),
  name: d.text(),
}).shared();

const db = createDb({
  url: 'postgres://...',
  models: {
    organizations: d.model(organizations),
    users: d.model(users, {
      organization: d.ref.one(() => organizations, 'organizationId'),
    }, { tenant: 'organization' }),
    tasks: d.model(tasks, {
      user: d.ref.one(() => users, 'userId'),
    }),
    featureFlags: d.model(featureFlags),
  },
});

// Tenant graph computed correctly from relation metadata
expect(db._internals.tenantGraph.root).toBe('organizations');
expect(db._internals.tenantGraph.directlyScoped).toContain('users');
expect(db._internals.tenantGraph.indirectlyScoped).toContain('tasks');
expect(db._internals.tenantGraph.shared).toContain('featureFlags');

// Type error: tenant must reference a valid relation name
// @ts-expect-error — 'nonexistent' is not a key of the relations record
d.model(users, {
  organization: d.ref.one(() => organizations, 'organizationId'),
}, { tenant: 'nonexistent' });

// Type error: d.tenant() no longer exists
// @ts-expect-error — d.tenant removed
d.tenant(organizations);
```

## Implementation Phases

### Phase 1: Add `ModelOptions` and `_tenant` to `d.model()` / `ModelDef`

**Changes:**
- `packages/db/src/schema/model.ts`: Add `ModelOptions<TRelations>` interface with `tenant?: Extract<keyof TRelations, string>`. Add `_tenant: string | null` to `ModelDef`. Update `createModel()` to accept optional third argument.
- `packages/db/src/d.ts`: Add 3-arg overload for `d.model()`. Pass options through to `createModel()`.
- `packages/db/src/schema/inference.ts`: Add `_tenant?: string | null` to `ModelEntry` if needed for `computeTenantGraph` compatibility.

**Type-level tests:**
- `d.model(table, { org: d.ref.one(...) }, { tenant: 'org' })` compiles.
- `d.model(table, { org: d.ref.one(...) }, { tenant: 'bad' })` → `@ts-expect-error`.
- `d.model(table)._tenant` is `null`.
- `d.model(table, { org: d.ref.one(...) }, { tenant: 'org' })._tenant` is `string | null`.

**Integration test:**
```ts
const model = d.model(users, {
  organization: d.ref.one(() => organizations, 'organizationId'),
}, { tenant: 'organization' });
expect(model._tenant).toBe('organization');
expect(model.relations.organization._type).toBe('one');
```

### Phase 2: Rewrite `computeTenantGraph` to be fully relation-derived

**Changes:**
- `packages/db/src/client/tenant-graph.ts`:
  - Update `TableRegistryEntry` to include `_tenant: string | null` and `relations: Record<string, RelationDef>`.
  - **Step 1 (direct scoping):** Scan entries for `_tenant !== null`. Read the tenant relation's `_target()._name` to find the root table.
  - **Step 2 (indirect scoping):** Walk ALL relations across ALL entries. For each relation, check if `rel._target()._name` refers to a scoped table. If yes, the current table is indirectly scoped. Fixed-point iteration until no new tables are found.
  - Remove all column-scanning logic (`col._meta.isTenant`, `col._meta.references`).
- Update all `tenant-graph.test.ts` tests to use model-level tenant declarations with relations.

**Integration test:** Same test matrix as today (root detection, direct scoping, indirect scoping, multi-hop, shared, unscoped, null root) — all using relation-based declarations.

### Phase 3: Remove `d.tenant()`, `TenantMeta`, and `isTenant` from columns

**Changes:**
- `packages/db/src/schema/column.ts`: Remove `createTenantColumn()`, `TenantMeta` type. Remove `isTenant` from `ColumnMetadata` and `DefaultMeta`.
- `packages/db/src/d.ts`: Remove `d.tenant()` from the `d` namespace type and implementation.
- Update all test files that use `d.tenant()`:
  - `column.test.ts`, `column.test-d.ts`: Remove `d.tenant()` test section. Add test that `d.tenant` does not exist.
  - `table.test.ts`, `table.test-d.ts`: Replace `d.tenant(org)` with `d.uuid()` where used.
  - `e2e.test.ts`: Change `organizationId: d.tenant(organizations)` to `d.uuid()`. Add organization relation with `{ tenant: 'organization' }` to users model.
  - `prisma-style-api.test.ts`: Same pattern.
  - `database.test.ts`: Same pattern.
  - `database-client-types.test-d.ts`, `database-types.test-d.ts`: Update if they reference `isTenant`.
  - `result-errors.test.ts`, `createDb-dialect.test.ts`: Update if they reference tenant column metadata.
  - `database-bridge-adapter.test.ts`: Update if needed.
  - `postgres-integration.test.ts`: Same pattern as e2e.test.ts.
- `packages/schema/src/__tests__/from-db-enum.test.ts`: Remove stale `isTenant: false` from mock `_meta` objects.

**Integration test:** `d.tenant` is `undefined`. `ColumnMetadata` type has no `isTenant` field.

### Phase 4: Update server package, add diagnostics, final verification

**Changes:**
- `packages/server/src/__tests__/create-server.test.ts`: Update mock `tenantGraph` in `mockDatabaseClient._internals`.
- `packages/server/src/entity/__tests__/context.test.ts`, `packages/server/src/service/__tests__/context.test.ts`: Verify tenant context still works (these use `tenantId` on request, not column metadata — likely unchanged).
- `packages/server/src/entity/__tests__/access-enforcer.test.ts`: Update if it references tenant column metadata.
- Add the diagnostic warning to `createDb()`: when a relation points to the tenant root but the model has no `{ tenant }`, log a specific warning.
- Verify `bun test` passes across ALL packages.
- Verify `bun run typecheck` passes across ALL packages.
- Run `bun run typecheck --filter @vertz/integration-tests` for cross-package type safety.

**Integration test:** Full E2E acceptance test from above. All quality gates green.
