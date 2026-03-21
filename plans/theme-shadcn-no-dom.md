# Design: Move DOM Creation from theme-shadcn to ui-primitives

## Problem

PR #1683 converted theme-shadcn components from `document.createElement` to JSX. While this fixed hydration, the fundamental issue remains: **theme-shadcn is creating DOM elements**. The package should only define styles and apply them to primitives via `withStyles()` — all DOM creation belongs in `@vertz/ui-primitives`.

Additionally:
- theme-shadcn exports individual factory functions (`createCardComponents`, `createButtonComponent`, etc.) that shouldn't exist. The package should exclusively export `configureTheme` for registration.
- There are unnecessary element casts (`as HTMLElement`, etc.) throughout both packages.

## Manifesto Alignment

- **Separation of concerns**: DOM structure (ui-primitives) vs styling (theme-shadcn)
- **Composability**: `withStyles()` is the established pattern for binding styles to primitives
- **Single responsibility**: theme-shadcn = style definitions + registration. That's it.

## Target Architecture

```
User app:
  import { configureTheme } from '@vertz/theme-shadcn';
  import { registerTheme } from '@vertz/ui';
  registerTheme(configureTheme({ palette: 'zinc' }));

  // Then use components:
  import { Card, Button, Input } from '@vertz/ui/components';

How it works internally:
  configureTheme()
    → builds style definitions (css(), variants())
    → calls withStyles(ComposedCard, cardClasses)     // from ui-primitives
    → calls withStyles(ComposedInput, inputClasses)    // from ui-primitives
    → calls withStyles(ComposedAlert, alertClasses)    // etc.
    → returns { theme, globals, styles, components }

  registerTheme(config)
    → stores config.components in global registry

  @vertz/ui/components proxies
    → look up from registry at call time
```

**theme-shadcn exports ONLY:**
- `configureTheme()` — returns the full config for `registerTheme()`
- Types for the theme config/styles

**No individual factory exports.** No `createCardComponents`, `createButtonComponent`, etc. All component wiring happens inside `configureTheme()` via `withStyles()`.

## API Surface

### Before (current state)

theme-shadcn has ~15 factory files in `src/components/` that create DOM:

```ts
// theme-shadcn/src/components/card.ts — WRONG: creates DOM, exports factory
export function createCardComponents(cardStyles) {
  function Card({ children }) {
    const el = document.createElement('div');
    el.className = cardStyles.root;
    for (const node of resolveChildren(children)) el.appendChild(node);
    return el;
  }
  // ...
}

// theme-shadcn/src/configure.ts — calls factories
const components = {
  Card: createCardComponents(cardStyles),   // factory call
  Button: createButtonComponent(buttonStyles), // factory call
  // ...
};
```

### After (target)

theme-shadcn component factory files **deleted**. `configure.ts` wires everything via `withStyles()`:

```ts
// theme-shadcn/src/configure.ts — NO factories, just withStyles()
import {
  ComposedAlert, ComposedAvatar, ComposedBadge, ComposedBreadcrumb,
  ComposedButton, ComposedCard, ComposedFormGroup, ComposedInput,
  ComposedLabel, ComposedPagination, ComposedSeparator, ComposedSkeleton,
  ComposedTable, ComposedTextarea,
  withStyles,
} from '@vertz/ui-primitives';

export function configureTheme(config?: ThemeConfig) {
  const { theme, globals } = configureThemeBase(config);

  // Build style definitions
  const cardStyles = createCard();
  const inputStyles = createInput();
  // ...

  // Wire components via withStyles() — NO DOM creation here
  const components = {
    Card: withStyles(ComposedCard, {
      root: cardStyles.root,
      header: cardStyles.header,
      title: cardStyles.title,
      // ...
    }),
    Input: withStyles(ComposedInput, { base: inputStyles.base }),
    Button: createThemedButton(buttonStyles), // variant wrapper, still no DOM
    Alert: createThemedAlert(alertStyles),     // variant wrapper, still no DOM
    // ...
    primitives: {
      Dialog: withStyles(ComposedDialog, dialogClasses),
      Tabs: createThemedTabs(tabsStyles), // existing pattern, already correct
      // ...
    },
  };

  return { theme, globals, styles, components };
}
```

For components with variants (Alert, Button, Separator), thin wrapper functions live inside `configure.ts` (or a small internal helper module). These wrappers select which `withStyles()` result to use based on the variant prop — same pattern as the existing Tabs wrapper. **They never create DOM**.

```ts
// Inside configure.ts — variant wrapper for Alert (internal, not exported)
function createThemedAlert(styles: AlertStyleClasses) {
  const Default = withStyles(ComposedAlert, {
    root: styles.root, title: styles.title, description: styles.description,
  });
  const Destructive = withStyles(ComposedAlert, {
    root: [styles.root, styles.destructive].join(' '),
    title: styles.title, description: styles.description,
  });

  function AlertRoot({ variant, ...rest }) {
    return (variant === 'destructive' ? Destructive : Default)(rest);
  }
  return Object.assign(AlertRoot, {
    AlertTitle: ComposedAlert.Title,
    AlertDescription: ComposedAlert.Description,
  });
}
```

### Composed primitives in ui-primitives

New composed JSX components that accept a `classes` prop:

```tsx
// ui-primitives/src/card/card-composed.tsx
export interface CardClasses {
  root?: string; header?: string; title?: string;
  description?: string; content?: string; footer?: string; action?: string;
}

const CardContext = createContext<{ classes?: CardClasses } | undefined>(
  undefined, '@vertz/ui-primitives::CardContext',
);

function ComposedCardRoot({ children, classes, className, class: classProp }: ComposedCardProps) {
  const effectiveCls = className ?? classProp;
  const combinedClass = [classes?.root, effectiveCls].filter(Boolean).join(' ');
  return (
    <CardContext.Provider value={{ classes }}>
      <div class={combinedClass}>{children}</div>
    </CardContext.Provider>
  );
}

function CardHeader({ children, className, class: classProp }: SlotProps) {
  const ctx = useContext(CardContext);
  const effectiveCls = className ?? classProp;
  const combinedClass = [ctx?.classes?.header, effectiveCls].filter(Boolean).join(' ');
  return <div class={combinedClass}>{children}</div>;
}
// ... Title (<h3>), Description (<p>), Content, Footer, Action

export const ComposedCard = Object.assign(ComposedCardRoot, {
  Header: CardHeader, Title: CardTitle, Description: CardDescription,
  Content: CardContent, Footer: CardFooter, Action: CardAction,
});
```

Single-element components (no sub-components, no context):

```tsx
// ui-primitives/src/input/input-composed.tsx
export interface InputClasses { base?: string; }

function ComposedInputRoot({ classes, className, class: classProp, ...props }: ComposedInputProps) {
  const effectiveCls = className ?? classProp;
  const combinedClass = [classes?.base, effectiveCls].filter(Boolean).join(' ');
  return <input class={combinedClass} {...props} />;
}
```

Data-driven components (Breadcrumb, Pagination) accept `classes` directly:

```tsx
// ui-primitives/src/breadcrumb/breadcrumb-composed.tsx
export function ComposedBreadcrumb({ items, separator = '/', classes, className }: Props) {
  // renders nav > ol > li structure using classes — no hardcoded styles
}
```

## Type System Changes

### `ComposedPrimitive` needs element type parameter

Current `ComposedPrimitive` returns `HTMLElement`, but `ThemeComponentMap` declares specific types (`HTMLInputElement`, etc.). Fix:

```ts
// Before
export interface ComposedPrimitive<K extends string = string> {
  (props: { ... }): HTMLElement;
}

// After — generic over element type
export interface ComposedPrimitive<K extends string = string, E extends Element = HTMLElement> {
  (props: { ... }): E;
  __classKeys?: K;
  __elementType?: E;
}

export type ElementOf<C> = C extends ComposedPrimitive<string, infer E> ? E : HTMLElement;

export type StyledPrimitive<C extends ComposedPrimitive> = ((
  props: Omit<Parameters<C>[0], 'classes'>,
) => ElementOf<C>) & Omit<C, '__classKeys' | '__elementType' | keyof CallableFunction>;
```

## Files to Delete from theme-shadcn

All component factory files in `src/components/`:

- `alert.ts` (or `.tsx` after #1683)
- `avatar.ts` / `avatar.tsx`
- `badge.ts` / `badge.tsx`
- `breadcrumb.ts` / `breadcrumb.tsx`
- `button.tsx`
- `card.ts` / `card.tsx`
- `form-group.ts` / `form-group.tsx`
- `input.ts` / `input.tsx`
- `label.ts` / `label.tsx`
- `pagination.ts` / `pagination.tsx`
- `separator.ts` / `separator.tsx`
- `skeleton.ts` / `skeleton.tsx`
- `table.ts` / `table.tsx`
- `textarea.ts` / `textarea.tsx`

The `src/components/primitives/` subfolder files that already use `withStyles()` (like `tabs.ts`, `dialog.ts`, `checkbox.ts`, etc.) are fine and stay. The ones with JSX casts (`drawer.tsx`, `button.tsx`) get their casts removed.

## Composed Primitives to Create in ui-primitives

### Compound (need context + sub-components)

| Component | Sub-components | HTML elements |
|-----------|---------------|---------------|
| Card | Header, Title, Description, Content, Footer, Action | div, h3, p |
| Alert | Title, Description | div (role=alert), h5 |
| FormGroup | FormError | div, span |
| Avatar | Image, Fallback | div, img |
| Table | Header, Body, Row, Head, Cell, Caption, Footer | div (scroll wrapper), table, thead, tbody, tr, th, td, caption, tfoot |

### Single-element (no context)

| Component | HTML element | Props forwarded |
|-----------|-------------|-----------------|
| Input | input | name, placeholder, type, disabled, value, events |
| Textarea | textarea | name, placeholder, disabled, value, rows, events |
| Label | label | for (htmlFor) |
| Separator | hr | orientation → role, aria-orientation |
| Skeleton | div | width, height, style → aria-hidden |
| Button | button | type, disabled, events |
| Badge | span | style (for inline colors from theme) |

### Data-driven (accept data, render full structure)

| Component | Key props |
|-----------|-----------|
| Breadcrumb | items[], separator |
| Pagination | currentPage, totalPages, onPageChange, siblingCount |

## Non-Goals

- **No behavioral changes**: purely structural composed primitives. Existing composed primitives (dialog, tabs, select, etc.) untouched.
- **No removal of deprecated `class` prop**: carry forward for backward compat.
- **No new features**: structural refactor only.

## Allowed Breaking Changes (pre-v1)

- Suite component shapes in `ThemeComponentMap` may change (e.g., `Card` becomes callable with `.Header` etc. instead of `{ Card, CardHeader, ... }`)
- `ComposedPrimitive` type gains second type parameter (existing code unaffected via default)
- `StyledPrimitive` return type becomes more specific (strictly more correct)

## Unknowns (Resolved)

1. **Table wrapper div** — structural, goes in primitive. Add `wrapper` class key.
2. **Pagination `generatePaginationRange()`** — moves to ui-primitives (behavioral, not styling).
3. **Badge inline color styles** — composed primitive accepts `style` prop. Theme computes and passes styles.
4. **Pagination SVG icons** — structural, live in composed primitive with `aria-hidden`.

## E2E Acceptance Test

```ts
describe('Feature: theme-shadcn is style-only', () => {
  describe('Given theme-shadcn source', () => {
    it('Then src/components/ contains no factory files', () => {});
    it('Then no file in the package calls document.createElement', () => {});
    it('Then no .tsx files exist outside primitives/ subfolder', () => {});
    it('Then the only export is configureTheme() and types', () => {});
  });

  describe('Given a registered theme', () => {
    describe('When rendering Card from @vertz/ui/components', () => {
      it('Then produces correct DOM with theme classes', () => {});
    });
    describe('When rendering Input and typing', () => {
      it('Then event handlers fire correctly', () => {});
    });
    describe('When rendering Alert with variant="destructive"', () => {
      it('Then applies both root and destructive classes', () => {});
    });
  });

  describe('Given ComposedCard from ui-primitives (no theme)', () => {
    it('Then renders correct semantic HTML without any styling', () => {});
    it('Then sub-components receive classes from context', () => {});
  });
});
```

## Implementation Phases

All phases ship as a single PR.

### Phase 1: Type system + single-element composed primitives

**ui-primitives:**
- Extend `ComposedPrimitive<K, E>` in `with-styles.ts`
- Create: `ComposedInput`, `ComposedTextarea`, `ComposedLabel`, `ComposedSeparator`, `ComposedSkeleton`, `ComposedButton`, `ComposedBadge`
- Tests for each: semantic HTML, class application, prop forwarding, event handlers

**theme-shadcn:**
- Delete: `input.ts`, `textarea.ts`, `label.ts`, `separator.ts`, `skeleton.ts`, `badge.ts`, `button.tsx`
- Update `configure.ts`: wire via `withStyles()` + variant wrappers for Button/Separator
- Remove casts from `ui-primitives/src/badge/badge.tsx`, `ui-primitives/src/button/button.tsx`

### Phase 2: Compound composed primitives

**ui-primitives:**
- Create: `ComposedCard`, `ComposedAlert`, `ComposedFormGroup`, `ComposedAvatar`
- Tests: context-based class distribution, semantic elements, ARIA attributes

**theme-shadcn:**
- Delete: `card.ts`, `alert.ts`, `form-group.ts`, `avatar.ts`
- Update `configure.ts`: wire via `withStyles()` + Alert variant wrapper
- Update `index.ts` module augmentation if types changed

### Phase 3: Table + data-driven + final cleanup

**ui-primitives:**
- Create: `ComposedTable`, `ComposedBreadcrumb`, `ComposedPagination`
- Move `generatePaginationRange()` to ui-primitives
- Tests: Table scroll wrapper, Breadcrumb aria/nav structure, Pagination page range + edge cases

**theme-shadcn:**
- Delete: `table.ts`, `breadcrumb.ts`, `pagination.ts`
- Update `configure.ts`: wire via `withStyles()` / thin wrappers
- Remove casts from `primitives/drawer.tsx`
- Verify: zero `document.createElement` in package, zero exported factories, zero `as HTML*Element` casts in source

**Acceptance (all phases):**
- All existing theme-shadcn tests pass (may need updating for new component shapes)
- 95%+ coverage on all new composed primitives
- Semantic HTML preserved (roles, aria-*, scope, etc.)
- `withStyles()` preserves specific element return types (type tests)
