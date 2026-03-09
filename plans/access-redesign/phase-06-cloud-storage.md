# Phase 6: Cloud Storage + Data Residency

**Prerequisites:** [Phase 2 — Plans + Limits](./phase-02-plans-and-limits.md)

**Goal:** Implement the cloud wallet adapter, cloud failure modes (`closed`/`open`/`cached`), the local/cloud data split, and InMemory implementations for all cloud-side stores.

**Design doc:** [`plans/access-redesign.md`](../access-redesign.md) — sections: Data Residency, Cloud Failure Modes.

---

## Context — Read These First

- `packages/server/src/auth/wallet-store.ts` — Phase 2 output (InMemoryWalletStore)
- `packages/server/src/auth/plan-version-store.ts` — Phase 4 output (InMemoryPlanVersionStore)
- `packages/server/src/auth/grandfathering-store.ts` — Phase 4 output (InMemoryGrandfatheringStore)
- `plans/access-redesign.md` — Data Residency, Cloud Failure Modes

---

## What to Implement

1. **Cloud wallet adapter** — `CloudWalletStore` implementing `WalletStore`:
   - HTTP client calling the Vertz cloud API
   - Endpoint: `POST /api/v1/wallet/check`, `POST /api/v1/wallet/consume`
   - 2-second timeout
   - Authenticated via `apiKey`

2. **Cloud failure modes** — `storage.cloud.failMode`:
   - `'closed'` (default) — limit checks return `false` on cloud error
   - `'open'` — limit checks return `true` on cloud error
   - `'cached'` — use last-known wallet state (requires local cache with TTL)
   - `meta.cloudError: true` in check result when cloud fails

3. **Storage config** — `defineAccess({ storage: { local: db, cloud: { apiKey, failMode } } })`:
   - With cloud → wallet queries go to cloud, everything else stays local
   - Without cloud → all stores are local (InMemory or DB-backed)

4. **Data split enforcement** — configure which stores use local vs cloud:
   - Local: role assignments, closure table, plan assignments, flags, overrides, add-on assignments
   - Cloud: wallet counts, plan version snapshots, grandfathering state, billing events, audit log

5. **Cached failure mode** — `CachedWalletStore` wrapper:
   - On successful cloud response, cache the result locally with TTL
   - On cloud failure, serve from cache if available, otherwise fall back to `failMode`
   - Default cache TTL: 30 seconds

6. **InMemory cloud stores** — ensure all cloud-side stores have InMemory implementations for testing. These already exist from Phases 2/4 — this phase just ensures they're properly exported and documented as test alternatives.

7. **Cloud health check** — `access.cloud.health()` → `{ status, latency, lastError? }`

---

## Files to Create/Modify

```
packages/server/src/auth/
├── cloud/
│   ├── cloud-wallet-store.ts    # NEW — CloudWalletStore (HTTP client)
│   ├── cached-wallet-store.ts   # NEW — CachedWalletStore wrapper
│   ├── cloud-config.ts          # NEW — CloudConfig type, validation
│   └── cloud-health.ts          # NEW — health check
├── define-access.ts             # MODIFY — accept storage config, wire cloud stores
├── access-context.ts            # MODIFY — handle cloudError in check results
├── types.ts                     # MODIFY — StorageConfig, CloudConfig types
├── index.ts                     # MODIFY — export cloud types
```

### Test Files

```
packages/server/src/auth/__tests__/
├── cloud/
│   ├── cloud-wallet-store.test.ts   # NEW (mock HTTP)
│   ├── cached-wallet-store.test.ts  # NEW
│   ├── cloud-config.test.ts         # NEW

packages/integration-tests/src/__tests__/
├── auth-cloud-fallback.test.ts      # NEW — cloud failure mode E2E
```

---

## Expected Behaviors to Test

### Cloud wallet store (`cloud-wallet-store.test.ts`)

- [ ] `check()` calls cloud API and returns wallet state
- [ ] `consume()` calls cloud API for atomic CAS
- [ ] 2-second timeout on cloud calls
- [ ] Cloud error → throws (caller handles based on failMode)
- [ ] Authentication header includes API key

### Cloud failure modes (`cloud-config.test.ts`, `access-context.test.ts`)

```typescript
describe('Feature: Cloud failure modes', () => {
  describe('Given failMode: "closed" (default) and cloud is down', () => {
    describe('When checking can() with limit', () => {
      it('returns false with reason "limit_reached"', () => {})
      it('check result includes meta.cloudError: true', () => {})
    })
  })

  describe('Given failMode: "open" and cloud is down', () => {
    describe('When checking can() with limit', () => {
      it('returns true (allow access despite cloud failure)', () => {})
      it('check result includes meta.cloudError: true', () => {})
    })
  })

  describe('Given failMode: "cached" and cloud is down with cached data', () => {
    describe('When checking can() with limit', () => {
      it('uses cached wallet state', () => {})
    })
  })

  describe('Given failMode: "cached" and cloud is down with no cached data', () => {
    describe('When checking can() with limit', () => {
      it('falls back to closed behavior (deny)', () => {})
    })
  })

  describe('Given no cloud configured (local only)', () => {
    describe('When checking can() with limit', () => {
      it('uses local InMemoryWalletStore', () => {})
      it('no cloud call made', () => {})
    })
  })
})
```

### Cached wallet store (`cached-wallet-store.test.ts`)

- [ ] Successful cloud response is cached locally
- [ ] Subsequent check within TTL returns cached value (no cloud call)
- [ ] Cache expires after TTL → cloud is called again
- [ ] Cloud failure → serves from cache if available
- [ ] Cloud failure + no cache → throws (caller handles)

### Cloud health (`cloud-health.ts`)

- [ ] Returns `{ status: 'healthy', latency: <ms> }` when cloud is up
- [ ] Returns `{ status: 'unhealthy', lastError: '...' }` when cloud is down

---

## Quality Gates

```bash
bunx biome check --write packages/server/src/auth/
bun test --filter @vertz/server
bun run typecheck --filter @vertz/server
bun test --filter @vertz/integration-tests
```

---

## Notes

- This phase can run in parallel with Phase 4 and Phase 5 since it only depends on Phase 2.
- Cloud API calls in tests should be **mocked** using a mock HTTP server. Do not hit a real Vertz cloud instance.
- The `'cached'` failure mode adds complexity — if it proves too complex for the initial implementation, defer it and only ship `'closed'` and `'open'`. Mark `'cached'` as future.
- The cloud wallet API is assumed to exist as a separate service (Vertz cloud). This phase implements the client adapter, not the server.
- For checks without limits (pure role/plan/flag), the cloud is never contacted — zero network calls.
