---
'@vertz/agents': patch
---

feat(agents): bridge `AgentStore` with Vertz entities for RLS-aware queries [#2847]

Adds `@vertz/agents/entities` subpath exporting column packs
(`agentSessionColumns`, `agentMessageColumns`, `agentSessionIndexes`,
`agentMessageIndexes`) and a `defineAgentEntities(db)` factory that turns the
store's tables into first-class Vertz entities. App-side reads via
`/api/agent-session` routes or `ctx.entities.agentSession.list()` now flow
through the CRUD pipeline with full `rules.*` enforcement (auth, tenant
scoping, row-level `where`). Writes from the agent loop keep going through
`sqliteStore`/`d1Store` — same atomic paths, unchanged hot path.

**Breaking:** `AgentStore.appendMessages(sessionId, messages)` gains a third
`session: AgentSession` parameter — matches the existing
`appendMessagesAtomic` shape. `run.ts` already has the session in scope at the
call site; external `AgentStore` implementers need to update their method
signature (and, if they back entity reads, denormalize `userId`/`tenantId`
onto message rows as the shipped implementations now do).

**Breaking:** `agent_messages` gains `user_id` and `tenant_id` columns.
Fresh installs get them automatically; existing databases must run
`packages/agents/migrations/001-add-rls-columns.sql` once on upgrade.

Follow-ups tracked: #2957 (reject entity hook registration on factory
entities), #2958 (migrate `state`/`toolCalls` to `d.jsonb<T>()`).

See `plans/agent-store-entity-bridge.md` (merged as #2959) for the full
design and `guides/agents/entity-bridge` in mint-docs for usage.
