---
'@vertz/db': patch
'@vertz/server': patch
---

feat(db): add composite primary key support to d.table()

Tables can now define composite primary keys via a table-level `primaryKey` option:

```ts
const tenantMembers = d.table('tenant_members', {
  tenantId: d.uuid(),
  userId: d.uuid(),
  role: d.text().default('member'),
}, { primaryKey: ['tenantId', 'userId'] });
```

- `primaryKey` is type-constrained to valid column names (compile-time error for typos)
- Composite PK columns are required in `$insert` and `$create_input` (no auto-generation)
- Composite PK columns are excluded from `$update` and `$update_input`
- Existing `.primary()` API unchanged (backward compatible)
- Migration SQL generator already handles composite PKs
- Differ warns on PK flag changes (no ALTER SQL emitted)
- Entity CRUD pipeline throws clear error for composite-PK tables (not yet supported)
