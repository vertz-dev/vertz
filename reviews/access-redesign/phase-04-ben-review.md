# Phase 4: Plan Versioning & Grandfathering — Ben Review

- **Reviewer:** ben
- **Date:** 2026-03-09
- **Focus:** Core/types, type safety, runtime correctness

## Verdict: Approved with notes

## Findings

### Blockers

1. **`sortedReplacer` does not sort arrays — feature order affects hash**
   `plan-hash.ts:33-42` — The `sortedReplacer` sorts object keys but passes arrays through unchanged. This means `features: ['a', 'b']` and `features: ['b', 'a']` produce different hashes. If a developer reorders features in the `defineAccess()` config (a cosmetic change with no semantic meaning), it creates a spurious new version, grandfathering all existing tenants unnecessarily. The design doc says "version creation only on actual config hash change" — feature reordering is not an actual change. Either sort arrays in the replacer, or document that feature order is significant (and enforce it via lint/validation).

2. **`versionedLimits` is typed as `Record<string, unknown>` — unsafe cast to `LimitDef`-like shape**
   `access-context.ts:755-756` and `access-context.ts:865-866` — The snapshot's `limits` field is `Record<string, unknown>`, and the code casts it to a `{ max, gates, per?, scope?, overage? }` shape via `as typeof limitDef`. If the snapshot was stored with a different shape (e.g., an older version of the `LimitDef` interface), the cast would silently succeed with missing properties. At minimum, `PlanSnapshot.limits` should be typed as `Record<string, { max: number; gates: string; per?: string; scope?: string; overage?: { amount: number; per: number; cap?: number } }>` instead of `Record<string, unknown>`. The loose type undermines the entire versioning guarantee.

### Should Fix

1. **`resolveEffectiveFeatures` skips override check for versioned tenants**
   `access-context.ts:658-677` — When a tenant has a versioned snapshot, the function checks snapshot features and add-ons, then returns `false` without checking `overrides?.features`. The non-versioned path at line 695 does check overrides. This means a tenant with a versioned snapshot can never benefit from feature overrides, which contradicts the design intent of overrides as per-tenant customization independent of plan version. The early `return false` on line 676 should fall through to the override check.

2. **`PlanEvent` type uses optional fields loosely — no discriminated union**
   `plan-manager.ts:18-33` — `PlanEvent` has a single interface with many optional fields (`tenantId?`, `version?`, `previousVersion?`, etc.). Different event types populate different subsets of these fields. Without a discriminated union, consumers cannot safely access fields after checking `event.type`. For example, `plan:migrated` always has `tenantId` and `previousVersion`, but TypeScript sees them as `string | undefined`. This forces unnecessary null checks or unsafe non-null assertions in event handlers. A discriminated union per event type would be type-safe.

3. **`PlanSnapshot.features` has dual type `readonly string[] | string[]`**
   `plan-version-store.ts:13` — This dual type is inherited from `PlanDef.features` but it leaks internal mutability concerns into the store interface. Snapshots should always be immutable. Using `readonly string[]` alone would be cleaner and prevent accidental mutation of stored snapshots.

4. **No validation that `version > 0` in `setTenantVersion`**
   `plan-version-store.ts:84-86` — The `InMemoryPlanVersionStore.setTenantVersion` accepts any number, including 0 or negative values. If a bug passes `0` or `-1`, `getVersion(planId, 0)` returns `planVersions[-1]` which is `undefined` in JavaScript (not an error). A bounds check would catch this class of bug early.

### Notes

1. **`computePlanHash` is async but doesn't need to be in test context** — The SHA-256 via Web Crypto is inherently async. This is correct for production but adds `await` noise to every test. Not actionable, just noting the tradeoff.

2. **`extractSnapshot` does a shallow copy of `limits`** — `plan-manager.ts:128` uses `{ ...planDef.limits }` which is a shallow copy. If limit definitions have nested objects (like `overage: { amount, per, cap }`), the snapshot shares references with the original `PlanDef`. Mutation of the original `PlanDef` after snapshotting would corrupt the stored snapshot. In practice this is unlikely (the config is usually static), but a deep copy or `structuredClone` would be safer for a versioning system where snapshot integrity is critical.

3. **`checkGraceEvents` has no deduplication** — If called multiple times per day (e.g., on a cron), the same tenant gets `grace_approaching` or `grace_expiring` events repeatedly. The store doesn't track whether an event was already emitted. This is a known pattern (callers should handle idempotency), but worth noting for documentation.

4. **`off()` only removes the first matching handler** — `plan-manager.ts:320-322` uses `indexOf` + `splice`, which removes only the first occurrence if the same handler is registered twice. This is standard behavior but undocumented.
