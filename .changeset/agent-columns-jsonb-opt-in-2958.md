---
'@vertz/agents': patch
---

BREAKING: `agentSessionColumns` / `agentMessageColumns` are now functions — call them (`...agentSessionColumns()`), don't spread the bare identifier.

```ts
// Before (no longer compiles)
d.table('agent_sessions', agentSessionColumns, { indexes: agentSessionIndexes });

// After (default behavior unchanged — still d.text() on disk)
d.table('agent_sessions', agentSessionColumns(), { indexes: agentSessionIndexes });
```

Closes [#2958](https://github.com/vertz-dev/vertz/issues/2958).

Pass `{ useJsonb: true }` with a generic to opt each column into
`d.jsonb<T>()`, which emits `JSONB` on Postgres (indexable, typed
operators) and stays `TEXT` on SQLite (the driver auto-parses on read):

```ts
d.table(
  'agent_sessions',
  agentSessionColumns<AgentState>({ useJsonb: true }),
  { indexes: agentSessionIndexes },
);

// Entity reads now return AgentState, not string.
const { items } = await ctx.entities['agent-session'].list({});
items[0]?.state.step; // typed
```

The `AgentStore` path (`sqliteStore` / `d1Store`) is orthogonal — it keeps
its own `JSON.stringify` / `JSON.parse` wrapping and writes raw SQL, so
on SQLite the on-disk shape is the same in both modes and store/entity
readers share rows without coordination.
