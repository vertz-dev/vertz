---
'@vertz/server': patch
---

Add `requestHandler` to `ServerInstance` — a unified handler that routes auth requests (`/api/auth/*`) to `auth.handler` and everything else to the entity handler. Eliminates the manual if/else routing boilerplate every auth-enabled app previously required.
