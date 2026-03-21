# DX Review: Move DOM Creation from theme-shadcn to ui-primitives

- **Reviewer:** DX Agent
- **Date:** 2026-03-20
- **Document:** `plans/theme-shadcn-no-dom.md`

## Overall Assessment

The design is sound. The separation of "structure in ui-primitives, styling in theme-shadcn" is the right call and aligns with how the existing composed primitives (Dialog, Tabs, Select, AlertDialog) already work. Extending this pattern to the remaining components (Card, Alert, Table, Input, etc.) is a natural completion of the architecture.

The `withStyles()` API is already proven in production for compound primitives. Theme authors who have seen the Dialog or Tabs theme files will immediately understand the Card or Alert equivalents.

That said, I have findings in several areas where the DX could be improved or where the design introduces inconsistencies that will confuse both theme authors and framework contributors.

---

## Findings

### BLOCKER-1: Sub-component naming inconsistency between suites and compound primitives

**Current state (consumer-facing):**

Compound primitives use dot notation with short names:
```tsx
<Dialog.Trigger>...</Dialog.Trigger>
<Dialog.Title>...</Dialog.Title>
<Tabs.List>...</Tabs.List>
```

Suite components use prefixed names:
```tsx
<Card.CardHeader>...</Card.CardHeader>
<Card.CardTitle>...</Card.CardTitle>
<Alert.AlertTitle>...</Alert.AlertTitle>
```

The design doc proposes the composed primitive with short names:
```tsx
ComposedCard.Header
ComposedCard.Title
ComposedCard.Footer
```

But the consumer-facing Card is currently accessed via `Card.CardHeader`, `Card.CardTitle`, etc. (see `examples/component-catalog/src/demos/card.tsx`). The design doc says "No public API changes" in Non-Goals, but if the composed primitive uses `.Header` and the theme wrapper passes sub-components through, the consumer will see `.Header` instead of `.CardHeader`.

Either:
1. The design must explicitly address how the naming transition works (breaking change acceptable per policy), or
2. The theme wrapper must re-map `.Header` to `.CardHeader` for backward compatibility, which adds complexity.

This needs a decision before implementation. It affects every compound component being converted: Card (7 sub-components), Alert (3), FormGroup (2), Avatar (3), Table (8).

**Recommendation:** Take the breaking change. The `Card.CardHeader` pattern is redundant and confusing -- `Card.Header` is strictly better DX. Pre-v1 is the right time. But this contradicts the "No public API changes" non-goal, so the design doc needs updating.

### BLOCKER-2: The `as unknown as ThemedDialogComponent` cast in existing withStyles usage

Looking at `theme-shadcn/src/components/primitives/dialog.ts`:
```ts
return withStyles(ComposedDialog, { ... }) as unknown as ThemedDialogComponent;
```

This is a double cast (`as unknown as T`), which Biome's `no-double-cast` GritQL plugin flags as an error. More importantly, it means `withStyles()` return types don't actually match what theme authors need. If the existing pattern requires a double cast, every new theme conversion will inherit this problem.

The design doc doesn't address this. Before scaling `withStyles()` to 15+ more components, the type mismatch between `StyledPrimitive<C>` and the theme's expected component type needs to be resolved. Otherwise every theme file will have an `as unknown as T` escape hatch, which undermines the "if it builds, it works" principle.

**Recommendation:** Fix `StyledPrimitive<C>` types or introduce a type-safe bridge so that theme authors never need double casts. This is foundational -- doing it after 15 conversions means 15 files to fix.

---

### SHOULD-FIX-1: Single-element composed primitives add ceremony for zero benefit

For Input, Textarea, Label, Separator, Skeleton -- the "composed primitive" is literally:

```tsx
function ComposedInputRoot({ classes, className, ...props }: ComposedInputProps) {
  const combinedClass = [classes?.base, className].filter(Boolean).join(' ');
  return <input class={combinedClass} {...props} />;
}
```

This is a function that joins two strings and renders a single element. Creating a dedicated file, a `Classes` interface with one key (`base`), a `ComposedPrimitive` type assertion, and a `withStyles()` call for this feels like architecture for architecture's sake.

Compare with what `withStyles()` actually does for these: it pre-binds a single class string. A theme author writes:
```ts
withStyles(ComposedInput, { base: styles.base })
```

Which is equivalent to:
```ts
(props) => ComposedInput({ ...props, classes: { base: styles.base } })
```

For compound components (Card with 7 sub-components, Dialog with 7), `withStyles()` genuinely earns its keep -- it distributes classes through context. For single-element components, it's a one-liner that wraps a one-liner.

**Recommendation:** Consider a simpler `styledElement()` helper for single-element cases:
```ts
// theme-shadcn
export const Input = styledElement('input', styles.base);
```

Or just accept that the composed primitive pattern is the universal pattern and the overhead is worth the consistency. But the design doc should explicitly acknowledge the tradeoff and state the rationale for choosing uniformity over simplicity. Right now it just presents the pattern without discussion.

### SHOULD-FIX-2: Variant handling creates N withStyles calls per variant

The Alert variant example:
```ts
const DefaultAlert = withStyles(ComposedAlert, { root: styles.root, ... });
const DestructiveAlert = withStyles(ComposedAlert, { root: [styles.root, styles.destructive].join(' '), ... });
```

For Button, which has 2 variant dimensions (`intent` x `size`), this would mean creating `O(intents * sizes)` pre-styled variants. That's not viable -- Button currently has ~7 intents and ~4 sizes. The design doc acknowledges Button has variants but doesn't show how to handle multi-dimensional variants.

The Tabs example (default + line) works because it's a single dimension with 2 values. Button's combinatorial variant space is fundamentally different.

**Recommendation:** The design doc needs an explicit strategy for multi-dimensional variants. Options:
1. Keep Button's variant logic in theme-shadcn (don't use `withStyles` for the variant part, only for the base class)
2. Extend `withStyles` to accept a variant resolver function
3. Have the composed Button primitive accept `className` and let theme-shadcn compute the full class string

Option 3 is what the current Button implementation already does (see `button.tsx` -- it calls `buttonStyles({ intent, size })` and passes the result as `class`). The design doc should state that Button doesn't use `withStyles` at all, just uses the composed primitive directly with dynamic classes.

### SHOULD-FIX-3: Context overhead for purely structural components

The Card design uses context to distribute classes to sub-components:

```tsx
function ComposedCardRoot({ children, classes, className }) {
  return (
    <CardContext.Provider value={{ classes }}>
      <div class={combinedClass}>{children}</div>
    </CardContext.Provider>
  );
}

function CardHeader({ children, className }) {
  const ctx = useContext(CardContext);
  const combinedClass = [ctx?.classes?.header, className].filter(Boolean).join(' ');
  return <div class={combinedClass}>{children}</div>;
}
```

Card has no behavioral state -- no open/close, no signals, no refs. The only reason for context is to pass class strings from root to sub-components. This is the same pattern as Dialog, but Dialog genuinely needs context for shared state (isOpen, dialogRef, close/toggle).

For Card, using context to distribute CSS strings is a heavyweight mechanism. Every `<Card.Header>` call does a context lookup to get a string that could have been passed directly.

This isn't a blocker because the pattern is consistent with Dialog/Tabs, and consistency has value. But the design doc should acknowledge this is a deliberate trade-off: we accept per-render context lookups for CSS strings in exchange for API uniformity.

**Alternative considered and rejected:** Having `withStyles()` pre-bind classes on each sub-component individually (no context). This would mean `StyledCard.Header` is a self-contained styled component. But it would mean `withStyles()` needs to know about sub-component structure, which couples the utility to each primitive's shape. Context is the more decoupled approach.

### SUGGESTION-1: Document the theme author's mental model explicitly

The design doc is implementation-focused. A theme author who reads it needs to understand:

1. **What files do I create/modify?** Only theme-shadcn files. No touching ui-primitives.
2. **What is the pattern?** Import `ComposedX` + `withStyles` from `@vertz/ui-primitives`, call `withStyles(ComposedX, { ...myClasses })`, export the result.
3. **When do I add variant logic?** When the component has theme-level variants (Alert: default/destructive, Button: intent/size). Create a wrapper function that selects the right styled variant.
4. **When do I NOT use withStyles?** When variant logic requires dynamic class computation at render time (Button with combinatorial variants).

A "Theme Author Guide" section in the design doc would make this immediately clear.

### SUGGESTION-2: Consider whether Breadcrumb and Pagination belong here

Breadcrumb takes an `items[]` array and renders `nav > ol > li` with separators. Pagination computes page ranges and renders interactive buttons with ellipsis logic. These are not "styled containers" like Card -- they have real behavioral logic (iteration, range computation, click handlers).

The design doc groups them under "Complex components" and proposes composing them as primitives. This is fine architecturally, but the `withStyles()` pattern is less natural here. A Pagination primitive needs to render buttons, handle page changes, and compute ranges. The theme's contribution is styling the buttons and the container, not just binding class strings.

This might work fine with the proposed approach, but it's worth flagging that these two components are qualitatively different from the others. If the implementation reveals friction, don't force them into the pattern.

### SUGGESTION-3: The `ComposedPrimitive` type assertion for single-element components

The design shows:
```ts
export const ComposedInput = ComposedInputRoot as ComposedPrimitive<'base'>;
```

This cast is necessary because a plain function doesn't carry the phantom `__classKeys` brand. But it means every single-element composed primitive needs an explicit type assertion. For compound components, the `Object.assign()` pattern naturally supports the type annotation.

Consider whether there's a factory helper that avoids the cast:
```ts
export const ComposedInput = composedPrimitive<'base'>(ComposedInputRoot);
```

This would be a one-liner wrapper that adds the phantom brand. It's a small improvement but it makes the intent declarative rather than relying on a cast.

---

## Summary

| Finding | Severity | Action Required |
|---------|----------|----------------|
| Sub-component naming inconsistency (CardHeader vs Header) | BLOCKER | Decide on naming, update non-goals |
| `as unknown as T` double cast in withStyles usage | BLOCKER | Fix types before scaling the pattern |
| Single-element composed primitives are over-engineered | SHOULD-FIX | Acknowledge tradeoff or provide simpler alternative |
| Multi-dimensional variant handling (Button) unaddressed | SHOULD-FIX | Add explicit strategy for combinatorial variants |
| Context overhead for stateless compounds (Card) | SHOULD-FIX | Acknowledge as deliberate tradeoff |
| Theme author mental model not documented | SUGGESTION | Add "Theme Author Guide" section |
| Breadcrumb/Pagination are qualitatively different | SUGGESTION | Flag as potentially needing different approach |
| `ComposedPrimitive<K>` type assertion pattern | SUGGESTION | Consider `composedPrimitive()` factory |

## Verdict: Changes Requested

The two blockers must be resolved before implementation. The sub-component naming inconsistency will cascade through the consumer API and example apps. The double-cast problem will be copy-pasted into 15+ files if not addressed upfront.

The should-fix items don't block but will result in review findings during implementation if not addressed in the design. The suggestions are quality-of-life improvements.
