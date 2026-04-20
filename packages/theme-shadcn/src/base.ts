import type {
  ColorTokens,
  FontLineHeightTokens,
  FontSizeTokens,
  FontWeightTokens,
  GlobalCSSOutput,
  SpacingTokens,
  Theme,
} from '@vertz/ui';
import { defineTheme, globalCss } from '@vertz/ui';

import { deepMergeTokens } from './merge';
import type { PaletteName } from './tokens';
import { palettes } from './tokens';
import type { PaletteTokens } from './types';

// ─── Default scales ─────────────────────────────────────────────
//
// These back `token.spacing.*`, `token.font.size.*`, etc. Every app that
// uses `configureThemeBase()` gets the same Tailwind-compatible defaults
// so components that reference `token.spacing[4]` aren't silently broken
// when the consumer forgets to define a spacing scale.
//
// Consumers can still override (or extend) any of these via the config.

/** Tailwind-compatible numeric spacing scale — 0.25rem step, named by 4th increments. */
const DEFAULT_SPACING: SpacingTokens = {
  '0': '0',
  px: '1px',
  '0.5': '0.125rem',
  '1': '0.25rem',
  '1.5': '0.375rem',
  '2': '0.5rem',
  '2.5': '0.625rem',
  '3': '0.75rem',
  '3.5': '0.875rem',
  '4': '1rem',
  '5': '1.25rem',
  '6': '1.5rem',
  '7': '1.75rem',
  '8': '2rem',
  '9': '2.25rem',
  '10': '2.5rem',
  '11': '2.75rem',
  '12': '3rem',
  '14': '3.5rem',
  '16': '4rem',
  '20': '5rem',
  '24': '6rem',
  '28': '7rem',
  '32': '8rem',
  '36': '9rem',
  '40': '10rem',
  '44': '11rem',
  '48': '12rem',
  '52': '13rem',
  '56': '14rem',
  '60': '15rem',
  '64': '16rem',
  '72': '18rem',
  '80': '20rem',
  '96': '24rem',
};

/** Tailwind-compatible t-shirt font-size scale. */
const DEFAULT_FONT_SIZE: FontSizeTokens = {
  xs: '0.75rem',
  sm: '0.875rem',
  base: '1rem',
  lg: '1.125rem',
  xl: '1.25rem',
  '2xl': '1.5rem',
  '3xl': '1.875rem',
  '4xl': '2.25rem',
  '5xl': '3rem',
  '6xl': '3.75rem',
  '7xl': '4.5rem',
  '8xl': '6rem',
  '9xl': '8rem',
};

/** CSS font-weight keyword/numeric aliases. */
const DEFAULT_FONT_WEIGHT: FontWeightTokens = {
  thin: '100',
  extralight: '200',
  light: '300',
  normal: '400',
  medium: '500',
  semibold: '600',
  bold: '700',
  extrabold: '800',
  black: '900',
};

/** Line-height scale (unitless multipliers). */
const DEFAULT_FONT_LINE_HEIGHT: FontLineHeightTokens = {
  none: '1',
  tight: '1.25',
  snug: '1.375',
  normal: '1.5',
  relaxed: '1.625',
  loose: '2',
};

/** Raw Tailwind gray ramp — populated on `theme.colors.gray` so `token.color.gray[500]` resolves. */
const DEFAULT_GRAY_RAMP: Record<string, string> = {
  '50': 'oklch(0.985 0 0)',
  '100': 'oklch(0.97 0 0)',
  '200': 'oklch(0.922 0 0)',
  '300': 'oklch(0.87 0 0)',
  '400': 'oklch(0.708 0 0)',
  '500': 'oklch(0.556 0 0)',
  '600': 'oklch(0.439 0 0)',
  '700': 'oklch(0.371 0 0)',
  '800': 'oklch(0.269 0 0)',
  '900': 'oklch(0.205 0 0)',
  '950': 'oklch(0.145 0 0)',
};

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
  /**
   * Color token overrides — deep-merged into the selected palette.
   * @example colors: { primary: { DEFAULT: 'oklch(0.55 0.2 260)', _dark: 'oklch(0.65 0.25 260)' } }
   */
  colors?: Record<string, Record<string, string> | undefined>;
}

/** Return type of configureThemeBase(). */
export interface ResolvedThemeBase {
  /** Theme object for compileTheme(). */
  theme: Theme;
  /** Global CSS (reset, typography, radius). Auto-injected via globalCss(). */
  globals: GlobalCSSOutput;
}

export const RADIUS_VALUES: Record<'none' | 'sm' | 'md' | 'lg' | 'xl', string> = {
  none: '0rem',
  sm: '0.25rem',
  md: '0.375rem',
  lg: '0.625rem',
  xl: '1rem',
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

  // Apply color overrides, then layer the raw gray ramp on top so
  // `token.color.gray[500]` resolves out of the box.
  const colorOverrides = config?.colors ?? {};
  const mergedTokens: PaletteTokens = deepMergeTokens(baseTokens, colorOverrides);
  const colorsWithGray: ColorTokens = {
    ...(mergedTokens as ColorTokens),
    gray: { ...DEFAULT_GRAY_RAMP, ...((mergedTokens as ColorTokens).gray ?? {}) },
  };

  // Build theme via defineTheme() with the shared typography + spacing scales.
  const theme = defineTheme({
    colors: colorsWithGray,
    spacing: DEFAULT_SPACING,
    fontSize: DEFAULT_FONT_SIZE,
    fontWeight: DEFAULT_FONT_WEIGHT,
    fontLineHeight: DEFAULT_FONT_LINE_HEIGHT,
  });

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
      // shadcn-style radius scale: `token.radius.xs|sm|md|lg|xl|2xl|3xl|full`
      // compiles to `var(--radius-*)`, so these must resolve out of the box —
      // otherwise `border-radius` falls back to 0 and components ship with
      // squared corners (including radios, avatars, and other `full` shapes).
      '--radius-xs': 'calc(var(--radius) - 6px)',
      '--radius-sm': 'calc(var(--radius) - 4px)',
      '--radius-md': 'calc(var(--radius) - 2px)',
      '--radius-lg': 'var(--radius)',
      '--radius-xl': 'calc(var(--radius) + 4px)',
      '--radius-2xl': 'calc(var(--radius) + 8px)',
      '--radius-3xl': 'calc(var(--radius) + 12px)',
      '--radius-full': '9999px',
    },
    body: {
      fontFamily:
        'ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
      lineHeight: '1.5',
      color: 'var(--color-foreground)',
      backgroundColor: 'var(--color-background)',
    },
    // Native <dialog> — hide when not [open] so component-level
    // `display: grid` styles don't flash content during SSR-to-hydration.
    'dialog:not([open])': {
      display: 'none',
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
