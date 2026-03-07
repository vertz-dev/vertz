---
'@vertz/server': patch
---

Validate entity models are registered in createDb() at server creation time. When an entity name doesn't match a key in the DatabaseClient's model registry, createServer() now throws a clear error listing all missing models and showing which models are registered. Previously this caused a cryptic runtime TypeError when the entity was first accessed.
