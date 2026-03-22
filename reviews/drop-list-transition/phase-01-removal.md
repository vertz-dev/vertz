# Phase 1: Remove ListTransition source + exports, migrate consumers

- **Author:** viniciusdacal
- **Reviewer:** claude-opus (adversarial)
- **Commits:** uncommitted working tree changes on `viniciusdacal/drop-list-transition`
- **Date:** 2026-03-22

## Changes

- `packages/ui/src/component/list-transition.ts` (deleted)
- `packages/ui/src/component/__tests__/list-transition.test.ts` (deleted)
- `packages/ui/src/dom/list-transition.ts` (deleted)
- `packages/ui/src/dom/__tests__/list-transition.test.ts` (deleted)
- `packages/ui/src/index.ts` (modified — removed `ListTransition` and `ListTransitionProps` exports)
- `examples/entity-todo/src/pages/todo-list.tsx` (modified — migrated to `<List animate>`)
- `examples/linear/src/components/status-column.tsx` (modified — migrated to `<List animate>`)
- `examples/linear/src/app.tsx` (modified — updated comment)
- `packages/create-vertz-app/src/templates/index.ts` (modified — migrated template to `<List animate>`)
- `packages/create-vertz-app/src/templates/__tests__/templates.test.ts` (modified — updated assertion)
- `packages/docs/api-reference/ui/list.mdx` (modified — removed "Migration from ListTransition" section)
- `packages/docs/guides/ui/auto-field-selection.mdx` (modified — removed ListTransition references)
- `packages/ui-server/src/ssr-render.ts` (modified — updated comment)
- `plans/relative-time.md` (modified — removed ListTransition from export list)
- `plans/drop-list-transition.md` (new — design doc)

## CI Status

- [ ] `dagger call ci` passed — **not yet run, changes are uncommitted**

## Review Checklist

- [x] Delivers what the ticket asks for
- [x] No type gaps or missing edge cases
- [x] No security issues
- [x] Public API changes match design doc

## Findings

### BLOCKER: Missing changeset

There is no changeset file for the `ListTransition` removal. The only changeset in `.changeset/` is `remove-query-match.md` which covers the `queryMatch` removal (a separate change already committed on the branch). The `ListTransition` removal is a breaking API change (removing a public export from `@vertz/ui`) and requires its own changeset describing what was removed and the migration path.

**Required:** Add `.changeset/drop-list-transition.md` with at minimum `@vertz/ui: patch` (and `@vertz/create-vertz-app: patch` since its template changed).

### BLOCKER: Changes are uncommitted

All ListTransition removal changes are unstaged in the working tree. They have not been committed. The branch has 43 commits ahead of main, but none of them are the ListTransition removal -- they are all previously merged PRs. The actual ListTransition work needs to be committed.

### SHOULD-FIX: TDD not followed

The design doc specifies acceptance criteria including tests that verify `ListTransition` is not a named export from `@vertz/ui`. No such test was written. While the existing template test (`templates.test.ts`) was updated (which is good), there should be a dedicated test verifying the export removal:

```ts
import * as ui from '@vertz/ui';
expect(ui).not.toHaveProperty('ListTransition');
expect(ui).not.toHaveProperty('ListTransitionProps');
```

This would prevent accidental re-introduction of the export.

### Approved (with above fixes)

The actual code changes are correct and complete:

1. **Completeness:** All ListTransition references are removed from source code. The only remaining references are in `plans/` (design docs -- expected), `plans/drop-list-transition.md` (the design doc for this change), and `packages/ui/CHANGELOG.md` (historical record -- expected).

2. **Migration correctness:** All three consumers (`entity-todo`, `linear`, `create-vertz-app` template) correctly use `<List animate>` with `.map()` and `<List.Item key={...}>`. The pattern is consistent across all migrations.

3. **Export removal:** `packages/ui/src/index.ts` cleanly removes both `ListTransition` and `ListTransitionProps` exports. No dangling imports.

4. **Doc updates:**
   - `list.mdx` -- "Migration from ListTransition" section removed. Clean.
   - `auto-field-selection.mdx` -- ListTransition example removed, replaced with correct `<List animate>` recommendation. The new text ("For animated lists, use `<List animate>` which uses `.map()` children -- field selection works automatically.") is a genuine improvement because `<List animate>` does NOT break field selection, unlike the old `ListTransition`.
   - `ssr-render.ts` -- comment updated.
   - `plans/relative-time.md` -- ListTransition removed from export list sentence.

5. **Template correctness:** The `homePageTemplate()` in `create-vertz-app` generates valid code. It imports `List` from `@vertz/ui/components`, uses `<List animate>`, and wraps items in `<List.Item key={...}>`. The test assertion was updated from `expect(result).toContain('ListTransition')` to `expect(result).toContain('<List animate>')`.

6. **No missed files:** `grep -r "ListTransition" packages/ examples/` returns only `packages/ui/CHANGELOG.md` (historical, expected). No `.ts`, `.tsx`, or `.mdx` files reference ListTransition.

7. **No runtime bugs introduced:** The migration pattern is straightforward -- `<List animate>` with `.map()` children is the documented replacement. The `<List>` component already exists and is tested. No new code was written, only deletion and migration.

### NIT: `as Label[]` cast in status-column.tsx (line 43)

```tsx
labels={(issue.labels ?? []) as Label[]}
```

This is a pre-existing cast from the VertzQL `include` migration, not introduced by this PR. Not a blocker, but worth noting for future cleanup.

## Resolution

Three items to address before merge:

1. Add a changeset file (`.changeset/drop-list-transition.md`)
2. Commit all changes
3. Consider adding an export removal test (should-fix, not strictly blocking if quality gates already verify this via typecheck)
