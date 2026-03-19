# Collapsible Compound Pattern Migration

**Issue:** #1554
**Type:** Refactor (pattern migration, not new API)

## Summary

Migrate `ComposedCollapsible` from the two-phase registration pattern to the React-style compound pattern, matching the 15+ already-migrated primitives (Dialog, AlertDialog, Carousel, etc.).

## API Surface

The **public API is unchanged** — same props, same sub-components, same DOM structure:

```tsx
<Collapsible defaultOpen={false} disabled={false} onOpenChange={(open) => {}}>
  <Collapsible.Trigger>Toggle</Collapsible.Trigger>
  <Collapsible.Content>Body content here</Collapsible.Content>
</Collapsible>
```

Props interfaces remain identical:
- `ComposedCollapsibleProps`: `{ children, classes, defaultOpen, disabled, onOpenChange }`
- `SlotProps`: `{ children, className, class }`

### Internal Architecture Change

| Aspect | Before (registration) | After (compound) |
|--------|----------------------|-------------------|
| Context shape | `_registerTrigger`, `_registerContent` callbacks | `toggle`, `ids`, `refs`, `classes`, `disabled`, `defaultOpen` |
| Sub-components | Register via callbacks, return invisible `<span>` | Render own DOM (`<button>`, `<div>`) directly |
| Root rendering | Collects registrations → builds all DOM | Wraps children in Provider + root `<div>` |
| `resolveChildren` | Required for two-phase resolution | Removed |
| Provider pattern | Callback: `Provider(value, fn)` | JSX: `<Provider value={ctx}>{children}</Provider>` |

### Context Value

```ts
interface CollapsibleContextValue {
  ids: { triggerId: string; contentId: string };
  triggerRef: Ref<HTMLButtonElement>;
  contentRef: Ref<HTMLDivElement>;
  classes?: CollapsibleClasses;
  disabled: boolean;
  defaultOpen: boolean;
  toggle: () => void;
}
```

### Animation Strategy

Matches Dialog's approach — static initial attributes + imperative updates:

- **Trigger**: static initial `aria-expanded`, `data-state` based on `defaultOpen`. Toggle updates imperatively via `triggerRef`.
- **Content**: static initial `aria-hidden`, `data-state`, `style` (display) based on `defaultOpen`. Toggle updates imperatively via `contentRef`.
- **Why not reactive bindings for Content?** The `setHiddenAnimated` utility defers `display: none` until CSS exit animation completes. A reactive `style` binding would set `display: none` immediately, preventing the animation.

## Manifesto Alignment

- **Declarative over imperative**: Sub-components render their own DOM in JSX instead of registering callbacks.
- **Composition over configuration**: Users arrange Trigger/Content in any order; Root doesn't force DOM order.
- **Consistency**: Follows the same compound pattern as Dialog, AlertDialog, Carousel, and 12+ other primitives.

## Non-Goals

- **No new features**: Same behavior, same API, same DOM structure.
- **No low-level collapsible.ts changes**: Only the composed layer is migrated.
- **No theme-shadcn changes**: The `createThemedCollapsible` factory has the same API surface. Sub-components are re-exported.

## Unknowns

None — this pattern is established by 15+ completed migrations.

## Type Flow Map

No generic type parameters. All types are concrete interfaces (`CollapsibleClasses`, `ComposedCollapsibleProps`, `SlotProps`). No type flow verification needed.

## E2E Acceptance Test

```ts
describe('ComposedCollapsible (compound pattern)', () => {
  it('Trigger renders own <button> with ARIA attributes', () => {
    // button has aria-expanded, aria-controls, data-state, disabled
  });

  it('Content renders own <div> with animation support', () => {
    // div has aria-hidden, data-state, display management, --collapsible-content-height
  });

  it('No resolveChildren import', () => {
    // Source file does not import resolveChildren
  });

  it('No @vertz/ui/internals import', () => {
    // Source file does not import from @vertz/ui/internals
  });

  it('All existing behavioral tests pass', () => {
    // toggle, defaultOpen, disabled, onOpenChange, classes, aria-controls linking
  });
});
```

## Implementation Plan

**Single phase** — this is a 1:1 pattern replacement in one file with test updates.

### Steps

1. Rewrite `collapsible-composed.tsx`:
   - Replace registration context with data/ref context
   - Make Trigger render its own `<button>`
   - Make Content render its own `<div>` with animation support
   - Root becomes Provider + wrapper `<div>`
   - Remove `resolveChildren` import
2. Update tests in `collapsible-composed.test.ts` to match new structure (assertions should mostly stay the same since DOM output is equivalent)
3. Verify theme-shadcn integration works without changes
4. Run quality gates: test + typecheck + lint

### Acceptance Criteria

- [ ] `CollapsibleTrigger` renders its own `<button>` element
- [ ] `CollapsibleContent` renders its own `<div>` with height animation
- [ ] Root provides state via context — no registration callbacks
- [ ] No `resolveChildren` import
- [ ] No `@vertz/ui/internals` import
- [ ] All existing tests pass or are updated equivalently
- [ ] Hydration-safe: no two-phase rendering
- [ ] Quality gates pass (test + typecheck + lint)

### Reference Implementations

- Dialog: `packages/ui-primitives/src/dialog/dialog-composed.tsx`
- Carousel: `packages/ui-primitives/src/carousel/carousel-composed.tsx`
