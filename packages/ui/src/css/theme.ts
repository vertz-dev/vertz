/**
 * Theme definition and compilation.
 *
 * defineTheme() creates a structured theme object from raw and contextual tokens.
 * compileTheme() generates CSS custom properties from the theme.
 *
 * Token types:
 * - **Raw tokens**: exact values that become CSS custom properties.
 *   e.g., `primary: { 500: '#3b82f6' }` → `--color-primary-500: #3b82f6`
 *
 * - **Contextual tokens**: values that swap per theme variant.
 *   e.g., `background: { DEFAULT: 'white', _dark: '#111827' }`
 *   → `:root { --color-background: white; }`
 *   → `[data-theme="dark"] { --color-background: #111827; }`
 */

import {
  type CompileFontsOptions,
  compileFonts,
  type FontDescriptor,
  type PreloadItem,
} from './font';
import { sanitizeCssValue } from './sanitize';

// ─── Types ──────────────────────────────────────────────────────

/** A token value entry: either a raw string value or a nested shade/variant map. */
export type TokenValue = string | Record<string, string>;

/** Color tokens: a map of color names to their raw/contextual values. */
export type ColorTokens = Record<string, Record<string, string>>;

/** Spacing tokens: a flat map of names to CSS values. */
export type SpacingTokens = Record<string, string>;

/** Input to defineTheme(). */
export interface ThemeInput {
  /** Color design tokens (raw shades and contextual variants). */
  colors: ColorTokens;
  /** Spacing scale tokens. */
  spacing?: SpacingTokens;
  /** Font descriptors keyed by token name (e.g., sans, mono, display). */
  fonts?: Record<string, FontDescriptor>;
}

/** The structured theme object returned by defineTheme(). */
export interface Theme {
  /** Color design tokens. */
  colors: ColorTokens;
  /** Spacing scale tokens. */
  spacing?: SpacingTokens;
  /** Font descriptors keyed by token name. */
  fonts?: Record<string, FontDescriptor>;
}

/** Output of compileTheme(). */
export interface CompiledTheme {
  /** The generated CSS string with :root and [data-theme] blocks. */
  css: string;
  /** Flat list of token dot-paths (e.g., 'primary.500', 'background'). */
  tokens: string[];
  /** Font preload link tags for injection into <head>. */
  preloadTags: string;
  /** Structured preload data for generating HTTP Link headers. */
  preloadItems: PreloadItem[];
}

/** Options for compileTheme(). */
export interface CompileThemeOptions {
  /** Pre-computed font fallback metrics for zero-CLS font loading. */
  fallbackMetrics?: CompileFontsOptions['fallbackMetrics'];
}

// ─── defineTheme ────────────────────────────────────────────────

/**
 * Define a theme with raw and contextual design tokens.
 *
 * @param input - Theme token definitions.
 * @returns A structured theme object.
 */
export function defineTheme(input: ThemeInput): Theme {
  return {
    colors: input.colors,
    spacing: input.spacing,
    fonts: input.fonts,
  };
}

// ─── compileTheme ───────────────────────────────────────────────

/**
 * Compile a theme into CSS custom properties.
 *
 * Generates:
 * - `:root { ... }` block with default/raw token values
 * - `[data-theme="dark"] { ... }` block with dark overrides (if any)
 *
 * @param theme - A theme object from defineTheme().
 * @returns Compiled CSS and token list.
 */
export function compileTheme(theme: Theme, options?: CompileThemeOptions): CompiledTheme {
  const rootVars: string[] = [];
  const darkVars: string[] = [];
  const tokenPaths: string[] = [];

  // Validate: reject camelCase color token keys
  for (const name of Object.keys(theme.colors)) {
    if (/[A-Z]/.test(name)) {
      throw new Error(
        `Color token '${name}' uses camelCase. Use kebab-case to match CSS custom property naming.`,
      );
    }
  }

  // Validate: detect CSS custom property name collisions across namespaces.
  // e.g., `primary: { foreground: '#fff' }` and `'primary-foreground': { DEFAULT: '#eee' }`
  // would both produce `--color-primary-foreground`, silently overwriting each other.
  const seenVars = new Map<string, string>();
  const recordVar = (varName: string, path: string) => {
    const prev = seenVars.get(varName);
    if (prev !== undefined && prev !== path) {
      throw new Error(
        `Color token collision: '${prev}' and '${path}' both produce CSS variable '${varName}'. ` +
          `Rename one to avoid silent overrides.`,
      );
    }
    seenVars.set(varName, path);
  };

  // Process color tokens
  for (const [name, values] of Object.entries(theme.colors)) {
    for (const [key, value] of Object.entries(values)) {
      if (key === 'DEFAULT') {
        // Contextual token: default value goes in :root
        const varName = `--color-${name}`;
        recordVar(varName, name);
        rootVars.push(`  ${varName}: ${sanitizeCssValue(value)};`);
        tokenPaths.push(name);
      } else if (key.startsWith('_')) {
        // Contextual variant (e.g., _dark)
        const variant = key.slice(1); // Remove leading underscore
        const varName = `--color-${name}`;
        if (variant === 'dark') {
          darkVars.push(`  ${varName}: ${sanitizeCssValue(value)};`);
        }
      } else {
        // Raw token shade (e.g., 500, 600)
        const varName = `--color-${name}-${key}`;
        const path = `${name}.${key}`;
        recordVar(varName, path);
        rootVars.push(`  ${varName}: ${sanitizeCssValue(value)};`);
        tokenPaths.push(path);
      }
    }
  }

  // Process spacing tokens
  if (theme.spacing) {
    for (const [name, value] of Object.entries(theme.spacing)) {
      const varName = `--spacing-${name}`;
      rootVars.push(`  ${varName}: ${sanitizeCssValue(value)};`);
      tokenPaths.push(`spacing.${name}`);
    }
  }

  // Compile fonts if provided
  let fontFaceCss = '';
  let preloadTags = '';
  let preloadItems: PreloadItem[] = [];
  if (theme.fonts) {
    const compiled = compileFonts(theme.fonts, {
      fallbackMetrics: options?.fallbackMetrics,
    });
    fontFaceCss = compiled.fontFaceCss;
    preloadTags = compiled.preloadTags;
    preloadItems = compiled.preloadItems;
    // Merge font CSS vars into the main :root block (avoid duplicate :root)
    rootVars.push(...compiled.cssVarLines);
  }

  // Build CSS blocks
  const blocks: string[] = [];

  // @font-face declarations go before :root
  if (fontFaceCss) {
    blocks.push(fontFaceCss);
  }

  if (rootVars.length > 0) {
    blocks.push(`:root {\n${rootVars.join('\n')}\n}`);
  }

  if (darkVars.length > 0) {
    blocks.push(`[data-theme="dark"] {\n${darkVars.join('\n')}\n}`);
  }

  return {
    css: blocks.join('\n'),
    tokens: tokenPaths,
    preloadTags,
    preloadItems,
  };
}
