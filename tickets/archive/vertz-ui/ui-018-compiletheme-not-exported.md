# ui-018: compileTheme() not exported from public API

- **Status:** 🟢 Done
- **Assigned:** nora
- **Phase:** v0.1.x patch
- **Estimate:** 30m
- **Blocked by:** none
- **Blocks:** none
- **PR:** —
- **Priority:** P1 (dead-end API)

## Description

`defineTheme()` is exported from `@vertz/ui` (public API), but `compileTheme()` — the only way to get usable CSS from a theme definition — is only exported from `@vertz/ui/internals` (compiler-internal entry point).

This means `defineTheme()` is a dead end for anyone not using the compiler. In the task-manager demo, Josh had to write a 26-line `buildThemeCss()` function that is a near line-for-line copy of the internal `compileTheme()`. He documented it as "gotcha G1" in the DX Journal.

`compileTheme()` already exists, is clean, and is well-tested. It just needs to be added to the public exports.

### Current state

```ts
// packages/ui/src/index.ts — public API
export { css, defineTheme, globalCss, s, ThemeProvider, variants } from './css';

// packages/ui/src/internals.ts — compiler-internal
export { compileTheme } from './css/theme';
```

### Fix

```ts
// packages/ui/src/index.ts
export { compileTheme, css, defineTheme, globalCss, s, ThemeProvider, variants } from './css';
```

And ensure `compileTheme` is re-exported from `./css/index.ts` if it isn't already.

## Acceptance Criteria

- [ ] `compileTheme` is importable from `@vertz/ui`
- [ ] `import { compileTheme } from '@vertz/ui'` works and returns `{ css: string, tokens: string[] }`
- [ ] Existing tests pass unchanged
- [ ] New test: `compileTheme(defineTheme({ colors: { primary: { DEFAULT: '#000' } } }))` returns CSS containing `--color-primary`

## Progress

- 2026-02-12: Ticket created from PR #210 DX review (ava + nora)
- 2026-02-12: Already fixed in commit e17ccb2 (PR #230) — compileTheme exported from @vertz/ui public API
