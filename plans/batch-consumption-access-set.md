# perf(auth): Use getBatchConsumption in computeAccessSet

**Issue:** #1831
**Status:** Approved (DX, Product, Technical — 2026-03-27)
**Author:** viniciusdacal

## Context

`computeAccessSet()` enriches entitlements with wallet consumption data for JWT embedding.
Currently it calls `walletStore.getConsumption()` individually per limit key — O(N) round-trips
where N = number of limited entitlements. The `WalletStore` interface already has
`getBatchConsumption()` which resolves multiple keys in one call — O(1) round-trip.

For CloudWalletStore, each `getConsumption()` is an HTTP POST to `/api/v1/wallet/check`.
Batching into one `/api/v1/wallet/batch-check` call reduces network latency proportionally.

**Period constraint:** `getBatchConsumption` takes a single `(periodStart, periodEnd)` pair
for all keys. Since each `LimitDef` can have a different `per` value (`'month'`, `'day'`,
`'year'`, or omitted for lifetime), limit keys within the same plan may produce different
billing periods. The implementation must **group keys by their computed period** and issue
one batch call per distinct period group — O(P) where P = number of distinct periods
(typically 1-2, much less than N).

## API Surface

No public API changes. `getBatchConsumption` already exists on the `WalletStore` interface
and is implemented in all three stores:
- `InMemoryWalletStore` — iterates keys internally
- `CloudWalletStore` — single POST to `/api/v1/wallet/batch-check`
- `CachedWalletStore` — delegates to inner store

The change is internal to `computeAccessSet()`.

### Before (O(N) calls)

```ts
for (const name of Object.keys(accessDef.entitlements)) {
  const limitKeys = accessDef._entitlementToLimitKeys[name];
  if (!limitKeys?.length) continue;
  const limitKey = limitKeys[0];
  // ... compute effectiveMax, period ...
  const consumed = await walletStore.getConsumption(
    resourceType, tenantId, limitKey, period.periodStart, period.periodEnd,
  );
  // ... enrich entitlement with consumed/remaining ...
}
```

### After (O(P) calls, P = distinct periods)

```ts
// Step 1: Collect all limit keys that need consumption data
interface PendingLimit {
  entitlementName: string;
  limitKey: string;
  effectiveMax: number;
  periodStart: Date;
  periodEnd: Date;
}
const pendingLimits: PendingLimit[] = [];

for (const name of Object.keys(accessDef.entitlements)) {
  const limitKeys = accessDef._entitlementToLimitKeys[name];
  if (!limitKeys?.length) continue;
  const limitKey = limitKeys[0];
  // ... compute effectiveMax, period per limitDef.per ...
  if (effectiveMax === -1) {
    // unlimited — enrich immediately, no wallet call needed
  } else {
    pendingLimits.push({ entitlementName: name, limitKey, effectiveMax, periodStart, periodEnd });
  }
}

// Step 2: Group by period and batch fetch
if (pendingLimits.length > 0) {
  const byPeriod = new Map<string, { periodStart: Date; periodEnd: Date; entries: PendingLimit[] }>();
  for (const p of pendingLimits) {
    const periodKey = `${p.periodStart.getTime()}:${p.periodEnd.getTime()}`;
    let group = byPeriod.get(periodKey);
    if (!group) {
      group = { periodStart: p.periodStart, periodEnd: p.periodEnd, entries: [] };
      byPeriod.set(periodKey, group);
    }
    group.entries.push(p);
  }

  for (const group of byPeriod.values()) {
    const keys = group.entries.map((e) => e.limitKey);
    const consumptionMap = await walletStore.getBatchConsumption(
      resourceType, tenantId, keys, group.periodStart, group.periodEnd,
    );

    // Step 3: Enrich entitlements using batch results
    for (const entry of group.entries) {
      const consumed = consumptionMap.get(entry.limitKey) ?? 0;
      // ... same enrichment logic as before ...
    }
  }
}
```

## Manifesto Alignment

- **Performance by default** — reduces wallet round-trips from O(N) to O(P) where P = distinct periods (typically 1)
- **No new API surface** — uses existing `getBatchConsumption` method
- **Internal refactor** — no breaking changes, no new concepts for developers

## Non-Goals

- Extending `getBatchConsumption` to accept per-key periods (would change WalletStore interface)
- Batching across ancestor levels in multi-level mode (each level has its own tenant/resourceType)
- Changing `canAndConsume()` in AccessContext (that performs atomic consume, not advisory reads)
- Scoped limits (`scope` field on `LimitDef`) — not currently handled in `computeAccessSet`, pre-existing limitation

## Unknowns

None identified. `getBatchConsumption` is already implemented and tested in all stores.

## Type Flow Map

No generic type parameters involved. All types are concrete (`string`, `number`, `Date`, `Map<string, number>`).

## E2E Acceptance Test

```ts
describe('Feature: computeAccessSet uses batch consumption', () => {
  describe('Given a plan with multiple limited entitlements (same period)', () => {
    describe('When computing access set', () => {
      it('Then calls getBatchConsumption once instead of getConsumption per key', () => {
        // Spy on walletStore.getBatchConsumption — called once
        // Spy on walletStore.getConsumption — never called
        // Entitlement meta has correct consumed/remaining values
      });
    });
  });

  describe('Given a plan with limits using different billing periods', () => {
    describe('When computing access set', () => {
      it('Then groups keys by period and calls getBatchConsumption per group', () => {
        // e.g., one limit per: 'month', one per: 'day'
        // getBatchConsumption called twice (once per period group)
        // Each entitlement enriched with correct consumed value for its period
      });
    });
  });

  describe('Given a plan with a lifetime limit (no per) and a monthly limit', () => {
    describe('When computing access set', () => {
      it('Then handles the lifetime period separately from monthly', () => {
        // lifetime period = (startedAt, 9999-12-31)
        // monthly period = calculateBillingPeriod(startedAt, 'month')
        // Two batch calls, each with correct period
      });
    });
  });

  describe('Given multi-level mode with wallet store', () => {
    describe('When computing access set for deepest level', () => {
      it('Then uses batch consumption for the deepest level limits', () => {
        // Same enrichment semantics, but via batch call
      });
    });
  });
});
```

## Implementation Plan

### Phase 1: Refactor single-level path to use batch consumption

**Scope:** Refactor the single-level wallet enrichment in `computeAccessSet()` (lines 471-545) to collect limit keys, group by period, then batch-fetch.

**Acceptance criteria:**
```ts
describe('Feature: single-level batch consumption in computeAccessSet', () => {
  describe('Given a plan with one limited entitlement and partial consumption', () => {
    describe('When computeAccessSet is called with walletStore', () => {
      it('Then includes correct limit meta (consumed/remaining)', () => {});
      it('Then calls getBatchConsumption instead of getConsumption', () => {});
    });
  });

  describe('Given a plan with multiple limited entitlements (same period)', () => {
    describe('When computeAccessSet is called', () => {
      it('Then fetches all consumption in one batch call', () => {});
      it('Then enriches each entitlement with its respective consumed value', () => {});
    });
  });

  describe('Given a plan with limits using different billing periods', () => {
    describe('When computeAccessSet is called', () => {
      it('Then groups by period and calls getBatchConsumption per group', () => {});
      it('Then enriches each entitlement with correct consumed value for its period', () => {});
    });
  });

  describe('Given a plan with a lifetime limit (no per) and a monthly limit', () => {
    describe('When computeAccessSet is called', () => {
      it('Then issues separate batch calls for lifetime and monthly periods', () => {});
    });
  });

  describe('Given limit reached (consumed >= max)', () => {
    describe('When computeAccessSet is called', () => {
      it('Then denies with limit_reached reason', () => {});
    });
  });

  describe('Given unlimited entitlement (max = -1)', () => {
    describe('When computeAccessSet is called', () => {
      it('Then skips wallet call and sets consumed=0, remaining=-1', () => {});
    });
  });

  describe('Given no limited entitlements', () => {
    describe('When computeAccessSet is called', () => {
      it('Then does not call getBatchConsumption', () => {});
    });
  });
});
```

### Phase 2: Refactor multi-level path to use batch consumption

**Scope:** Refactor the multi-level wallet enrichment (lines 346-424) to use the same collect-group-batch pattern.

**Acceptance criteria:**
```ts
describe('Feature: multi-level batch consumption in computeAccessSet', () => {
  describe('Given multi-level setup with limited entitlements at deepest level', () => {
    describe('When computeAccessSet is called with ancestorResolver', () => {
      it('Then uses getBatchConsumption for deepest level limits', () => {});
      it('Then enriches limit meta correctly', () => {});
    });
  });

  describe('Given multi-level with limit reached', () => {
    describe('When computeAccessSet is called', () => {
      it('Then denies with limit_reached reason', () => {});
    });
  });

  describe('Given multi-level with limits using different periods', () => {
    describe('When computeAccessSet is called', () => {
      it('Then groups by period and uses batch consumption per group', () => {});
    });
  });
});
```
