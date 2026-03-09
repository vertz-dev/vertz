# Phase 9 Adversarial Review — Reactive Invalidation + Feature Flags

**Reviewers:** ben (core/types), nora (frontend/DX), ava (quality/tests), mike (architecture)
**Date:** 2026-03-08

## Findings

### BLOCKER — Fixed

1. **Stale docstring** (ben) — `access-context.ts` lines 7-12 still said L1/L4/L5 are "stubbed" when all three layers are implemented.
   - **Fix:** Updated docstring to reflect current state.

2. **Missing ping interval** (mike) — `access-event-broadcaster.ts` created `allConnections` set but never started the 30s ping timer. Dead code.
   - **Fix:** Added `setInterval` with 30s ping + `unref()` to prevent keeping process alive.

### NON-BLOCKER — Accepted

3. **`flagEntitlementMap` is a manual prop** (nora) — User must manually construct this map from `defineAccess()` config to get inline flag toggle optimizations. Could be derived automatically.
   - **Decision:** Acceptable for v1. Can derive in Phase 10 (compiler integration).

4. **Jitter formula simplified** (mike) — Client uses fixed `Math.random() * 1000` (0-1s) instead of design doc's `random(0, min(30, affectedUsers/100))`. Client doesn't know affected user count.
   - **Decision:** Acceptable. Server-side scaling could be added by including `affectedUsers` in the event payload.

5. **No `.test-d.ts` type-level tests** (ava) — Phase 9 introduces no new generic type parameters, so type-level tests aren't required per TDD rules.

### Verification

- `disabledFlags` added to both server `DenialMeta` (define-access.ts:26) and client mirror (access-set-types.ts:20) ✓
- All exports in `packages/server/src/index.ts` and `packages/ui/src/auth/public.ts` ✓
- `AccessContext` stable ID preserved (`@vertz/ui::AccessContext`) ✓
- No `@ts-ignore`, no `as any`, no `.skip` ✓
- Integration tests use only public `@vertz/server` imports ✓
- 48 new tests across 8 test files, all passing ✓
- Typecheck, lint, build all green ✓
