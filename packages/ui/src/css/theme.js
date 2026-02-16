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
// ─── defineTheme ────────────────────────────────────────────────
/**
 * Define a theme with raw and contextual design tokens.
 *
 * @param input - Theme token definitions.
 * @returns A structured theme object.
 */
export function defineTheme(input) {
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
export function compileTheme(theme) {
  const rootVars = [];
  const darkVars = [];
  const tokenPaths = [];
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
  const blocks = [];
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
//# sourceMappingURL=theme.js.map
