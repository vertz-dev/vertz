---
'@vertz/server': patch
---

fix(server): extract auth session middleware and add integration tests

`createServer()` with `auth` now auto-wires a session middleware that bridges JWT session data (`userId`, `tenantId`, `roles`) into the entity/service handler context. The inline middleware has been extracted to `createAuthSessionMiddleware()` in the auth module for testability and separation of concerns.
