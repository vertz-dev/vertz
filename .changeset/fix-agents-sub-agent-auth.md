---
'@vertz/agents': patch
---

fix(agents): propagate `userId`/`tenantId` to sub-agents via `ctx.agents.invoke()`

Previously, `ctx.agents.invoke()` dropped the caller's identity, so every sub-agent ran with `null` `userId` and `tenantId` — a privilege-confusion bug where sub-agent tools saw no authenticated user regardless of the caller's context.

Sub-agents now inherit the parent's identity by default. An optional `as: { userId?, tenantId? }` override on `invoke()` lets a tool handler explicitly rescope a sub-run (set a field to `null` to drop it entirely).

`userId` and `tenantId` are now accepted on all `run()` calls — not only when a store is provided — so stateless callers can also thread identity through.
