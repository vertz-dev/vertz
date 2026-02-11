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
}

/** The structured theme object returned by defineTheme(). */
export interface Theme {
  /** Color design tokens. */
  colors: ColorTokens;
  /** Spacing scale tokens. */
  spacing?: SpacingTokens;
}

/** Output of compileTheme(). */
export interface CompiledTheme {
  /** The generated CSS string with :root and [data-theme] blocks. */
  css: string;
  /** Flat list of token dot-paths (e.g., 'primary.500', 'background'). */
  tokens: string[];
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
export function compileTheme(theme: Theme): CompiledTheme {
  const rootVars: string[] = [];
  const darkVars: string[] = [];
  const tokenPaths: string[] = [];

  // Process color tokens
  for (const [name, values] of Object.entries(theme.colors)) {
    for (const [key, value] of Object.entries(values)) {
      if (key === 'DEFAULT') {
        // Contextual token: default value goes in :root
        const varName = `--color-${name}`;
        rootVars.push(`  ${varName}: ${value};`);
        tokenPaths.push(name);
      } else if (key.startsWith('_')) {
        // Contextual variant (e.g., _dark)
        const variant = key.slice(1); // Remove leading underscore
        const varName = `--color-${name}`;
        if (variant === 'dark') {
          darkVars.push(`  ${varName}: ${value};`);
        }
      } else {
        // Raw token shade (e.g., 500, 600)
        const varName = `--color-${name}-${key}`;
        rootVars.push(`  ${varName}: ${value};`);
        tokenPaths.push(`${name}.${key}`);
      }
    }
  }

  // Process spacing tokens
  if (theme.spacing) {
    for (const [name, value] of Object.entries(theme.spacing)) {
      const varName = `--spacing-${name}`;
      rootVars.push(`  ${varName}: ${value};`);
      tokenPaths.push(`spacing.${name}`);
    }
  }

  // Build CSS blocks
  const blocks: string[] = [];

  if (rootVars.length > 0) {
    blocks.push(`:root {\n${rootVars.join('\n')}\n}`);
  }

  if (darkVars.length > 0) {
    blocks.push(`[data-theme="dark"] {\n${darkVars.join('\n')}\n}`);
  }

  return {
    css: blocks.join('\n'),
    tokens: tokenPaths,
  };
}
