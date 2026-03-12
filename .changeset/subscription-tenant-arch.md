---
"@vertz/server": patch
---

Refactor plan storage to subscription-based tenant architecture

- `PlanStore` → `SubscriptionStore`, `OrgPlan` → `Subscription`, methods simplified (`assign`, `get`, `remove`)
- `DbPlanStore` → `DbSubscriptionStore`, `InMemoryPlanStore` → `InMemorySubscriptionStore`
- All store interfaces (`SubscriptionStore`, `FlagStore`, `WalletStore`) now use `tenantId` instead of `orgId`
- Removed `plan` field from `AuthUser`, `ReservedSignUpField`, `UserTableEntry`, and `auth_users` DDL
- `computeAccessSet()` resolves plan via `subscriptionStore.get(tenantId)` instead of `user.plan` parameter
- `AuthAccessConfig` now accepts `subscriptionStore` and `walletStore`
