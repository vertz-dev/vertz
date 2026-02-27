# Vertz Theme System -- Architecture Plan

## Context

Vertz has headless UI primitives (`@vertz/ui-primitives` -- 14 accessible components) and a powerful style system (`css()`, `variants()`, `defineTheme()`, `compileTheme()`, `ThemeProvider`), but no reusable style layer. Every app must define its own button variants, card styles, form styles from scratch. This blocks adoption -- developers want to start building immediately with a polished, professional look.

The goal is to create a theme system where:
- **Primitives are the foundation** -- generic, headless, owned by Vertz
- **Themes are a style-definition layer** -- pre-built `variants()` and `css()` definitions, not components
- **First theme is shadcn-inspired** -- battle-tested, widely loved design
- **Users NEVER modify theme source** -- customization through token overrides and config-object spread
- **One way to do things** -- `configureTheme()` is the single entry point; variant customization is via explicit config spread

## Architecture Overview

```
@vertz/ui                    (core: css, variants, defineTheme, compileTheme, globalCss, ThemeProvider)
    |
@vertz/theme-shadcn          (style definitions: configureTheme(), token palettes, variants/css configs)
```

### One new package: `@vertz/theme-shadcn`

The theme package exports **style definitions** -- pre-built `variants()` and `css()` calls using the same primitives users already know. No JSX. No components. No separate contract package.

**Why no `@vertz/ui-theme` contract package?** It's YAGNI for a single theme. Pre-v1, breaking changes are encouraged. If a second theme is ever needed, the contract can be extracted then.

**Why no JSX components?** The `jsx-runtime.ts` in `@vertz/ui` is a one-shot DOM factory. `signal()` attributes don't update after initial render in library packages (no compiler). Exporting style definitions eliminates this problem entirely -- users write their own JSX in app code where the compiler handles reactivity.

### Minor additions to `@vertz/ui`

- Add kebab-case compound foreground namespaces to `COLOR_NAMESPACES` in `token-tables.ts`
- Add collision validation in `compileTheme()` -- throw if a namespace+shade produces the same CSS variable as a compound namespace
- Add camelCase validation in `compileTheme()` -- throw if any color token key contains uppercase letters

## Distribution Model: NPM Package (not code-copy)

**Themes are standard npm packages.** `bun add @vertz/theme-shadcn`. Done.

This explicitly rejects the shadcn/ui "own the code" model because:
- **"One way to do things"** -- no CLI code-copy step, no ejection decisions, no "should I modify this?" ambiguity
- **Upgradeable** -- `bun update @vertz/theme-shadcn` gets you the latest. No merge conflicts
- **"My LLM nailed it on the first try"** -- an LLM reads the types, generates code. No registry protocol to understand
- **Avoids shadcn's core problem** -- users can't accidentally modify theme source and break upgrades

## API Surface

### Single entry point: `configureTheme()`

```ts
// app.tsx
import { compileTheme, ThemeProvider } from '@vertz/ui';
import { configureTheme } from '@vertz/theme-shadcn';

// 1. Configure theme (globals auto-injected via globalCss())
const { theme, globals, styles } = configureTheme({ palette: 'zinc' });

// 2. Destructure style definitions
const { button, card, input, badge, label, separator } = styles;

// 3. Compile tokens to CSS custom properties
const compiled = compileTheme(theme);

// 4. Use in JSX -- styles work exactly like hand-written variants()/css()
export function App() {
  return (
    <ThemeProvider theme="light">
      <div class={card.root}>
        <div class={card.header}>
          <h3 class={card.title}>My App</h3>
        </div>
        <div class={card.content}>
          <button class={button({ intent: 'primary', size: 'md' })}>
            Click me
          </button>
        </div>
      </div>
    </ThemeProvider>
  );
}

// SSR: globals.css and compiled.css available as strings
export const ssrStyles = [globals.css, compiled.css];
```

### With customization

```ts
import { compileTheme } from '@vertz/ui';
import { configureTheme } from '@vertz/theme-shadcn';

const { theme, globals, styles } = configureTheme({
  palette: 'slate',
  radius: 'lg',
  overrides: {
    tokens: {
      colors: {
        primary: { DEFAULT: '#7c3aed', _dark: '#8b5cf6' },
      },
    },
  },
});

const compiled = compileTheme(theme);
const { button, card, input } = styles;

// Same usage pattern -- token overrides cascade via CSS custom properties
```

### Variant customization via config-object spread

For adding or overriding variant values, users import config objects and spread them into their own `variants()` call. This is the ONLY way to customize variants -- explicit, type-safe, works today with the existing `variants()` API.

```ts
import { buttonConfig } from '@vertz/theme-shadcn/configs';
import { variants } from '@vertz/ui';

const myButton = variants({
  ...buttonConfig,
  variants: {
    ...buttonConfig.variants,
    intent: {
      ...buttonConfig.variants.intent,
      brand: ['bg:primary', 'text:white', 'rounded:full'],
    },
  },
});
// TypeScript infers: intent has 'primary' | 'secondary' | 'danger' | 'ghost' | 'brand'
```

### Theme switching

Switching themes is a single import change:

```ts
// Before
import { configureTheme } from '@vertz/theme-shadcn';
// After
import { configureTheme } from '@vertz/theme-vertz';

// Everything else is IDENTICAL -- same configureTheme() signature, same style names
```

Light/dark mode is runtime (handled by existing `ThemeProvider` + `data-theme` attribute). Theme-package switching is build-time (different import).

## `configureTheme()` Specification

### Signature

```ts
import type { GlobalCSSOutput } from '@vertz/ui';

interface ThemeConfig {
  palette?: 'zinc' | 'slate' | 'stone' | 'neutral' | 'gray';  // default: 'zinc'
  radius?: 'sm' | 'md' | 'lg';                                  // default: 'md'
  overrides?: {
    tokens?: DeepPartial<ColorTokens>;
  };
}

interface ResolvedTheme {
  theme: Theme;              // Pass to compileTheme() to generate CSS custom properties
  globals: GlobalCSSOutput;  // Auto-injected via globalCss(); .css string available for SSR
  styles: ThemeStyles;       // Pre-built variant functions and css() results
}

function configureTheme(config?: ThemeConfig): ResolvedTheme;
```

### Behavior

- **Palette selection** -- picks one of 5 pre-defined token sets
- **Radius selection** -- injects `--radius` custom property via the globals
- **Token overrides** -- deep-merges user overrides into the selected palette's token definitions
- **Globals injection** -- calls `globalCss()` internally, which auto-injects the reset/typography CSS into the DOM (matching the established `globalCss()` behavior in `@vertz/ui`). The `.css` property on the returned `GlobalCSSOutput` is available for SSR extraction.
- **Style construction** -- calls `variants()` and `css()` internally to build all style definitions
- **Does NOT support variant extension** -- `configureTheme()` only handles tokens, palette, and radius

### Return values

- **`theme`** -- a `Theme` object (from `defineTheme()`) for passing to `compileTheme()`
- **`globals`** -- a `GlobalCSSOutput` from `globalCss()`. Auto-injected into the DOM (same behavior as `globalCss()` everywhere else in `@vertz/ui`). Contains CSS reset, base typography, and radius custom property. The `.css` string is available for SSR extraction.
- **`styles`** -- an object of pre-built `VariantFunction` and `css()` results:
  - `button` -- `VariantFunction` with `intent` and `size` variants
  - `badge` -- `VariantFunction` with `color` variant
  - `card` -- `css()` result with `root`, `header`, `title`, `content`, `footer` class names
  - `input` -- `css()` result or `VariantFunction`
  - `label` -- `css()` result
  - `separator` -- `css()` result
  - `formGroup` -- `css()` result

### Package exports

- `configureTheme` -- the single entry point (function)
- `type ThemeConfig` -- for TypeScript consumers
- `type ResolvedTheme` -- for TypeScript consumers
- Config objects via subpath `@vertz/theme-shadcn/configs`:
  - `buttonConfig`, `badgeConfig` -- `VariantsConfig` objects for variant customization via spread

## Customization: Two Layers

### Layer 1: Token overrides (via `configureTheme()`)

Change colors globally. All style definitions use CSS custom properties, so token changes cascade everywhere.

```ts
const { theme, globals, styles } = configureTheme({
  palette: 'zinc',
  radius: 'lg',
  overrides: {
    tokens: {
      colors: {
        primary: { DEFAULT: '#7c3aed', _dark: '#8b5cf6' },
      },
    },
  },
});
```

### Layer 2: Variant customization (via config-object spread)

Import config objects and spread to add/override variant values:

```ts
import { buttonConfig } from '@vertz/theme-shadcn/configs';
import { variants } from '@vertz/ui';

const myButton = variants({
  ...buttonConfig,
  variants: {
    ...buttonConfig.variants,
    intent: {
      ...buttonConfig.variants.intent,
      brand: ['bg:primary', 'text:white', 'rounded:full'],
    },
  },
});
```

No "slot" system, no "parts" API, no `classNames` map. Two layers, each with a single clear mechanism.

## Token Architecture

### `COLOR_NAMESPACES` extension

The token resolver in `@vertz/ui` uses a hardcoded `COLOR_NAMESPACES` set. For shadcn-style semantic tokens, add compound foreground namespaces using kebab-case:

**Current:** `primary`, `secondary`, `accent`, `background`, `foreground`, `muted`, `surface`, `destructive`, `danger`, `success`, `warning`, `info`, `border`, `ring`, `input`, `card`, `popover`, `gray`.

**Additions:** `primary-foreground`, `secondary-foreground`, `accent-foreground`, `destructive-foreground`, `muted-foreground`, `card-foreground`, `popover-foreground`.

Usage: `text:primary-foreground` resolves to `var(--color-primary-foreground)`.

### Kebab-case keys enforced

Token definitions use kebab-case keys: `'primary-foreground': { DEFAULT: '#fff', _dark: '#000' }`.

`compileTheme()` generates `--color-primary-foreground` directly. No camelCase-to-kebab transform needed.

**Validation:** `compileTheme()` throws if any color token key contains uppercase letters:

```ts
for (const name of Object.keys(theme.colors)) {
  if (/[A-Z]/.test(name)) {
    throw new Error(
      `Color token '${name}' uses camelCase. Use kebab-case to match CSS custom property naming.`
    );
  }
}
```

### CSS variable collision prevention

`compileTheme()` validates that no namespace+shade combination collides with a compound namespace:

```ts
for (const [name, values] of Object.entries(theme.colors)) {
  for (const key of Object.keys(values)) {
    if (key === 'DEFAULT' || key.startsWith('_')) continue;
    const compoundName = `${name}-${key}`;
    if (COLOR_NAMESPACES.has(compoundName)) {
      throw new Error(
        `Token collision: '${name}.${key}' produces CSS variable '--color-${name}-${key}' ` +
        `which conflicts with semantic token '${compoundName}'.`
      );
    }
  }
}
```

Build-time error. "If it builds, it works."

## Complex Components (Dialog, Select, Tabs, etc.)

Complex interactive components are NOT in the theme package. Users compose them from `@vertz/ui-primitives` + theme styles in their app code, where the compiler handles reactivity:

```tsx
// User's confirm-dialog.tsx
import { Dialog } from '@vertz/ui-primitives';
import { css } from '@vertz/ui';

const dialogStyles = css({
  overlay: ['fixed', 'inset:0', 'bg:gray.900', 'opacity:50'],
  panel: ['bg:background', 'rounded:lg', 'shadow:xl', 'p:6'],
});

export function ConfirmDialog({ title, onConfirm }: Props) {
  let isOpen = false;
  // ... compose Dialog primitive with theme styles
}
```

This is exactly what the task-manager example already does. The theme just replaces hand-written `button = variants({...})` with `const { button } = styles`.

## Manifesto Alignment

### "One way to do things"

There's only `variants()` and `css()`. The theme provides pre-built definitions using these same primitives. No new paradigm, no new API surface to learn. `configureTheme()` is the single entry point. Variant customization is via config-object spread -- one mechanism.

### "My LLM nailed it on the first try"

LLMs already know `variants()` and `css()`. Single import, single function call. The config-object spread pattern is standard JavaScript -- no framework-specific magic.

### "If it builds, it works"

TypeScript types on `variants()` are battle-tested. `compileTheme()` validates token collisions and camelCase at build time. `@ts-expect-error` tests verify invalid usage is rejected.

### "Explicit over implicit"

- No hidden class resolution or specificity magic
- No opaque component wrapping -- users see and control their JSX
- Variant customization is explicit spread, not hidden merge
- `globalCss()` auto-injection follows the established pattern in `@vertz/ui` -- consistent, not surprising

### Tradeoffs accepted

- **Convention over configuration** -- kebab-case token keys are enforced, not optional
- **Predictability over convenience** -- variant customization requires manual spread rather than a convenient `configureTheme()` option, but it's always type-safe and never ambiguous

## Non-Goals

- **JSX components in the theme package** -- eliminated due to jsx-runtime reactivity limitations in library packages
- **`@vertz/ui-theme` contract package** -- YAGNI for a single theme, extract if a second theme is needed
- **Variant extension in `configureTheme()`** -- type-safe deep-merge of variant generics is complex; config-object spread is explicit and works today
- **Runtime switching between theme packages** -- build-time import change, not runtime
- **CLI for theme scaffolding** -- no `vertz add button`. Themes are npm packages
- **Visual theme builder/configurator** -- out of scope
- **Component animation system** -- separate concern
- **Extending `compileTheme()` with radius/typography** -- globals CSS covers the gap
- **Refactoring `@vertz/ui-primitives` to JSX** -- valuable but separate workstream
- **Custom elements for form integration** -- separate architectural decision

## Unknowns

No unknowns identified. All critical questions have been resolved through the adversarial review process:

1. JSX reactivity in library packages -- resolved by exporting style definitions, not components
2. CSS variable collision -- resolved by build-time validation in `compileTheme()`
3. Variant extension type safety -- resolved by using config-object spread instead of `configureTheme()` extension
4. camelCase/kebab-case mismatch -- resolved by enforcing kebab-case with a hard error
5. Two import paths -- resolved by making `configureTheme()` the single entry point
6. Globals injection lifecycle -- resolved by using `GlobalCSSOutput` from `globalCss()` with auto-injection (established pattern) and `.css` for SSR

## Type Flow Map

### Default usage (no generics)

```
buttonConfig (static const) -> variants(buttonConfig) -> VariantFunction<V> -> button({ intent: 'primary' })
```

`V` is inferred statically from the config literal. No generics flow to trace.

### Token customization through configureTheme

```
ThemeConfig['overrides']['tokens'] -> deepMerge(paletteTokens, overrides) -> defineTheme(merged) -> Theme -> compileTheme(theme) -> CSS string
```

No generic type parameters -- `Theme` is a concrete type with `ColorTokens` (string records).

### Variant customization (manual spread)

```
buttonConfig (exported const) -> user spreads with additions -> variants(spreadConfig) -> VariantFunction<MergedV> -> myButton({ intent: 'brand' })
```

`MergedV` is inferred by TypeScript from the spread object literal. The `variants()` function infers `V` from its argument -- no special generic machinery needed.

## E2E Acceptance Test

```ts
// packages/integration-tests/src/theme-shadcn.test.ts
import { describe, it, expect } from 'bun:test';
import { compileTheme, variants } from '@vertz/ui';
import { configureTheme } from '@vertz/theme-shadcn';
import { buttonConfig } from '@vertz/theme-shadcn/configs';

describe('@vertz/theme-shadcn E2E', () => {
  it('zero-config produces valid styles and theme', () => {
    const { theme, globals, styles } = configureTheme();
    const { button, card, input } = styles;

    // Styles produce class name strings
    expect(typeof button({ intent: 'primary', size: 'md' })).toBe('string');
    expect(button({ intent: 'primary' }).length).toBeGreaterThan(0);
    expect(typeof card.root).toBe('string');
    expect(typeof card.header).toBe('string');
    expect(typeof card.title).toBe('string');
    expect(typeof card.content).toBe('string');

    // Theme compiles to CSS with light+dark tokens
    const compiled = compileTheme(theme);
    expect(compiled.css).toContain(':root');
    expect(compiled.css).toContain('[data-theme="dark"]');
    expect(compiled.css).toContain('--color-primary');
    expect(compiled.css).toContain('--color-primary-foreground');

    // Globals is a GlobalCSSOutput with .css string
    expect(typeof globals.css).toBe('string');
    expect(globals.css.length).toBeGreaterThan(0);
  });

  it('palette selection changes token values', () => {
    const zinc = configureTheme({ palette: 'zinc' });
    const slate = configureTheme({ palette: 'slate' });
    const zincCss = compileTheme(zinc.theme).css;
    const slateCss = compileTheme(slate.theme).css;
    expect(zincCss).not.toBe(slateCss);
  });

  it('token overrides inject custom colors', () => {
    const { theme } = configureTheme({
      overrides: {
        tokens: {
          colors: { primary: { DEFAULT: '#7c3aed', _dark: '#8b5cf6' } },
        },
      },
    });
    const compiled = compileTheme(theme);
    expect(compiled.css).toContain('#7c3aed');
  });

  it('variant customization via config spread is type-safe', () => {
    const myButton = variants({
      ...buttonConfig,
      variants: {
        ...buttonConfig.variants,
        intent: {
          ...buttonConfig.variants.intent,
          brand: ['bg:primary', 'text:white', 'rounded:full'],
        },
      },
    });

    // Original intents still work
    expect(typeof myButton({ intent: 'primary' })).toBe('string');
    // New intent works
    expect(typeof myButton({ intent: 'brand' })).toBe('string');
  });

  it('globals contains reset CSS and radius custom property', () => {
    const { globals } = configureTheme({ radius: 'lg' });
    expect(globals.css).toContain('box-sizing');
    expect(globals.css).toContain('--radius');
  });
});
```

```ts
// packages/integration-tests/src/theme-shadcn.test-d.ts
import { configureTheme } from '@vertz/theme-shadcn';
import { variants } from '@vertz/ui';
import { buttonConfig } from '@vertz/theme-shadcn/configs';

// Default styles are fully typed
const { styles } = configureTheme();
styles.button({ intent: 'primary' });
styles.button({ size: 'sm' });
styles.button(); // all optional, uses defaults

// @ts-expect-error -- 'nonexistent' is not a valid intent
styles.button({ intent: 'nonexistent' });

// @ts-expect-error -- 'xl' is not a valid size
styles.button({ size: 'xl' });

// Config spread preserves type safety
const myButton = variants({
  ...buttonConfig,
  variants: {
    ...buttonConfig.variants,
    intent: {
      ...buttonConfig.variants.intent,
      brand: ['bg:primary', 'text:white'],
    },
  },
});

myButton({ intent: 'brand' });   // OK -- new intent
myButton({ intent: 'primary' }); // OK -- original intent

// @ts-expect-error -- 'invalid' is still rejected
myButton({ intent: 'invalid' });
```

## Package Structure

```
@vertz/theme-shadcn/
  src/
    tokens/
      zinc.ts          -- Zinc palette token definitions (light + dark)
      slate.ts         -- Slate palette
      stone.ts         -- Stone palette
      neutral.ts       -- Neutral palette
      gray.ts          -- Gray palette
      index.ts         -- Palette registry
    styles/
      button.ts        -- buttonConfig (VariantsConfig) + default button (VariantFunction)
      badge.ts         -- badgeConfig + default badge
      card.ts          -- card css() definition
      input.ts         -- input css() definition
      label.ts         -- label css() definition
      separator.ts     -- separator css() definition
      form-group.ts    -- formGroup css() definition
      index.ts         -- Aggregates all style definitions
    globals.ts         -- Builds reset CSS + base typography + radius via globalCss()
    configure.ts       -- configureTheme() implementation
    merge.ts           -- Deep partial token merge utility
    index.ts           -- Public API: configureTheme, ThemeConfig, ResolvedTheme
  configs.ts           -- Subpath export: buttonConfig, badgeConfig for variant customization
  package.json
  tsconfig.json
```

## Implementation Phases

### Phase 1: `COLOR_NAMESPACES` Extension + Collision Validation

**Files:**
- `packages/ui/src/css/token-tables.ts` -- add kebab-case compound foreground namespaces
- `packages/ui/src/css/theme.ts` -- add collision validation and camelCase validation in `compileTheme()`

**Integration test:** `compileTheme()` throws on `primary: { foreground: '...' }` when `primary-foreground` is in `COLOR_NAMESPACES`. Throws on camelCase token keys. Accepts kebab-case compound tokens.

### Phase 2: Token Definitions + `configureTheme()` Scaffold

**Files:**
- `packages/theme-shadcn/package.json` -- new package, depends on `@vertz/ui`
- `packages/theme-shadcn/tsconfig.json` -- extends root, no JSX needed (style definitions only)
- `packages/theme-shadcn/src/tokens/*.ts` -- 5 palette token sets
- `packages/theme-shadcn/src/globals.ts` -- Reset CSS + base typography builder via `globalCss()`
- `packages/theme-shadcn/src/merge.ts` -- Deep partial token merge
- `packages/theme-shadcn/src/configure.ts` -- `configureTheme()` returning theme + globals (styles empty initially)
- `packages/theme-shadcn/src/index.ts` -- Public exports

**Integration test:** `configureTheme()` returns a `Theme` that `compileTheme()` accepts. Palette selection changes CSS output. Token overrides appear in compiled CSS. `globals.css` is a non-empty CSS string.

### Phase 3: Style Definitions

**Files:**
- `packages/theme-shadcn/src/styles/button.ts` -- `buttonConfig` + default `button` VariantFunction
- `packages/theme-shadcn/src/styles/badge.ts` -- `badgeConfig` + default `badge`
- `packages/theme-shadcn/src/styles/card.ts` -- `card` css() result
- `packages/theme-shadcn/src/styles/input.ts` -- `input` css() result
- `packages/theme-shadcn/src/styles/label.ts` -- `label` css() result
- `packages/theme-shadcn/src/styles/separator.ts` -- `separator` css() result
- `packages/theme-shadcn/src/styles/form-group.ts` -- `formGroup` css() result
- `packages/theme-shadcn/src/configs.ts` -- Subpath export for config objects

**Integration test:** `configureTheme().styles.button({ intent: 'primary' })` returns a non-empty class name string. All style definitions produce valid class names. Config-object spread + `variants()` produces a typed function accepting new variant values.

### Phase 4: Migrate Task-Manager Example + Developer Walkthrough

**Files to modify:**
- `examples/task-manager/src/styles/theme.ts` -- replace with `configureTheme()` call
- `examples/task-manager/src/styles/components.ts` -- remove hand-written variants, use theme styles
- `examples/task-manager/src/app.tsx` -- use theme globals + compiled theme CSS
- `examples/task-manager/src/components/*.tsx` -- use destructured theme styles

**Acceptance criteria:**
- Task manager renders with shadcn-inspired styling
- Dark mode toggle still works
- No hand-written `variants()` calls for standard UI components remain
- Developer walkthrough: fresh app using theme with customizations passes end-to-end

## Verification

1. **Type safety:** `bun run typecheck` on `@vertz/theme-shadcn` + `@vertz/integration-tests`
2. **Unit tests:** Each style definition produces correct class names
3. **Integration tests:** `configureTheme()` -> `compileTheme()` -> style usage end-to-end
4. **Type-level tests:** `@ts-expect-error` on invalid variant values, config spread preserves types
5. **Collision validation:** `compileTheme()` throws on namespace+shade collisions and camelCase keys
6. **Customization:** Token overrides and config-object spread both work without source modification
7. **Example:** Task-manager runs with the new theme system
8. **Cross-package typecheck:** `bun run typecheck --filter @vertz/integration-tests` passes
