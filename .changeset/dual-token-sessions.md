---
'@vertz/server': patch
---

Dual-token sessions: replace single 7-day JWT with 60-second JWT (`vertz.sid`) + 7-day opaque refresh token (`vertz.ref`) stored hashed in session store. Adds token rotation with 10-second idempotent grace period, session management API (list/revoke/revoke-all), device name parsing, and pluggable store interfaces (SessionStore, UserStore, RateLimitStore). Decomposes auth monolith into focused modules.
