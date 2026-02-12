import { describe, expect, it } from 'vitest';
import { compileTheme, defineTheme } from '../../index';

describe('compileTheme public export [ui-018]', () => {
  it('compileTheme is exported from the public API', () => {
    expect(compileTheme).toBeDefined();
    expect(typeof compileTheme).toBe('function');
  });

  it('compileTheme works end-to-end with defineTheme output', () => {
    const theme = defineTheme({
      colors: {
        primary: { 500: '#3b82f6', 600: '#2563eb' },
        background: { DEFAULT: 'white', _dark: '#111827' },
      },
      spacing: {
        sm: '0.5rem',
        md: '1rem',
      },
    });

    const result = compileTheme(theme);

    // Returns compiled CSS
    expect(result.css).toContain(':root');
    expect(result.css).toContain('--color-primary-500: #3b82f6');
    expect(result.css).toContain('--color-background: white');
    expect(result.css).toContain('--spacing-sm: 0.5rem');
    expect(result.css).toContain('[data-theme="dark"]');
    expect(result.css).toContain('--color-background: #111827');

    // Returns token paths
    expect(result.tokens).toContain('primary.500');
    expect(result.tokens).toContain('primary.600');
    expect(result.tokens).toContain('background');
    expect(result.tokens).toContain('spacing.sm');
    expect(result.tokens).toContain('spacing.md');
  });

  it('compileTheme returns the CompiledTheme shape', () => {
    const theme = defineTheme({
      colors: { accent: { 100: '#fee2e2' } },
    });

    const result = compileTheme(theme);

    expect(result).toHaveProperty('css');
    expect(result).toHaveProperty('tokens');
    expect(typeof result.css).toBe('string');
    expect(Array.isArray(result.tokens)).toBe(true);
  });
});
