import { describe, expect, it } from 'vitest';
import { compileTheme, defineTheme } from '../theme';
import { palettes, type ColorPalette } from '../palettes';

const OKLCH_PATTERN = /^oklch\([^)]+\)$/;
const SHADES = ['50', '100', '200', '300', '400', '500', '600', '700', '800', '900', '950'] as const;

describe('palettes', () => {
  // Palettes should exist
  it('should export palettes object', () => {
    expect(palettes).toBeDefined();
  });

  // Test that each palette has all shades (50-950)
  describe('color palette structure', () => {
    const paletteNames = [
      'slate',
      'gray',
      'zinc',
      'neutral',
      'stone',
      'red',
      'orange',
      'amber',
      'yellow',
      'lime',
      'green',
      'emerald',
      'teal',
      'cyan',
      'sky',
      'blue',
      'indigo',
      'violet',
      'purple',
      'fuchsia',
      'pink',
      'rose',
    ] as const;

    it.each(paletteNames)('should have all shades for %s palette', (name) => {
      const palette = palettes[name];
      SHADES.forEach((shade) => {
        expect(palette[shade]).toBeDefined();
      });
    });
  });

  // Test that all values are valid oklch strings
  describe('oklch format validation', () => {
    const paletteNames = [
      'slate',
      'gray',
      'zinc',
      'neutral',
      'stone',
      'red',
      'orange',
      'amber',
      'yellow',
      'lime',
      'green',
      'emerald',
      'teal',
      'cyan',
      'sky',
      'blue',
      'indigo',
      'violet',
      'purple',
      'fuchsia',
      'pink',
      'rose',
    ] as const;

    it.each(paletteNames)('all %s values should be valid oklch strings', (name) => {
      const palette = palettes[name];
      SHADES.forEach((shade) => {
        expect(palette[shade]).toMatch(OKLCH_PATTERN);
      });
    });
  });
});

describe('defineTheme with palette objects', () => {
  it('should accept a palette object for color namespace', () => {
    // This tests that when we pass a palette object (like palettes.blue) 
    // to defineTheme, it expands into the shade map
    const theme = defineTheme({
      colors: {
        primary: palettes.blue,
      },
    });
    expect(theme.colors.primary).toEqual(palettes.blue);
  });

  it('should expand palette into shade map with numeric keys', () => {
    const theme = defineTheme({
      colors: {
        primary: palettes.blue,
      },
    });
    expect(theme.colors.primary['50']).toBeDefined();
    expect(theme.colors.primary['500']).toBeDefined();
    expect(theme.colors.primary['950']).toBeDefined();
  });
});

describe('compileTheme with oklch values', () => {
  it('should output oklch CSS custom properties', () => {
    const theme = defineTheme({
      colors: {
        primary: palettes.blue,
      },
    });
    const { css } = compileTheme(theme);
    // Should contain oklch values
    expect(css).toContain('oklch');
    expect(css).toContain('--color-primary-500');
  });

  it('should generate all shade CSS variables from palette', () => {
    const theme = defineTheme({
      colors: {
        brand: palettes.emerald,
      },
    });
    const { css } = compileTheme(theme);
    // Should have all shades
    SHADES.forEach((shade) => {
      expect(css).toContain(`--color-brand-${shade}:`);
    });
  });
});
