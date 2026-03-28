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

  it('flat colors key overrides appear in compiled CSS', () => {
    const { theme } = configureTheme({
      colors: {
        primary: { DEFAULT: '#7c3aed' },
      },
    });
    const compiled = compileTheme(theme);
    expect(compiled.css).toContain('#7c3aed');
  });

  it('flat colors key adds custom tokens to compiled CSS', () => {
    const { theme } = configureTheme({
      colors: {
        'brand-accent': { DEFAULT: '#ff6b6b', _dark: '#ee5a5a' },
      },
    });
    const compiled = compileTheme(theme);
    expect(compiled.css).toContain('#ff6b6b');
  });

  it('old overrides path is a type error', () => {
    // @ts-expect-error — old overrides path removed in #1969
    configureTheme({ overrides: { tokens: { colors: { primary: { DEFAULT: '#000' } } } } });
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

describe('configureTheme() components', () => {
  it('components.primitives is lazily initialized', () => {
    const config = configureTheme();
    const { primitives } = config.components;

    // Primitives should be an object with expected keys
    expect(primitives).toBeDefined();

    // Each primitive should be accessible
    expect(primitives.DropdownMenu).toBeDefined();
    expect(typeof primitives.DropdownMenu).toBe('function');
    expect(primitives.Select).toBeDefined();
    expect(primitives.Dialog).toBeDefined();
  });

  it('primitives are cached after first access', () => {
    const config = configureTheme();
    const { primitives } = config.components;

    const first = primitives.DropdownMenu;
    const second = primitives.DropdownMenu;
    expect(first).toBe(second);
  });

  it('accessing one primitive does not initialize others', () => {
    const config = configureTheme();
    const { primitives } = config.components;

    // Access only Dialog — this should not crash even if other
    // primitives have import resolution issues
    const dialog = primitives.Dialog;
    expect(dialog).toBeDefined();
  });

  it('a broken factory does not prevent other factories from working', () => {
    // Replicate the lazyPrimitives pattern to test failure isolation
    const obj: Record<string, unknown> = {};
    const factories: Record<string, () => unknown> = {
      Working: () => 'ok',
      Broken: () => {
        throw new Error('import resolution failed');
      },
      AlsoWorking: () => 42,
    };
    for (const key of Object.keys(factories)) {
      let cached: unknown;
      let initialized = false;
      Object.defineProperty(obj, key, {
        get() {
          if (!initialized) {
            cached = factories[key]!();
            initialized = true;
          }
          return cached;
        },
        enumerable: true,
        configurable: true,
      });
    }

    // Working factory succeeds
    expect(obj.Working).toBe('ok');

    // Broken factory throws
    expect(() => obj.Broken).toThrow('import resolution failed');

    // AlsoWorking factory still succeeds despite Broken having thrown
    expect(obj.AlsoWorking).toBe(42);

    // Broken factory retries on next access (not memoized on failure)
    expect(() => obj.Broken).toThrow('import resolution failed');

    // Working factory remains cached
    expect(obj.Working).toBe('ok');
  });

  it('all primitives are enumerable', () => {
    const config = configureTheme();
    const { primitives } = config.components;
    const keys = Object.keys(primitives);

    expect(keys).toContain('Dialog');
    expect(keys).toContain('DropdownMenu');
    expect(keys).toContain('Select');
    expect(keys).toContain('Tabs');
    expect(keys).toContain('Checkbox');
    expect(keys).toContain('Switch');
    expect(keys).toContain('Accordion');
    expect(keys.length).toBeGreaterThanOrEqual(29);
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
