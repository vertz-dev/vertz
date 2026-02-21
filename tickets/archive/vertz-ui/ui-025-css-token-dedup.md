# ui-025: Extract shared CSS token tables

- **Status:** 🟢 Done
- **Assigned:** ben
- **Phase:** v0.1.x patch
- **Estimate:** 6h
- **Blocked by:** none
- **Blocks:** none
- **PR:** —
- **Source:** follow-up #6 from PR #177

## Description

The entire token resolution pipeline (property map, spacing scale, color namespaces, pseudo prefixes) is duplicated between three locations:

1. `packages/ui/src/css/token-resolver.ts` (runtime)
2. `packages/ui-compiler/src/transformers/css-transformer.ts` (compiler)
3. `packages/ui-compiler/src/css-extraction/extractor.ts` (extraction)

This has already caused drift — `svw`/`dvw` units are missing from the compiler but present in the runtime. Every future token addition must be made in three places.

Consider extracting shared lookup tables into a shared module that both packages import from, or a build-time generated file.

## Acceptance Criteria

- [ ] Token lookup tables exist in a single source of truth
- [ ] Runtime, compiler, and extractor all resolve the same set of tokens
- [ ] Test: adding a new CSS property to the shared table makes it available in all three consumers
- [ ] No duplicate property/spacing/color/pseudo maps across packages
- [ ] `svw`/`dvw` drift is fixed (present in all three consumers)

## Progress

- 2026-02-12: Ticket created from follow-up #6 (PR #177 review)
- 2026-02-12: Implemented — created token-tables.ts as single source of truth, removed ~500 lines of duplicates from compiler/extractor. Fixed drift (missing colors, keywords, breakpoints). 122 new regression tests.
