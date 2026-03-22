# Theme Customizer for Component Docs

**Status:** Draft — reviewed, blockers addressed
**Scope:** `sites/component-docs` only (minimal framework change: export palette data)

## Problem

The component docs site shows all components with a single hardcoded theme: zinc palette, medium radius, dark/light toggle. Developers evaluating Vertz can't see how components look with different palettes or radius settings without cloning the repo and editing `theme.ts`.

A live theme customizer would let visitors:
1. Switch between the 5 built-in palettes (zinc, slate, stone, neutral, gray)
2. Change border radius (sm, md, lg)
3. Toggle light/dark mode (already exists)
4. See changes reflected instantly across all component previews
5. Copy the matching `configureTheme()` call for their project

## API Surface

### Framework Change: Export Palette Data from `@vertz/theme-shadcn`

The customizer needs runtime access to all palette token objects and radius values. These are currently internal. Add public exports:

```ts
// packages/theme-shadcn/src/index.ts — new exports
export { palettes } from './tokens';
export type { PaletteName } from './tokens';
export { RADIUS_VALUES } from './base';
```

This is a non-breaking addition. `PaletteName` is already used in the public `ThemeConfig` type — exporting it directly is a natural extension.

### User-Facing (Component Docs Site)

**New component — `ThemeCustomizer`:**

```tsx
// sites/component-docs/src/components/theme-customizer.tsx

// Trigger button placed in Header, next to existing dark/light toggle
<ThemeCustomizer />

// Internally renders:
// 1. A trigger button (paintbrush icon)
// 2. A right-side panel (CSS positioned, not a Sheet primitive)
//    with palette selector, radius selector, config export, and reset
// 3. On viewports < 768px, panel overlays content with a close button
//    (no bottom-sheet complexity — just full-width overlay with scroll)
```

**New context — `CustomizationContext`:**

```tsx
// sites/component-docs/src/hooks/use-customization.ts

interface CustomizationContextValue {
  palette: PaletteName;           // 'zinc' | 'slate' | 'stone' | 'neutral' | 'gray'
  radius: 'sm' | 'md' | 'lg';
  setPalette: (p: PaletteName) => void;
  setRadius: (r: 'sm' | 'md' | 'lg') => void;
  reset: () => void;
}

const CustomizationContext = createContext<CustomizationContextValue>();

export function useCustomization(): CustomizationContextValue {
  const ctx = useContext(CustomizationContext);
  if (!ctx) throw new Error('useCustomization must be within CustomizationContext.Provider');
  return ctx;
}
```

**Persistence:** Cookie (`customization=slate,lg`) + localStorage fallback. Cookie enables SSR to read the saved palette/radius, avoiding a flash-of-wrong-theme on page load. This follows the existing pattern — the dark/light toggle already uses a cookie (`theme=dark|light`).

### Runtime Mechanism — CSS Variable Override

All components read from CSS custom properties (`--color-*`, `--radius`). The customizer overrides these via inline `style` on the **ThemeProvider's wrapper `<div>`** — the same element that carries the `data-theme` attribute.

**Critical: Why target the ThemeProvider div, not `<html>`.**
`ThemeProvider` creates a `<div data-theme="...">` wrapper. The `[data-theme="dark"] { --color-background: ... }` CSS rules match this div. If we set inline styles on `<html>` (an ancestor), children would still inherit from the `<div>`'s `[data-theme]` rule, which is closer in the DOM tree. By targeting the same `<div>`, inline styles win via specificity (inline > attribute selector).

```tsx
// When user selects a new palette:
function applyPalette(paletteName: PaletteName, mode: 'dark' | 'light') {
  const tokens = palettes[paletteName]; // exported from @vertz/theme-shadcn
  const target = document.querySelector('[data-theme]') as HTMLElement | null;
  if (!target) return;

  for (const [name, variants] of Object.entries(tokens)) {
    const value = mode === 'dark' && variants._dark
      ? variants._dark
      : variants.DEFAULT;
    target.style.setProperty(`--color-${name}`, value);
  }
}

// When user selects a new radius — uses canonical values from theme package:
import { RADIUS_VALUES } from '@vertz/theme-shadcn';

function applyRadius(radius: 'sm' | 'md' | 'lg') {
  const target = document.querySelector('[data-theme]') as HTMLElement | null;
  if (!target) return;
  target.style.setProperty('--radius', RADIUS_VALUES[radius]);
}

// Reset — removes inline overrides so stylesheet rules take control again:
function clearOverrides() {
  const target = document.querySelector('[data-theme]') as HTMLElement | null;
  if (!target) return;
  for (const name of Object.keys(palettes.zinc)) {
    target.style.removeProperty(`--color-${name}`);
  }
  target.style.removeProperty('--radius');
}
```

**Why `removeProperty()` for reset:** Setting zinc values as inline styles would permanently shadow the stylesheet rules. `removeProperty()` fully clears the inline override, letting `:root {}` and `[data-theme="dark"] {}` rules take effect again — which is the correct default state.

**Theme toggle integration:** When the user toggles dark/light mode, we must re-apply the selected palette's tokens for the new mode (DEFAULT vs _dark values). `applyPalette()` takes an explicit `mode` parameter to avoid ordering bugs — the caller passes the new mode directly rather than reading from DOM state.

```tsx
// In App's toggle():
function toggle() {
  currentTheme = currentTheme === 'dark' ? 'light' : 'dark';
  setThemeCookie(currentTheme);
  document.querySelector('[data-theme]')?.setAttribute('data-theme', currentTheme);
  // Re-apply palette for the new mode (only if non-default palette is active)
  if (activePalette !== 'zinc') {
    applyPalette(activePalette, currentTheme);
  }
}
```

### Config Export

Generates a complete, copy-paste-ready snippet including imports and `registerTheme()`:

```tsx
function generateConfig(palette: PaletteName, radius: 'sm' | 'md' | 'lg'): string {
  const parts: string[] = [];
  if (palette !== 'zinc') parts.push(`  palette: '${palette}',`);
  if (radius !== 'md') parts.push(`  radius: '${radius}',`);

  const configArg = parts.length > 0
    ? `{\n${parts.join('\n')}\n}`
    : '';

  return [
    "import { configureTheme } from '@vertz/theme-shadcn';",
    "import { registerTheme } from '@vertz/ui';",
    '',
    `const config = configureTheme(${configArg});`,
    'registerTheme(config);',
  ].join('\n');
}
```

### Accessibility

Palette options use `role="radiogroup"` with individual `role="radio"` items and `aria-checked`. Radius options follow the same pattern. This gives correct arrow-key navigation and screen reader semantics. For a component docs site that developers use to evaluate accessibility, the customizer itself should model good a11y patterns.

## Manifesto Alignment

### Principle 2: One way to do things
The customizer uses the same `configureTheme()` configuration that developers use in their apps. We're not introducing a separate "live theme" system — we're showing the existing system's options interactively. The export generates the exact same `configureTheme()` call developers would write.

### Principle 3: AI agents are first-class users
The exported config is copy-paste ready. An LLM could read the generated snippet and apply it directly.

### Principle 6: If you can't demo it, it's not done
This feature IS the demo. It lets people see exactly what each configuration option does before writing any code.

### Principle 7: Performance is not optional
CSS variable overrides are instant — no JS re-renders, no style recalculation beyond what the browser does naturally. Palette switching is a loop over ~30 `setProperty` calls.

### Tradeoffs
- **Rejected: Re-running `configureTheme()` at runtime.** This would require `resetInjectedStyles()`, re-inject all component CSS, and potentially break class name hashing. CSS variable override is simpler and more reliable.
- **Rejected: Pre-generating all palette CSS with scoped selectors.** Would bloat the initial CSS payload 5x for a feature most users access once. On-demand variable override is zero-cost until used.
- **Rejected: Using the Sheet primitive for the panel.** The docs site should not depend on `@vertz/ui-primitives` for its own chrome — a simple CSS-positioned panel keeps the docs site self-contained and avoids circular showcase concerns.
- **Rejected: Inline styles on `<html>`.** ThemeProvider creates a `<div data-theme="...">` that sets CSS variables via `[data-theme]` rules. Children inherit from the closest ancestor that sets a property. Inline styles on `<html>` would be shadowed by the `<div>`'s rules. Must target the same element.

## Non-Goals

1. **Custom color picker for individual tokens.** Users can tweak oklch values in their own `configureTheme({ overrides })`. The docs customizer showcases the built-in palettes, not arbitrary colors.
2. **Theme persistence across devices.** Cookie + localStorage is sufficient for a docs site. No account system, no cloud sync.
3. **Framework-level runtime theme switching API.** This is a docs site feature. If the pattern proves useful, it could inspire a future framework API, but that's out of scope.
4. **Custom font selection.** Font choices are outside the palette/radius knobs that `configureTheme()` exposes.
5. **Per-component theme scoping.** All previews share the same theme. Showing two palettes side-by-side is a future enhancement.
6. **Style selector.** `ThemeConfig` accepts a `style` option (currently only `'nova'`). A style selector is out of scope until additional styles beyond 'nova' exist.
7. **Chromatic palettes.** The 5 built-in palettes (zinc, slate, stone, neutral, gray) are all near-achromatic. Adding chromatic palettes (blue, rose, green) would dramatically increase visual impact but is a theme-shadcn feature, not a docs feature. A follow-up issue should be created for expanding the palette set.

### Known Limitation: Subtle Palette Differences

The 5 palettes are all gray-based with different undertones (zinc = blue-gray, stone = warm gray, slate = cool blue-gray, neutral = pure gray, gray = true gray). The visual difference between them is subtle — especially on non-color-critical components like buttons and cards. To help users distinguish them:
- Each palette swatch shows a labeled descriptor ("cool blue-gray", "warm beige-gray", etc.)
- The primary/accent tokens show the most visible difference — the panel could highlight these

## Unknowns

1. **Palette token re-application on theme toggle.** When the user is on the `slate` palette and toggles dark→light, we need to re-apply all `slate` DEFAULT values. The current `toggle()` function only flips `data-theme`. **Resolution:** The `toggle()` function in `App` will call `applyPalette(activePalette, newMode)` after switching `data-theme`. The explicit `mode` parameter avoids ordering bugs — the caller passes the new mode directly rather than reading from reactive state.

2. **SSR mismatch on first load with customization.** **Resolution:** Use cookie-based persistence (same pattern as existing `theme=dark|light` cookie). SSR reads the `customization` cookie to apply the correct palette during server rendering. The `themeFromRequest` callback in the dev server already reads cookies — extending it to read `customization=slate,lg` is straightforward.

## POC Results

No POC needed. The mechanism (CSS custom property override via `document.documentElement.style.setProperty`) is a standard browser API with no unknowns. Already validated by the existing dark/light toggle which uses the same cascade principle via `data-theme`.

## Type Flow Map

Minimal — this feature is UI-only with no generic type parameters flowing through the framework. The key types are:

```
PaletteName ('zinc' | 'slate' | 'stone' | 'neutral' | 'gray')
  → CustomizationContextValue.palette
  → applyPalette(paletteName)
  → palettes[paletteName] lookup
  → token iteration → setProperty()

'sm' | 'md' | 'lg'
  → CustomizationContextValue.radius
  → applyRadius(radius)
  → setProperty()
```

No dead generics. All type parameters are consumed.

## E2E Acceptance Test

```typescript
describe('Feature: Theme customizer', () => {
  describe('Given the component docs site is loaded', () => {
    describe('When the user clicks the customizer trigger button', () => {
      it('Then a panel appears on the right side with palette and radius options', () => {
        // Panel visible, shows 5 palette options (role="radiogroup"), 3 radius options
      });
    });
  });

  describe('Given the customizer panel is open', () => {
    describe('When the user selects the "slate" palette', () => {
      it('Then all component previews update to slate colors immediately', () => {
        // Check CSS variable on the ThemeProvider div (not documentElement)
        const target = document.querySelector('[data-theme]') as HTMLElement;
        const primary = target.style.getPropertyValue('--color-primary');
        expect(primary).toBe('oklch(0.208 0.042 265.755)');
      });

      it('Then the "slate" option is visually marked as selected (aria-checked)', () => {});

      it('Then the config export shows the full configureTheme snippet', () => {
        // Code block contains:
        // import { configureTheme } from '@vertz/theme-shadcn';
        // import { registerTheme } from '@vertz/ui';
        // const config = configureTheme({ palette: 'slate' });
        // registerTheme(config);
      });
    });

    describe('When the user selects radius "lg"', () => {
      it('Then all component borders update to larger radius immediately', () => {
        const target = document.querySelector('[data-theme]') as HTMLElement;
        // Canonical value from RADIUS_VALUES: lg = 0.5rem
        expect(target.style.getPropertyValue('--radius')).toBe('0.5rem');
      });

      it('Then the config export includes radius: "lg"', () => {});
    });

    describe('When the user toggles dark/light mode while a non-default palette is selected', () => {
      it('Then the palette colors update to the correct mode variant', () => {
        // Select slate, then toggle to light — slate DEFAULT values applied
        // Toggle back to dark — slate _dark values applied
      });
    });

    describe('When the user clicks "Reset"', () => {
      it('Then palette reverts to zinc and radius to md', () => {});
      it('Then inline style overrides are removed (removeProperty, not set-to-default)', () => {
        const target = document.querySelector('[data-theme]') as HTMLElement;
        expect(target.style.getPropertyValue('--color-primary')).toBe('');
      });
      it('Then customization cookie is cleared', () => {});
    });

    describe('When the user clicks "Copy" on the config export', () => {
      it('Then the full configureTheme() snippet is copied to clipboard', () => {});
    });
  });

  describe('Given the user previously customized the theme', () => {
    describe('When the page is reloaded', () => {
      it('Then the saved palette and radius are restored from cookie', () => {});
      it('Then component previews reflect the saved customization', () => {});
    });
  });

  describe('Type safety', () => {
    it('setPalette rejects invalid palette names', () => {
      // @ts-expect-error - 'red' is not a valid PaletteName
      setPalette('red');
    });

    it('setRadius rejects invalid radius values', () => {
      // @ts-expect-error - 'xl' is not a valid radius
      setRadius('xl');
    });
  });
});
```

## Implementation Plan

### Phase 1: Export Palette Data + Customization Context

**Goal:** Export `palettes`, `PaletteName`, and `RADIUS_VALUES` from `@vertz/theme-shadcn`. Wire up the runtime mechanism — palette and radius switching via CSS variables, persisted to cookie.

**Acceptance Criteria:**
```typescript
describe('Given @vertz/theme-shadcn exports', () => {
  it('Then palettes is importable and contains 5 palette objects', () => {});
  it('Then PaletteName type matches the 5 palette names', () => {});
  it('Then RADIUS_VALUES is importable and contains sm/md/lg', () => {});
});

describe('Given CustomizationContext is provided', () => {
  describe('When setPalette("slate") is called', () => {
    it('Then --color-primary on [data-theme] element matches slate value for current mode', () => {});
    it('Then --color-background on [data-theme] element matches slate value', () => {});
  });

  describe('When setRadius("lg") is called', () => {
    it('Then --radius on [data-theme] element is "0.5rem" (canonical RADIUS_VALUES.lg)', () => {});
  });

  describe('When theme toggles from dark to light with slate palette active', () => {
    it('Then --color-primary matches slate DEFAULT (not _dark)', () => {});
  });

  describe('When reset() is called', () => {
    it('Then CSS variable overrides are removed via removeProperty()', () => {});
    it('Then customization cookie is cleared', () => {});
  });
});
```

**Files:**
- Modify: `packages/theme-shadcn/src/index.ts` — add `palettes`, `PaletteName`, `RADIUS_VALUES` exports
- Modify: `packages/theme-shadcn/src/base.ts` — export `RADIUS_VALUES` (currently module-private)
- Create: `sites/component-docs/src/hooks/use-customization.ts` — context, provider logic, `applyPalette()`, `applyRadius()`, `clearOverrides()`, cookie persistence
- Modify: `sites/component-docs/src/app.tsx` — wrap app in `CustomizationContext.Provider`, restore from cookie on mount, integrate with theme toggle

### Phase 2: Customizer Panel UI + Config Export

**Goal:** Build the interactive panel with palette swatches, radius buttons, config export with copy-to-clipboard, and reset. This phase delivers the complete user-facing feature.

**Acceptance Criteria:**
```typescript
describe('Given the customizer panel component', () => {
  describe('When rendered', () => {
    it('Then shows 5 palette options as a radiogroup with labeled swatches', () => {});
    it('Then shows 3 radius options (sm, md, lg) as a radiogroup', () => {});
    it('Then shows current selections as aria-checked', () => {});
  });

  describe('When a palette swatch is clicked', () => {
    it('Then calls setPalette with the palette name', () => {});
    it('Then the swatch gets aria-checked="true"', () => {});
  });

  describe('When a radius option is clicked', () => {
    it('Then calls setRadius with the radius value', () => {});
  });

  describe('When the panel close button is clicked', () => {
    it('Then the panel is hidden', () => {});
  });
});

describe('Given the config export section', () => {
  describe('When default palette (zinc) and radius (md) are selected', () => {
    it('Then shows configureTheme() with no options + imports + registerTheme', () => {});
  });

  describe('When slate palette and lg radius are selected', () => {
    it('Then shows configureTheme({ palette: "slate", radius: "lg" })', () => {});
  });

  describe('When "Copy" button is clicked', () => {
    it('Then the full code string is written to navigator.clipboard', () => {});
    it('Then button text changes to "Copied!" briefly', () => {});
  });

  describe('When "Reset to defaults" is clicked', () => {
    it('Then palette resets to zinc, radius to md', () => {});
    it('Then inline overrides are removed (not set to zinc values)', () => {});
    it('Then config export updates to show no options', () => {});
  });
});
```

**Files:**
- Create: `sites/component-docs/src/components/theme-customizer.tsx` — panel with palette radiogroup, radius radiogroup, config code block, copy button, reset button, close button
- Modify: `sites/component-docs/src/components/header.tsx` — add customizer trigger button
- Modify: `sites/component-docs/src/components/index.ts` — export new component

## Review Findings & Resolutions

### Blocker Fixes (from DX, Product, Technical reviews)

| Finding | Resolution |
|---------|------------|
| CSS cascade: inline styles on `<html>` shadowed by `[data-theme]` on ThemeProvider div | Target the `[data-theme]` element directly via `document.querySelector('[data-theme]')` |
| Radius values wrong (`md: 0.5rem` vs actual `0.375rem`) | Import `RADIUS_VALUES` from `@vertz/theme-shadcn` — single source of truth |
| `palettes`/`PaletteName` not exported from `@vertz/theme-shadcn` | Add public exports in Phase 1 (non-breaking addition) |

### Incorporated Suggestions

| Suggestion | Resolution |
|------------|------------|
| Config export should include imports + registerTheme | Full snippet with imports in `generateConfig()` |
| Cookie persistence to avoid SSR flash | Cookie as primary persistence, following existing `theme=dark\|light` pattern |
| `reset()` should use `removeProperty()` | `clearOverrides()` iterates and calls `removeProperty()` for each token |
| Merge Phase 3 into Phase 2 | Done — config export is part of the panel UI phase |
| Keyboard accessibility | Palette + radius use `role="radiogroup"` / `role="radio"` with `aria-checked` |
| Responsive behavior | Panel overlays content on narrow viewports with close button |
| Acknowledge subtle palette differences | Labeled descriptors per swatch + noted as known limitation |
| `applyPalette` takes explicit `mode` parameter | Prevents ordering bugs when integrated with theme toggle |
