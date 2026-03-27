---
'@vertz/server': patch
'@vertz/ui': patch
---

chore(auth): align AccessEventBroadcaster with (resourceType, resourceId) pattern

AccessEvent type and broadcast method signatures now use (orgId, resourceType, resourceId, ...) instead of bare orgId. ClientAccessEvent includes resourceType/resourceId for client-side resource-level filtering. WebSocket connection routing unchanged.
