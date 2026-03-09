# Retrospective — Phase 8: Plans & Wallet

## What went well

1. **Existing architecture was well-prepared.** The 5-layer resolution model in `access-context.ts` had clear stub comments for Layers 4 and 5. The implementation slotted in without structural changes to the resolution flow.

2. **Type system caught issues early.** TypeScript strict mode caught the `readonly string[]` vs `string[]` mismatch when freezing plan entitlements. Fixed at compile time rather than runtime.

3. **Integration tests caught a real design gap.** The initial integration tests used `{ type: 'Project', id: 'proj-1' }` for `canAndConsume('project:create')`, but `project:create` requires `admin`/`owner` roles which only exist at Organization level. The user's inherited role at Project level is `contributor`. This exposed a real API design consideration — `canAndConsume` resource context matters.

4. **Billing period calculation is deterministic.** Anchoring periods to `startedAt` avoids timezone issues and makes tests reproducible.

## What went wrong

1. **Test billing period alignment.** Initial `computeAccessSet` tests created wallet consumption with manually-computed period boundaries (`new Date(now.getFullYear(), now.getMonth(), 1)`) that didn't match the periods calculated by `calculateBillingPeriod(planStartedAt, 'month')`. Fixed by using `calculateBillingPeriod` in tests.

2. **Non-null assertions slipped through.** Used `orgPlan!` in `canAndConsume` and `unconsume` after proving null-safety via early returns. Biome flagged them. Should have used early `if (!orgPlan) return` guard from the start.

## How to avoid it

1. **Always use the same utility for period calculation** — both in production code and tests. Never manually compute billing periods.

2. **Add null guards immediately after nullable lookups.** Pattern: `const x = store.get(id); if (!x) return;` before any property access.

## Process changes adopted

None — the existing TDD process with quality gates after each green state caught all issues within the development cycle.
