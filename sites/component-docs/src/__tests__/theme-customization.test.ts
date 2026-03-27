import { describe, expect, it } from 'bun:test';
import { generateConfig } from '../hooks/use-customization';

describe('Feature: Theme customizer config export', () => {
  describe('Given generateConfig()', () => {
    describe('When default palette (zinc), radius (md), and accent (default) are selected', () => {
      it('Then generates configureTheme() with no options', () => {
        const result = generateConfig({ palette: 'zinc', radius: 'md', accent: 'default' });
        expect(result).toContain("import { configureTheme } from '@vertz/theme-shadcn';");
        expect(result).toContain("import { registerTheme } from '@vertz/ui';");
        expect(result).toContain('const config = configureTheme();');
        expect(result).toContain('registerTheme(config);');
      });
    });

    describe('When only palette is non-default', () => {
      it('Then generates configureTheme with palette option', () => {
        const result = generateConfig({ palette: 'slate', radius: 'md', accent: 'default' });
        expect(result).toContain("palette: 'slate',");
        expect(result).not.toContain('radius');
      });
    });

    describe('When only radius is non-default', () => {
      it('Then generates configureTheme with radius option', () => {
        const result = generateConfig({ palette: 'zinc', radius: 'lg', accent: 'default' });
        expect(result).toContain("radius: 'lg',");
        expect(result).not.toContain('palette');
      });
    });

    describe('When both palette and radius are non-default', () => {
      it('Then generates configureTheme with both options', () => {
        const result = generateConfig({ palette: 'stone', radius: 'sm', accent: 'default' });
        expect(result).toContain("palette: 'stone',");
        expect(result).toContain("radius: 'sm',");
      });
    });

    describe('When accent color is non-default', () => {
      it('Then generates configureTheme with colors for accent tokens', () => {
        const result = generateConfig({ palette: 'zinc', radius: 'md', accent: 'blue' });
        expect(result).toContain('colors: {');
        expect(result).not.toContain('overrides');
        expect(result).toContain("'primary':");
        expect(result).toContain("'primary-foreground':");
        expect(result).toContain("'ring':");
        expect(result).toContain('DEFAULT:');
        expect(result).toContain('_dark:');
      });
    });

    describe('When both palette and accent are non-default', () => {
      it('Then generates configureTheme with palette and colors', () => {
        const result = generateConfig({ palette: 'slate', radius: 'md', accent: 'rose' });
        expect(result).toContain("palette: 'slate',");
        expect(result).toContain('colors: {');
        expect(result).not.toContain('overrides');
        expect(result).toContain("'primary':");
      });
    });
  });
});
