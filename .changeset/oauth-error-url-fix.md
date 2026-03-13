---
'@vertz/server': patch
---

Fix OAuth error redirect URL construction to use the URL constructor instead of string concatenation. Handles URL fragments, existing query params, duplicate error params, and absolute URLs correctly.
