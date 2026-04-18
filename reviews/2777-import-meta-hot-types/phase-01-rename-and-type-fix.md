# Phase 1: Rename and Type Fix

- **Author:** claude-opus-4-7 (Vinicius)
- **Reviewer:** claude-opus-4-7 (self-adversarial; agent-pool limit)
- **Commit:** `3c5135292`
- **Date:** 2026-04-18
- **Branch:** `viniciusdacal/issue-2777`

## Changes

- `packages/vertz/client.d.ts` (new)
- `packages/vertz/env.d.ts` (deleted)
- `packages/vertz/package.json` — `./env` → `./client` export; `files`; `typecheck` script
- `packages/vertz/tsconfig.json` — `exclude` adds `**/*.test-d.ts`
- `packages/vertz/tsconfig.typecheck.json` (new)
- `packages/vertz/src/__tests__/import-meta-hot.test-d.ts` (new)
- `packages/vertz/__tests__/subpath-exports.test.ts` — `./client` + anti-regression
- `packages/create-vertz-app/src/templates/index.ts` — tsconfig `types` + `?.`
- `packages/create-vertz-app/src/templates/__tests__/templates.test.ts`
- `packages/create-vertz-app/src/__tests__/scaffold.test.ts`
- `plans/2777-import-meta-hot-types.md` + phase files

## CI Status

- [x] `vtz test` green in `packages/vertz` (17 tests) and `packages/create-vertz-app` (217 tests).
- [x] `vtzx tsgo --noEmit -p packages/vertz/tsconfig.typecheck.json` green.
- [x] `vtzx tsgo --noEmit -p packages/create-vertz-app/tsconfig.json` green.
- [x] `vtzx oxlint packages/vertz packages/create-vertz-app` — 0 warnings, 0 errors.

## Review Checklist

- [x] Delivers what Phase 1 plan asks for (rename + type shape fix + scaffold update)
- [x] TDD compliance — tests updated to new behavior before implementation
- [x] No type gaps — `accept()`, `accept(cb)`, `accept(deps, cb?)`, `dispose`, `data` all covered by `.test-d.ts`
- [x] Anti-regression: `./env` subpath and `env.d.ts` removal asserted in test
- [x] Ambient augmentation pattern correct (`declare global { ... } export {};`)
- [x] `ImportMeta.main` removal verified by grep: zero usage in `packages/vertz/src/`

## Findings

### Blockers — none

### Should-Fix — none

### Nits

**N1. `@ts-expect-error` unused-locals interaction.** The test-d.ts has
`const _main: boolean = import.meta.main;` under a `@ts-expect-error`. With
`noUnusedLocals: true`, TS treats `_`-prefixed locals as intentionally unused,
so it doesn't fire a TS6133 here. Typecheck passes cleanly. If someone later
changes the TS compiler flag behavior, this could regress silently — but that's
not a blocker. Documented for future reference.

**N2. `expect(...).toEqualTypeOf<void | undefined>()` for optional chain.**
Technically `import.meta.hot?.accept()` returns `void | undefined`. The test
asserts exactly that, which reads as redundant-looking. Intentional — documents
the optional-chain return type. Not worth changing.

### Approved

- `declare global { ... } export {};` is the canonical pattern for wrapping an
  ambient augmentation in a module file. `types: ["vertz/client"]` in tsconfig
  pulls the file in and the `declare global` block applies the augmentation.
  Verified by the test-d.ts referencing `client.d.ts` and the assertions
  compiling.
- `ImportMeta.hot: ImportMetaHot | undefined` matches runtime contract
  (`plugin.ts:488` emits `if (import.meta.hot) import.meta.hot.accept();`).
- `accept(cb)` overload is present and tested; matches `poc/ssr-hmr/client.tsx`
  usage pattern.
- `ImportMeta.main` dropped — confirmed not used by the vertz meta-package
  itself. User-facing examples still use it (via `bun-types` in their
  tsconfigs), which is fine; this PR doesn't change Bun-types behavior.
- The known stale call sites (`packages/landing/src/entry-client.ts:5`,
  `packages/component-docs/src/entry-client.ts:6`, 4 examples, and
  `poc/ssr-hmr/client.tsx`) do NOT currently reference `vertz/env` in their
  tsconfigs (verified via `rg 'vertz/(env|client)' --glob '**/tsconfig*.json'`
  — zero hits). They rely on `bun-types`' ImportMetaHot, so Phase 1 does not
  regress their typecheck. Phase 2 adds `vertz/client` to their `types`
  arrays and migrates the call sites to `?.` in the same step.

## Resolution

Approved. No blockers or should-fix items. Proceeding to Phase 2.
