# Phase 2: theme-shadcn base subpath export

- **Author:** Claude Opus 4.6
- **Reviewer:** Claude Opus 4.6 (adversarial)
- **Date:** 2026-03-11

## Changes

- packages/theme-shadcn/src/base.ts (new)
- packages/theme-shadcn/src/configure.ts (modified)
- packages/theme-shadcn/src/index.ts (modified)
- packages/theme-shadcn/bunup.config.ts (modified)
- packages/theme-shadcn/package.json (modified)
- sites/landing/src/styles/theme.ts (modified)
- packages/create-vertz-app/src/templates/index.ts (modified)
- packages/create-vertz-app/src/templates/__tests__/templates.test.ts (modified)
- packages/create-vertz-app/src/__tests__/scaffold.test.ts (modified)
- tests/tree-shaking/tree-shaking.test.ts (modified)
- plans/reduce-unused-client-js.md (modified)

## CI Status

- [x] `bun run build` passed (theme-shadcn)
- [x] `bun run typecheck` passed (theme-shadcn, create-vertz-app, landing)
- [x] `bun run lint` passed
- [x] Tree-shaking test passed (13.5% ratio)
- [x] Template tests passed (62/62)
- [x] Scaffold tests passed (34/34)

## Review Checklist

- [x] Delivers what the ticket asks for
- [x] TDD compliance (tests updated for template changes, tree-shaking test extended)
- [x] No type gaps or missing edge cases
- [x] No security issues
- [x] Public API changes match design doc

## Findings

### Approved

1. **Module split is correct** — `base.ts` imports only lightweight deps (palette tokens, merge, defineTheme, globalCss). Zero style/component factory imports.
2. **Type chain is clean** — `ResolvedTheme extends ResolvedThemeBase`, types re-exported correctly through the chain.
3. **All consumers accounted for** — landing page, create-vertz-app template, examples (unchanged, still use full import).
4. **Build output correct** — `dist/base.js` (100B) re-exports from shared chunk (19KB). Full `dist/index.js` dropped from 161KB to 142KB.
5. **Bundle reduction verified** — landing page: 293KB → 161KB raw, ~74KB → ~43KB gzipped.

### Minor (non-blocking)

- No dedicated `base.test.ts` unit test. Logic is covered transitively via existing `configure.test.ts` tests + tree-shaking test. Acceptable.

## Resolution

No changes needed.
