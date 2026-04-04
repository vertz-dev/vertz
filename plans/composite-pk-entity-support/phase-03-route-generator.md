# Phase 3: Route Generator — Multi-Segment Paths

## Context

Issue [#1776](https://github.com/vertz-dev/vertz/issues/1776). Phase 1 widened the DB adapter, Phase 2 lifted the CRUD guard and wired composite ID handling. This phase generates multi-segment URL paths (`/:pk1/:pk2`) for composite-PK entities in the route generator, including custom actions.

Design doc: `plans/composite-pk-entity-support.md`

## Tasks

### Task 1: Multi-segment route paths for CRUD operations

**Files:**
- `packages/server/src/entity/route-generator.ts` (modified)
- `packages/server/src/entity/__tests__/route-generator.test.ts` (modified)

**What to implement:**

1. **Resolve PK columns at the top of `generateEntityRoutes()`:**

```ts
const table = def.model.table;
const pkColumns: string[] = table._primaryKey?.length
  ? [...table._primaryKey]
  : (() => {
      for (const [key, col] of Object.entries(table._columns)) {
        if ((col as any)?._meta?.primary) return [key];
      }
      return ['id'];
    })();
const isCompositePk = pkColumns.length > 1;
```

2. **Build the ID path pattern:**

```ts
// Single PK: '/:id' (unchanged)
// Composite PK: '/:projectId/:userId' (PK column names in _primaryKey order)
const idPath = isCompositePk
  ? '/' + pkColumns.map(col => `:${col}`).join('/')
  : '/:id';
```

3. **Replace all `${basePath}/:id` with `${basePath}${idPath}`** in the route registration for GET (single), PATCH, DELETE:

```ts
// GET single
routes.push({ method: 'GET', path: `${basePath}${idPath}`, handler: ... });
// PATCH
routes.push({ method: 'PATCH', path: `${basePath}${idPath}`, handler: ... });
// DELETE
routes.push({ method: 'DELETE', path: `${basePath}${idPath}`, handler: ... });
```

4. **Extract composite ID from params in each handler:**

```ts
// Replace: const id = getParams(ctx).id as string;
// With:
function extractEntityId(ctx: Record<string, unknown>): EntityId {
  const params = getParams(ctx);
  if (isCompositePk) {
    const compositeId: Record<string, string> = {};
    for (const col of pkColumns) {
      compositeId[col] = params[col] as string;
    }
    return compositeId;
  }
  return params.id as string;
}
```

Update GET handler (~line 393):
```ts
const id = extractEntityId(ctx);
const result = await crudHandlers.get(entityCtx, id, getOptions);
```

Update PATCH handler (~line 530):
```ts
const id = extractEntityId(ctx);
const result = await crudHandlers.update(entityCtx, id, data);
```

Update DELETE handler (~line 586):
```ts
const id = extractEntityId(ctx);
const result = await crudHandlers.delete(entityCtx, id);
```

5. **LIST and CREATE routes remain unchanged** — they use `basePath` without an ID segment.

6. **Add startup log for composite-PK entities:**

```ts
if (isCompositePk) {
  console.log(`[vertz] Entity "${def.name}" routes: ${basePath}${idPath} (composite PK)`);
}
```

**Tests to write:**

```ts
describe('generateEntityRoutes — composite PK', () => {
  it('generates multi-segment paths for GET, PATCH, DELETE', () => {
    const routes = generateEntityRoutes(compositePkDef, registry, mockDb);
    const paths = routes.map(r => `${r.method} ${r.path}`);
    expect(paths).toContain('GET /api/project-members/:projectId/:userId');
    expect(paths).toContain('PATCH /api/project-members/:projectId/:userId');
    expect(paths).toContain('DELETE /api/project-members/:projectId/:userId');
  });

  it('keeps single-segment path for single-PK entities', () => {
    const routes = generateEntityRoutes(singlePkDef, registry, mockDb);
    const paths = routes.map(r => `${r.method} ${r.path}`);
    expect(paths).toContain('GET /api/tasks/:id');
  });

  it('LIST and CREATE routes unchanged', () => {
    const routes = generateEntityRoutes(compositePkDef, registry, mockDb);
    const paths = routes.map(r => `${r.method} ${r.path}`);
    expect(paths).toContain('GET /api/project-members');
    expect(paths).toContain('POST /api/project-members');
  });

  it('GET handler extracts composite ID from params', async () => {
    const routes = generateEntityRoutes(compositePkDef, registry, mockDb);
    const getRoute = routes.find(r => r.method === 'GET' && r.path.includes(':projectId'));
    // Mock ctx with params matching composite PK
    const ctx = {
      params: { projectId: 'p1', userId: 'u1' },
      query: {},
      userId: 'user-1',
      tenantId: null,
      roles: [],
    };
    const response = await getRoute!.handler(ctx);
    // Verify it called db.get with composite ID
  });
});
```

**Acceptance criteria:**
- [ ] Composite-PK entity generates `/:pk1/:pk2` paths (GET, PATCH, DELETE)
- [ ] Path param names match PK column names from `table._primaryKey` array order
- [ ] Route handler constructs `Record<string, string>` from path params
- [ ] LIST and CREATE routes unchanged (no PK in path)
- [ ] Single-PK entities unchanged (`/:id`)
- [ ] Startup log for composite-PK entities

---

### Task 2: Custom action paths for composite-PK entities

**Files:**
- `packages/server/src/entity/route-generator.ts` (modified)
- `packages/server/src/entity/action-pipeline.ts` (modified)
- `packages/server/src/entity/__tests__/route-generator.test.ts` (modified)

**What to implement:**

1. **Update custom action path construction** (~line 616-618):

```ts
// Current:
const actionPath = actionDef.path
  ? `${basePath}/${actionDef.path}`
  : `${basePath}/:id/${actionName}`;
const hasId = actionPath.includes(':id');

// New: use composite PK path for default record-level actions
const actionPath = actionDef.path
  ? `${basePath}/${actionDef.path}`
  : `${basePath}${idPath}/${actionName}`;
// For composite PK, check if any PK param is in the path
const hasId = isCompositePk
  ? pkColumns.some(col => actionPath.includes(`:${col}`))
  : actionPath.includes(':id');
```

2. **Update action handler invocation** (~line 644):

```ts
// Current:
const id = hasId ? (getParams(ctx).id as string) : null;

// New:
const id = hasId ? extractEntityId(ctx) : null;
```

3. **Update `createActionHandler` in `action-pipeline.ts`** to accept `EntityId`:

The function signature (line 28) currently takes `id: string | null`. Change to:

```ts
import type { EntityId } from './crud-pipeline';

export function createActionHandler<TModel extends ModelDef = ModelDef>(
  def: EntityDefinition<TModel>,
  actionName: string,
  actionDef: EntityActionDef,
  db: EntityDbAdapter,
  hasId: boolean,
): (
  ctx: EntityContext<TModel>,
  id: EntityId | null,
  rawInput: unknown,
) => Promise<Result<CrudResult, EntityError>> {
```

And update the `db.get(id as string)` call (~line 38) to pass the EntityId directly:

```ts
if (hasId) {
  row = (await db.get(id as EntityId)) as TModel['table']['$response'] | null;
  if (!row) {
    // Format error message based on ID type
    const idStr = typeof id === 'string'
      ? `id "${id}"`
      : `key { ${Object.entries(id as Record<string, string>).map(([k, v]) => `${k}: "${v}"`).join(', ')} }`;
    return err(new EntityNotFoundError(`${def.name} with ${idStr} not found`));
  }
}
```

**Tests to write:**

```ts
describe('custom actions — composite PK', () => {
  it('generates composite-PK action path', () => {
    const routes = generateEntityRoutes(compositePkDefWithAction, registry, mockDb);
    const actionRoute = routes.find(r => r.path.includes('deactivate'));
    expect(actionRoute?.path).toBe('/api/project-members/:projectId/:userId/deactivate');
  });

  it('action handler receives composite ID', async () => {
    const routes = generateEntityRoutes(compositePkDefWithAction, registry, mockDb);
    const actionRoute = routes.find(r => r.path.includes('deactivate'));
    const ctx = {
      params: { projectId: 'p1', userId: 'u1' },
      body: {},
      userId: 'user-1',
      tenantId: null,
      roles: [],
    };
    await actionRoute!.handler(ctx);
    // Verify db.get called with composite ID
  });
});
```

**Acceptance criteria:**
- [ ] Custom action paths use `/:pk1/:pk2/actionName` for composite-PK entities
- [ ] `createActionHandler` accepts `EntityId | null`
- [ ] Action handler passes composite ID to `db.get()`
- [ ] Custom actions with explicit `path` property unchanged
- [ ] Collection-level actions (no ID) unchanged

---

### Task 3: OpenAPI generator — skip composite-PK entities

**Files:**
- `packages/server/src/entity/openapi-generator.ts` (modified — if it exists; otherwise the file that generates OpenAPI specs)
- `packages/server/src/entity/__tests__/route-generator.test.ts` (modified)

**What to implement:**

Find the OpenAPI/spec generation code. It currently hardcodes `{id}` in paths and a single UUID path parameter. For composite-PK entities, skip generation with a warning:

```ts
if (isCompositePk) {
  console.warn(
    `[vertz] Entity "${def.name}" has composite PK — OpenAPI spec generation skipped. ` +
    `Composite-PK OpenAPI support is a follow-up feature.`
  );
  // Skip adding this entity to the OpenAPI spec
  continue; // or return early from the entity's spec generation
}
```

If you can't find the OpenAPI generator or it's not in the entity layer, skip this task and note it in the review.

**Acceptance criteria:**
- [ ] Composite-PK entities skipped in OpenAPI generation
- [ ] Warning logged explaining the skip
- [ ] Single-PK entity OpenAPI generation unchanged
