import { describe, expect, it } from 'vitest';
import { generateThemeTypes } from '../theme-types';

describe('generateThemeTypes()', () => {
  // IT-2C-3: Type generation creates ThemeTokens types from defineTheme()
  it('produces valid ThemeTokens', () => {
    const types = generateThemeTypes({
      colors: {
        primary: { 500: '#3b82f6', 600: '#2563eb' },
        background: { DEFAULT: 'white', _dark: '#111827' },
        foreground: { DEFAULT: '#111827', _dark: 'white' },
      },
    });
    expect(types).toContain("'primary.500': string");
    expect(types).toContain("'primary.600': string");
    expect(types).toContain("'background': string");
    expect(types).toContain("'foreground': string");
  });

  it('generates an exported ThemeTokens type', () => {
    const types = generateThemeTypes({
      colors: {
        primary: { 500: '#3b82f6' },
      },
    });
    expect(types).toContain('export type ThemeTokens');
  });

  it('does not include _dark keys as separate tokens', () => {
    const types = generateThemeTypes({
      colors: {
        background: { DEFAULT: 'white', _dark: '#111827' },
      },
    });
    expect(types).not.toContain('_dark');
    expect(types).toContain("'background': string");
  });

  it('includes spacing tokens', () => {
    const types = generateThemeTypes({
      colors: {},
      spacing: {
        sm: '0.5rem',
        md: '1rem',
      },
    });
    expect(types).toContain("'spacing.sm': string");
    expect(types).toContain("'spacing.md': string");
  });

  it('generates a valid TypeScript type literal', () => {
    const types = generateThemeTypes({
      colors: {
        primary: { 500: '#3b82f6' },
      },
    });
    // Should be a valid type literal format
    expect(types).toMatch(/export type ThemeTokens\s*=\s*\{/);
    expect(types).toMatch(/\};?\s*$/);
  });
});
