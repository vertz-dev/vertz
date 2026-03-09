---
'@vertz/server': patch
---

feat(auth): plans & wallet — Layer 4/5 plan checks, wallet limits, canAndConsume/unconsume

Adds SaaS plan and wallet infrastructure to the auth system:
- `defineAccess()` now accepts `plans` config with entitlements and limits
- `PlanStore` / `InMemoryPlanStore` for org-to-plan assignments with expiration and overrides
- `WalletStore` / `InMemoryWalletStore` for consumption tracking with atomic check-and-increment
- `calculateBillingPeriod()` for period-anchored billing calculations
- Layer 4 (plan check) and Layer 5 (wallet check) in `can()` and `check()`
- `canAndConsume()` — atomic access check + wallet increment
- `unconsume()` — rollback after operation failure
- `computeAccessSet()` enrichment with limit info for JWT embedding
- Plan expiration with free fallback
- Per-customer overrides via `max(override, plan_limit)`
