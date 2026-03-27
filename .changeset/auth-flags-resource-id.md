---
'@vertz/server': patch
---

feat(auth): align auth_flags with (resource_type, resource_id) pattern

FlagStore interface now uses `(resourceType, resourceId, flag)` instead of `(tenantId, flag)`.
This aligns with the composite key pattern used by SubscriptionStore, ClosureStore, and other auth stores.

Breaking change: all FlagStore method signatures updated from 2/3 args to 3/4 args.
