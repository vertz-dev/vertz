import type { GlobalCSSOutput, Theme, VariantFunction } from '@vertz/ui';
import { defineTheme, globalCss } from '@vertz/ui';
import { deepMergeTokens } from './merge';
import {
  createBadge,
  createButton,
  createCard,
  createFormGroup,
  createInput,
  createLabel,
  createSeparator,
} from './styles';
import type { PaletteName } from './tokens';
import { palettes } from './tokens';
import type { PaletteTokens } from './types';

/** Configuration options for the shadcn theme. */
export interface ThemeConfig {
  /** Color palette base. Default: 'zinc'. */
  palette?: PaletteName;
  /** Border radius preset. Default: 'md'. */
  radius?: 'sm' | 'md' | 'lg';
  /** Token overrides — deep-merged into the selected palette. */
  overrides?: {
    tokens?: {
      colors?: Record<string, Record<string, string> | undefined>;
    };
  };
}

/** Pre-built style definitions returned by configureTheme(). */
export interface ThemeStyles {
  /** Button variant function: `button({ intent: 'primary', size: 'md' })` */
  button: VariantFunction<{
    intent: Record<string, string[]>;
    size: Record<string, string[]>;
  }>;
  /** Badge variant function: `badge({ color: 'blue' })` */
  badge: VariantFunction<{
    color: Record<string, string[]>;
  }>;
  /** Card css() result with root, header, title, description, content, footer. */
  card: {
    readonly root: string;
    readonly header: string;
    readonly title: string;
    readonly description: string;
    readonly content: string;
    readonly footer: string;
    readonly css: string;
  };
  /** Input css() result. */
  input: { readonly base: string; readonly css: string };
  /** Label css() result. */
  label: { readonly base: string; readonly css: string };
  /** Separator css() result. */
  separator: { readonly base: string; readonly css: string };
  /** Form group css() result with base and error. */
  formGroup: { readonly base: string; readonly error: string; readonly css: string };
}

/** Return type of configureTheme(). */
export interface ResolvedTheme {
  /** Theme object for compileTheme(). */
  theme: Theme;
  /** Global CSS (reset, typography, radius). Auto-injected via globalCss(). */
  globals: GlobalCSSOutput;
  /** Pre-built style definitions. */
  styles: ThemeStyles;
}

const RADIUS_VALUES: Record<string, string> = {
  sm: '0.25rem',
  md: '0.375rem',
  lg: '0.5rem',
};

/**
 * Configure the shadcn theme.
 *
 * Single entry point — selects palette, applies overrides, builds globals and styles.
 */
export function configureTheme(config?: ThemeConfig): ResolvedTheme {
  const palette = config?.palette ?? 'zinc';
  const radius = config?.radius ?? 'md';
  const baseTokens = palettes[palette];

  // Apply token overrides
  const colorOverrides = config?.overrides?.tokens?.colors ?? {};
  const mergedTokens: PaletteTokens = deepMergeTokens(baseTokens, colorOverrides);

  // Build theme via defineTheme()
  const theme = defineTheme({ colors: mergedTokens });

  // Build globals: CSS reset + base typography + radius
  const globals = globalCss({
    '*, *::before, *::after': {
      boxSizing: 'border-box',
      margin: '0',
      padding: '0',
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
  });

  // Build style definitions
  const styles: ThemeStyles = {
    button: createButton(),
    badge: createBadge(),
    card: createCard(),
    input: createInput(),
    label: createLabel(),
    separator: createSeparator(),
    formGroup: createFormGroup(),
  };

  return { theme, globals, styles };
}
