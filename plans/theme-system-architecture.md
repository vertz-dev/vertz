# Vertz Theme System — Architecture Plan

## Context

Vertz has headless UI primitives (`@vertz/ui-primitives` — 14 accessible components) and a powerful style system (`css()`, `variants()`, `defineTheme()`, `compileTheme()`, `ThemeProvider`), but no reusable styled component layer. Every app must define its own button variants, card styles, form styles from scratch. This blocks adoption — developers want to start building immediately with a polished, professional look.

The goal is to create a theme system where:
- **Primitives are the foundation** — generic, headless, owned by Vertz
- **Themes are a styling layer on top** — swappable without rewriting components
- **First theme is shadcn-inspired** — battle-tested, widely loved design
- **Users NEVER modify theme source** — customization through API, not source editing
- **Multiple themes can coexist** — switching is a one-line import change

## Architecture Overview

```
@vertz/ui                    (core: css, variants, defineTheme, ThemeProvider, JSX, signals)
    ↓
@vertz/ui-primitives         (headless: Dialog, Select, Tabs, etc.)
    ↓
@vertz/ui-theme              (contract: ThemeComponents interface, component prop types)
    ↓
@vertz/theme-shadcn          (implementation: configureTheme(), styled components)
```

### Three new packages

1. **`@vertz/ui-theme`** — The theme contract. Defines the `ThemeComponents` interface and all component prop types (`ButtonProps`, `DialogProps`, etc.). Thin package, mostly types. This is what makes themes swappable — all themes implement the same interface.

2. **`@vertz/theme-shadcn`** — The first concrete theme. Contains styled component implementations, design tokens (5 palette variants: zinc, slate, stone, neutral, gray), and global styles. This is what users install.

3. Minor additions to **`@vertz/ui`** — Add missing color namespaces to `COLOR_NAMESPACES` (e.g., `primaryForeground`, `cardForeground`, `accentForeground`) so themed tokens resolve correctly in the shorthand syntax.

### Why separate `@vertz/ui-theme` from `@vertz/theme-shadcn`?

The contract package makes theme-switching type-safe. When users swap `@vertz/theme-shadcn` for `@vertz/theme-vertz`, the compiler verifies that every component they use exists in both themes with the same props. Without the contract, switching themes could silently break.

## Distribution Model: NPM Package (not code-copy)

**Themes are standard npm packages.** `bun add @vertz/theme-shadcn`. Done.

This explicitly rejects the shadcn/ui "own the code" model because:
- **"One way to do things"** — no CLI code-copy step, no ejection decisions, no "should I modify this?" ambiguity
- **Upgradeable** — `bun update @vertz/theme-shadcn` gets you the latest. No merge conflicts
- **"My LLM nailed it on the first try"** — an LLM reads the types, generates code. No registry protocol to understand
- **Avoids shadcn's core problem** — users can't accidentally modify theme source and break upgrades

## Customization: Three Ordered Layers

Users customize without ever touching theme source code:

### Layer 1: Design token overrides (via `configureTheme()`)
Change colors, spacing, radius globally. All components use CSS custom properties, so token changes cascade everywhere.

```ts
const { theme, globals, components } = configureTheme({
  palette: 'zinc',
  radius: 'lg',
  overrides: {
    tokens: {
      colors: {
        primary: { DEFAULT: '#7c3aed', _dark: '#8b5cf6', 600: '#7c3aed', 700: '#6d28d9' },
      },
    },
  },
});
```

### Layer 2: Variant extensions (via `configureTheme()`)
Add new variant values (e.g., a `brand` intent) or override existing ones.

```ts
configureTheme({
  overrides: {
    variants: {
      button: {
        intent: {
          brand: ['bg:primary', 'text:white', 'rounded:full'],
        },
      },
    },
  },
});
```

### Layer 3: `class` prop (escape hatch)
Every themed component accepts a `class` prop that appends to (never replaces) the theme's classes. For one-off tweaks.

```tsx
<Button intent="primary" class="my-extra-class">Custom</Button>
```

No "slot" system, no "parts" API, no `classNames` map. Three layers, ordered by scope. One way to do things.

## API Surface

### User-facing usage

```ts
// app.tsx
import { compileTheme, ThemeProvider, globalCss } from '@vertz/ui';
import { configureTheme } from '@vertz/theme-shadcn';

// 1. Configure theme (once, at app root)
const { theme, globals, components } = configureTheme({ palette: 'zinc' });

// 2. Compile tokens to CSS custom properties
const compiled = compileTheme(theme);
// Inject compiled.css and globals into the page

// 3. Destructure components
const { Button, Card, CardHeader, CardTitle, CardContent, Input, Label, Dialog } = components;

// 4. Use in JSX — identical API regardless of which theme is installed
export function App() {
  return (
    <ThemeProvider theme="light">
      <Card>
        <CardHeader>
          <CardTitle>My App</CardTitle>
        </CardHeader>
        <CardContent>
          <Button intent="primary" size="md" onClick={() => console.log('clicked')}>
            Click me
          </Button>
        </CardContent>
      </Card>
    </ThemeProvider>
  );
}
```

### Theme switching

Switching themes is a single import change:

```ts
// Before
import { configureTheme } from '@vertz/theme-shadcn';
// After
import { configureTheme } from '@vertz/theme-vertz';

// Everything else is IDENTICAL — same configureTheme() signature, same component names
```

Light/dark mode is runtime (handled by existing `ThemeProvider` + `data-theme` attribute). Theme-package switching is build-time (different import).

### Theme contract types

```ts
// @vertz/ui-theme — what all themes must implement

export interface ResolvedTheme {
  theme: Theme;           // For compileTheme()
  globals: string;        // Reset CSS + base typography
  components: ThemeComponents;
}

export interface ThemeComponents {
  // Simple components (pure JSX, no primitive needed)
  Button: (props: ButtonProps) => HTMLElement;
  Badge: (props: BadgeProps) => HTMLElement;
  Card: (props: CardProps) => HTMLElement;
  CardHeader: (props: CardSectionProps) => HTMLElement;
  CardTitle: (props: CardSectionProps) => HTMLElement;
  CardContent: (props: CardSectionProps) => HTMLElement;
  CardFooter: (props: CardSectionProps) => HTMLElement;
  Input: (props: InputProps) => HTMLInputElement;
  Textarea: (props: TextareaProps) => HTMLTextAreaElement;
  Label: (props: LabelProps) => HTMLLabelElement;
  Separator: (props: SeparatorProps) => HTMLElement;
  // Complex components (backed by @vertz/ui-primitives)
  Dialog: (props: DialogProps) => HTMLElement;
  Select: (props: SelectProps) => HTMLElement;
  Checkbox: (props: CheckboxProps) => HTMLElement;
  Switch: (props: SwitchProps) => HTMLElement;
  Tabs: (props: TabsProps) => HTMLElement;
  Progress: (props: ProgressProps) => HTMLElement;
  Accordion: (props: AccordionProps) => HTMLElement;
  Tooltip: (props: TooltipProps) => HTMLElement;
}
```

## JSX in Library Packages — Key Architectural Finding

**The current state:** Primitives (`@vertz/ui-primitives`) use `document.createElement()` because the Vertz compiler only runs at app build time (via the Bun plugin). Library packages use `bunup`/tsc which has no JSX configured.

**The solution:** `@vertz/ui` already ships a `jsx-runtime.ts` — a simple DOM factory implementing the React automatic JSX runtime. Library packages can use JSX by adding `jsx: "react-jsx"` + `jsxImportSource: "@vertz/ui"` to their `tsconfig.json`. The basic runtime handles element creation, attributes, event listeners, and children. The only thing lost without the compiler is the automatic `let` → signal transform — library code uses explicit `signal()` calls instead.

**This applies to both `@vertz/ui-primitives` and `@vertz/theme-shadcn`** — both are npm packages that need JSX support without the compiler.

### Theme component approach: All JSX, explicit signals for state

```ts
// Simple component — pure JSX, no state needed
function ThemedButton({ intent, size, class: className, children, onClick }: ButtonProps) {
  const classes = [buttonVariants({ intent, size }), className].filter(Boolean).join(' ');
  return (
    <button type="button" class={classes} onClick={onClick}>
      {children}
    </button>
  );
}

// Complex component — JSX with explicit signal() for state
import { signal } from '@vertz/ui';

function ThemedDialog({ modal = true, onOpenChange, children }: DialogProps) {
  const isOpen = signal(false);
  const titleId = `dialog-${uid()}`;

  return (
    <div>
      <div
        class={dialogStyles.overlay}
        aria-hidden={isOpen.value ? 'false' : 'true'}
        style={isOpen.value ? '' : 'display: none'}
        onClick={() => { isOpen.value = false; onOpenChange?.(false); }}
      />
      <div
        role="dialog"
        aria-modal={modal ? 'true' : undefined}
        aria-labelledby={titleId}
        class={dialogStyles.content}
        style={isOpen.value ? '' : 'display: none'}
      >
        {children}
      </div>
    </div>
  );
}
```

### Evolving primitives to JSX — separate workstream

Refactoring `@vertz/ui-primitives` from imperative to declarative JSX is valuable but separate from the theme work. When done, themed components will compose primitives like `<Dialog.Overlay class={styles.overlay} />`. Until then, themed components implement their own declarative JSX with ARIA/keyboard support directly (following the same pattern as the existing `ConfirmDialog` example).

### Custom elements for form integration — future consideration

Components that interact with the native `<form>` API (Select, Checkbox, Switch returning non-string values) may need custom elements internally so they participate in `FormData`. The theme would wrap these in JSX components for DX. This is a separate architectural decision to explore when form integration is prioritized.

## Token Architecture: `COLOR_NAMESPACES` Extension

**Critical finding:** The token resolver in `@vertz/ui` uses a hardcoded `COLOR_NAMESPACES` set to validate color references in shorthand syntax. For shadcn-style semantic tokens, we need to add compound foreground namespaces.

Current `COLOR_NAMESPACES` includes: `primary`, `secondary`, `accent`, `background`, `foreground`, `muted`, `surface`, `destructive`, `danger`, `success`, `warning`, `info`, `border`, `ring`, `input`, `card`, `popover`, `gray`.

**Needs addition:** `primary-foreground`, `secondary-foreground`, `accent-foreground`, `destructive-foreground`, `muted-foreground`, `card-foreground`, `popover-foreground` — using kebab-case to match CSS custom property conventions.

Usage in shorthand: `text:primary-foreground` → resolves to `var(--color-primary-foreground)`.

Token definition in JS uses camelCase keys (standard JS convention), but the `compileTheme()` output and shorthand resolution use kebab-case:
```ts
// In defineTheme()
colors: {
  primaryForeground: { DEFAULT: '#fff', _dark: '#000' },
}
// Generates: --color-primaryForeground (needs mapping to kebab)
```

**Note:** `compileTheme()` currently generates var names by concatenating `--color-${name}`. For kebab-case resolution, we need to either:
- Use kebab-case keys in the theme definition (`'primary-foreground'`), or
- Add a camelCase-to-kebab transform in `compileTheme()`

**Decision:** Use kebab-case keys directly in theme definitions (`'primary-foreground': { DEFAULT: '#fff', _dark: '#000' }`). This is valid JS, matches CSS conventions, and avoids transformation complexity.

**Files to modify:**
- `packages/ui/src/css/token-tables.ts` — add kebab-case foreground namespaces to `COLOR_NAMESPACES`

For `radius` tokens (not in `compileTheme()` today), use `globalCss()` to inject CSS custom properties. Extending `compileTheme()` to support radius/typography is a natural follow-up but not required for Phase 1.

## Non-Goals

- **Runtime switching between theme packages** — switching from shadcn to vertz-custom is a build-time import change, not runtime
- **CLI for theme scaffolding** — no `vertz add button`. Themes are npm packages
- **Visual theme builder/configurator** — out of scope
- **Component animation system** — separate concern
- **Extending `compileTheme()` with radius/typography** — `globalCss()` covers the gap for now
- **Refactoring `@vertz/ui-primitives` to JSX** — valuable but separate workstream. Theme components implement their own declarative JSX for now
- **Custom elements for form integration** — separate architectural decision for when form-interactive components (Select, Checkbox returning non-string values) need to participate in native `FormData`

## Implementation Phases

### Phase 1: Contract Package (`@vertz/ui-theme`) + COLOR_NAMESPACES extension

**Files:**
- `packages/ui-theme/package.json` — new package, depends on `@vertz/ui` and `@vertz/ui-primitives`
- `packages/ui-theme/tsconfig.json` — extends root, no JSX needed (types-only package)
- `packages/ui-theme/src/types.ts` — `ThemeTokens`, `ThemeOverrides`, `ResolvedTheme`, `ThemeComponents`
- `packages/ui-theme/src/props.ts` — All component prop interfaces
- `packages/ui-theme/src/index.ts` — Public barrel export
- `packages/ui/src/css/token-tables.ts` — Add kebab-case foreground namespaces to `COLOR_NAMESPACES`

**Integration test:** Type-level test verifying `ThemeComponents` can be implemented, destructured, and components called with correct props. `@ts-expect-error` on missing required components.

### Phase 2: Shadcn Theme — Tokens + Simple Components

**Files:**
- `packages/theme-shadcn/package.json` — depends on `@vertz/ui-theme`, `@vertz/ui`, `@vertz/ui-primitives`
- `packages/theme-shadcn/tsconfig.json` — extends root, adds `"jsx": "react-jsx"`, `"jsxImportSource": "@vertz/ui"` for JSX support via the basic runtime
- `packages/theme-shadcn/src/tokens.ts` — Default tokens for 5 palettes with light/dark
- `packages/theme-shadcn/src/globals.ts` — Reset CSS + base typography
- `packages/theme-shadcn/src/configure.ts` — `configureTheme()` factory
- `packages/theme-shadcn/src/utils/merge.ts` — Deep partial token merge utility
- `packages/theme-shadcn/src/components/button.tsx` through `separator.tsx` — Simple components (pure JSX, no state)

**Integration test:** `configureTheme({ palette: 'zinc' })` returns valid `ResolvedTheme`. Components render as `HTMLElement` with scoped class names. Token overrides produce different CSS custom property values.

### Phase 3: Complex Components (JSX + explicit signals)

**Files:**
- `packages/theme-shadcn/src/components/dialog.tsx` — declarative JSX with `signal()` for open/close state, ARIA attributes, focus trap, keyboard (Escape to close)
- `packages/theme-shadcn/src/components/select.tsx` — JSX with keyboard navigation, ARIA listbox pattern
- `packages/theme-shadcn/src/components/tabs.tsx` — JSX with arrow key navigation, ARIA tablist pattern
- `packages/theme-shadcn/src/components/checkbox.tsx`, `switch.tsx`, `progress.tsx`, `accordion.tsx`, `tooltip.tsx`

All complex components use explicit `signal()` calls (not `let`) since they're library code without the compiler. They implement ARIA and keyboard patterns directly in JSX (same approach as the existing `ConfirmDialog` example).

**Integration test:** Complex components render with correct ARIA attributes and keyboard navigation. Dialog opens/closes with Escape, Select handles arrow keys, Tabs switch on arrow key press.

### Phase 4: Customization System + Developer Walkthrough

**Deliverables:**
- Deep-partial token merge tested end-to-end
- Variant extension system tested (adding new `intent` values)
- `class` prop append behavior on all components
- Developer walkthrough: fresh app using theme with customizations

**Integration test (walkthrough):**
```ts
import { configureTheme } from '@vertz/theme-shadcn';
import { compileTheme, ThemeProvider } from '@vertz/ui';

const { theme, globals, components } = configureTheme({
  palette: 'slate',
  overrides: { tokens: { colors: { primary: { DEFAULT: '#7c3aed', _dark: '#8b5cf6' } } } },
});
const { Button, Card } = components;
const compiled = compileTheme(theme);
// Verify: compiled.css contains '#7c3aed', components render, class prop appends
```

### Phase 5: Migrate Task-Manager Example

**Files to modify:**
- `examples/task-manager/src/styles/theme.ts` — replace with `configureTheme()` call
- `examples/task-manager/src/styles/components.ts` — remove (replaced by theme components)
- `examples/task-manager/src/components/*.tsx` — use theme components instead of hand-written styles

**Acceptance criteria:**
- Task manager renders with shadcn-inspired styling
- Dark mode toggle still works
- No hand-written `variants()` calls for standard UI components remain

## Verification

1. **Type safety:** `bun run typecheck` on all new packages + `@vertz/integration-tests`
2. **Unit tests:** Each component renders correct HTML structure and CSS classes
3. **Integration tests:** `configureTheme()` → `compileTheme()` → component rendering end-to-end
4. **Theme switching:** Type-level test proving a second mock theme satisfies `ThemeComponents`
5. **Customization:** Token overrides, variant extensions, and `class` prop all work without source modification
6. **Example:** Task-manager runs with the new theme system
