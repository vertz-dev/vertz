---
'@vertz/ui': patch
'@vertz/codegen': patch
---

Deep normalization for EntityStore — cross-entity reactive resolution.

Write-side: `merge()` extracts nested entity objects, stores them separately, and replaces inline references with bare IDs. Read-side: `resolveReferences()` inside computed signals resolves bare IDs back to live entity objects, creating reactive subscriptions that propagate cross-entity updates automatically.

Includes relation schema registry (`registerRelationSchema`), reference counting (`addRef`/`removeRef`), smart eviction (`evictOrphans`), and codegen integration to emit `registerRelationSchema` calls in generated client code.
