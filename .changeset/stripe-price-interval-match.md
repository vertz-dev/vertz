---
'@vertz/server': patch
---

Fix matchingPrice check in Stripe adapter to compare recurring interval and interval_count, not just unit_amount — prevents silent interval drift when syncing plans (#1560)
