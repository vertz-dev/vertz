---
'@vertz/server': patch
---

feat(server): conditional BaseContext types via typed() factory (#2004)

BaseContext is now generic over ContextFeatures. Auth/tenancy fields only
appear on ctx when configured. Use typed(auth) to get narrowed entity()
and service() factories. Existing code is unaffected — BaseContext without
a type parameter defaults to FullFeatures (all fields present).
