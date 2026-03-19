---
'@vertz/server': patch
---

Fix quarterly interval dropping interval_count when building Stripe price params — quarterly plans were silently created as monthly (#1557)
