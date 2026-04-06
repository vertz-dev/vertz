---
'@vertz/server': patch
---

fix(server): service action custom `path` now respects the API prefix

Previously, providing a custom `path` on a service action would bypass the API prefix entirely (e.g., `path: '/webhooks/stripe'` produced `/webhooks/stripe` instead of `/api/webhooks/stripe`). Custom paths are now always prefixed with the configured API prefix, consistent with entity custom action behavior.
