---
'@vertz/agents': patch
---

Add agent persistence layer: pluggable `AgentStore` interface with `memoryStore`, `sqliteStore`, and `d1Store` implementations. `run()` now supports session resumption via discriminated union options, with session ownership enforcement and message pruning via `maxStoredMessages`.
