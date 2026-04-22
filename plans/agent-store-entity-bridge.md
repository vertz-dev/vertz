# Agent Store ↔ Entity Bridge — Design Document (Rev 3)

> "If it builds, it works." — Vertz Vision, Principle 1

## Revision History

| Rev | Date | Changes |
|---|---|---|
| 1 | 2026-04-22 | Initial draft — `agentSession()`/`agentMessage()` helpers + `entityAgentStore` adapter. |
| 2 | 2026-04-22 | Pivoted to "entities are a read-view over the store's tables". Dropped sugar helpers. |
| 3 | 2026-04-22 | Fix all Rev-2 findings: six API hallucinations, `create` rule footgun, hook-bypass tracking, `AgentStore` interface change made explicit, DDL-ownership policy, PK-type question resolved, honest framing (no "byte-for-byte" claims). |
| 4 | 2026-04-22 | E2E test rewritten with real `createDb` shape, `createDatabaseBridgeAdapter`, `Result.data`, shared DB file. Line-number ranges tightened. `before.create` priority pinned (`ctx.userId` wins). Non-adopter breaking change explicitly called out as scope. |
| 5 | 2026-04-22 | E2E final pass: `createEntityContext` 3-arg shape; `registry.register(name, ops)`; dropped tenant-column/tenant-relation conflict by using `tenantId` column directly; stub `EntityOperations` pattern matching `crud-pipeline.test.ts:145-153`. No more API hallucinations. |
| 6 | 2026-04-22 | Usage-section fixes: remove fabricated `sqliteDriver()` (replaced with real `{ dialect, path, migrations }`); correct the false "RLS applied by the entity pipeline" claim on `db.agentSessions.list()` — the right path is the auto-generated `/api/agent-session` routes or `ctx.entities.agentSession.list()`; fix stub `EntityOperations.list` to return the real `ListResult` shape. Removed `withRlsColumns: true` alternative (present one path). Approval checklist references updated to cite Rev 4 blockers correctly. |

### Rev 3 — what changed from Rev 2

Six API references in Rev 2 were hallucinations; all are replaced with real, verified signatures (see **References** for file:line evidence):
- `d.model(table, { relations: {...} })` → `d.model(table, {...})` (relations are the second arg directly).
- `db._models` → `db._internals.models`.
- `Session.list.byCtx(ctx).run(args)` → `createCrudHandlers(def, db)` + `handlers.list(ctx, options)`.
- `import { rules } from '@vertz/server/rules'` → `import { rules } from '@vertz/server'`.
- `app.serve({ entities })` → `createServer({ db, entities })`.
- SQL migration using `new_uuid()` → removed (see PK decision below).

Four design-level issues are resolved:
- **Default `create` rule** no longer has the "caller must pass `userId`" footgun. The factory now registers a `before.create` hook that injects `userId: ctx.userId` / `tenantId: ctx.tenantId` from the request context, so `rules.authenticated()` is sufficient and the resulting row satisfies the `rules.where({ userId: rules.user.id })` on subsequent reads.
- **`AgentStore.appendMessages` gains a `session: AgentSession` parameter** — matching `appendMessagesAtomic` (which already has it). This is how the store gets the `userId`/`tenantId` to denormalize onto message rows. Breaking change at the `AgentStore` interface (pre-v1, three in-repo implementations, no external consumers on this method's current signature).
- **Hook bypass is tracked**, not just documented — the PR opens follow-up issue `#2957` to add a runtime rejection at entity registration. Linked in Non-Goals.
- **PK type** is NOT changed on `agent_messages.id`. Rev 2 proposed `d.uuid().primary()`; `d.*` has no primitive for `INTEGER PRIMARY KEY AUTOINCREMENT` (verified — `createSerialColumn` at `packages/db/src/schema/column.ts:448-460` has hard-coded `primary: false`). Rev 3 uses `d.integer().primary()` which maps to SQLite `INTEGER PRIMARY KEY` (autoincrement-like ROWID semantics, sufficient). `sqliteStore`/`d1Store` DDL stays byte-identical on `id`. The only additive change to stores is the two new `user_id`/`tenant_id` columns.
- **DDL ownership** is explicit — when entities are adopted, `@vertz/db` migrations own the schema; the store's `CREATE TABLE IF NOT EXISTS` is a no-op by construction (table exists). Non-adopting users keep the store-owned DDL path unchanged.

Three framing problems are corrected:
- "Byte-for-byte / bit-for-bit unchanged" language removed. Stores change (two new columns + one new method parameter) — the change is additive, documented, and opt-in by schema-migration.
- "~22 lines of pure mechanical change" is replaced with a concrete per-store breakdown (see **Implementation Phasing**).
- E2E no longer uses the `test.skip('types', ...)` anti-pattern; negative type assertions move to `.test-d.ts`.

---

## Problem (condensed — see Rev 1 history for full motivation)

`@vertz/agents` ships `AgentStore` with three implementations (`memoryStore`, `sqliteStore`, `d1Store`). Their tables are invisible to `@vertz/server`:
- No `Session.list({ where: { projectId } })` from app code.
- `rules.*` (auth, tenant, row-level `where`, FVA) don't apply.
- Multi-tenant isolation is hand-rolled in `run.ts:222-252`.

This is Gap #4 of `plans/open-agents-clone.md`. Closes [#2847](https://github.com/vertz-dev/2847).

---

## Goal

Make `agent_sessions` and `agent_messages` **queryable as Vertz entities alongside app data**. Entity `rules.*` apply to app-side reads. The agent loop's write path and in-loop reads keep using the existing `AgentStore` implementations (with one additive interface change) so that D1 atomicity, durable resume, and per-step semantics are unaffected.

The bridge is **schema-level**: shared table shapes between what the store writes and what entities view. Everything above the DB is normal Vertz code — normal `d.table`/`d.model`/`entity`/`createServer`/`rules.*`. No new execution model.

---

## Non-Goals

- Routing writes through the entity CRUD pipeline. Writes stay on the stores. Entity `before`/`after` hooks do NOT fire for agent-loop writes. A follow-up issue will make this a registration-time error on the entities returned by `defineAgentEntities` (tracking: will be filed with this PR — issue `#2957`).
- Applying entity `rules.*` to the agent loop's internal reads (`store.loadSession`, `store.loadMessages`). Those stay gated by `run.ts:222-252`'s ownership check.
- D1 transaction support in `@vertz/db`. Not needed — `d1Store` keeps using `batch()`.
- An `extend` API on schema helpers. Replaced by "developers write their own `d.table()` by spreading the column packs."
- Deprecating `memoryStore`/`sqliteStore`/`d1Store`. Additive.
- Streaming, cross-agent joins, embeddings.

---

## API Surface

### 1. Exported column packs (plain `ColumnRecord` constants)

```ts
// packages/agents/src/entities/columns.ts
import { d } from '@vertz/db';

// Columns for agent_sessions. Matches legacy sqlite-store.ts:9-22 on every existing column.
export const agentSessionColumns = {
  id: d.text().primary(),                    // 'sess_<uuid>' — same as today
  agentName: d.text(),
  userId: d.text().nullable(),
  tenantId: d.text().nullable(),
  state: d.text(),                           // JSON blob, opaque to the DB
  createdAt: d.text(),
  updatedAt: d.text(),
};

// Columns for agent_messages. Existing legacy columns + two new denormalized columns
// (user_id, tenant_id) that enable flat rules.where() on the Message entity.
export const agentMessageColumns = {
  id: d.integer().primary(),                 // INTEGER PRIMARY KEY (ROWID semantics)
  sessionId: d.text(),
  seq: d.integer(),
  role: d.text(),
  content: d.text(),
  toolCallId: d.text().nullable(),
  toolName: d.text().nullable(),
  toolCalls: d.text().nullable(),            // JSON array, stringified
  userId: d.text().nullable(),               // NEW — denormalized from session for RLS
  tenantId: d.text().nullable(),             // NEW — denormalized from session for RLS
  createdAt: d.text(),
};

export const agentSessionIndexes = [
  d.index('agentName'),
  d.index('userId'),
  d.index('updatedAt'),
];

export const agentMessageIndexes = [
  d.index(['sessionId', 'seq'], { unique: true }),
  d.index('userId'),
];
```

> **Design note — `d.text()` for JSON columns.** `state` and `toolCalls` are stored as TEXT (matching legacy). `d.jsonb<T>()` would be nicer but would change on-disk format; deferred to a follow-up issue. Tracked.
>
> **Design note — `d.integer().primary()` for message id.** Not a `d.*` primitive for `INTEGER PRIMARY KEY AUTOINCREMENT` (the distinction between SQLite ROWID and explicit AUTOINCREMENT). `d.integer().primary()` produces `INTEGER PRIMARY KEY`, which is ROWID-backed and monotonically increasing for inserts in normal use. Good enough. Exact AUTOINCREMENT semantics (no ID reuse after delete) are not needed by the agent loop.

### 2. `defineAgentEntities(db, opts?)`

```ts
// packages/agents/src/entities/define.ts
import { entity } from '@vertz/server';
import { rules } from '@vertz/server';
import type { DatabaseClient } from '@vertz/db';

export interface DefineAgentEntitiesOptions {
  /** Override entity names if 'agent-session'/'agent-message' collides. */
  readonly sessionName?: string;
  readonly messageName?: string;
  /** Access rule overrides. Defaults below. */
  readonly sessionAccess?: EntityAccess;
  readonly messageAccess?: EntityAccess;
}

export function defineAgentEntities<TDb extends DatabaseClient<any>>(
  db: TDb,
  opts: DefineAgentEntitiesOptions = {},
): { session: EntityDefinition; message: EntityDefinition };
```

What the factory does:

1. Looks up the two table defs from `db._internals.models` (verified signature at `packages/db/src/client/database.ts:601`). If either is missing, throws with an actionable message:
   > `defineAgentEntities: no model registered for table 'agent_sessions'. Did you forget to add it to createDb({ models })?`
2. Constructs the two `entity(name, { model, access, before })` definitions:
   - `model` comes from the registered models.
   - `access` is the user override or the defaults below.
   - `before` hooks inject `userId`/`tenantId` on `create` (see below).
3. Returns `{ session, message }` — both are frozen `EntityDefinition` values ready for `createServer({ db, entities: [session, message] })`.

**Default access rules:**

```ts
// Session defaults — row-level `userId` scope is the key; auto-detected tenant scope adds the `tenantId`
// filter automatically via entity.ts:50-53.
const defaultSessionAccess: EntityAccess = {
  list:   rules.where({ userId: rules.user.id }),
  read:   rules.where({ userId: rules.user.id }),
  create: rules.authenticated(),                 // before.create hook injects userId/tenantId
  update: rules.where({ userId: rules.user.id }),
  delete: rules.where({ userId: rules.user.id }),
};

// Message defaults — reads are RLS'd; writes are false (only the agent-loop store writes).
const defaultMessageAccess: EntityAccess = {
  list:   rules.where({ userId: rules.user.id }),
  read:   rules.where({ userId: rules.user.id }),
  create: false,
  update: false,
  delete: false,
};
```

**`before.create` hook injected by the factory:**

```ts
// Session: populate userId/tenantId from ctx on create so subsequent reads pass rules.where().
// ctx.userId wins over any input-supplied userId — prevents an authenticated caller from creating
// a session under a different user's identity (which would be invisible to them afterwards).
before: {
  create: async (input, ctx) => ({
    ...input,
    userId:   ctx.userId   ?? input.userId   ?? null,
    tenantId: ctx.tenantId ?? input.tenantId ?? null,
  }),
}
```

Thus: `Session.create({ agentName: 'coder' })` from an authenticated request writes `{ agentName: 'coder', userId: ctx.userId, tenantId: ctx.tenantId, … }`. The caller doesn't have to remember anything. LLM-friendly by construction. `ctx` values are authoritative — an explicit `input.userId` is only used when `ctx.userId` is null (unauthenticated context, e.g. system bootstrap).

**Composing with user `before.create` hooks.** `DefineAgentEntitiesOptions` does not expose a `before` override in this PR. If the developer wants their own `before.create` (e.g. populate `projectId` from ctx), they skip the factory for that entity and build it themselves with `entity()` — same pattern as extending the schema with custom columns. Hook composition is tracked as a follow-up if the pattern turns out to be common.

**Tenant auto-detection priority** (documented convention): when the model has BOTH a `tenantId` column AND a `ref.one()` to a `.tenant()` table, the relation wins. See `packages/server/src/entity/entity.ts:14-23` (`resolveTenantColumn`) and `:50-53` (fallback logic). Developers extending `agentSessionColumns` should drop the `tenantId` column from their table if they're adding a `.tenant()` relation, to avoid a dead column. The E2E example demonstrates this pattern.

### 3. Usage

```ts
// apps/coder/db.ts
import { d, createDb } from '@vertz/db';
import {
  agentSessionColumns, agentSessionIndexes,
  agentMessageColumns, agentMessageIndexes,
} from '@vertz/agents/entities';

const sessionsTable = d.table('agent_sessions', agentSessionColumns, { indexes: agentSessionIndexes });
const messagesTable = d.table('agent_messages', agentMessageColumns, { indexes: agentMessageIndexes });

export const db = createDb({
  dialect: 'sqlite',
  path: 'app.db',
  migrations: { autoApply: true },
  models: {
    agentSessions: d.model(sessionsTable),
    agentMessages: d.model(messagesTable, {
      session: d.ref.one(() => sessionsTable, 'sessionId'),
    }),
  },
});

// apps/coder/entities.ts
import { defineAgentEntities } from '@vertz/agents/entities';
import { db } from './db';

export const { session: Session, message: Message } = defineAgentEntities(db);
// Defaults are correct for most apps. Override with { sessionAccess, messageAccess } if needed.

// apps/coder/server.ts — registering the entities auto-generates REST routes (/api/agent-session, /api/agent-message)
// whose handlers run the full CRUD pipeline, including entity rules.*.
import { createServer } from '@vertz/server';
import { Session, Message } from './entities';
const server = createServer({ db, entities: [Session, Message], /* … */ });

// apps/coder/agent.ts — the agent loop writes through the store (unchanged).
import { sqliteStore } from '@vertz/agents';
const store = sqliteStore({ path: 'app.db' });   // same DB file as `db` above
const result = await run(coderAgent, {
  message: 'Fix bug', llm, store,
  userId: ctx.userId, tenantId: ctx.tenantId,
});

// Reading agent data with RLS applied:
//   1. From the client (fetch) — RLS flows from the auto-generated route:
//        const res = await fetch('/api/agent-session?agentName=coder');   // only the user's rows
//   2. From server-side code that has an EntityContext (e.g. inside a route / service):
//        const sessions = await ctx.entities.agentSession.list({ where: { agentName: 'coder' } });
//
// DO NOT use `db.agentSessions.list()` from handler code and expect RLS — that path is the raw
// DatabaseClient delegate and bypasses the entity pipeline. It's fine for internal/trusted code
// (migrations, admin tasks). For user-facing queries, go through routes or `ctx.entities.*`.
```

### 4. Extending the schema (custom fields)

Spread the pack, add fields, use normal `@vertz/db` primitives. No helper.

```ts
const sessionsTable = d.table('agent_sessions', {
  ...agentSessionColumns,
  projectId: d.uuid().nullable(),
}, { indexes: [...agentSessionIndexes, d.index('projectId')] });

const db = createDb({
  dialect: 'sqlite',
  path: 'app.db',
  migrations: { autoApply: true },
  models: {
    agentSessions: d.model(sessionsTable, {
      project: d.ref.one(() => projectsTable, 'projectId'),
    }),
    // …
  },
});
```

### 5. The one breaking change to `AgentStore`

```ts
// packages/agents/src/stores/types.ts
// BEFORE
appendMessages(sessionId: string, messages: Message[]): Promise<void>;

// AFTER  (aligns with appendMessagesAtomic, which already takes `session`)
appendMessages(sessionId: string, messages: Message[], session: AgentSession): Promise<void>;
```

All three in-repo store implementations are updated. `run()` already has the session data at the call site (it constructs it for the atomic path — `run.ts:319-330`) so this is a one-line change at the caller, fully type-checked.

**Why breaking:** The denormalized `user_id`/`tenant_id` columns on `agent_messages` require the store to know identity at each append. Adding them to `AgentStore` as new fields on `Message` would leak DB-specific concerns into the in-memory shape (`react-loop.ts:9-18`), which is the shape the LLM-adapter layer consumes. Passing `session` keeps `Message` in-memory pure. Pre-v1 breaking change, no known external consumers.

### 6. DDL ownership

When entities are adopted (tables registered via `createDb({ models })`), `@vertz/db` migrations own the schema. The store's `CREATE TABLE IF NOT EXISTS` is a no-op because the table already exists when the store runs. For users NOT adopting entities, nothing changes — the store keeps creating its own tables exactly as today.

The additive columns (`user_id`, `tenant_id` on `agent_messages`) are added to the store's built-in DDL so that non-adopting users also get them on fresh installs. For existing installs, an additive migration file is provided (`ALTER TABLE agent_messages ADD COLUMN user_id TEXT; ADD COLUMN tenant_id TEXT; …` + backfill). Stores write the new columns unconditionally; legacy schemas without the columns must run the migration before upgrading.

---

## Manifesto Alignment

1. **If it builds, it works.** Entity type flow uses existing `@vertz/db` type inference (`d.table → d.model → entity`). The factory adds a tiny runtime validation (`db._internals.models` lookup). Every generic is an existing one.
2. **Least surface for the most power.** Five new exports (`agentSessionColumns`, `agentMessageColumns`, `agentSessionIndexes`, `agentMessageIndexes`, `defineAgentEntities`).
3. **The framework is the integration.** Schema + factory + one interface-parameter addition. Zero new execution paths, zero new concepts.
4. **Data is the contract.** Column packs are the single source of truth; consumed by store DDL and by user-written `d.table` calls.
5. **Serializable > opaque.** Rules stay `rules.*` descriptors — edge enforcement (per `feedback-edge-permission-enforcement.md`) applies to app-side reads. In-loop reads bypass the edge (as they should — they run inside the authenticated request handler).
6. **Small > clever.** No driver branching, no transaction gymnastics, no adapter layer.
7. **Built for LLMs.** Default access rules "just work"; `before.create` hook handles the one place developers would otherwise need to know to pass `userId` themselves.
8. **Ship the path, not the platform.** Happy path is 3 lines; override is a single config key; escape hatch is "write your own `entity()`" — the same as every other Vertz feature.

---

## Unknowns

**U1: Does `db._internals.models` expose model lookup by table name?**
Verified: `packages/db/src/client/database.ts:601` declares `_internals: DatabaseInternals<TModels>`. `DatabaseInternals` includes a `models` record keyed by model name (from the `createDb({ models })` input). Implementation detail to confirm: does it also expose the table's `_name`, or do we need to iterate? 30-second check during impl — worst case, `defineAgentEntities` iterates entries matching `model.table._name === 'agent_sessions'`. Either way, the lookup is a few lines of code; not a design unknown.

**U2: Pre-existing tables from legacy `sqliteStore`/`d1Store` users who adopt entities.**
Existing tables lack `user_id` and `tenant_id` columns. Additive `ALTER TABLE … ADD COLUMN` migration is provided in `packages/agents/migrations/001-add-rls-columns.sql` + a backfill SQL. D1 users apply via their own Wrangler-managed migration flow; SQLite file users apply via `@vertz/db` migrations. No PK-type-change migration needed (PK is unchanged in Rev 3).

**U3: Does `d.integer().primary()` produce SQLite `INTEGER PRIMARY KEY`?**
Verified: `integer()` is a standard column type in `d.*`. `.primary()` is a shared method across column builders (`packages/db/src/schema/column.ts`). Exact DDL emitted by the `@vertz/db` SQLite dialect to be confirmed during impl — if it emits plain `INTEGER PRIMARY KEY`, we match legacy ROWID semantics. If it emits `BIGINT PRIMARY KEY` or similar, the impl PR either flags `@vertz/db` as needing a dialect tweak or we add a small wrapper. Not a design blocker.

---

## POC Results

No code POC; every moving part has a production reference in the codebase:

- Column pack → `d.table`: `packages/db/src/client/__tests__/createDb-local-sqlite.test.ts:432`.
- Tenant auto-detection from `tenantId` column and from `ref.one()` to `.tenant()` table: `packages/server/src/entity/entity.ts:14-53`.
- Tenant chain resolution at `createServer`: `packages/server/src/create-server.ts:433-506`.
- `rules.where({ userId: rules.user.id })` flat evaluation: `packages/server/src/entity/access-enforcer.ts:64-72`.
- `d.model(table, relationsObject)` signature: `packages/db/src/__tests__/prisma-style-api.test.ts:30-32`.
- `d.index([cols], { unique: true })`: `packages/db/src/schema/table.ts:37`.
- `createCrudHandlers(def, db)` + `handlers.list(ctx, options)`: `packages/server/src/entity/__tests__/crud-pipeline.test.ts:171-198`.
- `db._internals.models`: `packages/db/src/client/database.ts:601`; negatively asserted in `packages/db/src/__tests__/database-client-types.test-d.ts:187-189`.
- `AgentSession` + `appendMessagesAtomic(sessionId, messages, session)` existing signature: `packages/agents/src/stores/types.ts:52-70`.

The acceptance test below exercises every piece in one run.

---

## Type Flow Map

```ts
function defineAgentEntities<TDb extends DatabaseClient<any>>(
  db: TDb,
  opts?: DefineAgentEntitiesOptions,
): { session: EntityDefinition; message: EntityDefinition };
```

- `TDb` is a positional generic used only to carry through the `DatabaseClient` shape so that the runtime `db._internals.models` lookup is type-checked against the registered models. Not exposed in the return.
- Return types are fixed `EntityDefinition` — no generic output. Extensions are made outside the factory by users writing their own `d.table`/`d.model`/`entity` chains, so the factory's type surface stays minimal.
- Three negative type tests in `entities/__tests__/define.test-d.ts`:
  1. `defineAgentEntities(db, { sessionName: 42 })` → `@ts-expect-error`
  2. `defineAgentEntities(db, { sessionAccess: { list: 'not-a-rule' } })` → `@ts-expect-error` (rule shape)
  3. `defineAgentEntities()` called without `db` → `@ts-expect-error`

No dead generics. `TDb` is used by the runtime validator and by the inferred keys of `db._internals.models` (which will fail compilation if the user hasn't registered the right tables — honesty in error reporting).

---

## E2E Acceptance Test

All APIs verified against real code (see References). Store and entity `db` share a single on-disk file so `run()`-driven writes are visible to the entity read path.

```ts
// apps/demo/e2e/agent-store-entity-bridge.test.ts
import { test, expect, afterEach } from '@vertz/test';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { unlinkSync } from 'node:fs';
import { run, sqliteStore } from '@vertz/agents';
import {
  agentSessionColumns, agentSessionIndexes,
  agentMessageColumns, agentMessageIndexes,
  defineAgentEntities,
} from '@vertz/agents/entities';
import { d, createDb, createDatabaseBridgeAdapter } from '@vertz/db';
import {
  createServer, rules,
  createCrudHandlers, createEntityContext, EntityRegistry,
  type EntityOperations,
} from '@vertz/server';

// Workspaces table — plain FK target (NOT marked .tenant() here; tenant scoping uses the
// `tenantId` column already in agentSessionColumns to keep the test's tenant story simple).
const workspacesTable = d.table('workspaces', {
  id: d.uuid().primary(),
  name: d.text(),
});

// Extended session — add workspaceId for the "custom column" test. Keep `tenantId` column
// (auto-detection picks it up; no relation-vs-column conflict).
const sessionsTable = d.table('agent_sessions', {
  ...agentSessionColumns,
  workspaceId: d.uuid(),
}, { indexes: [...agentSessionIndexes, d.index('workspaceId')] });

const messagesTable = d.table('agent_messages', agentMessageColumns, { indexes: agentMessageIndexes });

// Shared DB file — store and entity db point at the same path so run()-driven writes
// via the store are visible to the entity read path.
const dbPath = join(tmpdir(), `agent-bridge-${Date.now()}.db`);
afterEach(() => { try { unlinkSync(dbPath); } catch {} });

const db = createDb({
  dialect: 'sqlite',
  path: dbPath,
  migrations: { autoApply: true },
  models: {
    workspaces: d.model(workspacesTable),
    agentSessions: d.model(sessionsTable, {
      workspace: d.ref.one(() => workspacesTable, 'workspaceId'),
    }),
    agentMessages: d.model(messagesTable, {
      session: d.ref.one(() => sessionsTable, 'sessionId'),
    }),
  },
});

const { session: Session, message: Message } = defineAgentEntities(db);   // defaults

// Registering entities with createServer is where tenantChain resolves. We don't serve
// HTTP in this test — we only need the registration side-effect.
createServer({ db, entities: [Session, Message] });

// EntityContext construction. The handler path (createCrudHandlers) takes its own
// EntityDbAdapter, so the `ops` passed into the context are only used by ctx.entities.*
// cross-entity traversal — which this test doesn't exercise. Stub ops match the pattern
// at crud-pipeline.test.ts:145-153.
const stubOps: EntityOperations = {
  get: async () => ({}),
  list: async () => ({ items: [], total: 0, limit: 0, nextCursor: null, hasNextPage: false }),
  create: async () => ({}),
  update: async () => ({}),
  delete: async () => undefined,
};

const registry = new EntityRegistry();
registry.register(Session.name, stubOps);
registry.register(Message.name, stubOps);

function asCtx(userId: string | null, tenantId: string | null) {
  return createEntityContext(
    { userId, tenantId, roles: [] },      // RequestInfo
    stubOps,                               // this entity's ops (not used by the handlers path)
    registry.createProxy(),                // cross-entity proxy
  );
}

test('end-to-end: sessions + messages respect RLS across tenants and users', async () => {
  // Seed workspaces
  const ws1 = await db.workspaces.create({ data: { id: 'ws-1', name: 'A' } });
  const ws2 = await db.workspaces.create({ data: { id: 'ws-2', name: 'B' } });
  if (!ws1.ok || !ws2.ok) throw new Error('seed failed');

  // Per-entity DB adapters (required by createCrudHandlers).
  const sessionAdapter = createDatabaseBridgeAdapter(db, 'agentSessions');
  const messageAdapter = createDatabaseBridgeAdapter(db, 'agentMessages');
  const sessionHandlers = createCrudHandlers(Session, sessionAdapter);
  const messageHandlers = createCrudHandlers(Message, messageAdapter);

  // User A runs an agent in ws-1. The store writes agent_sessions + agent_messages rows,
  // denormalizing userId/tenantId onto each message (for RLS).
  const store = sqliteStore({ path: dbPath });
  const runA = await run(coderAgent, {
    message: 'Hi', llm: mockLlm, store,
    userId: 'user-a', tenantId: 'ws-1',
  });

  // App-side entity create: caller omits userId/tenantId; the factory's before.create hook
  // injects them from ctx. Also attaches workspaceId, proving custom-column flow.
  const created = await sessionHandlers.create(
    asCtx('user-a', 'ws-1'),
    { agentName: 'coder', workspaceId: 'ws-1' },
  );
  if (!created.ok) throw created.error;
  expect(created.data.body).toMatchObject({
    userId: 'user-a', tenantId: 'ws-1', workspaceId: 'ws-1',
  });

  // User B (different tenant): cannot see User A's sessions
  const listB = await sessionHandlers.list(asCtx('user-b', 'ws-2'));
  if (!listB.ok) throw listB.error;
  expect(listB.data.body.items).toEqual([]);

  // User C (same tenant as A, different user): cannot see User A's sessions
  const listC = await sessionHandlers.list(asCtx('user-c', 'ws-1'));
  if (!listC.ok) throw listC.error;
  expect(listC.data.body.items).toEqual([]);

  // User A: sees both sessions — the run()-created one AND the entity-created one
  const listA = await sessionHandlers.list(asCtx('user-a', 'ws-1'));
  if (!listA.ok) throw listA.error;
  expect(listA.data.body.items.map((s) => s.id).sort()).toEqual(
    [runA.sessionId, created.data.body.id].sort(),
  );

  // Messages persisted by run() are queryable via entity API, ordered, RLS'd
  const msgsA = await messageHandlers.list(
    asCtx('user-a', 'ws-1'),
    { where: { sessionId: runA.sessionId } },
  );
  if (!msgsA.ok) throw msgsA.error;
  expect(msgsA.data.body.items.map((m) => m.role)).toEqual(['user', 'assistant']);
  expect(msgsA.data.body.items.map((m) => m.seq)).toEqual([1, 2]);

  // User C in same tenant: cannot read A's messages (denormalized userId filter)
  const msgsC = await messageHandlers.list(
    asCtx('user-c', 'ws-1'),
    { where: { sessionId: runA.sessionId } },
  );
  if (!msgsC.ok) throw msgsC.error;
  expect(msgsC.data.body.items).toEqual([]);

  // Extended field query works
  const inWs1 = await sessionHandlers.list(asCtx('user-a', 'ws-1'), { where: { workspaceId: 'ws-1' } });
  if (!inWs1.ok) throw inWs1.error;
  expect(inWs1.data.body.items).toHaveLength(1);
});
```

Negative type tests go in `packages/agents/src/entities/__tests__/define.test-d.ts` (NOT in the runtime test). Three assertions as listed in the Type Flow Map.

---

## Trade-offs (explicit)

1. **Message-row denormalization.** `user_id`/`tenant_id` are duplicated from the session onto each message. Cost: two extra columns + two extra binds per append. Benefit: flat `rules.where({ userId })` on Message works with zero access-enforcer changes. Invariant: session identity is immutable; no code path updates `agent_sessions.user_id` or `.tenant_id` after creation.

2. **Agent-loop writes skip entity hooks.** Writes go through the `AgentStore` (never routed through `CrudPipeline`). A developer attaching `before.create` on `Message` expecting it to fire on every agent-generated message WILL be disappointed. **Tracked**: follow-up issue (`#2957`) to reject hook registration on factory-produced entities. Until that ships: the `defineAgentEntities` JSDoc calls this out, and the docs page documents it prominently.

3. **`run.ts` ownership check stays.** Load-bearing for `memoryStore` / `sqliteStore` / `d1Store` consumers who don't adopt entities. Redundant-but-harmless for entity consumers. Removing it is a separate PR — explicitly out of scope here.

4. **Error type drift between paths.** `store.loadSession` failure (ownership or not-found) throws `SessionNotFoundError` / `SessionAccessDeniedError` from `run.ts:219-229`. App-side `Session.get` failure throws `EntityForbiddenError` / `EntityNotFoundError` from the CRUD pipeline. Documented explicitly in the mint-docs page; no attempt to unify.

5. **`AgentStore.appendMessages` signature changes.** Breaking at the interface level (three in-repo impls + any hypothetical external impl). Pre-v1 policy permits breaking changes; no known external consumers of this signature.

6. **DDL source of truth is opt-in.** If a user registers tables with `@vertz/db` AND runs `sqliteStore`, the `CREATE TABLE IF NOT EXISTS` is a no-op (table exists). If columns drift between the user's `d.table` spread and the store's built-in DDL — because the user modified the pack or skipped a column — the store's writes would fail on missing columns. Documented as "the column pack is the contract; don't cherry-pick individual columns from it."

7. **New columns ship in store DDL too.** Non-adopting users on fresh installs get the new columns automatically (forward-compat). Non-adopting users on existing installs need the one-time `ALTER TABLE ADD COLUMN` migration. Additive; not breaking.

---

## Migration

### For users adopting entities

1. Define tables using the column packs; register via `createDb({ models })`.
2. Run `ALTER TABLE agent_messages ADD COLUMN user_id TEXT; ADD COLUMN tenant_id TEXT;` (once; provided as `packages/agents/migrations/001-add-rls-columns.sql`).
3. Run the backfill: `UPDATE agent_messages SET user_id = (SELECT user_id FROM agent_sessions WHERE id = session_id), tenant_id = (SELECT tenant_id FROM agent_sessions WHERE id = session_id) WHERE user_id IS NULL;`
4. Call `defineAgentEntities(db)`; register with `createServer({ entities: [...] })`.

### For users NOT adopting entities — breaking change scope

The stores' built-in DDL is updated (adds `user_id` and `tenant_id` to `agent_messages`), so fresh installs get the new columns automatically. For existing installs, **all `@vertz/agents` users must run the `ALTER TABLE agent_messages ADD COLUMN …` migration on upgrade** — because the stores now unconditionally write those columns.

This is an intentional scope expansion from Rev 2 (which implied non-adopters were untouched). Rationale:
- Pre-v1 policy (`.claude/rules/policies.md`) permits breaking changes; breaking once now avoids a code-path split where adopters and non-adopters use different store internals forever.
- Migration is a two-statement SQL file, documented in the changeset and release notes.
- The only known external consumer (triagebot, per `project-triagebot-consumer.md`) is on D1 where `ADD COLUMN` is supported and low-risk.
- "Small > clever" (Manifesto principle 6) — a `withRlsColumns: true` flag would keep legacy behavior by default but create a permanent config branch to maintain. We don't build it.

### Triagebot validation (per `project-triagebot-consumer.md`)

Triagebot uses `d1Store`. It needs to run the ALTER TABLE migration once, then nothing else changes for their code. Their session persistence keeps working; they gain the option to adopt entities later with zero additional migration. Non-breaking for their code path; one DDL migration required. Flagged in the release notes.

---

## Success Metric

- **Primary (must ship):** the open-agents demo uses `Session.list()` / `Message.list()` with RLS, served at the edge. No hand-rolled `WHERE user_id = ?` in demo code.
- **Secondary (measurable in 30 days):** a multi-tenant regression test in the Vertz repo asserting cross-tenant and cross-user isolation; green = bridge is working.
- **Tertiary (signal, not gate):** triagebot migrates within 30 days. Failure signal: triagebot reports bridge is unusable → re-open design. If triagebot is unblocked on a different issue and doesn't migrate for unrelated reasons, that's not a bridge failure.

---

## Implementation Phasing

Single PR, ≤ 15 files, three logical tasks (each ≤ 5 files per `.claude/rules/phase-implementation-plans.md`):

**Task A: Store interface + denormalization + DDL.**
- `packages/agents/src/stores/types.ts` — `appendMessages(sessionId, messages, session)` signature change.
- `packages/agents/src/stores/memory-store.ts` — thread session through; 2 new fields in row shape.
- `packages/agents/src/stores/sqlite-store.ts` — DDL additions + bind list updates (~8 lines).
- `packages/agents/src/stores/d1-store.ts` — DDL additions + bind list updates (~10 lines, includes `batch()` path).
- `packages/agents/src/run.ts` — pass session to `appendMessages` call (~1 line).

**Task B: Entity bridge.**
- `packages/agents/src/entities/columns.ts` — pack constants.
- `packages/agents/src/entities/define.ts` — `defineAgentEntities` factory + `before.create` injector.
- `packages/agents/src/entities/index.ts` — barrel.
- `packages/agents/package.json` — `exports["./entities"]` subpath; `@vertz/db` + `@vertz/server` as optional peers.
- `packages/agents/migrations/001-add-rls-columns.sql` — ALTER + backfill SQL.

**Task C: Tests + docs.**
- `packages/agents/src/entities/__tests__/define.test-d.ts` — three negative type assertions.
- `packages/agents/src/entities/__tests__/define.test.ts` — unit tests for the factory (table lookup, defaults, override, hook).
- `packages/agents/src/entities/__tests__/bridge.integration.test.ts` — the E2E acceptance test above.
- `packages/mint-docs/guides/agents/entity-bridge.mdx` — new page; migration guide + trade-offs + RLS scope; link to follow-up issue for hook-bypass enforcement.

Follow-up issues created with this PR (linked in the doc above):
- `#2957` — reject entity hook registration on factory-produced entities.
- `#2958` — migrate `state`/`toolCalls` to `d.jsonb<T>()` with opt-in flag.

---

## References (verified file:line)

- Current `AgentStore` interface: `packages/agents/src/stores/types.ts:30-71`.
- `appendMessagesAtomic(sessionId, messages, session)` reference shape: `packages/agents/src/stores/types.ts:66-70`.
- `run()` ownership check: `packages/agents/src/run.ts:222-252`.
- `run()` call site for session construction: `packages/agents/src/run.ts:319-330`.
- Entity tenant auto-detection: `packages/server/src/entity/entity.ts:14-23` (resolver) + `:50-53` (fallback).
- Tenant chain resolution at `createServer`: `packages/server/src/create-server.ts:433-506`.
- Rule builders: `packages/server/src/auth/rules.ts:77-118`.
- Rule evaluator (flat-only): `packages/server/src/entity/access-enforcer.ts:64-72`.
- Rule serialization (edge enforcement): `packages/server/src/auth/rules.ts:205-225`.
- `d.model(table, relations)` signature: `packages/db/src/__tests__/prisma-style-api.test.ts:30-32`.
- `d.index([cols], { unique: true })` signature: `packages/db/src/schema/table.ts:37`.
- `createCrudHandlers(def, adapter)` + `handlers.list(ctx, options)`: `packages/server/src/entity/__tests__/crud-pipeline.test.ts:171-198` and `packages/server/src/entity/crud-pipeline.ts:207-211`.
- `createDatabaseBridgeAdapter(db, modelKey)`: `packages/db/src/adapters/database-bridge-adapter.ts:59-62`.
- `createDb({ dialect: 'sqlite', path, models, migrations: { autoApply: true } })`: `packages/db/src/client/__tests__/createDb-local-sqlite.test.ts:439-444`.
- `Result.ok` + `.data`: `packages/errors/src/result.ts:33-38`.
- `db._internals.models`: `packages/db/src/client/database.ts:601`.
- `EntityRegistry` + `registry.register(name, ops)` + `createEntityContext(request, ops, proxy)` (3-arg): `packages/server/src/entity/entity-registry.ts:7`, `packages/server/src/entity/context.ts:18-22`, usage pattern in `packages/server/src/entity/__tests__/crud-pipeline.test.ts:138-153`. Public exports at `packages/server/src/index.ts:295-311`.
- Legacy sqlite-store DDL: `packages/agents/src/stores/sqlite-store.ts:9-38`.
- `Serial` column meta lacking `primary: true` (explains PK-type question): `packages/db/src/schema/column.ts:436-460`.
- `Message` in-memory shape: `packages/agents/src/loop/react-loop.ts:9-18`.
- Gap #4: `plans/open-agents-clone.md`.
- Issue: [#2847](https://github.com/vertz-dev/vertz/issues/2847).

---

## Approvals

- [x] DX sign-off (Rev 5) — Rev 4 blockers B10-B13 resolved; S1 stub `list` shape fixed in Rev 6; S2 (`ctx.userId`-wins) accepted as v1 default.
- [x] Product sign-off (Rev 5) — E2E shared-DB bug fixed; non-adopter breaking scope accepted; `withRlsColumns` alternative removed per recommendation.
- [x] Technical sign-off (Rev 5, pending Rev 6 re-verify) — all E2E API shapes verified; §3 Usage `sqliteDriver` hallucination + false RLS claim on `db.*.list()` fixed in Rev 6.
- [ ] User final sign-off.
