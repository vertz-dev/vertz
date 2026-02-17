# renderPage — Implementation Plan

## References
- Design doc: `plans/render-page.md`
- Issue: #414
- Package: `@vertz/ui-server`

## Current State
- `PageOptions` interface already defined in `packages/ui-server/src/render-page.ts`
- `renderPage` function already implemented
- Basic tests exist in `packages/ui-server/src/__tests__/render-page.test.ts`
- Already exported from `packages/ui-server/src/index.ts`

## Phase 1: PageOptions type + HTML shell builder (COMPLETE)

### Task 1.1: Define PageOptions interface ✅
**File:** `packages/ui-server/src/render-page.ts`

**Status:** Complete - interface already defined with all fields from design doc.

### Task 1.2: Build HTML head string ✅
**Function:** `buildHeadHtml(options: PageOptions, componentHeadEntries?: HeadEntry[]): string`

**Status:** Complete but needs enhancement - currently accepts `_componentHeadEntries` parameter but doesn't use it.

**Gap:** Two-pass rendering not implemented - HeadCollector integration incomplete.

### Task 1.3: Build HTML document wrapper ✅
**Function:** Inline in `renderPage`

**Status:** Complete - wrapDocument logic inlined in `renderPage`.

## Phase 2: renderPage with two-pass rendering

### Task 2.1: Implement renderPage ✅
**Function:** `renderPage(vnode: VNode, options?: PageOptions): Response`

**Status:** Complete - returns Response with proper status, content-type, and streaming body.

### Task 2.2: HeadCollector integration 🔲
**Acceptance Criteria:**
- [ ] renderPage creates HeadCollector context before rendering component
- [ ] Component-set head values override renderPage option values
- [ ] If HeadCollector sets title but not description, renderPage description is used (partial override)
- [ ] Works with nested components setting Head

**Technical Approach:**
1. Create `HeadCollector` instance before rendering
2. Pass collector via render context/context API
3. Render component tree (first pass)
4. Extract collected head entries
5. Merge with PageOptions (component overrides options)
6. Build final head HTML
7. Stream full document (second pass)

**Tests to add:**
- Component sets `<Head title="Override">` → output has `<title>Override</title>` not the option title
- Component sets title only → description still comes from options
- Nested components setting Head all apply

## Phase 3: Export + integration

### Task 3.1: Export from package ✅
**Status:** Complete - `renderPage` and `PageOptions` exported from index.ts.

### Task 3.2: Update Cloudflare example 🔲
**Acceptance Criteria:**
- [ ] `examples/ssr-cloudflare/src/app.ts` uses `renderPage` instead of raw HTML string
- [ ] Example is <20 lines of code
- [ ] Local wrangler dev serves HTML correctly
- [ ] Deploy to Cloudflare works

## Quality Gates
- [x] All tests pass: `cd packages/ui-server && bun test`
- [x] Typecheck: `bun run typecheck` passes
- [x] Build: `bun run build` succeeds
- [ ] No lint errors
- [ ] PR passes CI
- [ ] HeadCollector integration tested

## Remaining Work Summary

| Task | Status |
|------|--------|
| PageOptions interface | ✅ Done |
| buildHeadHtml | ✅ Done (needs HeadCollector integration) |
| wrapDocument (inlined) | ✅ Done |
| renderPage core | ✅ Done |
| HeadCollector two-pass | 🔲 Todo |
| Cloudflare example update | 🔲 Todo |
