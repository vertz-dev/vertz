# Centralized Theme API — Design Doc

## Context

Currently, developers configure themes via `@vertz/theme-shadcn`:

```ts
// theme.ts — boilerplate in every app
import { configureTheme } from '@vertz/theme-shadcn';
const { components } = configureTheme({ palette: 'zinc', radius: 'md' });
export const themeComponents = components;

// every-component.tsx — imports from local module
import { themeComponents } from '../styles/theme';
const { Button, Dialog } = themeComponents;
```

Switching themes requires changing imports across the app. There's no centralized component source.

## Goal

One registration call. One import path. Components automatically use the configured theme.

```ts
// theme.ts — register once
import { registerTheme } from '@vertz/ui';
import { configureTheme } from '@vertz/theme-shadcn';
registerTheme(configureTheme({ palette: 'zinc', radius: 'md' }));

// any-component.tsx — import from @vertz/ui/components
import { Button, Dialog } from '@vertz/ui/components';
```

Switching themes = changing one import (`@vertz/theme-shadcn` → `@vertz/theme-xyz`). Component imports stay the same.

## API Surface

### `registerTheme(resolved)` — from `@vertz/ui`

```ts
import { registerTheme } from '@vertz/ui';
import { configureTheme } from '@vertz/theme-shadcn';

// Register at app startup (before any component renders)
registerTheme(configureTheme({ palette: 'zinc', radius: 'md' }));
```

Signature:
```ts
interface RegisterThemeInput {
  components: {
    primitives?: Record<string, unknown>;
    [key: string]: unknown;
  };
}

function registerTheme(resolved: RegisterThemeInput): void;
```

- Stores the theme's components in a module-level registry
- Must be called before any component from `@vertz/ui/components` is used
- Calling again replaces the registered theme (hot-reload friendly)

### `@vertz/ui/components` — proxy exports

```ts
import { Button, Dialog, Card, Input, Select } from '@vertz/ui/components';

// Use exactly like theme components
<Button intent="primary" size="md">Submit</Button>
<Dialog>
  <Dialog.Trigger><Button>Open</Button></Dialog.Trigger>
  <Dialog.Content>...</Dialog.Content>
</Dialog>
```

Every component from `ThemeComponents` and `ThemedPrimitives` is available as a named export. Components delegate to the registered theme at call time.

### Type augmentation

Without a theme package installed, components are typed as `unknown`. When `@vertz/theme-shadcn` is installed, it augments `ThemeComponentMap` via module augmentation, providing full type safety:

```ts
// @vertz/ui defines the empty interface
export interface ThemeComponentMap {
  [key: string]: unknown;
}

// @vertz/theme-shadcn augments it
declare module '@vertz/ui/components' {
  interface ThemeComponentMap {
    Button: (props: ButtonProps) => HTMLButtonElement;
    Dialog: ThemedDialogComponent;
    // ...
  }
}
```

Component exports use `ThemeComponentMap['Name']` as their type, which resolves based on augmentation:
- Without theme package: `unknown` (from index signature)
- With `@vertz/theme-shadcn`: `(props: ButtonProps) => HTMLButtonElement` (from augmentation)

### Exported components

**Direct components** (simple function proxies):
- `Button`, `Badge`, `Input`, `Textarea`, `Label`, `Separator`

**Suite components** (object with sub-component getters):
- `Alert` (`.Alert`, `.AlertTitle`, `.AlertDescription`)
- `Card` (`.Card`, `.CardHeader`, `.CardTitle`, `.CardDescription`, `.CardContent`, `.CardFooter`, `.CardAction`)
- `FormGroup` (`.FormGroup`, `.FormError`)
- `Avatar` (`.Avatar`, `.AvatarImage`, `.AvatarFallback`)
- `Skeleton` (`.Skeleton`)
- `Table` (`.Table`, `.TableHeader`, `.TableBody`, `.TableRow`, `.TableHead`, `.TableCell`, `.TableCaption`, `.TableFooter`)
- `Breadcrumb` — sub-components from theme
- `Pagination` — sub-components from theme

**Compound primitives** (callable + sub-component getters):
- `AlertDialog`, `Dialog`, `DropdownMenu`, `Select`, `Tabs`, `Checkbox`, `Switch`, `Popover`, `Progress`, `RadioGroup`, `Slider`, `Accordion`, `Toast`, `Tooltip`, `Sheet`, `Toggle`

**Factory primitives** (lowercase, delegated directly):
- `calendar`, `carousel`, `collapsible`, `command`, `contextMenu`, `datePicker`, `drawer`, `hoverCard`, `menubar`, `navigationMenu`, `resizablePanel`, `scrollArea`, `toggleGroup`

## Architecture

### Module-level registry

```
registerTheme(result)
        ↓
  _components = result.components  (module-level variable)
  _primitives = result.components.primitives
        ↓
  @vertz/ui/components proxies read from _components/_primitives
```

No context, no dependency injection, no runtime overhead. Pure module-level state.

### Proxy pattern

Three proxy factories:

1. **`createComponentProxy(name)`** — for simple components (Button, Input). Returns a function that delegates to `_getComponent(name)`.

2. **`createSuiteProxy(name, subComponents)`** — for suites (Card, Alert). Returns an object with getter-backed properties that delegate to `_getComponent(name)[sub]`.

3. **`createCompoundProxy(name, subComponents)`** — for primitives (Dialog, Select). Returns a callable function with getter-backed sub-component properties that delegate to `_getPrimitive(name)`.

### Tree-shaking

Each proxy is a `const` export with a `/*#__PURE__*/` annotation. Bundlers can remove unused proxies. The proxy functions are trivial (single function call), so unused ones add negligible dead code even if not tree-shaken.

The theme package's `configureTheme()` still builds all component factories eagerly — this is unchanged. Tree-shaking at the theme level is a separate optimization.

## Design Considerations

### How does the theme config reach components?

Module-level registration. `registerTheme()` stores the theme result in a module-level variable. Proxy components read from it at call time (not at import time). This is the same pattern used by `setAdapter()` for render adapters in `@vertz/ui`.

### Tree-shaking

Each proxy is independently tree-shakeable. Importing `Button` doesn't pull in `Dialog`'s proxy code. The `/*#__PURE__*/` annotations ensure bundlers know the factory calls have no side effects. Verified via the existing tree-shaking test suite.

### SSR

Works naturally. Theme registration is app-level config that happens once at server startup. The module-level state persists for the server's lifetime. SSR renders use the same registered theme as client-side renders. No per-request registration needed because the theme is application config, not user-specific state.

### Multiple themes in one app

The centralized API handles the common case (one theme per app). For admin-vs-public scenarios:
1. Use separate `configureTheme()` calls and thread components explicitly (current pattern)
2. Or register the "main" theme centrally and use explicit theme references for the alternate section

The centralized API doesn't prevent explicit theme usage — both patterns coexist.

## Manifesto Alignment

### "One way to do things"
The centralized API becomes THE way to use themed components. The existing `configureTheme()` + destructuring pattern still works but is no longer the recommended approach for standard usage.

### "My LLM nailed it on the first try"
`import { Button } from '@vertz/ui/components'` — one import, done. No boilerplate theme module, no destructuring. LLMs can generate correct component imports without knowing the app's theme setup.

### "If it builds, it works"
Module augmentation provides compile-time type safety. Calling `Button({ intent: 'invalid' })` is a type error when `@vertz/theme-shadcn` is installed.

### "Explicit over implicit"
`registerTheme()` is an explicit call. No auto-detection, no convention-based config files, no magic. The registration point is visible in the code.

## Non-Goals

- **Theme auto-detection** — no scanning for installed theme packages. Explicit registration.
- **Per-request theme selection** — module-level, not request-level. Use existing pattern for that.
- **Style re-exports** — `@vertz/ui/styles` is out of scope. Focus on components.
- **Lazy component factory creation** — `configureTheme()` still builds all factories eagerly.
- **Breaking change to existing API** — `configureTheme()` and direct theme imports continue to work.

## Unknowns

None identified. The approach is straightforward:
- Module-level registry is the same pattern as `setAdapter()`
- Proxy functions are trivial delegation
- Module augmentation is well-supported by TypeScript
- `isolatedDeclarations: true` preserves indexed access types in `.d.ts`

## Type Flow Map

```
ThemeComponentMap (empty interface with index signature)
  → augmented by @vertz/theme-shadcn with specific component types
  → ThemeComponentMap['Button'] resolves to (props: ButtonProps) => HTMLButtonElement
  → export const Button: ThemeComponentMap['Button'] in @vertz/ui/components
  → user imports Button, gets fully typed component
```

No generic type parameters. All types flow through interface augmentation and indexed access.

## E2E Acceptance Test

```ts
// packages/ui/src/__tests__/theme-registry.test.ts
import { describe, it, expect, beforeEach } from 'bun:test';
import { registerTheme, _getComponent, _getPrimitive, _resetTheme } from '../theme/registry';

describe('theme registry', () => {
  beforeEach(() => _resetTheme());

  it('stores components and makes them retrievable', () => {
    const mockButton = () => document.createElement('button');
    registerTheme({ components: { Button: mockButton } });
    expect(_getComponent('Button')).toBe(mockButton);
  });

  it('throws when no theme is registered', () => {
    expect(() => _getComponent('Button')).toThrow('No theme registered');
  });

  it('stores primitives from components.primitives', () => {
    const mockDialog = () => document.createElement('div');
    registerTheme({ components: { primitives: { Dialog: mockDialog } } });
    expect(_getPrimitive('Dialog')).toBe(mockDialog);
  });
});
```

```ts
// Type-level test
import { Button, Dialog } from '@vertz/ui/components';

// Without theme augmentation, types are unknown
// With @vertz/theme-shadcn installed:
// Button({ intent: 'primary' }); // ✓ typed
// @ts-expect-error — 'invalid' is not a valid intent
// Button({ intent: 'invalid' });
```

## Migration Path

### Before (current pattern)
```ts
// theme.ts
import { configureTheme } from '@vertz/theme-shadcn';
const { components } = configureTheme({ palette: 'zinc' });
export const themeComponents = components;

// component.tsx
import { themeComponents } from '../styles/theme';
const { Button } = themeComponents;
```

### After (centralized pattern)
```ts
// theme.ts (simplified)
import { registerTheme } from '@vertz/ui';
import { configureTheme } from '@vertz/theme-shadcn';
registerTheme(configureTheme({ palette: 'zinc' }));
// Can still export for direct access if needed:
// export const { theme, globals, styles } = configureTheme({ palette: 'zinc' });

// component.tsx (no local import needed)
import { Button } from '@vertz/ui/components';
```

Migration is incremental: existing pattern continues to work. Components can be migrated one file at a time.

## Implementation Phases

### Phase 1: Theme registry + proxy components

**Files:**
- `packages/ui/src/theme/registry.ts` — `registerTheme`, `_getComponent`, `_getPrimitive`, `_resetTheme`
- `packages/ui/src/components/types.ts` — `ThemeComponentMap` interface
- `packages/ui/src/components/index.ts` — proxy exports for all components
- `packages/ui/src/index.ts` — re-export `registerTheme`
- `packages/ui/bunup.config.ts` — add `src/components/index.ts` entry
- `packages/ui/package.json` — add `./components` export

**Tests:**
- Unit tests for registry (register, retrieve, error on missing)
- Unit tests for proxy components (delegation, error messages)

### Phase 2: Module augmentation in @vertz/theme-shadcn

**Files:**
- `packages/theme-shadcn/src/augment.d.ts` — augments `ThemeComponentMap` with all component types
- `packages/theme-shadcn/tsconfig.json` — ensure augment.d.ts is included

**Tests:**
- Type-level tests verifying augmentation provides correct types

### Phase 3: Tree-shaking verification + integration test

**Files:**
- `tests/tree-shaking/tree-shaking.test.ts` — add `@vertz/ui/components` test case
- Integration test verifying full flow: register → import → use

### Phase 4: Documentation

**Files:**
- Update `packages/docs/` with centralized theme API guide
