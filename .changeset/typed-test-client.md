---
'@vertz/testing': patch
'@vertz/server': patch
---

Add createTestClient() with typed entity/service proxies for 100% type-safe server testing. Entity proxy provides typed create/list/get/update/delete. Service proxy provides direct method access with typed body/response. Adds phantom type pattern to ServiceDefinition for type preservation.
