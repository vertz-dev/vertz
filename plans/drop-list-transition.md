# Drop ListTransition in Favor of List

## Summary

Remove the deprecated `ListTransition` component and its DOM runtime entirely. Migrate all consumers to `<List animate>` from `@vertz/ui/components`.

`ListTransition` was deprecated when the `<List>` compound component was introduced (PR #1590). `<List>` provides a superset of functionality (enter/exit + FLIP reorder + drag-sort) and uses `.map()` children which preserves VertzQL field selection. No reason to keep the deprecated code.

## API Surface

No new API. This is purely a removal. All consumers migrate from:

```tsx
// BEFORE
import { ListTransition } from '@vertz/ui';

<ListTransition
  each={items}
  keyFn={(item) => item.id}
  children={(item) => <TodoItem task={item} />}
/>

// AFTER
import { List } from '@vertz/ui/components';

<List animate>
  {items.map(item => (
    <List.Item key={item.id}>
      <TodoItem task={item} />
    </List.Item>
  ))}
</List>
```

### Removed Exports (from `@vertz/ui`)

- `ListTransition` (function)
- `ListTransitionProps` (type)

## Manifesto Alignment

- **Remove deprecated surface area** — smaller API means less for LLMs and developers to learn.
- **One way to do things** — having both `ListTransition` and `<List>` violates the single-path principle.

## Non-Goals

- Not changing the `<List>` component itself — it's already complete.
- Not removing the lower-level `dom/list.ts` (non-transition keyed reconciliation) — that's still used by the `<List>` compound component.
- Not touching the `onAnimationsComplete` utility in `dom/animation.ts` — still used by other components.

## Unknowns

None identified. The migration path is well-documented and all consumers are internal.

## Files to Change

### Delete

| File | Reason |
|------|--------|
| `packages/ui/src/component/list-transition.ts` | Component wrapper |
| `packages/ui/src/component/__tests__/list-transition.test.ts` | Component tests |
| `packages/ui/src/dom/list-transition.ts` | DOM runtime |
| `packages/ui/src/dom/__tests__/list-transition.test.ts` | DOM runtime tests |

### Modify

| File | Change |
|------|--------|
| `packages/ui/src/index.ts` | Remove `ListTransition` / `ListTransitionProps` exports |
| `examples/entity-todo/src/pages/todo-list.tsx` | Migrate to `<List animate>` |
| `examples/linear/src/components/status-column.tsx` | Migrate to `<List animate>` |
| `examples/linear/src/app.tsx` | Update comment referencing ListTransition |
| `packages/create-vertz-app/src/templates/index.ts` | Migrate template to `<List animate>` |
| `packages/create-vertz-app/src/templates/__tests__/templates.test.ts` | Update assertion |
| `packages/mint-docs/api-reference/ui/list.mdx` | Remove "Migration from ListTransition" section |
| `packages/mint-docs/guides/ui/auto-field-selection.mdx` | Remove ListTransition references |
| `packages/ui-server/src/ssr-render.ts` | Update comment referencing list-transition |
| `plans/relative-time.md` | Remove ListTransition from export example list |

## Implementation Plan

### Phase 1: Remove ListTransition source + exports, migrate consumers

Since this is a deletion task, a single phase is sufficient.

**Steps:**
1. Delete the 4 source/test files
2. Remove exports from `packages/ui/src/index.ts`
3. Migrate `examples/entity-todo` to `<List animate>`
4. Migrate `examples/linear` to `<List animate>`
5. Migrate `create-vertz-app` template to `<List animate>`
6. Update docs
7. Update stale comments in SSR render

**Acceptance Criteria:**

```typescript
describe('Feature: ListTransition removal', () => {
  describe('Given ListTransition is removed from @vertz/ui', () => {
    describe('When importing from @vertz/ui', () => {
      it('Then ListTransition is not a named export', () => {})
      it('Then ListTransitionProps type is not a named export', () => {})
    })
  })

  describe('Given examples migrated to <List animate>', () => {
    describe('When the entity-todo example renders a todo list', () => {
      it('Then it uses <List animate> with .map() children', () => {})
    })
    describe('When the linear example renders a status column', () => {
      it('Then it uses <List animate> with .map() children', () => {})
    })
  })

  describe('Given the create-vertz-app template is updated', () => {
    describe('When generating a new app', () => {
      it('Then the home page template uses <List animate>', () => {})
      it('Then the template does not reference ListTransition', () => {})
    })
  })
})
```

- All quality gates pass (`bun test && bun run typecheck && bun run lint`)
- No remaining references to `ListTransition` in source code (plans/changelogs excluded)

## E2E Acceptance Test

After all changes:
- `bun test` passes across all packages
- `bun run typecheck` passes across all packages
- `grep -r "ListTransition" packages/ examples/` returns no matches (excluding changelogs)
- The `entity-todo` and `linear` examples render their lists using `<List animate>`

## Type Flow Map

No new generics. The `<List>` component's existing type flow is unchanged.
