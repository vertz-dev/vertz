import type { GlobalCSSOutput, Theme } from '@vertz/ui';
import { defineTheme, globalCss } from '@vertz/ui';

import { deepMergeTokens } from './merge';
import type { PaletteName } from './tokens';
import { palettes } from './tokens';
import type { PaletteTokens } from './types';

/**
 * Visual style preset. Each style applies different spacing, border-radius,
 * colors, and visual treatment to all components.
 *
 * Currently only 'nova' is implemented. The architecture supports adding
 * additional styles (e.g., 'default', 'vega', 'maia', 'mira', 'lyra')
 * in the future — each style factory accepts this parameter.
 */
export type ThemeStyle = 'nova';

/** Configuration options for the shadcn theme. */
export interface ThemeConfig {
  /** Color palette base. Default: 'zinc'. */
  palette?: PaletteName;
  /** Border radius preset. Default: 'md'. */
  radius?: 'sm' | 'md' | 'lg';
  /** Visual style preset. Default: 'nova'. */
  style?: ThemeStyle;
  /** Token overrides — deep-merged into the selected palette. */
  overrides?: {
    tokens?: {
      colors?: Record<string, Record<string, string> | undefined>;
    };
  };
}

/** Return type of configureThemeBase(). */
export interface ResolvedThemeBase {
  /** Theme object for compileTheme(). */
  theme: Theme;
  /** Global CSS (reset, typography, radius). Auto-injected via globalCss(). */
  globals: GlobalCSSOutput;
}

const RADIUS_VALUES: Record<string, string> = {
  sm: '0.25rem',
  md: '0.375rem',
  lg: '0.5rem',
};

/**
 * Configure the shadcn theme base — palette tokens and global CSS only.
 *
 * Use this when you only need `{ theme, globals }` without pre-built component
 * styles or factory functions. This avoids bundling 38 style factories and 30+
 * component factories (~161 KB) that the full `configureTheme()` from
 * `@vertz/theme-shadcn` includes.
 *
 * For the full theme with styles and components, use `configureTheme()` from
 * `@vertz/theme-shadcn`.
 */
export function configureThemeBase(config?: ThemeConfig): ResolvedThemeBase {
  const palette = config?.palette ?? 'zinc';
  const radius = config?.radius ?? 'md';
  const baseTokens = palettes[palette];

  // Apply token overrides
  const colorOverrides = config?.overrides?.tokens?.colors ?? {};
  const mergedTokens: PaletteTokens = deepMergeTokens(baseTokens, colorOverrides);

  // Build theme via defineTheme()
  const theme = defineTheme({ colors: mergedTokens });

  // Build globals: CSS reset + base typography + radius + native form elements
  const globals = globalCss({
    '*, *::before, *::after': {
      boxSizing: 'border-box',
      margin: '0',
      padding: '0',
      borderWidth: '0',
      borderStyle: 'solid',
      borderColor: 'var(--color-border)',
    },
    'button, input, select, textarea': {
      font: 'inherit',
      color: 'inherit',
    },
    ':root': {
      '--radius': RADIUS_VALUES[radius] ?? '0.375rem',
    },
    body: {
      fontFamily:
        'ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
      lineHeight: '1.5',
      color: 'var(--color-foreground)',
      backgroundColor: 'var(--color-background)',
    },
    // Native checkbox — styled to match shadcn design tokens so
    // <input type="checkbox"> looks correct without a custom component.
    'input[type="checkbox"]': {
      appearance: 'none',
      width: '1rem',
      height: '1rem',
      borderWidth: '1px',
      borderStyle: 'solid',
      borderColor: 'var(--color-input)',
      borderRadius: '4px',
      backgroundColor: 'transparent',
      cursor: 'pointer',
      flexShrink: '0',
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      transition: 'background-color 150ms, border-color 150ms',
      verticalAlign: 'middle',
    },
    'input[type="checkbox"]:checked': {
      backgroundColor: 'var(--color-primary)',
      borderColor: 'var(--color-primary)',
      backgroundImage:
        "url(\"data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 20 20'%3e%3cpath fill='none' stroke='%23fff' stroke-linecap='round' stroke-linejoin='round' stroke-width='3' d='m6 10 3 3 6-6'/%3e%3c/svg%3e\")",
      backgroundSize: '100% 100%',
      backgroundPosition: 'center',
      backgroundRepeat: 'no-repeat',
    },
    'input[type="checkbox"]:focus-visible': {
      outline: 'none',
      borderColor: 'var(--color-ring)',
      boxShadow: '0 0 0 3px color-mix(in oklch, var(--color-ring) 50%, transparent)',
    },
    'input[type="checkbox"]:disabled': {
      pointerEvents: 'none',
      opacity: '0.5',
    },
    // Native text inputs — styled to match shadcn design tokens so
    // <input>, <input type="text">, <input type="number">, etc. look
    // correct without applying a component class.
    'input:not([type]), input[type="text"], input[type="number"], input[type="email"], input[type="password"], input[type="search"], input[type="tel"], input[type="url"]':
      {
        display: 'flex',
        width: '100%',
        borderWidth: '1px',
        borderStyle: 'solid',
        borderColor: 'var(--color-input)',
        borderRadius: 'var(--radius)',
        backgroundColor: 'transparent',
        height: '2rem',
        paddingLeft: '0.625rem',
        paddingRight: '0.625rem',
        paddingTop: '0.25rem',
        paddingBottom: '0.25rem',
        fontSize: '0.875rem',
        lineHeight: '1.25rem',
        color: 'var(--color-foreground)',
        transition: 'border-color 150ms, box-shadow 150ms',
      },
    'input:not([type]):focus-visible, input[type="text"]:focus-visible, input[type="number"]:focus-visible, input[type="email"]:focus-visible, input[type="password"]:focus-visible, input[type="search"]:focus-visible, input[type="tel"]:focus-visible, input[type="url"]:focus-visible':
      {
        outline: '3px solid color-mix(in oklch, var(--color-ring) 50%, transparent)',
        outlineOffset: '2px',
        borderColor: 'var(--color-ring)',
      },
    'input:not([type]):disabled, input[type="text"]:disabled, input[type="number"]:disabled, input[type="email"]:disabled, input[type="password"]:disabled, input[type="search"]:disabled, input[type="tel"]:disabled, input[type="url"]:disabled':
      {
        pointerEvents: 'none',
        opacity: '0.5',
      },
  });

  return { theme, globals };
}
