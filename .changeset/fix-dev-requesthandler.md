---
'@vertz/cli': patch
---

Fix CLI dev server using `.handler` instead of `.requestHandler` when auth is configured, which caused auth routes (sign-in, sign-up, OAuth, etc.) to 404. The dev server now prefers `requestHandler` when available and falls back to `handler` for non-auth setups.
