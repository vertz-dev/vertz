# Phase 2: CRUD Pipeline — Composite PK Entity Support

## Context

Issue [#1776](https://github.com/vertz-dev/vertz/issues/1776). Phase 1 widened the DB adapter to accept `string | Record<string, string>` for IDs and fixed `tableToSchemas()` to include composite PK columns in create bodies.

This phase lifts the composite PK guard in `createCrudHandlers()` and wires composite ID handling through the CRUD pipeline: get, update, delete, cursor pagination, error messages, and the `EntityOperations` interface.

Design doc: `plans/composite-pk-entity-support.md`

## Tasks

### Task 1: Lift composite PK guard and add PK column resolution

**Files:**
- `packages/server/src/entity/crud-pipeline.ts` (modified)
- `packages/server/src/entity/__tests__/crud-pipeline.test.ts` (modified)

**What to implement:**

1. **Remove the composite PK guard** (lines 159-171 of `crud-pipeline.ts`). Replace with PK column resolution:

```ts
// Replace the guard with PK column resolution using table._primaryKey
const pkColumns: string[] = table._primaryKey?.length
  ? [...table._primaryKey]
  : (() => {
      // Fallback: scan _columns for primary metadata (backward compat)
      for (const key of Object.keys(table._columns)) {
        const col = table._columns[key] as ColumnBuilder<unknown, ColumnMetadata> | undefined;
        if (col?._meta.primary) return [key];
      }
      return ['id']; // default fallback
    })();

const isCompositePk = pkColumns.length > 1;
```

2. **Add an `EntityId` type alias** at the top of the file:

```ts
/** ID type for entity operations — single string or composite key record. */
export type EntityId = string | Record<string, string>;
```

3. **Update `CrudHandlers` interface:** Change `id: string` to `id: EntityId` on `get`, `update`, `delete`.

4. **Update `WidenedUpdate` and `WidenedDelete` type aliases:**

```ts
type WidenedUpdate = (
  id: EntityId,
  data: Record<string, unknown>,
  options?: { where: Record<string, unknown> },
) => Promise<Record<string, unknown>>;
type WidenedDelete = (
  id: EntityId,
  options?: { where: Record<string, unknown> },
) => Promise<Record<string, unknown> | null>;
```

5. **Add composite ID validation helper:**

```ts
function validateEntityId(id: EntityId, pkColumns: string[], entityName: string): Record<string, string> {
  if (typeof id === 'string') {
    if (pkColumns.length > 1) {
      throw new EntityValidationError([{
        path: [],
        message: `Entity "${entityName}" requires composite key { ${pkColumns.join(', ')} }. Got a single string ID. Use: { ${pkColumns.map(c => `${c}: "..."`).join(', ')} }`,
        code: 'invalid_type',
      }]);
    }
    // Single PK — return as record with default column name
    return { [pkColumns[0]!]: id };
  }
  // Composite: validate all PK columns present
  for (const col of pkColumns) {
    if (!(col in id)) {
      throw new EntityValidationError([{
        path: [col],
        message: `Entity "${entityName}" requires composite key { ${pkColumns.join(', ')} }. Missing key column: "${col}".`,
        code: 'invalid_type',
      }]);
    }
  }
  return id;
}
```

6. **Update `notFound()` helper:**

```ts
function notFound(id: EntityId) {
  const idStr = typeof id === 'string'
    ? `id "${id}"`
    : `key { ${Object.entries(id).map(([k, v]) => `${k}: "${v}"`).join(', ')} }`;
  return err(new EntityNotFoundError(`${def.name} with ${idStr} not found`));
}
```

**Tests to write:**

```ts
describe('createCrudHandlers — composite PK', () => {
  it('does NOT throw for composite-PK tables', () => {
    // Previously this threw "Entity CRUD does not support composite primary keys"
    expect(() => createCrudHandlers(compositePkDef, mockDb)).not.toThrow();
  });

  it('validates composite ID completeness — missing column', async () => {
    const handlers = createCrudHandlers(compositePkDef, mockDb);
    const result = await handlers.get(ctx, { projectId: 'p1' }); // missing userId
    expect(result.ok).toBe(false);
    expect(result.error.message).toContain('Missing key column: "userId"');
  });

  it('validates composite ID — string ID on composite entity', async () => {
    const handlers = createCrudHandlers(compositePkDef, mockDb);
    const result = await handlers.get(ctx, 'single-string');
    expect(result.ok).toBe(false);
    expect(result.error.message).toContain('requires composite key');
  });

  it('notFound formats composite key in error', async () => {
    const handlers = createCrudHandlers(compositePkDef, mockDb);
    // Mock db.get to return null
    const result = await handlers.get(ctx, { projectId: 'p1', userId: 'u1' });
    expect(result.ok).toBe(false);
    expect(result.error.message).toContain('key { projectId: "p1", userId: "u1" }');
  });
});
```

**Acceptance criteria:**
- [ ] `createCrudHandlers()` no longer throws for composite-PK tables
- [ ] PK columns resolved from `table._primaryKey` with fallback to `_meta.primary` scan
- [ ] Composite ID validation: missing column returns descriptive error
- [ ] Single-string ID on composite entity returns descriptive error
- [ ] `notFound()` formats composite key values in error message
- [ ] `EntityId` type exported
- [ ] `WidenedUpdate`/`WidenedDelete` accept `EntityId`
- [ ] Existing single-PK tests unchanged

---

### Task 2: Composite ID in get, update, delete handlers

**Files:**
- `packages/server/src/entity/crud-pipeline.ts` (modified)
- `packages/server/src/entity/__tests__/crud-pipeline.test.ts` (modified)

**What to implement:**

Update the `get`, `update`, and `delete` handlers to use `validateEntityId()` and pass the resolved ID Record to the DB adapter:

1. **`get` handler (line 383):**

```ts
async get(ctx, id, options) {
  const resolvedId = validateEntityId(id, pkColumns, def.name);
  // ... existing access/tenant logic ...
  const row = await db.get(resolvedId, getOpts);
  if (!row) return notFound(id);
  // ... rest unchanged
}
```

2. **`update` handler (line 566):**

```ts
async update(ctx, id, data) {
  const resolvedId = validateEntityId(id, pkColumns, def.name);
  // ... existing validation, access, tenant logic ...
  const existing = await db.get(resolvedId, whereOpts);
  if (!existing) return notFound(id);
  // ... defense-in-depth update:
  if (hasWhere) {
    result = await (db.update as WidenedUpdate)(resolvedId, input, { where: dbWhere });
  } else {
    result = await db.update(resolvedId, input);
  }
  // ... rest unchanged
}
```

3. **`delete` handler (line 647):**

```ts
async delete(ctx, id) {
  const resolvedId = validateEntityId(id, pkColumns, def.name);
  // ... existing access, tenant logic ...
  const existing = await db.get(resolvedId, whereOpts);
  if (!existing) return notFound(id);
  if (hasWhere) {
    deleted = await (db.delete as WidenedDelete)(resolvedId, { where: dbWhere });
  } else {
    deleted = await db.delete(resolvedId);
  }
  // ... rest unchanged
}
```

**Tests to write:**

```ts
it('get() with composite ID calls db.get with Record', async () => {
  const handlers = createCrudHandlers(compositePkDef, mockDb);
  await handlers.get(ctx, { projectId: 'p1', userId: 'u1' });
  expect(mockDb.get).toHaveBeenCalledWith(
    { projectId: 'p1', userId: 'u1' },
    expect.anything(),
  );
});

it('update() with composite ID calls db.get and db.update with Record', async () => {
  const handlers = createCrudHandlers(compositePkDef, mockDb);
  await handlers.update(ctx, { projectId: 'p1', userId: 'u1' }, { role: 'admin' });
  expect(mockDb.get).toHaveBeenCalledWith(
    { projectId: 'p1', userId: 'u1' },
    expect.anything(),
  );
});

it('delete() with composite ID calls db.delete with Record', async () => {
  const handlers = createCrudHandlers(compositePkDef, mockDb);
  await handlers.delete(ctx, { projectId: 'p1', userId: 'u1' });
  expect(mockDb.delete).toHaveBeenCalledWith({ projectId: 'p1', userId: 'u1' });
});

it('single PK entity with string ID unchanged', async () => {
  const handlers = createCrudHandlers(singlePkDef, mockDb);
  await handlers.get(ctx, 'uuid-123');
  // Verify db.get called with { id: 'uuid-123' } (Record form)
});
```

**Acceptance criteria:**
- [ ] `get(ctx, { pk1, pk2 })` resolves to `db.get({ pk1, pk2 })`
- [ ] `update(ctx, { pk1, pk2 }, data)` resolves to `db.update({ pk1, pk2 }, data)`
- [ ] `delete(ctx, { pk1, pk2 })` resolves to `db.delete({ pk1, pk2 })`
- [ ] Single-PK entity: `get(ctx, 'uuid')` resolves to `db.get({ id: 'uuid' })`
- [ ] Defense-in-depth WHERE conditions still applied on update/delete
- [ ] Tenant-scoped composite entities: `withTenantFilter` and `resolveIndirectTenantWhere` still work

---

### Task 3: Composite cursor pagination

**Files:**
- `packages/server/src/entity/crud-pipeline.ts` (modified)
- `packages/server/src/entity/__tests__/crud-pipeline.test.ts` (modified)

**What to implement:**

1. **Encode composite cursor** in `list` handler. Replace `resolvePrimaryKeyColumn` usage (line 372) with composite-aware encoding:

```ts
// In list handler, after getting rows:
const lastRow = rows[rows.length - 1] as Record<string, unknown> | undefined;
let nextCursor: string | null = null;
if (limit > 0 && rows.length === limit && lastRow) {
  if (isCompositePk) {
    // Composite: JSON object with PK column values
    const cursorObj: Record<string, string> = {};
    for (const col of pkColumns) {
      cursorObj[col] = String(lastRow[col] as string | number);
    }
    nextCursor = JSON.stringify(cursorObj);
  } else {
    // Single PK: plain string (unchanged)
    nextCursor = String(lastRow[pkColumns[0]!] as string | number);
  }
}
```

2. **Decode composite cursor** — add a helper function:

```ts
/**
 * Decodes a cursor string. Returns a Record<string, string> keyed by PK columns.
 * For single PK: plain string → { pkColumn: value }
 * For composite PK: JSON object → validated against pkColumns
 */
function decodeCursor(
  after: string,
  pkColumns: string[],
  entityName: string,
): Record<string, string> | null {
  if (pkColumns.length === 1) {
    // Single PK: cursor is the raw value
    return { [pkColumns[0]!]: after };
  }
  // Composite: expect JSON object
  if (!after.startsWith('{')) return null; // invalid format
  try {
    const parsed = JSON.parse(after);
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return null;
    // Validate all PK columns present with string values
    for (const col of pkColumns) {
      if (typeof parsed[col] !== 'string') return null;
    }
    return parsed as Record<string, string>;
  } catch {
    return null;
  }
}
```

3. Wire cursor decoding in `list` handler before calling `db.list`:

```ts
// Decode cursor and pass as additional where condition
if (after) {
  const cursorRecord = decodeCursor(after, pkColumns, def.name);
  if (!cursorRecord) {
    return err(new EntityValidationError([{
      path: ['after'],
      message: `Invalid cursor format for entity "${def.name}".`,
      code: 'invalid_type',
    }]));
  }
  // TODO: The bridge adapter now forwards cursor; pass it through
  // For now, the cursor is forwarded as-is via options.after
}
```

Note: Full cursor-to-SQL wiring depends on the bridge adapter forwarding `cursor` to `listAndCount` (done in Phase 1). For composite PKs, the CRUD pipeline should pass the decoded cursor record to the adapter. This may require extending `ListOptions.after` to accept `Record<string, string>` or adding a `cursor` option. The exact wiring depends on how the bridge adapter passes it through.

**Tests to write:**

```ts
describe('composite cursor pagination', () => {
  it('encodes composite cursor as JSON object', async () => {
    const handlers = createCrudHandlers(compositePkDef, mockDbWithRows);
    const result = await handlers.list(ctx, { limit: 1 });
    expect(result.ok).toBe(true);
    const cursor = result.data.body.nextCursor;
    const parsed = JSON.parse(cursor!);
    expect(parsed).toEqual({ projectId: 'p1', userId: 'u1' });
  });

  it('single PK cursor remains plain string', async () => {
    const handlers = createCrudHandlers(singlePkDef, mockDbWithRows);
    const result = await handlers.list(ctx, { limit: 1 });
    expect(result.ok).toBe(true);
    expect(result.data.body.nextCursor).toBe('uuid-123'); // not JSON
  });

  it('returns 400 for invalid composite cursor', async () => {
    const handlers = createCrudHandlers(compositePkDef, mockDb);
    const result = await handlers.list(ctx, { limit: 10, after: 'not-json' });
    expect(result.ok).toBe(false);
    expect(result.error.message).toContain('Invalid cursor');
  });
});
```

**Acceptance criteria:**
- [ ] Composite cursor encoded as `{"col1":"val1","col2":"val2"}`
- [ ] Single PK cursor unchanged (plain string)
- [ ] Invalid cursor format returns validation error
- [ ] Cursor encodes all PK columns from `_primaryKey` order

---

### Task 4: Widen `EntityOperations` interface

**Files:**
- `packages/server/src/entity/entity-operations.ts` (modified)
- `packages/server/src/entity/__tests__/crud-pipeline.test.ts` (modified — if EntityOperations has tests here)

**What to implement:**

Import and use the `EntityId` type from `crud-pipeline.ts`:

```ts
import type { EntityId } from './crud-pipeline';

export interface EntityOperations<TModel extends ModelDef = ModelDef> {
  get(id: EntityId): Promise<TModel['table']['$response']>;
  list(options?: ListOptions<TModel>): Promise<ListResult<TModel['table']['$response']>>;
  create(data: TModel['table']['$create_input']): Promise<TModel['table']['$response']>;
  update(id: EntityId, data: TModel['table']['$update_input']): Promise<TModel['table']['$response']>;
  delete(id: EntityId): Promise<void>;
}
```

Also update any implementations of `EntityOperations` (check `create-server.ts` or wherever `createEntityOps` is defined) to accept `EntityId`.

**Tests to write:**

```ts
it('EntityOperations.get accepts Record<string, string>', () => {
  // Type-level test — just verify it compiles
  const ops: EntityOperations = {} as EntityOperations;
  ops.get({ projectId: 'p1', userId: 'u1' });
  ops.get('uuid-123');
});
```

**Acceptance criteria:**
- [ ] `EntityOperations.get/update/delete` accept `EntityId`
- [ ] `list` and `create` signatures unchanged
- [ ] Any `createEntityOps` implementation updated to pass through composite IDs

---

### Task 5: Tenant-scoped composite entity integration tests

**Files:**
- `packages/server/src/entity/__tests__/crud-pipeline-tenant.test.ts` (modified)

**What to implement:**

Add tests verifying that indirectly-scoped composite-PK entities work correctly with the tenant chain:

```ts
describe('composite PK + indirect tenant scoping', () => {
  // Setup: project_members(projectId, userId) → projects(id, orgId) → organizations(id)
  // project_members is indirectly scoped via projectId → projects → organizations

  it('create: verifies parent FK belongs to tenant', async () => {
    // Create a project member with a valid projectId in the tenant
    const result = await handlers.create(tenantCtx, {
      projectId: tenantProject.id,
      userId: 'user-1',
    });
    expect(result.ok).toBe(true);
  });

  it('create: rejects parent FK from different tenant', async () => {
    const result = await handlers.create(tenantCtx, {
      projectId: otherTenantProject.id,
      userId: 'user-1',
    });
    expect(result.ok).toBe(false);
    expect(result.error).toBeInstanceOf(EntityForbiddenError);
  });

  it('list: filters by tenant via indirect chain', async () => {
    const result = await handlers.list(tenantCtx);
    expect(result.ok).toBe(true);
    // Should only see members from projects in the tenant
  });
});
```

**Acceptance criteria:**
- [ ] Indirectly-scoped composite entity: parent FK validation works
- [ ] Create validates parent belongs to tenant
- [ ] List filters by tenant via chain
- [ ] Existing tenant tests still pass
