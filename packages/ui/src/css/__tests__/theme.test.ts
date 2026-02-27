import { describe, expect, it } from 'bun:test';
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
});
