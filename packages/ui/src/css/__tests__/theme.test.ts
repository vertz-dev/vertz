import { describe, expect, it } from 'bun:test';
import { font } from '../font';
import { compileTheme, defineTheme } from '../theme';

describe('defineTheme()', () => {
  it('returns a theme object with colors', () => {
    const theme = defineTheme({
      colors: {
        primary: { 500: '#3b82f6' },
      },
    });

    expect(theme.colors).toBeDefined();
    expect(theme.colors.primary).toEqual({ 500: '#3b82f6' });
  });

  it('returns a theme object with spacing', () => {
    const theme = defineTheme({
      colors: {},
      spacing: {
        sm: '0.5rem',
        md: '1rem',
        lg: '1.5rem',
      },
    });

    expect(theme.spacing).toBeDefined();
    expect(theme.spacing?.sm).toBe('0.5rem');
  });

  it('accepts contextual tokens with DEFAULT and _dark', () => {
    const theme = defineTheme({
      colors: {
        background: { DEFAULT: 'white', _dark: '#111827' },
        foreground: { DEFAULT: '#111827', _dark: 'white' },
      },
    });

    expect(theme.colors.background).toEqual({
      DEFAULT: 'white',
      _dark: '#111827',
    });
  });

  it('accepts mixed raw and contextual tokens', () => {
    const theme = defineTheme({
      colors: {
        primary: { 500: '#3b82f6', 600: '#2563eb' },
        background: { DEFAULT: 'white', _dark: '#111827' },
      },
    });

    expect(theme.colors.primary).toEqual({ 500: '#3b82f6', 600: '#2563eb' });
    expect(theme.colors.background).toEqual({
      DEFAULT: 'white',
      _dark: '#111827',
    });
  });
});

describe('compileTheme()', () => {
  // IT-2C-1: defineTheme() generates CSS custom properties for contextual tokens
  it('contextual tokens become CSS custom properties', () => {
    const theme = defineTheme({
      colors: {
        primary: { 500: '#3b82f6' },
        background: { DEFAULT: 'white' },
        foreground: { DEFAULT: '#111827' },
      },
    });
    const { css } = compileTheme(theme);
    expect(css).toContain('--color-background: white');
    expect(css).toContain('--color-foreground: #111827');
  });

  // IT-2C-2: Dark theme overrides contextual tokens via data-theme
  it('dark theme swaps contextual tokens', () => {
    const theme = defineTheme({
      colors: {
        background: { DEFAULT: 'white', _dark: '#111827' },
        foreground: { DEFAULT: '#111827', _dark: 'white' },
      },
    });
    const { css } = compileTheme(theme);
    expect(css).toContain('[data-theme="dark"]');
    expect(css).toContain('--color-background: #111827');
  });

  it('generates :root block for default values', () => {
    const theme = defineTheme({
      colors: {
        primary: { 500: '#3b82f6' },
      },
    });
    const { css } = compileTheme(theme);
    expect(css).toContain(':root');
    expect(css).toContain('--color-primary-500: #3b82f6');
  });

  it('flattens nested color tokens into dot-path CSS vars', () => {
    const theme = defineTheme({
      colors: {
        primary: { 500: '#3b82f6', 600: '#2563eb' },
      },
    });
    const { css } = compileTheme(theme);
    expect(css).toContain('--color-primary-500: #3b82f6');
    expect(css).toContain('--color-primary-600: #2563eb');
  });

  it('generates spacing custom properties', () => {
    const theme = defineTheme({
      colors: {},
      spacing: {
        sm: '0.5rem',
        md: '1rem',
        lg: '1.5rem',
      },
    });
    const { css } = compileTheme(theme);
    expect(css).toContain('--spacing-sm: 0.5rem');
    expect(css).toContain('--spacing-md: 1rem');
    expect(css).toContain('--spacing-lg: 1.5rem');
  });

  it('dark block only contains dark overrides, not raw tokens', () => {
    const theme = defineTheme({
      colors: {
        primary: { 500: '#3b82f6' },
        background: { DEFAULT: 'white', _dark: '#111827' },
      },
    });
    const { css } = compileTheme(theme);

    // Extract dark block
    const darkMatch = css.match(/\[data-theme="dark"\]\s*\{([^}]*)\}/);
    if (darkMatch) {
      // Dark block should NOT contain raw tokens like primary-500
      expect(darkMatch[1]).not.toContain('--color-primary-500');
      // Dark block SHOULD contain the dark override
      expect(darkMatch[1]).toContain('--color-background: #111827');
    } else {
      // Dark block should exist because we have _dark overrides
      expect(darkMatch).not.toBeNull();
    }
  });

  it('contextual DEFAULT values go in :root', () => {
    const theme = defineTheme({
      colors: {
        background: { DEFAULT: 'white', _dark: '#111827' },
      },
    });
    const { css } = compileTheme(theme);

    // Extract :root block
    const rootMatch = css.match(/:root\s*\{([^}]*)\}/);
    expect(rootMatch).not.toBeNull();
    expect(rootMatch?.[1]).toContain('--color-background: white');
  });

  it('throws on camelCase color token keys', () => {
    const theme = defineTheme({
      colors: {
        primaryForeground: { DEFAULT: '#fff', _dark: '#000' },
      },
    });
    expect(() => compileTheme(theme)).toThrow(
      "Color token 'primaryForeground' uses camelCase. Use kebab-case to match CSS custom property naming.",
    );
  });

  it('throws on namespace+shade collision with compound namespace', () => {
    const theme = defineTheme({
      colors: {
        primary: {
          500: '#3b82f6',
          foreground: '#ffffff',
        },
      },
    });
    expect(() => compileTheme(theme)).toThrow(
      "Token collision: 'primary.foreground' produces CSS variable '--color-primary-foreground' " +
        "which conflicts with semantic token 'primary-foreground'.",
    );
  });

  it('does not throw when shade does not collide with compound namespace', () => {
    const theme = defineTheme({
      colors: {
        primary: { 500: '#3b82f6', 600: '#2563eb' },
      },
    });
    expect(() => compileTheme(theme)).not.toThrow();
  });

  it('accepts kebab-case color token keys', () => {
    const theme = defineTheme({
      colors: {
        'primary-foreground': { DEFAULT: '#fff', _dark: '#000' },
      },
    });
    expect(() => compileTheme(theme)).not.toThrow();
  });

  it('strips semicolons from values to prevent CSS property injection', () => {
    const theme = defineTheme({
      colors: {
        danger: { 500: 'red; } body { background: url(evil)' },
      },
    });
    const { css } = compileTheme(theme);
    // Extract the value portion — should not contain injected semicolons or braces
    const valueMatch = css.match(/--color-danger-500:\s*([^;]+)/);
    expect(valueMatch).not.toBeNull();
    expect(valueMatch?.[1]?.trim()).not.toContain(';');
    expect(valueMatch?.[1]?.trim()).not.toContain('}');
    expect(valueMatch?.[1]?.trim()).toContain('red');
  });

  it('strips curly braces from values to prevent CSS rule breakout', () => {
    const theme = defineTheme({
      colors: {
        danger: { 500: 'red } .evil { color: green' },
      },
    });
    const { css } = compileTheme(theme);
    // Only structural braces from :root { ... }, not injected ones
    const valueMatch = css.match(/--color-danger-500:\s*([^;]+)/);
    expect(valueMatch?.[1]?.trim()).not.toContain('}');
    expect(valueMatch?.[1]?.trim()).not.toContain('{');
  });

  it('strips url( from values to prevent resource loading', () => {
    const theme = defineTheme({
      colors: {
        background: { DEFAULT: 'url(https://evil.com/tracker.png)' },
      },
    });
    const { css } = compileTheme(theme);
    expect(css).not.toContain('url(');
  });

  it('strips expression( from values to prevent IE expression injection', () => {
    const theme = defineTheme({
      colors: {
        background: { DEFAULT: 'expression(alert(1))' },
      },
    });
    const { css } = compileTheme(theme);
    expect(css).not.toContain('expression(');
  });

  it('strips @import from values to prevent stylesheet injection', () => {
    const theme = defineTheme({
      colors: {
        background: { DEFAULT: '@import "https://evil.com/styles.css"' },
      },
    });
    const { css } = compileTheme(theme);
    expect(css).not.toContain('@import');
  });

  it('passes through normal CSS values unchanged', () => {
    const theme = defineTheme({
      colors: {
        primary: { 500: '#ff0000' },
        background: { DEFAULT: 'white' },
      },
      spacing: {
        sm: '0.5rem',
        scale: '1.5',
      },
    });
    const { css } = compileTheme(theme);
    expect(css).toContain('--color-primary-500: #ff0000');
    expect(css).toContain('--color-background: white');
    expect(css).toContain('--spacing-sm: 0.5rem');
    expect(css).toContain('--spacing-scale: 1.5');
  });

  it('returns token map with all flat token paths', () => {
    const theme = defineTheme({
      colors: {
        primary: { 500: '#3b82f6', 600: '#2563eb' },
        background: { DEFAULT: 'white', _dark: '#111827' },
      },
    });
    const { tokens } = compileTheme(theme);
    expect(tokens).toContain('primary.500');
    expect(tokens).toContain('primary.600');
    expect(tokens).toContain('background');
  });

  it('includes font @font-face and --font-* vars when fonts are provided', () => {
    const sans = font('DM Sans', {
      weight: '100..1000',
      src: '/fonts/dm-sans.woff2',
      fallback: ['system-ui', 'sans-serif'],
    });
    const theme = defineTheme({
      colors: { primary: { 500: '#3b82f6' } },
      fonts: { sans },
    });
    const result = compileTheme(theme);

    // CSS should contain @font-face
    expect(result.css).toContain("font-family: 'DM Sans'");
    expect(result.css).toContain("url(/fonts/dm-sans.woff2) format('woff2')");
    // CSS should contain --font-sans var
    expect(result.css).toContain("--font-sans: 'DM Sans', system-ui, sans-serif;");
    // Color vars should still be present
    expect(result.css).toContain('--color-primary-500: #3b82f6');
    // preloadTags should be populated
    expect(result.preloadTags).toContain('dm-sans.woff2');
  });

  it('merges font CSS vars into a single :root block with color/spacing vars', () => {
    const sans = font('DM Sans', {
      weight: '100..1000',
      src: '/fonts/dm-sans.woff2',
      fallback: ['system-ui', 'sans-serif'],
    });
    const theme = defineTheme({
      colors: { primary: { 500: '#3b82f6' } },
      fonts: { sans },
    });
    const result = compileTheme(theme);

    // Should have exactly ONE :root block (not two)
    const rootCount = (result.css.match(/:root\s*\{/g) ?? []).length;
    expect(rootCount).toBe(1);

    // The single :root should contain both font and color vars
    const rootMatch = result.css.match(/:root\s*\{([^}]+)\}/);
    expect(rootMatch).not.toBeNull();
    expect(rootMatch?.[1]).toContain('--font-sans');
    expect(rootMatch?.[1]).toContain('--color-primary-500');
  });

  it('returns empty preloadTags when no fonts are provided', () => {
    const theme = defineTheme({
      colors: { primary: { 500: '#3b82f6' } },
    });
    const result = compileTheme(theme);
    expect(result.preloadTags).toBe('');
  });
});
