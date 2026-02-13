# @vertz/db Integration — Design Doc

> Bridge `@vertz/db` and `@vertz/core` so the database participates in the module lifecycle, and derive validation schemas from table definitions automatically.

**North star:** Inject a managed database service. Derive schemas from tables. Types flow. Developer keeps full control.

**PRD:** `backstage/plans/prds/crud-pipeline.md` (approved 2026-02-12)

---

## 1. API Surface

### 1.1 DB Service — `createDbProvider()`

Wraps `createDb()` as a core service with lifecycle hooks.

```typescript
import { createDbProvider } from '@vertz/db/core';

const dbProvider = createDbProvider({
  url: process.env.DATABASE_URL!,
  tables: { users, posts },
  casing: 'snake_case',
});
```

**What it returns:** A core-compatible service definition that can be passed to `moduleDef.service()`.

```typescript
// Type signature
function createDbProvider<TTables extends Record<string, TableEntry>>(
  config: DbConfig<TTables>,
): ServiceDef<
  Record<string, never>,          // TDeps — no external dependencies
  DatabaseInstance<TTables>,       // TState — the db instance IS the state
  DatabaseInstance<TTables>        // TMethods — exposes the full db API
>;
```

**Usage in a module:**

```typescript
const appDef = vertz.moduleDef({ name: 'app' });

const dbService = appDef.service(createDbProvider({
  url: process.env.DATABASE_URL!,
  tables: { users, posts },
  casing: 'snake_case',
}));

const userRouter = appDef
  .router({ prefix: '/users', inject: { db: dbService } })
  .get('/', {
    response: s.array(userSchemas.responseSchema),
    handler: async (ctx) => {
      return ctx.db.findMany('users');
    },
  });
```

**Lifecycle hooks:**

| Hook | What it does |
|------|-------------|
| `onInit()` | Calls `createDb(config)`, then `db.isHealthy()` to verify connection. Returns the `DatabaseInstance`. |
| `onDestroy(_, db)` | Calls `db.close()` to release the connection pool. |

The `methods` function returns the `DatabaseInstance` directly — all query methods (`findMany`, `create`, `update`, `delete`, etc.) are available on the injected service.

**Health check:**

`createDbProvider` also exposes a health method on the service. The core app can call `db.isHealthy()` which delegates to a `SELECT 1` query.

**Error on startup failure:**

If the database is unreachable during `onInit`, the error includes the connection target:

```
DbConnectionError: Failed to connect to database at localhost:5432
  Cause: ECONNREFUSED 127.0.0.1:5432
```

**Multiple instances:**

```typescript
const primaryDb = appDef.service(createDbProvider({
  url: process.env.PRIMARY_DB_URL!,
  tables: { users, posts },
}));

const replicaDb = appDef.service(createDbProvider({
  url: process.env.REPLICA_DB_URL!,
  tables: { users, posts },
}));

// Inject both
const router = appDef.router({
  prefix: '/users',
  inject: { primary: primaryDb, replica: replicaDb },
});
```

### 1.2 Schema Derivation — `tableToSchemas()`

Converts a `d.table()` definition into `@vertz/schema` validation schemas.

```typescript
import { tableToSchemas } from '@vertz/db/schema-derive';

const users = d.table('users', {
  id:           d.uuid().primary(),
  name:         d.text(),
  email:        d.email().unique(),
  passwordHash: d.varchar(255).hidden(),
  role:         d.enum('user_role', ['admin', 'member']).default('member'),
  createdAt:    d.timestamp().default('now'),
});

const userSchemas = tableToSchemas(users);
```

**What it returns:**

```typescript
function tableToSchemas<TColumns extends ColumnRecord>(
  table: TableDef<TColumns>,
): {
  /** Excludes primary keys and columns with defaults. For POST bodies. */
  createBody: ObjectSchema<CreateBodyShape<TColumns>>;

  /** All non-PK columns, all optional. For PATCH/PUT bodies. */
  updateBody: ObjectSchema<UpdateBodyShape<TColumns>>;

  /** Excludes hidden and sensitive columns. For API responses. */
  responseSchema: ObjectSchema<ResponseShape<TColumns>>;
};
```

**Derived schemas for the example above:**

| Schema | Includes | Excludes | Reason |
|--------|----------|----------|--------|
| `createBody` | `name`, `email`, `passwordHash` | `id` (primary), `role` (has default), `createdAt` (has default) | Client shouldn't send auto-generated fields |
| `updateBody` | `name?`, `email?`, `passwordHash?`, `role?` | `id` (primary), `createdAt` (primary/default) | Partial update — everything optional |
| `responseSchema` | `id`, `name`, `email`, `role`, `createdAt` | `passwordHash` (hidden) | Hidden fields never leave the server |

**Column type mapping:**

| DB Column Type | `@vertz/schema` Validator | Notes |
|---------------|---------------------------|-------|
| `d.uuid()` | `s.string().uuid()` | UUID format validation |
| `d.text()` | `s.string()` | |
| `d.varchar(n)` | `s.string().max(n)` | Max length from column metadata |
| `d.email()` | `s.string().email()` | Email format validation |
| `d.boolean()` | `s.boolean()` | |
| `d.integer()` | `s.number().int()` | Integer constraint |
| `d.bigint()` | `s.bigint()` | |
| `d.serial()` | `s.number().int()` | Same as integer |
| `d.real()` | `s.number()` | |
| `d.doublePrecision()` | `s.number()` | |
| `d.decimal(p, s)` | `s.string()` | String to preserve precision |
| `d.timestamp()` | `s.date()` | Coerced from string/Date |
| `d.date()` | `s.string()` | ISO date string |
| `d.time()` | `s.string()` | ISO time string |
| `d.jsonb<T>()` | `s.unknown()` | Cannot derive inner structure; if column has `validator`, use it |
| `d.textArray()` | `s.array(s.string())` | |
| `d.integerArray()` | `s.array(s.number().int())` | |
| `d.enum(name, values)` | `s.enum(values)` | Enum values from column metadata |

**Nullable columns:** If `._meta.nullable === true`, the schema is wrapped with `.nullable()`.

**Optional in updateBody:** All non-PK fields get `.optional()` in the update schema.

**jsonb columns:** If the column has a `validator` in metadata (set via `d.jsonb<T>().validator(schema)`), use that schema. Otherwise fall back to `s.unknown()`. This is a known limitation — jsonb without a validator cannot be derived.

### 1.3 Entrypoint Exports

```
@vertz/db
├── index.ts          ← existing: createDb, d, types, etc.
├── core.ts           ← NEW: createDbProvider()
└── schema-derive.ts  ← NEW: tableToSchemas()
```

Using subpath exports in `package.json`:

```json
{
  "exports": {
    ".": "./src/index.ts",
    "./core": "./src/core/index.ts",
    "./schema-derive": "./src/schema-derive/index.ts"
  }
}
```

This keeps the main `@vertz/db` import unchanged. Developers opt into integration by importing from `@vertz/db/core` and `@vertz/db/schema-derive`.

---

## 2. Core Philosophy

| Decision | Chosen | Rejected | Why |
|----------|--------|----------|-----|
| Where to put `createDbProvider` | Subpath export `@vertz/db/core` | Separate `@vertz/db-core` package | No new package to maintain. `@vertz/db` already depends on `@vertz/schema`. The core import is opt-in via subpath. |
| DB service API | Returns `DatabaseInstance` directly as methods | Thin wrapper with subset of methods | Developers already know the `DatabaseInstance` API. Wrapping it hides power. |
| Schema derivation scope | `createBody`, `updateBody`, `responseSchema` | Also generate `filterSchema`, `sortSchema` | Three schemas cover 90% of cases. Filter/sort can be added later without breaking changes. |
| Where to put `tableToSchemas` | Subpath export `@vertz/db/schema-derive` | In main `@vertz/db` export | Keeps main export clean. Schema derivation is opt-in functionality. |
| How to handle `jsonb` | Use column `validator` if present, else `s.unknown()` | Error on jsonb without validator | Pragmatic — jsonb is inherently unstructured. Erroring would be too strict. |

---

## 3. Manifesto Alignment

| Principle | How this design embodies it |
|-----------|---------------------------|
| "If it builds, it works" | Derived schema types are computed from table column types at the TypeScript level. If the table changes a column type, the derived schema type changes too — compile error if the route handler returns wrong data. |
| "Define once, types flow" | Table is the single source of truth. `tableToSchemas()` reads what you already defined. No duplication. |
| "Zero runtime overhead" | `createDbProvider()` is a thin wrapper — no proxy, no interception. The `DatabaseInstance` is returned as-is. Schema derivation happens at startup, not per-request. |
| "Escape hatches exist" | Everything is opt-in. You can use `createDb()` directly. You can hand-write schemas. The utilities add convenience without removing control. |

---

## 4. Non-Goals

| Non-Goal | Rationale |
|----------|-----------|
| Auto-generated CRUD routes | Premature abstraction. Hides routes without meaningful semantics (no auth, middleware, hooks). Deferred to entity-aware protocol. |
| Codegen pipeline integration | Codegen already picks up response schemas from routes. No special integration needed — `tableToSchemas().responseSchema` works with existing codegen. |
| Auto-migrations on schema change | Migrations are a separate, explicit CLI step. Auto-migration is dangerous in production. |
| New `@vertz/crud` package | No new package. Everything lives in `@vertz/db` as subpath exports. |
| `filterSchema` / `sortSchema` derivation | Can be added later. Not needed for v1 — developers write filter schemas by hand (usually custom per endpoint). |

---

## 5. Unknowns

### 5.1 Does follow-up #35 (query methods return `Promise<unknown>`) block this feature?

**Type:** Discussion-resolvable.

**Analysis:** The `DatabaseInstance` type signatures in the source code show fully generic return types (e.g., `findMany` returns `Promise<FindResult<...>[]>`). The follow-up #35 may refer to a specific edge case or an older state. The DB service wraps `DatabaseInstance` and passes it through — it does not change the return types.

**Resolution strategy:** Verify during Phase 1 implementation. If query methods actually return `unknown` at the type level, fix in `@vertz/db` as a prerequisite commit (Tier 1 bug fix — internal type gap, no public API change).

### 5.2 Does `@vertz/db` currently depend on `@vertz/core`?

**Type:** Discussion-resolvable.

**Analysis:** `createDbProvider()` needs to return a `ServiceDef`-compatible object. If `@vertz/db` doesn't depend on `@vertz/core`, we have two options:
1. Add `@vertz/core` as a dependency of `@vertz/db` (only used in the `core` subpath)
2. Make `createDbProvider()` return a plain object that happens to match the `ServiceDef` shape (structural typing)

**Resolution strategy:** Option 2 is preferred — the `ServiceDef` interface is simple (just `onInit`, `methods`, `onDestroy`). Structural typing means `@vertz/db` doesn't need to import from `@vertz/core`. Verify during implementation that this works with the core DI resolver.

### 5.3 Can `@vertz/schema` represent all DB column types?

**Type:** Discussion-resolvable.

**Analysis:** The column type mapping table in Section 1.2 covers all current `d.*` column types. The gap is `jsonb` — if a jsonb column has no `validator`, the derived schema falls back to `s.unknown()`. This is acceptable for v1.

**Resolution:** Verify the mapping table is complete during Phase 2 implementation. Add any missing types as they're discovered.

---

## 6. E2E Acceptance Test

The following test proves the full integration works:

```typescript
import { describe, it, expect, afterAll } from 'vitest';
import { d, createDb } from '@vertz/db';
import { createDbProvider } from '@vertz/db/core';
import { tableToSchemas } from '@vertz/db/schema-derive';
import { vertz } from '@vertz/core';

// 1. Define a table
const users = d.table('users', {
  id:        d.uuid().primary().default('gen_random_uuid()'),
  name:      d.text(),
  email:     d.email().unique(),
  secret:    d.text().hidden(),
  role:      d.enum('role', ['admin', 'user']).default('user'),
  createdAt: d.timestamp().default('now'),
});

// 2. Derive schemas
const userSchemas = tableToSchemas(users);

// 3. Create module with DB provider
const appDef = vertz.moduleDef({ name: 'test-app' });
const dbService = appDef.service(createDbProvider({
  url: process.env.TEST_DATABASE_URL!,
  tables: { users: { table: users, relations: {} } },
}));

const router = appDef
  .router({ prefix: '/users', inject: { db: dbService } })
  .post('/', {
    body: userSchemas.createBody,
    response: userSchemas.responseSchema,
    handler: async (ctx) => {
      const user = await ctx.db.create('users', { data: ctx.body });
      return user;
    },
  })
  .get('/', {
    response: s.array(userSchemas.responseSchema),
    handler: async (ctx) => ctx.db.findMany('users'),
  });

describe('db-integration e2e', () => {
  // 4. Boot the app (triggers onInit → db connects)
  const app = vertz.app().register(
    vertz.module(appDef, { services: [dbService], routers: [router] })
  );

  afterAll(async () => {
    // 7. Shutdown (triggers onDestroy → db.close())
    await app.close();
  });

  it('derives correct create body schema', () => {
    // createBody should have: name, email, secret (not id, not role, not createdAt)
    const result = userSchemas.createBody.safeParse({
      name: 'Alice',
      email: 'alice@example.com',
      secret: 'hidden-value',
    });
    expect(result.success).toBe(true);
  });

  it('derives correct response schema (excludes hidden)', () => {
    // responseSchema should NOT have 'secret' (hidden)
    const result = userSchemas.responseSchema.safeParse({
      id: '550e8400-e29b-41d4-a716-446655440000',
      name: 'Alice',
      email: 'alice@example.com',
      role: 'user',
      createdAt: new Date(),
      secret: 'should-be-stripped', // extra field
    });
    expect(result.success).toBe(true);
    // In strict mode, 'secret' would fail. In passthrough, it's ignored.
    // The TYPE should not include 'secret' — verify at compile time.
  });

  it('type-level: createBody excludes id and defaulted fields', () => {
    type CreateBody = typeof userSchemas.createBody['_output'];
    // These should be compile errors:
    // @ts-expect-error — id is auto-generated
    const _bad1: CreateBody = { id: '123', name: 'A', email: 'a@b.com', secret: 's' };
    // @ts-expect-error — createdAt has default
    const _bad2: CreateBody = { name: 'A', email: 'a@b.com', secret: 's', createdAt: new Date() };
  });

  it('type-level: responseSchema excludes hidden fields', () => {
    type Response = typeof userSchemas.responseSchema['_output'];
    // This should be a compile error:
    // @ts-expect-error — secret is hidden
    const _bad: Response = { id: '1', name: 'A', email: 'a@b.com', role: 'user', createdAt: new Date(), secret: 'x' };
  });

  it('creates and reads a user through the full pipeline', async () => {
    // 5. Create via route handler (validates body with derived schema)
    const created = await app.inject('POST', '/users', {
      body: { name: 'Bob', email: 'bob@test.com', secret: 'hash123' },
    });
    expect(created.status).toBe(200);
    expect(created.body.name).toBe('Bob');
    expect(created.body.email).toBe('bob@test.com');
    expect(created.body).not.toHaveProperty('secret'); // hidden field excluded

    // 6. Read via route handler
    const listed = await app.inject('GET', '/users');
    expect(listed.status).toBe(200);
    expect(listed.body).toHaveLength(1);
    expect(listed.body[0].name).toBe('Bob');
    expect(listed.body[0]).not.toHaveProperty('secret');
  });
});
```

**This test validates:**
1. `createDbProvider()` connects the DB on app boot
2. `tableToSchemas()` derives correct schemas
3. Derived schemas work in route definitions
4. Hidden fields are excluded from responses
5. Type-level assertions catch wrong types at compile time
6. `app.close()` disconnects the DB
7. Full round-trip: create → read through the framework

---

## 7. Implementation Plan

### Phase 1: DB Provider (~1-2 days)

**Files:**
- `packages/db/src/core/db-provider.ts` — `createDbProvider()` factory
- `packages/db/src/core/db-provider.test.ts` — Unit tests
- `packages/db/src/core/index.ts` — Barrel export
- `packages/db/package.json` — Add `./core` subpath export

**Acceptance criteria:**
- `createDbProvider(config)` returns a `ServiceDef`-compatible object
- `onInit` creates db instance and verifies health
- `onDestroy` calls `db.close()`
- Service is injectable via standard `inject` pattern
- Startup failure produces clear error with connection target
- Integration test: boot app → db connected → shutdown → db closed

### Phase 2: Table-to-Schema Derivation (~3-4 days)

**Files:**
- `packages/db/src/schema-derive/table-to-schemas.ts` — `tableToSchemas()` implementation
- `packages/db/src/schema-derive/column-mapper.ts` — Column type → schema validator mapping
- `packages/db/src/schema-derive/table-to-schemas.test.ts` — Unit tests
- `packages/db/src/schema-derive/table-to-schemas.test-d.ts` — Type-level tests
- `packages/db/src/schema-derive/index.ts` — Barrel export
- `packages/db/package.json` — Add `./schema-derive` subpath export

**Acceptance criteria:**
- `tableToSchemas(table)` returns `{ createBody, updateBody, responseSchema }`
- `createBody` excludes primary keys and columns with defaults
- `updateBody` makes all non-PK fields optional
- `responseSchema` excludes hidden and sensitive columns
- All column types mapped correctly (see mapping table in Section 1.2)
- Nullable columns produce `.nullable()` schemas
- Enum columns produce `s.enum(values)` schemas
- Type-level tests verify derived types match expected shapes
- `.test-d.ts` with `@ts-expect-error` for every exclusion rule

### Phase 3: Integration Test + Example App (~1-2 days)

**Files:**
- `packages/db/src/__tests__/db-integration.e2e.test.ts` — Full E2E test (Section 6)
- `examples/task-api/src/db/index.ts` — Refactor to use `createDbProvider()`
- `examples/task-api/src/schemas/*.ts` — Replace hand-written schemas with `tableToSchemas()`

**Acceptance criteria:**
- E2E test from Section 6 passes
- `task-api` example uses `createDbProvider()` and `tableToSchemas()`
- `dagger call ci` passes (full monorepo)
- Before/after diff shows reduction in boilerplate

---

## 8. Architecture Decisions

| Decision | Chosen | Alternative | Rationale |
|----------|--------|-------------|-----------|
| Service API returns `DatabaseInstance` | Yes | Subset/wrapper | No information hiding. Developers know the DB API. |
| Subpath exports (`@vertz/db/core`) | Yes | Top-level exports | Keeps main `@vertz/db` import unchanged. Opt-in integration. |
| No `@vertz/core` dependency | Structural typing | Explicit import | `ServiceDef` shape is simple. Structural typing avoids coupling. |
| Column mapping is exhaustive | Error on unknown type | Fall back to `s.unknown()` | Unknown column types are a bug, not a feature. Better to fail than silently produce wrong schemas. |
| `jsonb` without validator → `s.unknown()` | Yes | Error | Pragmatic. jsonb is inherently unstructured. Strictness can be added via `.validator()`. |
