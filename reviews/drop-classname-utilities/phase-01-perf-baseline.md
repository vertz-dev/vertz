# Phase 1 — `tsgo --noEmit` perf baseline on `packages/landing`

Budget: **< 15% regression** after rewriting `hero.tsx` to object-form `css()`.
Command: `tsgo --noEmit` run from `packages/landing/` (what `vtz run typecheck` aliases
to via `package.json`'s `typecheck` script).

Runs are `time` wall-clock from the `time` builtin (`real` column). Pre-existing
type errors (`presence-room.ts`, `styles/theme.ts` subpath) were present in both
measurements and are unrelated to this phase.

## Before (token-string array form)

Commit: `d5ca1409f` — parity test added, hero.tsx unchanged.

| Run | Wall-clock (s) |
| --- | --- |
| 1 | 0.461 |
| 2 | 0.415 |
| 3 | 0.405 |

Median: **0.415s**.

## After (object-form)

Commit: `hero.tsx` rewritten in this same commit.

| Run | Wall-clock (s) |
| --- | --- |
| 1 | 0.345 |
| 2 | 0.355 |
| 3 | 0.378 |

Median: **0.355s**.

## Regression

`(0.355 - 0.415) / 0.415 × 100 = -14.5%` (actually a speed-up — within
measurement variance, but clearly not a regression).

Budget: < 15% regression. Status: **PASS**. Object-form types resolve faster
here than the array-entry union — the token-string intersection types
(`StyleEntry` with dozens of branded literal shapes) are the dominant cost,
and dropping them in favour of a plain `StyleBlock` record is a net win.
