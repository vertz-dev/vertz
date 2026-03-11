# Phase 1: Multi-Entry Build for @vertz/ui-primitives

- **Author:** implementation agent
- **Reviewer:** adversarial reviewer (claude-opus-4-6)
- **Commits:** uncommitted working tree changes
- **Date:** 2026-03-11

## Changes

- `packages/ui-primitives/bunup.config.ts` (modified) — single entry `src/index.ts` replaced with 34 entries (barrel + utils + 32 components)
- `packages/ui-primitives/package.json` (modified) — `main`, `types`, and `exports` paths updated from `dist/index.js` to `dist/src/index.js`
- `tests/tree-shaking/tree-shaking.test.ts` (modified) — dist paths fixed for `@vertz/ui-primitives` and `@vertz/ui`, subpath aliases added, formatting cleanup

## CI Status

- [x] 394 ui-primitives tests pass
- [x] 446 theme-shadcn tests pass
- [x] Tree-shaking test: `@vertz/ui-primitives` ratio=16.1% (PASS, threshold <50%)
- [ ] Full `dagger call ci` status unknown — not reported

## Review Checklist

- [x] Delivers what the ticket asks for
- [ ] TDD compliance (tests before/alongside implementation) — **see Finding #1**
- [x] No type gaps or missing edge cases
- [x] No security issues
- [x] Public API changes match design doc — barrel import preserved, no consumer-facing changes

## Findings

### Finding #1 (Minor): TDD compliance unclear

The tree-shaking test already existed before this PR. The test was modified to fix paths (`dist/index.js` -> `dist/src/index.js`), add subpath aliases, and apply formatting. However, strict TDD requires writing a **failing test first** and then implementing. The sequence appears to have been:

1. Change the build config (implementation)
2. Fix the test paths to match the new dist structure

This means the test could not have been RED first — it was broken by the implementation and then fixed to match. This is understandable for a build-config-only change where the test harness itself must be updated to locate the new dist output, but it deviates from the letter of the TDD process.

**Verdict:** Acceptable for build-config changes. Not a blocker.

### Finding #2 (Medium): Hardcoded entry list is fragile — new components silently skipped

The `bunup.config.ts` manually lists all 34 entries. When a developer adds a new component (e.g., `src/data-table/data-table.ts`), they must remember to add it to `bunup.config.ts`. If they forget:

- The component still works (it gets bundled into `dist/src/index.js` via the barrel)
- But it ships as part of the monolithic barrel chunk, defeating tree-shaking for that component
- No test catches this — the tree-shaking test only checks the aggregate ratio, not per-component isolation

This is a **silent degradation**. The `@vertz/ui` package avoids this problem by having a small, stable set of entries (9 domain-scoped modules), but `@vertz/ui-primitives` has 32 components and will grow.

**Recommendation:** Add a guard test that verifies every directory in `src/` (excluding `__tests__` and `utils/`) has a corresponding entry in `bunup.config.ts`, OR use a glob/dynamic entry list:

```ts
import { globSync } from 'node:fs';
const componentEntries = globSync('src/*/index.ts')
  .concat(globSync('src/*/*.ts'))
  .filter(f => !f.includes('__tests__'));
```

**Verdict:** Not a blocker for Phase 1, but should be addressed before merging the final PR to main. The design doc already identifies this package as having 30+ components, and the team actively adds new ones.

### Finding #3 (Informational): Side-effect imports in individual entries

Inspecting the built output of `dist/src/tooltip/tooltip.js`:

```js
import { Tooltip } from "../../shared/chunk-fjr8m8jz.js";
import"../../shared/chunk-0mcr52hc.js";  // floating.ts utilities
import"../../shared/chunk-8y1jf6xr.js";  // id.ts utilities
```

The bare `import "..."` statements are side-effect-only imports. These exist because bunup/esbuild detected that `chunk-0mcr52hc.js` (floating utils) and `chunk-8y1jf6xr.js` (id utils) have module-level initialization code (e.g., `var counter = 0` in id.ts). This means importing `Tooltip` via its direct entry point still pulls in the floating and id chunks regardless of whether the consumer uses those functions.

This is functionally correct — Tooltip genuinely depends on these utilities. But it's worth noting that the shared chunks create implicit coupling. If a consumer does `import { Tooltip } from '@vertz/ui-primitives'` through the barrel, the bundler resolves to the barrel's re-export, which points to the Tooltip chunk, which pulls floating + id chunks. The `sideEffects: false` in package.json tells the bundler that unused re-exports from the barrel can be eliminated, but the transitive side-effect imports within each component's chunk cannot be — they are genuine dependencies.

The tree-shaking test confirms this works: 32,060B single vs 199,677B full = 16.1%. The ratio demonstrates that the **inter-component** isolation works (Tooltip doesn't pull in Accordion, Dialog, etc.), even if intra-component shared chunks remain.

**Verdict:** Working as designed. No action needed.

### Finding #4 (Low): `@vertz/ui` dist path fix in tree-shaking test is unrelated

The diff changes `@vertz/ui` distEntry from `packages/ui/dist/index.js` to `packages/ui/dist/src/index.js`. This is not related to the `@vertz/ui-primitives` multi-entry change — it fixes a pre-existing incorrect path for `@vertz/ui` (which already uses `dist/src/` as confirmed by its `package.json`). The test was presumably passing before because the alias resolution fell back to the package.json exports field, but the explicit dist path was wrong.

Similarly, the new `SUBPATH_ALIASES` for `@vertz/ui/internals`, `@vertz/core/internals`, and `@vertz/db/sql` fix pre-existing resolution failures that would have caused esbuild to either error or bundle stubs.

**Verdict:** Correct fixes, but they should be called out in the commit message as a separate concern from the `@vertz/ui-primitives` multi-entry change.

### Finding #5 (Informational): No Lighthouse measurement reported

The design doc states the POC gate is: "After building with multi-entry, build the landing page and compare bundle size." The tree-shaking test confirms per-package isolation (16.1% ratio), but the actual Lighthouse metric (30.5 KiB unused JS → target reduction) is not reported in the results provided.

**Verdict:** The tree-shaking test is a stronger, more reproducible signal than a Lighthouse measurement. However, the design doc's acceptance criteria explicitly mention comparing against the 70.6 KiB baseline. This should be verified before closing the issue.

### Finding #6 (None): Breaking changes assessment

Checked the `exports` field:
- `"."` now maps to `./dist/src/index.js` (was `./dist/index.js`)
- `"./utils"` now maps to `./dist/src/utils.js` (was `./dist/utils.js`)

The `files` field includes `"dist"` so both old and new paths ship in the published package. Since the `exports` field is the resolution mechanism for modern bundlers and Node.js, and `main`/`types` are updated to match, this is correct. The change is transparent to consumers — they import from `@vertz/ui-primitives` and the `exports` map resolves it.

This is consistent with how `@vertz/ui` already uses `dist/src/` paths.

**Verdict:** No breaking changes. Correct.

### Finding #7 (None): Security

No security concerns. Build configuration changes only. No new dependencies, no user input handling, no network calls.

## Summary

| # | Severity | Finding | Blocker? |
|---|----------|---------|----------|
| 1 | Minor | TDD sequence: test fixed after implementation | No |
| 2 | Medium | Hardcoded entry list is fragile for growing component set | No (but track) |
| 3 | Info | Side-effect imports in individual entries are expected | No |
| 4 | Low | `@vertz/ui` path fix and subpath aliases are unrelated to the main change | No |
| 5 | Info | Lighthouse measurement not yet reported | No |
| 6 | None | No breaking changes | No |
| 7 | None | No security issues | No |

## Verdict: APPROVED

The changes deliver what the ticket asks for: `@vertz/ui-primitives` now builds with multi-entry, the barrel re-exports resolve to separate shared chunks, and the tree-shaking test confirms a 16.1% ratio (well under the 50% threshold). All existing tests pass. No consumer-facing API changes.

**Recommended follow-ups (non-blocking):**
1. Add a guard test for bunup entry list completeness (Finding #2) — prevents silent degradation as new components are added
2. Run the landing page Lighthouse measurement to close the design doc's POC gate (Finding #5)
3. Consider splitting the `@vertz/ui` path fix and subpath aliases into a separate commit for clarity (Finding #4)

## Resolution

Pending author response to findings.
