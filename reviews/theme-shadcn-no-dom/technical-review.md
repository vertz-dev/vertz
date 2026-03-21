# Technical Review: Move DOM Creation from theme-shadcn to ui-primitives

- **Reviewer:** Technical (architecture, buildability, performance)
- **Document:** `plans/theme-shadcn-no-dom.md`
- **Date:** 2026-03-20

---

## Summary

The design moves DOM-creating code out of `theme-shadcn` into `ui-primitives` as composed JSX components, leaving `theme-shadcn` as a pure style-binding layer using `withStyles()`. The goal is correct: separation of concerns, elimination of `document.createElement`, and removal of element casts. The overall approach is sound and follows the established pattern proven by Tabs, Dialog, Sheet, etc.

That said, there are several concrete technical issues that will cause problems during implementation.

---

## Blockers

### B1. `withStyles()` silently drops sub-component styles — Card and all compound components will render unstyled sub-components

**The core issue.** The design shows this pattern for Card:

```ts
return withStyles(ComposedCard, {
  root: styles.root,
  header: styles.header,
  title: styles.title,
  // ...
});
```

But `withStyles()` only binds `classes` to the **root component call**. It does NOT apply styles to sub-components. Looking at the implementation:

```ts
const styled = (props: Omit<Parameters<C>[0], 'classes'>) =>
  component({ ...props, classes } as Parameters<C>[0]);
```

The `classes` object is passed to the root component, which stores it in context. Sub-components (`ComposedCard.Header`, `ComposedCard.Title`, etc.) read from context and apply the correct class. **This actually works** — because the design doc shows the root component wrapping children in a `CardContext.Provider` that holds the `classes` object.

However, `withStyles()` copies sub-components from the source, not styled versions:

```ts
for (const key of Object.getOwnPropertyNames(component)) {
  if (key !== 'length' && key !== 'name' && key !== 'prototype' && key !== '__classKeys') {
    subComponents[key] = (component as Record<string, unknown>)[key];
  }
}
```

This means `StyledCard.Header` === `ComposedCard.Header`. The sub-components are passed through unchanged. Since they read from context set by the root, **this works IF AND ONLY IF the sub-components are always rendered inside the styled root**.

**The subtle issue**: In the Tabs example (`theme-shadcn/src/components/primitives/tabs.ts`), the theme layer explicitly passes through `ComposedTabs.List`, `ComposedTabs.Trigger`, and `ComposedTabs.Content` as the sub-components — and they work because they `useTabsContext()` which holds the `classes`. The design is consistent.

**Verdict**: Not actually a blocker. The context-based propagation pattern works. But the design doc should explicitly state this invariant: **sub-components MUST be rendered within the styled root to receive classes, and this is enforced by the context throw**. If someone renders `<Card.Header>` outside a `<Card>`, they get an error, not silently unstyled output. This is the correct behavior.

**Downgraded to: Suggestion** — add an explicit note in the design doc about the context enforcement invariant.

### B2. `ComposedPrimitive` return type `HTMLElement` vs actual JSX return types

This is a real blocker. The `ComposedPrimitive` interface declares:

```ts
export interface ComposedPrimitive<K extends string = string> {
  (props: { ... }): HTMLElement;
  __classKeys?: K;
}
```

But the Vertz JSX factory's `JSX.Element` type is `HTMLElement | SVGElement | DocumentFragment`. When you write `<div class={...}>{children}</div>` in a `.tsx` file, the JSX factory overload `jsx('div', ...)` returns `HTMLDivElement` (which extends `HTMLElement`), so this narrows cleanly.

**The problem**: The composed component function signature. When `ComposedCardRoot` is a function that returns JSX, TypeScript infers its return type from the JSX expression. `<div>...</div>` returns `HTMLDivElement`, which is assignable to `HTMLElement`. So the cast on `ComposedTabs`:

```ts
export const ComposedTabs = Object.assign(ComposedTabsRoot, { ... }) as ((props: ComposedTabsProps) => HTMLElement) & { ... };
```

works because `HTMLDivElement extends HTMLElement`. The design doc says to **remove** these casts. If you remove them, the inferred return type of `ComposedCardRoot` will be `HTMLDivElement` (since it returns `<div>...</div>`). The `ComposedPrimitive<K>` interface expects `() => HTMLElement`. Since `HTMLDivElement extends HTMLElement`, this assignment is valid — the function is covariant in its return type.

**Actually not a blocker for the composed components themselves.** But it IS a blocker for the module augmentation in `theme-shadcn/src/index.ts`, which declares specific return types:

```ts
interface ThemeComponentMap {
  Card: CardComponents; // CardComponents has Card: (props) => HTMLDivElement
  Input: (props: InputProps) => HTMLInputElement;
  Label: (props: LabelProps) => HTMLLabelElement;
  Separator: (props: SeparatorProps) => HTMLHRElement;
  // etc.
}
```

After the refactor, `withStyles(ComposedInput, { base: '...' })` returns `StyledPrimitive<typeof ComposedInput>`, which is `(props: ...) => HTMLElement`. But `ThemeComponentMap.Input` expects `(props: InputProps) => HTMLInputElement`. `HTMLElement` is NOT assignable to `HTMLInputElement` — the return type widens.

**This is a real type-level breaking change.** Either:
1. The module augmentation must be updated to use `HTMLElement` (breaking downstream consumers who rely on specific element types), or
2. The `ComposedPrimitive` interface needs to be generic over the return type, not hardcode `HTMLElement`, or
3. The `withStyles` return type needs to preserve the element specificity.

**Recommendation**: Option 2 is cleanest. Make `ComposedPrimitive` generic over both class keys AND return element type:

```ts
export interface ComposedPrimitive<K extends string = string, E extends HTMLElement = HTMLElement> {
  (props: { children?: ChildValue; classes?: Partial<Record<K, string>>; [key: string]: unknown }): E;
  __classKeys?: K;
}
```

Then `ComposedInput` can be typed as `ComposedPrimitive<'base', HTMLInputElement>`, and `StyledPrimitive` preserves the element type through to the module augmentation.

---

## Should-Fix

### S1. Separator has orientation-dependent styling — `classes` pattern needs `horizontal`/`vertical` keys

The current `createSeparatorComponent` applies `separatorStyles.horizontal` or `separatorStyles.vertical` based on an `orientation` prop. But the design doc shows the composed primitive as a simple single-element with `classes.base`:

```tsx
function ComposedSeparator({ classes, className, orientation }: ...) {
  const combinedClass = [classes?.base, className].filter(Boolean).join(' ');
  return <hr class={combinedClass} role="separator" aria-orientation={orientation} />;
}
```

Where does the orientation-specific class go? The `classes` object only has `base`. The theme-shadcn styles have `base`, `horizontal`, and `vertical` keys.

**Options**:
- (a) The composed primitive handles orientation internally with additional class keys: `{ base, horizontal, vertical }`.
- (b) The theme wrapper (not `withStyles()`) handles variant selection — like how Alert handles `variant`.

Option (b) is cleaner and consistent with the Alert variant pattern already in the doc. But this means Separator can't use bare `withStyles()` — it needs a thin wrapper in theme-shadcn:

```ts
function Separator({ orientation = 'horizontal', ...rest }) {
  const Styled = orientation === 'vertical' ? VerticalSep : HorizontalSep;
  return Styled(rest);
}
```

The design doc should call this out explicitly. Separator is NOT a pure `withStyles()` component.

### S2. Input/Textarea event forwarding — `applyProps()` won't be available in composed primitives

The current `createInputComponent` uses `applyProps(el, attrs)` from `@vertz/ui-primitives/utils` to wire up event handlers on the imperative element. The design shows the composed version using JSX spread:

```tsx
function ComposedInputRoot({ classes, className, ...props }: ComposedInputProps) {
  return <input class={combinedClass} {...props} />;
}
```

JSX spread (`{...props}`) through the Vertz compiler should handle event binding (`onClick`, `onInput`, etc.) automatically. But there are two concerns:

1. **The `...props` rest pattern must exclude `classes`** — otherwise `classes` gets spread as an HTML attribute on `<input>`. The design shows this correctly.

2. **The `[key: string]: unknown` index signature on `ComposedPrimitive`** allows arbitrary props to flow through. This works with JSX spread. But `ComposedInputProps` needs to extend `ElementEventHandlers` (or have a similar index signature) to accept event handlers. The design doc doesn't show the full props interface for `ComposedInput`.

This is not a blocker but needs care during implementation to avoid losing event forwarding. The composed primitives for Input/Textarea/Button MUST accept and forward `...rest` props, including event handlers.

### S3. Table wrapper div — `classes.wrapper` is not mentioned in the styles object

The current `ThemeStyles.table` has keys: `root, header, body, row, head, cell, caption, footer`. No `wrapper` key. The design doc's unknown resolution says:

> The wrapper is structural (enables horizontal scroll), so it belongs in the primitive. The scroll styles can go in the `classes.wrapper` key.

But this means adding a `wrapper` key to the table style definitions in `theme-shadcn/src/styles/table.ts`, and to the `ThemeStyles.table` interface. The existing table styles would need a new entry. This is a minor change, but should be called out in the implementation plan for Phase 3.

Additionally, the current wrapper has inline styles (`position: relative; width: 100%; overflowX: auto; borderCollapse: collapse`). These are structural and belong in the primitive JSX. The composed primitive should hardcode these inline styles on the wrapper div, not put them in classes. Only the `className` passthrough needs the `classes.wrapper` key. The doc should clarify: scroll behavior styles are hardcoded in the primitive; optional visual wrapper styling goes in `classes.wrapper`.

### S4. Breadcrumb's `items[]` prop does not fit the `ComposedPrimitive` + `withStyles()` pattern

Breadcrumb takes an `items: BreadcrumbItem[]` prop and renders a dynamic list of `<li>` elements with separators. This is fundamentally different from the Card/Alert pattern where sub-components are statically composed by the developer.

The design doc lists Breadcrumb under "Phase 3: Complex components" but doesn't show a concrete API. The composed primitive needs to:
- Accept `items[]` and `separator` props
- Render `nav > ol > li*` structure with links, spans, and separator items
- Apply classes to nav, list, item, link, page, and separator elements

This doesn't work with `ComposedPrimitive<K>` + `withStyles()` because:
1. The props interface has `items[]`, `separator`, not just `children` + `classes`
2. There are no sub-components — the entire structure is data-driven

The Breadcrumb composed primitive will need a different approach: it accepts `classes` directly (like the root of any composed primitive) but does NOT use `withStyles()` in theme-shadcn. Instead, theme-shadcn would call the composed primitive directly, passing class strings. This is essentially what the current implementation does, just moving the DOM creation to ui-primitives.

This is fine, but the design doc should acknowledge that Breadcrumb and Pagination are NOT `withStyles()` candidates. They follow a "composed primitive called directly with classes" pattern, not the "withStyles() binding" pattern.

### S5. Pagination reactivity — current page changes won't update the rendered DOM

The current `createPaginationComponent` rebuilds the entire component on each call. But when `ComposedPagination` is a compiled JSX component, the `currentPage` prop needs to drive reactive updates. The `let` reactive state in the Vertz compiler transforms `let` declarations, but props are not `let`-assigned — they come in as function parameters.

When `currentPage` changes (from the parent re-rendering), the Pagination component function would need to be called again. In the Vertz model, if the parent uses `<Pagination currentPage={page} .../>` with a reactive `page` signal, the compiler wraps the prop in a getter. The Pagination component would receive the getter and reactivity flows through.

However, the complex rendering logic (button generation, ellipsis placement, disabled states) all depends on `currentPage`. The `generatePaginationRange()` is called once during initial render. For the reactive model to work, either:
- The entire Pagination component re-executes on prop change (fine for Vertz compiled components), or
- The range computation and DOM construction must be wrapped in reactive derivations.

The Vertz compiler handles this: `const range = generatePaginationRange(currentPage, totalPages, siblingCount)` where `currentPage` is reactive will become a computed derivation. The `.map()` over range items would use `__list()` transforms for efficient updates.

**This should work with the Vertz compiler**, but it's the most complex compiled component being introduced. The implementation should include tests that verify prop-driven re-renders (page change, total change) produce correct DOM updates.

### S6. Badge color → inline style mapping stays in theme-shadcn, but needs DOM access

The design says:

> The composed primitive is just a `<span>` with classes. The color → inline style mapping stays in theme-shadcn.

But the theme-shadcn wrapper needs to apply inline styles conditionally. If theme-shadcn uses `withStyles()`, it gets back a function that applies classes but not inline styles. The wrapper would need to:

```ts
function Badge({ color, ...rest }) {
  const styled = withStyles(ComposedBadge, { base: styles.base });
  const el = styled(rest);
  if (color && colorStyles[color]) {
    Object.assign(el.style, colorStyles[color]); // imperative!
  }
  return el;
}
```

This is imperative DOM manipulation — exactly what we're trying to eliminate. The design should address this. Options:
- (a) The composed primitive accepts a `style` prop (inline styles as an object), which the theme wrapper passes through.
- (b) The theme wrapper renders the composed primitive via JSX: `<ComposedBadge classes={...} style={colorStyle}>{children}</ComposedBadge>`.

Option (b) is cleaner but requires theme-shadcn's badge file to be `.tsx`, which contradicts the design goal of "no JSX in theme-shadcn files."

Option (a) is better: `ComposedBadge` accepts an optional `style` prop and applies it to the `<span>`. The theme wrapper passes it:

```ts
function Badge({ color, ...rest }) {
  return withStyledBadge({ ...rest, style: color ? colorStyles[color] : undefined });
}
```

Wait — `withStyles()` strips `classes` from props but passes everything else through. If `ComposedBadge` accepts `style`, and `withStyles()` produces a function that accepts `Omit<Props, 'classes'>`, then `style` would be part of the accepted props. This works.

But `ComposedPrimitive`'s props type is `{ children?: ChildValue; classes?: ...; [key: string]: unknown }`, so `style` flows through the index signature. The composed primitive needs to explicitly forward `style` to its root element. The design should show this.

---

## Suggestions

### G1. Card context is overhead for purely structural components — acceptable but document the tradeoff

Card, Alert, FormGroup, Avatar are purely structural (divs, headings, spans). Using a context provider for each means every `<Card>` render creates a context scope. This has runtime cost:
- Context creation: allocate object, push to context stack
- Sub-component lookup: `useContext()` call per sub-component

For interactive primitives (Tabs, Dialog) this overhead is justified by the behavioral state being shared. For Card, it's only propagating class strings.

**Alternative**: Sub-components could accept `classes` directly (no context), and `withStyles()` could inject classes into each sub-component individually. But this would require a different `withStyles()` implementation for compound components and break the established pattern.

**Verdict**: The context overhead is negligible (we're talking about microseconds). The consistency benefit outweighs the cost. Keep the pattern. But mention in the doc that this is a conscious tradeoff: consistency over micro-optimization.

### G2. Consider a shared `combineClasses` utility

Every composed component repeats this pattern:

```ts
const combinedClass = [ctx?.classes?.header, className].filter(Boolean).join(' ');
```

A small utility would reduce repetition and potential for bugs:

```ts
function cx(...classes: (string | undefined | false)[]): string | undefined {
  const result = classes.filter(Boolean).join(' ');
  return result || undefined;
}
```

### G3. Phase ordering — Button should be Phase 1, not Phase 4

Button is the most-used component and the one with `as HTMLButtonElement` casts in both theme-shadcn AND ui-primitives. Moving it to the last phase means the cast exists throughout the entire refactor. Suggest swapping Button into Phase 1 (with the other single-element components) and moving Skeleton to Phase 4.

### G4. The `ComposedPrimitive` type's `[key: string]: unknown` index signature is too loose

This allows any prop to be passed, which weakens type checking. For the Input/Textarea/Button composed primitives, this is necessary for event forwarding. But for Card/Alert/Table, there's no reason to accept arbitrary props. Consider splitting into:

- `ComposedPrimitive<K>` — for components with fixed props (Card, Alert, Table)
- `ComposedFormPrimitive<K>` — for components that need prop forwarding (Input, Textarea, Button)

Or keep the current loose type but add specific props interfaces for each composed component (which the design already implies via `ComposedCardProps`, `ComposedInputProps`, etc.).

### G5. Existing ui-primitives Button and Badge are factory-style — clarify relationship

`packages/ui-primitives/src/button/button.tsx` exports `Button.Root(options)` returning `HTMLButtonElement`. The design creates `ComposedButton` as a new composed component. What happens to the existing `Button`? The design should clarify:
- Is `Button.Root()` deprecated?
- Do both coexist? (confusing)
- Is `Button.Root()` removed? (breaking for any direct consumers)

Same for `Badge.Root()` which returns `BadgeElements`.

### G6. Build configuration is fine — no issues with additional .tsx files

The `bunup.config.ts` auto-discovers `src/<component>/<component>.ts(x)` files. New composed files like `card/card-composed.tsx` would be picked up automatically. The `createVertzLibraryPlugin()` compiles all `.tsx` files. No build configuration changes needed. The only thing to verify: the new `.tsx` files follow the naming convention `<component>-composed.tsx` and are properly exported from `src/index.ts`.

### G7. No circular dependency risk

`ui-primitives` depends on `@vertz/ui` (for `createContext`, `useContext`, `ChildValue`). `theme-shadcn` depends on both `@vertz/ui` and `@vertz/ui-primitives`. The dependency direction is strictly one-way:

```
theme-shadcn → ui-primitives → ui
```

The refactor moves code from `theme-shadcn` to `ui-primitives`, which strengthens this direction. No circular dependency risk.

---

## Checklist

| # | Severity | Item | Status |
|---|----------|------|--------|
| B2 | **Blocker** | `ComposedPrimitive` return type `HTMLElement` breaks specific element types in module augmentation | Must fix before implementation |
| S1 | Should-fix | Separator orientation classes don't fit pure `withStyles()` — needs variant wrapper | Document in design |
| S2 | Should-fix | Input/Textarea/Button composed primitives must forward event handler props | Document in design |
| S3 | Should-fix | Table `wrapper` key missing from styles definition | Add to Phase 3 plan |
| S4 | Should-fix | Breadcrumb/Pagination don't fit `withStyles()` pattern | Acknowledge in design |
| S5 | Should-fix | Pagination reactivity needs compiler-driven re-renders — add test plan | Add test criteria |
| S6 | Should-fix | Badge inline color styles need a `style` prop on composed primitive | Address in design |
| G1 | Suggestion | Card context overhead — document as conscious tradeoff | Nice to have |
| G2 | Suggestion | Shared `cx()` / `combineClasses` utility | Nice to have |
| G3 | Suggestion | Move Button to Phase 1 | Consider |
| G4 | Suggestion | Split `ComposedPrimitive` for fixed vs forwarding props | Consider |
| G5 | Suggestion | Clarify relationship with existing Button.Root/Badge.Root | Document |
| G6 | Info | Build config is fine | No action |
| G7 | Info | No circular dependency risk | No action |

---

## Verdict

**Changes Requested.** The blocker B2 (return type widening) must be resolved in the design before implementation can proceed. The should-fix items are all addressable but need to be called out in the design so implementers don't discover them mid-phase.

The overall architecture is sound. The context-based class propagation pattern for compound components works and is proven by Tabs/Dialog/Sheet. The `withStyles()` utility is sufficient for the common case. The phased approach is reasonable.

The main risk is the components that DON'T fit the standard pattern: Separator (variant), Badge (inline styles), Breadcrumb (data-driven), Pagination (complex reactive rendering). Each needs a specific approach documented in the design, not just "convert to withStyles()."
