# ui-029: Add subpath exports for router/form/query/css

- **Status:** 🟢 Done
- **Assigned:** nora
- **Phase:** v0.1.x patch
- **Estimate:** 4h
- **Blocked by:** none
- **Blocks:** none
- **PR:** —
- **Source:** josh DX review on PR #199 (should-fix #4)

## Description

The design doc specifies subpath imports like `@vertz/ui/router`, `@vertz/ui/form`, `@vertz/ui/query`, and `@vertz/ui/css`, but the implementation uses a single flat barrel export from `@vertz/ui`. While the main barrel was cleaned up (internals moved to `@vertz/ui/internals`), focused subpath imports would improve tree-shaking and make the import surface more navigable.

Currently only `@vertz/ui`, `@vertz/ui/internals`, and `@vertz/ui/test` exist as subpaths.

**File:** `packages/ui/package.json` (exports map), new subpath entry files

## Acceptance Criteria

- [ ] `@vertz/ui/router` exports: defineRoutes, createRouter, createLink, createOutlet, parseSearchParams, useSearchParams
- [ ] `@vertz/ui/form` exports: form, formDataToObject (+ fillForm/submitForm after ui-023)
- [ ] `@vertz/ui/query` exports: query
- [ ] `@vertz/ui/css` exports: css, variants, defineTheme, ThemeProvider, globalCss, s
- [ ] Main `@vertz/ui` barrel continues to re-export everything (backward compat)
- [ ] package.json exports map includes all new subpaths
- [ ] Type declarations generate correctly for each subpath
- [ ] Test: importing from subpath resolves correctly

## Progress

- 2026-02-12: Ticket created from josh's DX review on PR #199
- 2026-02-12: Already implemented — subpath exports for router, form, query, css, and internals exist in package.json
