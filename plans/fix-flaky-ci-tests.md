# Fix Flaky CI Tests

## Problem

CI on `main` fails on nearly every push, but with a **different test each time**. Over the last 12 CI runs, 10 different tests across 6 packages have failed. This makes CI unreliable — developers can't tell if their PR broke something or if it's a pre-existing flake.

## API Surface

N/A — all changes are in test files and test helpers only. No public API changes.

## Root Cause Analysis

Eight distinct flaky tests grouped into four systemic patterns:

### Pattern 1: Timing / Performance Assertions in CI

**1a. Benchmark assertion** — `packages/ui/src/dom/__tests__/hydration-deferred-effects-bench.test.ts:80`

```ts
expect(walkTime).toBeLessThan(syncTime);
```

Compares raw `performance.now()` deltas of 1000 effects. No warm-up, no repeated sampling, no margin. A single GC pause on a shared CI runner flips the result.

**1b. Graphics benchmark** — `packages/ui-canvas/src/graphics-benchmark.test.ts`

```ts
expect(avgMs).toBeLessThan(5);
expect(avgMs).toBeLessThan(10);
```

Identical pattern — performance thresholds that are unreliable on shared CI runners.

**1c. Race timeout too tight** — `packages/server/src/auth/__tests__/handler-edge-cases.test.ts:446`

```ts
const race = await Promise.race([
  pendingResponse.then(() => 'resolved'),
  new Promise<'timeout'>((resolve) => setTimeout(() => resolve('timeout'), 500)),
]);
```

500ms timeout to prove the handler responds before the delivery callback. On a loaded CI runner, token generation + hashing can exceed 500ms.

### Pattern 2: External Network Dependencies

**2a. Google Fonts fetch** — `packages/og/src/__tests__/test-helpers.ts:13-22`

The `getTestFont()` helper makes live network calls to Google Fonts (two hops: CSS then font binary). This helper is imported by `generate.test.ts` and template integration tests — NOT by `fonts.test.ts` (which correctly mocks `fetch`). Slow, rate-limited, or unreachable on CI.

**2b. Shiki WASM initialization** — `packages/mdx/src/__tests__/plugin.test.ts:7,41-43`

Shared `defaultPlugin` warm-up in `beforeAll` with 60s timeout. Tests with custom options (lines 58, 79, 106) create **new** `createMdxPlugin()` instances, each re-initializing Shiki WASM from scratch. Only 3 tests use custom options: `jsxImportSource`, `remarkFrontmatter: false`, and `shikiTheme: false` (the last one disables Shiki entirely, so it's fast).

### Pattern 3: Non-Deterministic Test Data

**3a. Date boundary** — `packages/server/src/auth/__tests__/access-context.test.ts`

```ts
calculateBillingPeriod(new Date(), 'month')
```

`new Date()` near month boundaries produces different billing periods across calls within the same test. The `consume()` and `can()` calls may evaluate against different periods. There are 6 call sites using `new Date()`: lines 545, 572, 623, 702, 730, 957.

**3b. Crypto tampering** — `packages/server/src/auth/__tests__/crypto.test.ts:63`

```ts
const tampered = `X${ciphertext.slice(1)}`;
```

If the first character of the base64url ciphertext is already `X` (~1/64 probability), the "tampered" value is identical to the original, and decryption succeeds instead of returning null.

### Pattern 4: Test Isolation / Real I/O

**4a. Shared JWKS server** — `packages/server/src/auth/jwks-client.test.ts:11,23-31`

All tests share one `Bun.serve()` and one `requestCount` variable. Background jose re-fetches from previous tests can increment the counter during the current test.

**4b. Dev server restart with real I/O** — `packages/ui-server/src/__tests__/bun-dev-server.test.ts:211-232`

`restart()` calls `start()` which does real dynamic imports and port binding. On CI, `import('./src/app.tsx')` fails (file doesn't exist), triggering 3 retries with delays of 100+200+500ms. The 5s test timeout expires. The `start()` function is a closure-local — it cannot be directly mocked from outside `createBunDevServer()`.

## Proposed Fixes

### Phase 1: Quick Wins — Deterministic Fixes (no design changes)

These are mechanical fixes that don't change any behavior or API.

**1. Benchmark tests → `.local.ts`** (`packages/ui`, `packages/ui-canvas`)
- Rename `hydration-deferred-effects-bench.test.ts` → `hydration-deferred-effects-bench.local.ts`
- Rename `graphics-benchmark.test.ts` → `graphics-benchmark.local.ts`
- This follows the existing convention in `.claude/rules/integration-test-safety.md` rule #6: tests that depend on timing/environment go in `.local.ts`
- Add `"test:benchmark"` scripts to both packages' `package.json`
- Verification: confirm `bun test` skips `.local.ts` files by checking the existing precedent at `packages/ui-server/src/__tests__/bun-dev-server.integration.local.ts` — this file is in `__tests__/` and is confirmed not discovered by `bun test`. Bun only discovers `*.test.*` and `*.spec.*` patterns, not arbitrary extensions.

**2. Increase race timeout** (`packages/server`)
- Change the 500ms timeout to 2000ms in `handler-edge-cases.test.ts:446`
- 2000ms is generous enough for slow CI runners but not so generous that it masks real performance regressions (e.g., a new 3s async operation would still be caught)
- The test only needs to prove the response comes before `releaseSend()` — exact timing doesn't matter

**3. Fix crypto tampering** (`packages/server`)
- Replace the single-character prepend with a deterministic swap:
  ```ts
  const flipped = ciphertext[0] === 'X' ? 'Y' : 'X';
  const tampered = flipped + ciphertext.slice(1);
  ```
- This is 3 lines, zero base64 decoding, trivially correct, and instantly readable
- Guarantees the tampered value always differs from the original

**4. Fix date boundary** (`packages/server`)
- Replace `new Date()` with a fixed date far from boundaries: `new Date('2024-06-15T12:00:00Z')`
- Apply to all 6 `calculateBillingPeriod(new Date(), ...)` calls in `access-context.test.ts` (lines 545, 572, 623, 702, 730, 957)

**5. Bundle test font** (`packages/og`)
- Download a Noto Sans Latin subset in **TTF format** (~50-100KB) and commit as `packages/og/src/__tests__/fixtures/NotoSans-Regular-Latin.ttf`
- Satori requires TTF or OTF — NOT woff2 (Satori uses `opentype.js` internally)
- Use Noto Sans to match the existing font family name in `test-helpers.ts`
- Replace `getTestFont()` network fetch with `Bun.file(fixturePath).arrayBuffer()`
- Eliminates external network dependency entirely

### Phase 2: Isolation Fixes

**6. JWKS client test isolation** (`packages/server`)
- Each test creates its own `Bun.serve()` on port 0 with its own request counter
- All per-test servers tracked in a cleanup array and stopped in `afterEach` — per `integration-test-safety.md` rule #1, cleanup must be in `afterEach`, NOT inline in the test body, to ensure cleanup even on assertion failures
- Fix the pre-existing `rotatingServer` leak (line 151 stops inline; move to `afterEach`)
- This removes inter-test state coupling entirely
- Note: per `integration-test-safety.md` rule #6, tests with real `Bun.serve()` should ideally be `.local.ts`. However, migrating JWKS tests to `.local.ts` is out of scope — the isolation fix is sufficient to address the observed flake. Track the broader `.local.ts` migration as a separate concern.

**7. Dev server restart test** (`packages/ui-server`)
- The test at line 211 verifies the concurrency guard (`isRestarting` flag + skip log). It does NOT need real I/O.
- Since `start()` is closure-local and cannot be directly mocked, use `spyOn(server, 'restart')` to verify the guard behavior, OR increase the test timeout to 30s to accommodate the retry delays (100+200+500ms × 2 concurrent calls = ~1.6s worst case, plus the actual import attempts)
- The preferred approach: increase the test timeout to 30s. The restart does fail (as expected — no `app.tsx` exists), but the concurrency guard still works because `isRestarting` is toggled. The test assertion (`skipMsg`) is correct — it just needs more time.

**8. MDX plugin warm-up** (`packages/mdx`)
- Increase `beforeAll` timeout to 120s
- Pre-create all custom-options plugin instances in `beforeAll` and warm them up with a trivial `buildMdx('# warm')` call. Specifically:
  - `createMdxPlugin({ jsxImportSource: 'custom' })` — needs Shiki warm-up
  - `createMdxPlugin({ remarkFrontmatter: false })` — needs Shiki warm-up
  - `createMdxPlugin({ shikiTheme: false })` — NO Shiki init (disabled), skip warm-up
- This eliminates per-test cold Shiki initialization

## Non-Goals

- **Rewriting test infrastructure** — We're fixing specific flakes, not overhauling the test framework
- **Adding retry logic to CI** — Retries mask real failures. Fix the root causes instead. CI-level retry (GitHub Actions `retry-on-failure`) is a separate concern that may be considered as defense-in-depth later, but this plan focuses on making tests deterministic.
- **Changing production code** — All fixes are in test files and test helpers only
- **100% flake elimination** — There may be additional flakes not yet observed. This plan targets the 8 known offenders
- **Calendar test JSX migration** — The function-call pattern `ComposedCalendar({...})` is a **deliberate workaround** in both tests AND production code (`date-picker-composed.tsx:179`), not a test oversight. The comment in production code says "Calls ComposedCalendar() as a function (not JSX) to avoid compiler reactive-wrapping issues with nested component calls." Fixing this requires addressing the underlying compiler limitation first. Tracked separately as a pre-existing issue.
- **Migrating all `Bun.serve()` tests to `.local.ts`** — Several test files across `packages/server` use real `Bun.serve()` (JWKS, cloud-server, cloud-proxy, etc.). Per `integration-test-safety.md` rule #6, these should be `.local.ts`. However, this is a broader migration effort unrelated to the specific flakes observed. Track separately.

## Manifesto Alignment

- **Reliability** — CI must be a trustworthy signal. Red means "something is broken", not "a random test flaked"
- **Developer experience** — Flaky CI erodes trust and slows down the merge pipeline

## POC Results

N/A — fixes are mechanical, no POC needed.

## Type Flow Map

N/A — no generic types introduced.

## E2E Acceptance Test

N/A — no production code changes. Acceptance is verified by CI stability (see criteria below).

## Unknowns

None remaining. All unknowns from the initial draft have been resolved:
- ~~MDX Shiki sharing~~ → Resolved: pre-create and warm all plugin variants in `beforeAll`
- ~~Calendar reactive bugs~~ → Resolved: descoped (deliberate production workaround, not a test issue)

## Acceptance Criteria

### Phase 1
- [ ] Both benchmark tests renamed to `.local.ts` and confirmed skipped by `bun test`
- [ ] `handler-edge-cases` race timeout increased to 2000ms
- [ ] Crypto tampering test uses deterministic `X-or-Y` swap
- [ ] All 6 billing period test calls use fixed date `2024-06-15T12:00:00Z`
- [ ] OG tests use bundled TTF font fixture, zero network calls

### Phase 2
- [ ] JWKS tests use per-test servers with independent counters, cleanup in `afterEach`
- [ ] Dev server restart test completes reliably with increased timeout
- [ ] MDX tests pre-warm all plugin variants in `beforeAll` with 120s timeout

### Overall
- [ ] Each of the 8 specific tests addressed in this plan passes reliably in CI
- [ ] No CI failures attributable to tests addressed in this plan for 1 week after merge
