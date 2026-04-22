import { d } from '@vertz/db';
import type { ColumnRecord, IndexDef } from '@vertz/db';

/**
 * Column pack for `agent_sessions`. Matches the legacy DDL in
 * `sqlite-store.ts` / `d1-store.ts` on every column.
 *
 * Spread into your own `d.table()` call. See `plans/agent-store-entity-bridge.md`
 * for the full usage pattern and the rationale for the ctx-wins `before.create`
 * hook that `defineAgentEntities()` installs.
 */
export const agentSessionColumns = {
  // `generate: 'uuid'` auto-generates an id when the entity CRUD pipeline creates a row
  // (the pipeline excludes PK columns from $create_input unless they have a default).
  // The `AgentStore` path (sqliteStore/d1Store) still provides its own id — `run()` mints
  // `sess_<uuid>` via `generateSessionId()`. Both paths write to the same TEXT column;
  // the DB doesn't care about the id format.
  id: d.text().primary({ generate: 'uuid' }),
  agentName: d.text(),
  userId: d.text().nullable(),
  tenantId: d.text().nullable(),
  state: d.text(),
  createdAt: d.text(),
  updatedAt: d.text(),
} satisfies ColumnRecord;

/**
 * Column pack for `agent_messages`. Existing legacy columns + two new denormalized
 * columns (`userId`, `tenantId`) that enable flat `rules.where({ userId: rules.user.id })`
 * on the `Message` entity without relation-traversing access rules.
 *
 * The agent store writes `userId` / `tenantId` from the session on every append —
 * which is why `AgentStore.appendMessages` gained a `session` parameter in the
 * same PR. See `plans/agent-store-entity-bridge.md`.
 */
export const agentMessageColumns = {
  id: d.integer().primary(),
  sessionId: d.text(),
  seq: d.integer(),
  role: d.text(),
  content: d.text(),
  toolCallId: d.text().nullable(),
  toolName: d.text().nullable(),
  toolCalls: d.text().nullable(),
  userId: d.text().nullable(),
  tenantId: d.text().nullable(),
  createdAt: d.text(),
} satisfies ColumnRecord;

export const agentSessionIndexes: IndexDef[] = [
  d.index('agentName'),
  d.index('userId'),
  d.index('updatedAt'),
];

export const agentMessageIndexes: IndexDef[] = [
  d.index(['sessionId', 'seq'], { unique: true }),
  d.index('userId'),
];
