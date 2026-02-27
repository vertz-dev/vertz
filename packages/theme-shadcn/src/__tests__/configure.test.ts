import { describe, expect, it } from 'bun:test';
import { compileTheme } from '@vertz/ui';
import { configureTheme } from '../configure';

describe('configureTheme', () => {
  it('returns theme, globals, and styles with zero config', () => {
    const result = configureTheme();
    expect(result.theme).toBeDefined();
    expect(result.globals).toBeDefined();
    expect(result.styles).toBeDefined();
  });

  it('returns a theme that compileTheme() accepts', () => {
    const { theme } = configureTheme();
    const compiled = compileTheme(theme);
    expect(compiled.css).toContain(':root');
    expect(compiled.css).toContain('--color-primary');
    expect(compiled.css).toContain('--color-primary-foreground');
  });

  it('compiled theme has light and dark blocks', () => {
    const { theme } = configureTheme();
    const compiled = compileTheme(theme);
    expect(compiled.css).toContain(':root');
    expect(compiled.css).toContain('[data-theme="dark"]');
  });

  it('palette selection changes compiled CSS output', () => {
    const zinc = configureTheme({ palette: 'zinc' });
    const slate = configureTheme({ palette: 'slate' });
    const zincCss = compileTheme(zinc.theme).css;
    const slateCss = compileTheme(slate.theme).css;
    expect(zincCss).not.toBe(slateCss);
  });

  it('token overrides appear in compiled CSS', () => {
    const { theme } = configureTheme({
      overrides: {
        tokens: {
          colors: {
            primary: { DEFAULT: '#7c3aed' },
          },
        },
      },
    });
    const compiled = compileTheme(theme);
    expect(compiled.css).toContain('#7c3aed');
  });

  it('globals contains CSS string', () => {
    const { globals } = configureTheme();
    expect(typeof globals.css).toBe('string');
    expect(globals.css.length).toBeGreaterThan(0);
  });

  it('globals contains box-sizing reset', () => {
    const { globals } = configureTheme();
    expect(globals.css).toContain('box-sizing');
  });

  it('radius selection injects --radius custom property', () => {
    const { globals } = configureTheme({ radius: 'lg' });
    expect(globals.css).toContain('--radius');
  });

  it('defaults to zinc palette', () => {
    const defaultResult = configureTheme();
    const zincResult = configureTheme({ palette: 'zinc' });
    const defaultCss = compileTheme(defaultResult.theme).css;
    const zincCss = compileTheme(zincResult.theme).css;
    expect(defaultCss).toBe(zincCss);
  });
});
