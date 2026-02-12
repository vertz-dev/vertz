# ui-020: Fix compiler replaceAll fragility and missing import generation

- **Status:** 🔴 Todo
- **Assigned:** ben
- **Phase:** v0.1.x patch
- **Estimate:** 4h
- **Blocked by:** none
- **Blocks:** none
- **PR:** —
- **Source:** ben review on PR #199 (should-fix S1, S2), ben noting N6

## Description

Three compiler issues to fix:

### S1: Fragile replaceAll in MutationTransformer
`MutationTransformer` uses `replaceAll` to rewrite variable references, but this is fragile with variable name substrings. For example, a variable named `item` would match inside `items.`, causing incorrect rewrites.

**File:** `packages/ui-compiler/src/transformers/mutation-transformer.ts`

### S2: Missing import generation for DOM helpers
The compiler never detects or generates imports for `__conditional`, `__list`, `__show`, `__classList`. These are exported from `@vertz/ui/internals` but the compiler's `buildImportStatement()` doesn't track their usage.

**File:** `packages/ui-compiler/src/compiler.ts` (buildImportStatement)

### N6: bunup.config.ts missing internals entry point
`bunup.config.ts` is missing the `internals` entry point, so `@vertz/ui/internals` may not build correctly.

**File:** `packages/ui/bunup.config.ts`

## Acceptance Criteria

- [ ] MutationTransformer correctly handles variable names that are substrings of other identifiers (e.g., `item` vs `items`)
- [ ] Test: mutation rewrite for `item` does not affect `items.length`
- [ ] Compiler generates import for `__conditional` when conditional rendering is used
- [ ] Compiler generates import for `__list` when list rendering is used
- [ ] Compiler generates import for `__show`/`__classList` when those directives are used
- [ ] Test: each directive produces the correct import from `@vertz/ui/internals`
- [ ] `bunup.config.ts` includes `internals` entry point
- [ ] `bun run build` in @vertz/ui produces `dist/internals.js` and `dist/internals.d.ts`

## Progress

- 2026-02-12: Ticket created from ben's review on PR #199
