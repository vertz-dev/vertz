---
"@vertz/core": patch
---

Process route-level middlewares in app runner. Routes with a `middlewares` field now have those middlewares executed after global middlewares, with their contributions merged into the handler context.
