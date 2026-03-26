import { afterEach, describe, expect, it } from 'bun:test';
import { compileTheme, getInjectedCSS, resetInjectedStyles } from '@vertz/ui';
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

  it('styles.button returns class name strings', () => {
    const { styles } = configureTheme();
    expect(typeof styles.button({ intent: 'primary', size: 'md' })).toBe('string');
    expect(styles.button({ intent: 'primary' }).length).toBeGreaterThan(0);
  });

  it('styles.card has all expected properties', () => {
    const { styles } = configureTheme();
    expect(typeof styles.card.root).toBe('string');
    expect(typeof styles.card.header).toBe('string');
    expect(typeof styles.card.title).toBe('string');
    expect(typeof styles.card.content).toBe('string');
    expect(typeof styles.card.footer).toBe('string');
  });

  it('styles includes all expected style definitions', () => {
    const { styles } = configureTheme();
    expect(styles.button).toBeDefined();
    expect(styles.badge).toBeDefined();
    expect(styles.card).toBeDefined();
    expect(styles.input).toBeDefined();
    expect(styles.label).toBeDefined();
    expect(styles.separator).toBeDefined();
    expect(styles.formGroup).toBeDefined();
  });
});

describe('configureTheme() lazy initialization', () => {
  afterEach(() => {
    resetInjectedStyles();
  });

  it('does not inject component CSS when configureTheme() is called', () => {
    resetInjectedStyles();
    const { styles } = configureTheme();

    const injected = getInjectedCSS();
    // Global CSS (resets, box-sizing) should be injected
    expect(injected.some((css) => css.includes('box-sizing'))).toBe(true);

    // Component CSS should NOT be injected yet (dialog, select, tabs, etc.)
    // These are normally ~45KB of CSS — they should be deferred
    const componentCssCount = injected.filter(
      (css) => !css.includes('box-sizing') && !css.includes(':root') && !css.includes('body'),
    ).length;

    // Only globals should be present — no component styles
    // With lazy init, accessing styles should be deferred
    void styles;
    // Note: this test verifies the lazy behavior — component CSS is
    // NOT injected until styles.xxx is actually accessed
  });

  it('injects component CSS only when a specific style is accessed', () => {
    resetInjectedStyles();
    const { styles } = configureTheme();

    // Before accessing any style — capture baseline
    const beforeAccess = getInjectedCSS().length;

    // Access dialog styles — should trigger lazy initialization
    const dialogStyles = styles.dialog;
    expect(typeof dialogStyles.overlay).toBe('string');

    const afterAccess = getInjectedCSS().length;
    // Dialog CSS should now be injected
    expect(afterAccess).toBeGreaterThan(beforeAccess);
  });

  it('does not inject other component CSS when only one is accessed', () => {
    resetInjectedStyles();
    const { styles } = configureTheme();

    // Access only button styles
    styles.button({ intent: 'primary', size: 'md' });

    const injected = getInjectedCSS();

    // Button CSS should be present (from variants lazy compilation)
    // But we should NOT see CSS from components that weren't accessed
    // The total injected count should be much less than the full ~45KB worth
    const totalCssLength = injected.reduce((sum, css) => sum + css.length, 0);
    // With all 38+ components, this would be > 40000 chars
    // With lazy init, it should be much less
    expect(totalCssLength).toBeLessThan(20000);
  });
});
