import { d } from '@vertz/db';
import type { ColumnRecord, IndexDef } from '@vertz/db';

/**
 * Opt-in options for the column packs. `useJsonb` swaps `state` / `toolCalls`
 * from `d.text()` to `d.jsonb<T>()`, which emits `JSONB` on Postgres (indexable,
 * typed operators) and stays `TEXT` on SQLite. Default remains `d.text()` for
 * byte-compat with the legacy `sqliteStore` / `d1Store` DDL. See #2958.
 */
export interface AgentColumnOptions {
  readonly useJsonb?: boolean;
}

// Internal helpers. We keep the shared shape in one builder so overloads only
// differ in the swapped column's type — each overload passes a different
// factory result into the same builder, and TS threads the column type
// through the returned object without a cast.

function buildSessionCols<TStateCol>(state: TStateCol) {
  return {
    // `generate: 'uuid'` auto-generates an id when the entity CRUD pipeline creates a row
    // (the pipeline excludes PK columns from $create_input unless they have a default).
    // The `AgentStore` path (sqliteStore/d1Store) still provides its own id — `run()` mints
    // `sess_<uuid>` via `generateSessionId()`. Both paths write to the same TEXT column;
    // the DB doesn't care about the id format.
    id: d.text().primary({ generate: 'uuid' }),
    agentName: d.text(),
    userId: d.text().nullable(),
    tenantId: d.text().nullable(),
    state,
    createdAt: d.text(),
    updatedAt: d.text(),
  };
}

function buildMessageCols<TToolCallsCol>(toolCalls: TToolCallsCol) {
  return {
    id: d.integer().primary(),
    sessionId: d.text(),
    seq: d.integer(),
    role: d.text(),
    content: d.text(),
    toolCallId: d.text().nullable(),
    toolName: d.text().nullable(),
    toolCalls,
    userId: d.text().nullable(),
    tenantId: d.text().nullable(),
    createdAt: d.text(),
  };
}

/**
 * Column pack for `agent_sessions`. Matches the legacy DDL in
 * `sqlite-store.ts` / `d1-store.ts` on every column.
 *
 * Spread into your own `d.table()` call. Pass `{ useJsonb: true }` to type
 * `state` with the `TState` generic and emit `JSONB` on Postgres. See
 * `plans/agent-store-entity-bridge.md` for the full usage pattern and the
 * ctx-wins `before.create` hook that `defineAgentEntities()` installs.
 */
export function agentSessionColumns(opts?: {
  readonly useJsonb?: false;
}): ReturnType<typeof buildSessionCols<ReturnType<typeof d.text>>>;
export function agentSessionColumns<TState>(opts: {
  readonly useJsonb: true;
}): ReturnType<typeof buildSessionCols<ReturnType<typeof d.jsonb<TState>>>>;
// Fallback for dynamic boolean — `{ useJsonb: flag }` where `flag: boolean`
// widens away from the literal and would otherwise miss both typed overloads.
export function agentSessionColumns(opts: AgentColumnOptions): ColumnRecord;
export function agentSessionColumns<TState = unknown>(opts: AgentColumnOptions = {}): ColumnRecord {
  const state = opts.useJsonb ? d.jsonb<TState>() : d.text();
  return buildSessionCols(state);
}

/**
 * Column pack for `agent_messages`. Existing legacy columns + two denormalized
 * columns (`userId`, `tenantId`) that enable flat `rules.where({ userId: rules.user.id })`
 * on the `Message` entity without relation-traversing access rules.
 *
 * The agent store writes `userId` / `tenantId` from the session on every append —
 * which is why `AgentStore.appendMessages` gained a `session` parameter in the
 * same PR. See `plans/agent-store-entity-bridge.md`.
 *
 * Pass `{ useJsonb: true }` to type `toolCalls` with the `TToolCalls` generic
 * (e.g. `readonly ToolCall[]`) and emit `JSONB` on Postgres.
 */
export function agentMessageColumns(opts?: {
  readonly useJsonb?: false;
}): ReturnType<typeof buildMessageCols<ReturnType<ReturnType<typeof d.text>['nullable']>>>;
export function agentMessageColumns<TToolCalls>(opts: {
  readonly useJsonb: true;
}): ReturnType<
  typeof buildMessageCols<ReturnType<ReturnType<typeof d.jsonb<TToolCalls>>['nullable']>>
>;
// Fallback for dynamic boolean — matches `{ useJsonb: boolean }`.
export function agentMessageColumns(opts: AgentColumnOptions): ColumnRecord;
export function agentMessageColumns<TToolCalls = unknown>(
  opts: AgentColumnOptions = {},
): ColumnRecord {
  const toolCalls = opts.useJsonb ? d.jsonb<TToolCalls>().nullable() : d.text().nullable();
  return buildMessageCols(toolCalls);
}

export const agentSessionIndexes: IndexDef[] = [
  d.index('agentName'),
  d.index('userId'),
  d.index('updatedAt'),
];

export const agentMessageIndexes: IndexDef[] = [
  d.index(['sessionId', 'seq'], { unique: true }),
  d.index('userId'),
];
