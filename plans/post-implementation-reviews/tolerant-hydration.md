# Post-Implementation Review: Tolerant Hydration Mode for mount()

**Feature:** Tolerant hydration mode for `mount()` [#510]
**Design Doc:** `plans/mutable-herding-journal.md` (Claude plans)
**PR:** #619
**Date:** 2026-02-22

---

## What went well

- **Cursor-based hydration architecture was sound** — the walk-and-attach approach via `claimElement`/`claimText`/`claimComment` with an enter/exit children stack worked exactly as designed. No fundamental redesign was needed during implementation. The 6-phase plan mapped 1:1 to the code that was written.
- **Browser extension tolerance is trivially handled** — the cursor-skip mechanism (`claimElement` skips non-matching nodes with `console.debug`) required zero special-casing for extension nodes. Grammarly overlays, password managers, etc. are simply skipped because they don't match expected tags. The simplicity validates the design choice of "tolerant" over "strict" for the first iteration.
- **Compiler changes were minimal and non-breaking** — replacing `appendChild` with `__append` and `createTextNode` with `__staticText`, plus adding `__enterChildren`/`__exitChildren`, required only changes to `jsx-transformer.ts`. The new helpers are no-ops during CSR, so existing behavior is completely unchanged. All 280+ compiler tests pass.
- **Error recovery fallback works cleanly** — the try/catch around the hydration attempt with automatic fallback to replace mode means tolerant hydration can never make an app worse than CSR. If hydration fails for any reason, the user sees fresh-rendered content instead of a broken page.
- **E2E test validates the full pipeline** — the `hydration-e2e.test.ts` test exercises SSR HTML → tolerant mount → node identity preservation → reactive updates → extension tolerance in a single test. This caught the critical `hydrateConditional` bug during review.

## What went wrong

- **`hydrateConditional` ripped SSR nodes from the live DOM** — the original implementation built a `DocumentFragment` and used `fragment.appendChild(anchor)` to collect the conditional's nodes. `appendChild` moves nodes out of their current parent, so SSR nodes were ripped from the live DOM. `__append` is a no-op during hydration, so the nodes were never re-inserted. This was a critical bug that passed initial tests because the unit tests called `container.appendChild(fragment)` which re-inserted the nodes — masking the bug. The e2e test through `mount()` caught it because there's no manual `appendChild` step.
- **Stale effects from failed hydration were not cleaned up** — the original mount error recovery path called `endHydration()` on failure but didn't dispose reactive effects created during the failed `app()` call. Any `effect()` registered during the failed hydration attempt remained alive, causing memory leaks and phantom reactivity. The fix required wrapping `app()` in a disposal scope (`pushScope`/`popScope`) and calling `runCleanups` on failure.
- **`effect` import missing in test file went unnoticed** — the stale effects test initially passed vacuously because `effect` wasn't imported. The undefined `effect()` call threw a `ReferenceError` which was caught by mount's try/catch, so no effect was ever registered and the assertion passed trivially. This highlights that tests which pass for the wrong reason are dangerous.
- **`__DEV__` global doesn't exist in the UI package** — the design doc assumed a `__DEV__` global for dev-mode guards, but `@vertz/ui` is browser-targeted and has no such global. Had to use `typeof process !== 'undefined' && process.env.NODE_ENV !== 'production'` with a `globals.d.ts` type declaration instead. This is a common pattern but wasn't anticipated in the plan.
- **Monolithic commit on first push** — all 6 phases were committed as a single commit. While the code was correct and tested, this makes git bisect less useful and the review harder to follow. The process review flagged this.

## How to avoid it

- **Unit tests for hydration helpers must never manually call `appendChild` on the result** — this masks bugs where nodes are moved out of the live DOM. Tests should verify node containment within the SSR root (`root.contains(node)`) and check node identity (`expect(el).toBe(ssrNode)`) rather than re-inserting fragments. The `hydrateConditional` bug would have been caught immediately if the unit test had asserted `root.contains(span)` instead of `container.appendChild(fragment)`.
- **Every test that imports a function must verify the import exists** — or use a linter rule that catches undefined references. The stale effects test should have failed at the `effect()` call with a clear error, not been caught by an unrelated try/catch. Consider adding a "no-undef" lint rule for test files.
- **Error recovery paths need dedicated disposal testing** — any try/catch in mount or hydration should have a test that: (1) creates a reactive effect inside the try block, (2) forces the catch path, (3) verifies the effect is dead after recovery. This pattern should be a checklist item for any error recovery implementation.
- **Design docs should specify the dev-mode guard mechanism explicitly** — don't assume `__DEV__` exists. Check the target package's build configuration and specify the exact guard pattern (`process.env.NODE_ENV`, `import.meta.env.DEV`, etc.) in the plan.
- **Split implementation into one commit per phase** — use the phase boundaries as natural commit points. Each phase has its own tests and acceptance criteria, making it a natural unit of work.

## Process changes adopted

- **Added disposal scope to mount error recovery** — `pushScope()`/`popScope()`/`runCleanups()` wraps the hydration `app()` call. On success, the scope provides cleanup on `unmount()`. On failure, stale effects are immediately disposed. This pattern should be applied to any future error recovery paths that may create reactive subscriptions.
- **Concurrent hydration guard** — `startHydration()` now throws if called while hydration is already active. This prevents subtle bugs from nested or concurrent hydration attempts.
- **`'strict'` mode throws explicitly** — instead of silently falling through to replace mode, `mount({ hydration: 'strict' })` throws with a clear message explaining it's reserved but not implemented. This prevents silent misconfiguration.
