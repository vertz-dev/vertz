---
'@vertz/ui': patch
'@vertz/fetch': patch
---

Add same-type query revalidation via MutationEventBus. Entity-backed queries now automatically revalidate when a mutation commits for the same entity type. Opt out per-mutation via `skipInvalidation: true` on MutationMeta.
