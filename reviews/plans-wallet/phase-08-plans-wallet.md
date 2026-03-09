# Adversarial Review — Phase 8: Plans & Wallet

## Sub-Phase 8.1: defineAccess() plans config + PlanStore

### Findings

1. **PlanStore.assignPlan default startedAt = `new Date()`** — Creating plans in tests without explicit startedAt introduces time-sensitivity. Tests that depend on billing period alignment could become flaky near midnight boundaries. **Mitigated:** Tests in this phase use explicit startedAt dates.

2. **OrgPlan overrides type uses `{ per: BillingPeriod; max: number }` but the `per` field is not validated against the entitlement's limit `per` field.** An override could theoretically have `per: 'day'` while the plan limit has `per: 'month'`. Currently `resolveEffectiveLimit()` ignores the override's `per` field and only uses `max`. This is acceptable for now but could be a source of confusion. **Severity: Low.**

3. **Frozen plan config correctly freezes entitlements and limits.** Verified the deep-freeze chain from `defineAccess()`. ✅

### Verdict: Pass

---

## Sub-Phase 8.2: WalletStore + calculateBillingPeriod

### Findings

1. **InMemoryWalletStore is not thread-safe** — `consume()` reads, checks, and increments in separate steps. In a multi-threaded production database, this would be a TOCTOU race. **Acceptable** because: (a) InMemory is for tests/dev only, (b) the interface signature is synchronous, allowing production implementations to use database-level atomics (e.g., `UPDATE ... WHERE consumed + amount <= limit`).

2. **calculateBillingPeriod month calculation** — The `addMonths` function uses `setUTCMonth()` which handles month overflow correctly (e.g., Jan 31 + 1 month = Mar 3). For billing periods anchored to the 31st, periods will be irregular. **Acceptable** — standard behavior for monthly billing.

3. **WalletEntry stores `periodEnd` but the key only uses `periodStart`** — The `periodEnd` is stored but never used in key generation or lookups. If two entries have the same orgId, entitlement, and periodStart but different periodEnd, they would collide. **Severity: Low** — this won't happen in practice since billing periods are deterministic from startedAt.

### Verdict: Pass

---

## Sub-Phase 8.3: Access Context Layer 4 (Plan Check)

### Findings

1. **can() Layer 4 guard: `entDef.plans?.length`** — If `plans` is an empty array `[]`, the length is 0 (falsy), so the plan check is skipped. This matches the expected behavior: entitlements without `plans` don't require plan checks. ✅

2. **check() evaluates all layers independently** — Even if the RBAC layer already denied, the plan/wallet layers still execute. This is correct because `check()` returns ALL denial reasons for UI display. ✅

3. **`resolveEffectivePlan()` duplication** — The function exists in both `access-context.ts` and `access-set.ts`. The comment in `access-set.ts` says "mirrors the logic... without circular dependency." The logic is identical. Consider extracting to a shared helper. **Severity: Low** — the function is 6 lines and unlikely to drift.

### Verdict: Pass

---

## Sub-Phase 8.4: Wallet Layer in check() + Limit Visibility

### Findings

1. **encodeAccessSet preserves meta.limit on allowed entries** — Correctly implemented. The sparse encoding only strips `requiredRoles` and `requiredPlans` from meta, keeping `limit` for client-side usage display. ✅

2. **computeAccessSet() plan enrichment loop** — The enrichment iterates over `accessDef.entitlements`, not `planDef.entitlements`. This means it checks ALL entitlements against the plan. For entitlements that don't have `plans` field, the `entDef.plans?.length` check short-circuits correctly. ✅

3. **Denial reason accumulation in computeAccessSet** — When both plan_required and limit_reached apply, both reasons are added. The `reason` field (singular) is set to the first reason. This matches the behavior in `access-context.ts check()`. ✅

### Verdict: Pass

---

## Sub-Phase 8.5: Integration Tests + Exports

### Findings

1. **Integration tests use Organization resource for canAndConsume/unconsume** — This is correct because the user's role at the Project level (`contributor` via inheritance) doesn't satisfy `project:create` (requires `admin`/`owner`). The test correctly uses `{ type: 'Organization', id: 'org-1' }` where the user has `admin` directly. ✅

2. **Exports are comprehensive** — PlanStore, WalletStore, InMemoryPlanStore, InMemoryWalletStore, calculateBillingPeriod, Period, BillingPeriod, LimitDef, PlanDef, OrgPlan, ConsumeResult all exported from both auth/index.ts and server/index.ts. ✅

3. **No `.test-d.ts` type flow tests** — The plan notes that generics should have type flow verification. However, the plans/wallet types use no complex generics — they're straightforward interfaces with concrete types. **Severity: Negligible** for this specific feature.

4. **14 integration tests cover all key scenarios** — Plan layer, wallet layer, canAndConsume, unconsume, overrides, accessSet enrichment, encode/decode round-trip, billing period. ✅

### Verdict: Pass

---

## Cross-Cutting Concerns

1. **canAndConsume() TOCTOU in can() + consume()** — `canAndConsume()` calls `can()` first (which includes its own wallet read-check), then calls `walletStore.consume()`. Between the `can()` read and the `consume()` write, another request could consume the last unit. The `consume()` method does its own atomic check (`consumed + amount > limit`), so the worst case is `can()` returns true but `consume()` returns false. The function correctly handles this by returning `result.success`. ✅

2. **No test for canAndConsume with amount > 1** — The unit tests use default amount=1. The wallet-store unit tests do test different amounts. **Acceptable** for integration level.

3. **fva (factor verification age) not integrated with plan/wallet** — The `fva` config field exists on AccessContextConfig but Layer 4/5 don't check it. This is by design (fva is a separate concern). ✅

## Overall Verdict: **Pass**

No blocking issues found. All implementations align with the design doc and test coverage is comprehensive.
