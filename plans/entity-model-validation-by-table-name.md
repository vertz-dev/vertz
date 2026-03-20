# Entity-Model Validation by Table Name

## Problem

The current entity-model validation in `createServer()` matches entities to database models **by registry key**:

```typescript
// create-server.ts — current validation
const tableOf = (e: EntityDefinition) => e.table ?? e.name;
const missing = config.entities
  .filter((e) => !(tableOf(e) in dbModels));
```

This forces developers to use the entity's kebab-case name as the model registry key:

```typescript
// Forced by current validation — ugly bracket access
const db = createDb({
  models: {
    'issue-labels': issueLabelsModel, // forces db['issue-labels'].findMany()
  },
});
```

The natural JavaScript convention is camelCase:

```typescript
// What developers actually want
const db = createDb({
  models: {
    issueLabels: issueLabelsModel, // db.issueLabels.findMany() ✓
  },
});
```

The validation should not care about registry keys. It should verify that every entity's backing model is registered — by comparing **table names** (`TableDef._name`), which are the stable, canonical identifiers.

## API Surface

### Before (broken DX)

```typescript
// schema.ts
const issueLabelsTable = d.table('issue_labels', { /* ... */ });
const issueLabelsModel = d.model(issueLabelsTable, { /* ... */ });

// db.ts — forced to use kebab-case key to match entity name
const db = createDb({
  models: {
    'issue-labels': issueLabelsModel,
  },
});

// entity.ts
const issueLabels = entity('issue-labels', {
  model: issueLabelsModel,
});

// usage — ugly bracket access
const count = await db['issue-labels'].count();
```

### After (natural camelCase)

```typescript
// schema.ts — unchanged
const issueLabelsTable = d.table('issue_labels', { /* ... */ });
const issueLabelsModel = d.model(issueLabelsTable, { /* ... */ });

// db.ts — camelCase keys (natural JS)
const db = createDb({
  models: {
    issueLabels: issueLabelsModel,
  },
});

// entity.ts — unchanged, still kebab-case (used for API routes)
const issueLabels = entity('issue-labels', {
  model: issueLabelsModel,
});

// usage — clean dot access
const count = await db.issueLabels.count();
```

### Validation behavior

```typescript
// ✅ Passes — entity's model.table._name ('issue_labels') matches
//    a registered model's table._name ('issue_labels')
createServer({
  db,
  entities: [issueLabels], // model: issueLabelsModel
});

// ❌ Fails — entity references issueLabelsModel but no registered
//    model has table._name === 'issue_labels'
createServer({
  db: createDb({ models: { users: usersModel } }),
  entities: [issueLabels],
});
// Error: Entity "issue-labels" references table "issue_labels" which is not
// registered in createDb(). Add the missing model to the models object.
```

### Bridge adapter resolution

The `createDatabaseBridgeAdapter` also needs to resolve by table name:

```typescript
// Before: db[tableName] where tableName = entity.name = 'issue-labels'
// After:  find the registry key whose model has table._name matching entity.model.table._name

// create-server.ts — bridge adapter creation
dbFactory = (entityDef) => {
  const modelKey = findModelKeyByTableName(dbModels, entityDef.model.table._name);
  return createDatabaseBridgeAdapter(db, modelKey);
};
```

## Manifesto Alignment

- **Convention over configuration** — camelCase model keys follow JS convention. No special naming required.
- **Pit of success** — developers naturally write `issueLabels: model` and it works. The old way forced an unnatural key format.
- **Separation of concerns** — entity names (kebab-case, for routes), table names (snake_case, for SQL), and model keys (camelCase, for JS) are independent concepts that serve different purposes.

## Non-Goals

- **Enforcing camelCase on model keys** — we change validation to not care about key format, not to enforce a new format. Developers can use any key they want; validation checks table names, not keys.
- **Changing entity name format** — entity names remain kebab-case (they're used in URL paths).
- **Changing table name format** — table names remain snake_case (SQL convention).
- **Auto-generating model keys from table names** — the developer chooses their own keys.

## Unknowns

None identified. The `ModelDef.table._name` property is already available at runtime and used elsewhere (e.g., SQL generation, tenant graph logging).

## Type Flow Map

No new generics introduced. The change is purely runtime validation logic — comparing `string` table names instead of `string` registry keys.

The bridge adapter's `TName` generic (`keyof TModels & string`) still works because we resolve the correct key before calling `createDatabaseBridgeAdapter`.

## E2E Acceptance Test

```typescript
describe('Feature: Entity-model validation by table name', () => {
  describe('Given an entity with model whose table is "issue_labels"', () => {
    describe('When createDb registers the model as "issueLabels" (camelCase)', () => {
      it('Then createServer does not throw — validation matches by table._name', () => {
        const table = d.table('issue_labels', { id: d.uuid().primary() });
        const model = d.model(table);

        const db = createDb({ models: { issueLabels: model }, dialect: 'sqlite', path: ':memory:' });

        expect(() =>
          createServer({
            basePath: '/',
            db,
            entities: [{ kind: 'entity', name: 'issue-labels', model, /* ... */ }],
          }),
        ).not.toThrow();
      });
    });
  });

  describe('Given an entity referencing a model not in createDb', () => {
    describe('When createServer validates', () => {
      it('Then throws with table name in the error message', () => {
        const registeredTable = d.table('users', { id: d.uuid().primary() });
        const unregisteredTable = d.table('issue_labels', { id: d.uuid().primary() });

        const db = createDb({
          models: { users: d.model(registeredTable) },
          dialect: 'sqlite',
          path: ':memory:',
        });

        expect(() =>
          createServer({
            basePath: '/',
            db,
            entities: [{
              kind: 'entity',
              name: 'issue-labels',
              model: d.model(unregisteredTable),
              /* ... */
            }],
          }),
        ).toThrow(/table "issue_labels" .* not registered/);
      });
    });
  });

});
```

## Implementation Plan

### Phase 1: Change validation to match by table name

**Scope:** `packages/server/src/create-server.ts` + tests

1. Build a **reverse lookup map** (`tableNameToModelKey`) from SQL table names to model registry keys. This map is built once at startup and reused by validation, bridge adapter, tenant chain resolution, and `queryParentIds`:
   ```typescript
   const tableNameToModelKey = new Map<string, string>();
   for (const [key, entry] of Object.entries(dbModels)) {
     tableNameToModelKey.set(entry.table._name, key);
   }
   ```

2. Change validation to compare entity's `model.table._name` against this map:
   ```typescript
   const missing = config.entities.filter(
     (e) => !tableNameToModelKey.has((e as EntityDefinition).model.table._name),
   );
   ```

3. Update error message to include the SQL table name and list registered table names (not registry keys) for clarity:
   ```
   Entity "issue-labels" references table "issue_labels" which is not registered in createDb().
   Add the missing model to the models object in your createDb() call.
   Registered tables: users, projects, comments
   ```

4. Update bridge adapter resolution to use the reverse map:
   ```typescript
   dbFactory = (entityDef) => {
     const modelKey = tableNameToModelKey.get(entityDef.model.table._name)!;
     return createDatabaseBridgeAdapter(db, modelKey);
   };
   ```

5. Update `resolveTenantChain` call to pass the **model registry key** (resolved via the reverse map), not `tableOf(eDef)`:
   ```typescript
   const modelKey = tableNameToModelKey.get(eDef.model.table._name)!;
   const chain = resolveTenantChain(modelKey, tenantGraph, dbModelsMap);
   ```

6. Update `queryParentIds` closure to use the reverse map for translating SQL table names from `TenantChainHop.tableName` to registry keys:
   ```typescript
   queryParentIds = async (sqlTableName: string, where: Record<string, unknown>) => {
     const registryKey = tableNameToModelKey.get(sqlTableName);
     if (!registryKey) return [];
     const delegate = (dbClient as Record<string, unknown>)[registryKey] as /* ... */;
     // ... rest unchanged
   };
   ```
   **Note:** This also fixes a latent bug — `queryParentIds` currently receives SQL table names from `TenantChainHop.tableName` (e.g., `issue_labels`) but uses them to index `dbClient[tableName]`, which is keyed by registry keys (e.g., `issueLabels`). This mismatch would silently fail for any multi-word entity with indirect tenant scoping.

7. Remove the `tableOf()` helper entirely — it is no longer needed.

8. Update existing tests + add new tests for camelCase model keys.

**Acceptance criteria:**
- `createServer` validates by `model.table._name`, not registry key
- camelCase model keys work without errors
- bridge adapter correctly resolves the delegate via reverse map
- `resolveTenantChain` receives the correct registry key via reverse map
- `queryParentIds` translates SQL table names to registry keys via reverse map (fixes latent bug)
- error messages include the SQL table name and list registered table names
- all existing tests pass (updated to match new validation)

### Phase 2: Update Linear example to use camelCase keys

**Scope:** `examples/linear/src/api/db.ts`, `examples/linear/src/api/seed.ts`, `examples/linear/src/api/seed.test.ts`

1. Change `'issue-labels': issueLabelsModel` → `issueLabels: issueLabelsModel` in `db.ts`
2. Update `seed.ts` to use `db.issueLabels` instead of `db['issue-labels']`
3. Update `seed.test.ts` to use camelCase key
4. Verify all seed tests pass

**Acceptance criteria:**
- Linear example uses camelCase model keys throughout
- All 40 linear tests pass
- No bracket access for model keys
