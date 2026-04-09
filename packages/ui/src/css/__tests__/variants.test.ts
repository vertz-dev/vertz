import { afterEach, describe, expect, it } from '@vertz/test';
import { getInjectedCSS, resetInjectedStyles } from '../css';
import { variants } from '../variants';

describe('variants() lazy compilation', () => {
  afterEach(() => {
    resetInjectedStyles();
  });

  it('only injects base CSS when the variant function is created but never called', () => {
    resetInjectedStyles();
    const button = variants({
      base: ['p:4'],
      variants: {
        intent: {
          primary: ['bg:primary'],
          secondary: ['bg:secondary'],
        },
        size: {
          sm: ['h:8'],
          md: ['h:10'],
        },
      },
      defaultVariants: { intent: 'primary', size: 'md' },
    });

    const injected = getInjectedCSS();
    // Base CSS should be injected
    expect(injected.some((css) => css.includes('padding: 1rem'))).toBe(true);
    // Variant option CSS should NOT be injected yet
    expect(injected.some((css) => css.includes('height: 2rem'))).toBe(false); // h:8
    expect(injected.some((css) => css.includes('height: 2.5rem'))).toBe(false); // h:10
    // Suppress unused var
    void button;
  });

  it('injects CSS for only the used variant options when called', () => {
    resetInjectedStyles();
    const button = variants({
      base: ['p:4'],
      variants: {
        intent: {
          primary: ['bg:primary'],
          secondary: ['bg:secondary'],
        },
        size: {
          sm: ['h:8'],
          md: ['h:10'],
        },
      },
      defaultVariants: { intent: 'primary', size: 'md' },
    });

    // Call with specific options
    button({ intent: 'primary', size: 'sm' });

    const injected = getInjectedCSS();
    // Used options should be injected
    expect(injected.some((css) => css.includes('height: 2rem'))).toBe(true); // h:8 = sm
    // Unused options should NOT be injected
    expect(injected.some((css) => css.includes('height: 2.5rem'))).toBe(false); // h:10 = md
  });

  it('does not re-inject CSS for already-compiled variant options', () => {
    resetInjectedStyles();
    const button = variants({
      base: ['p:4'],
      variants: {
        size: {
          sm: ['h:8'],
          md: ['h:10'],
        },
      },
      defaultVariants: { size: 'md' },
    });

    button({ size: 'sm' });
    const afterFirst = getInjectedCSS().length;
    button({ size: 'sm' }); // same option again
    const afterSecond = getInjectedCSS().length;

    expect(afterSecond).toBe(afterFirst);
  });

  it('lazily compiles compound variants only when all conditions match', () => {
    resetInjectedStyles();
    const button = variants({
      base: ['rounded:md'],
      variants: {
        intent: {
          primary: ['bg:primary.600'],
          secondary: ['bg:background'],
        },
        size: {
          sm: ['h:8'],
          md: ['h:10'],
        },
      },
      defaultVariants: { intent: 'primary', size: 'md' },
      compoundVariants: [{ intent: 'primary', size: 'sm', styles: ['px:2'] }],
    });

    // Call without matching compound conditions
    button({ intent: 'secondary', size: 'sm' });
    const beforeCompound = getInjectedCSS();
    expect(
      beforeCompound.some((css) => css.includes('padding-left:') && css.includes('0.5rem')),
    ).toBe(false);

    // Call with matching compound conditions
    button({ intent: 'primary', size: 'sm' });
    const afterCompound = getInjectedCSS();
    expect(afterCompound.some((css) => css.includes('0.5rem'))).toBe(true);
  });

  it('fn.css returns only CSS for base + used options', () => {
    resetInjectedStyles();
    const button = variants({
      base: ['p:4'],
      variants: {
        size: {
          sm: ['h:8'],
          md: ['h:10'],
        },
      },
      defaultVariants: { size: 'md' },
    });

    // Before any call — only base CSS
    expect(button.css).toContain('padding: 1rem');
    expect(button.css).not.toContain('height: 2rem');
    expect(button.css).not.toContain('height: 2.5rem');

    // After calling with size: 'sm'
    button({ size: 'sm' });
    expect(button.css).toContain('height: 2rem'); // h:8
    expect(button.css).not.toContain('height: 2.5rem'); // h:10 still unused
  });
});

describe('variants()', () => {
  // IT-2B-1: variants() generates classes per variant combination
  it('generates correct classes for each variant', () => {
    const button = variants({
      base: ['flex', 'weight:medium', 'rounded:md'],
      variants: {
        intent: {
          primary: ['bg:primary.600', 'text:foreground'],
          secondary: ['bg:background', 'text:muted'],
        },
        size: {
          sm: ['font:xs', 'h:8'],
          md: ['font:sm', 'h:10'],
        },
      },
      defaultVariants: { intent: 'primary', size: 'md' },
    });

    const className = button({ intent: 'secondary', size: 'sm' });
    expect(className).toBeTruthy();
    expect(typeof className).toBe('string');
  });

  // IT-2B-2: Default variants apply when no override is given
  it('uses default variants when not specified', () => {
    const button = variants({
      base: ['rounded:md'],
      variants: { size: { sm: ['h:8'], md: ['h:10'] } },
      defaultVariants: { size: 'md' },
    });
    const defaultClass = button();
    const smClass = button({ size: 'sm' });
    expect(defaultClass).not.toBe(smClass);
  });

  it('returns a string class name from base styles alone', () => {
    const box = variants({
      base: ['p:4', 'bg:background'],
      variants: {},
    });

    const className = box();
    expect(typeof className).toBe('string');
    expect(className.length).toBeGreaterThan(0);
  });

  it('merges base and variant class names', () => {
    const button = variants({
      base: ['rounded:md'],
      variants: {
        size: {
          sm: ['h:8'],
          md: ['h:10'],
        },
      },
      defaultVariants: { size: 'sm' },
    });

    const className = button({ size: 'sm' });
    // Should contain both base and variant class names (space-separated)
    const parts = className.split(' ');
    expect(parts.length).toBeGreaterThanOrEqual(2);
  });

  it('applies compound variants when multiple variant values match', () => {
    const button = variants({
      base: ['flex', 'rounded:md'],
      variants: {
        intent: {
          primary: ['bg:primary.600'],
          secondary: ['bg:background'],
        },
        size: {
          sm: ['h:8'],
          md: ['h:10'],
        },
      },
      defaultVariants: { intent: 'primary', size: 'md' },
      compoundVariants: [{ intent: 'primary', size: 'sm', styles: ['px:2'] }],
    });

    // Compound should apply: intent=primary + size=sm
    const withCompound = button({ intent: 'primary', size: 'sm' });
    // Without compound match: intent=secondary + size=sm
    const withoutCompound = button({ intent: 'secondary', size: 'sm' });

    expect(withCompound).not.toBe(withoutCompound);
    // The compound match should have more class parts
    const compoundParts = withCompound.split(' ');
    const nonCompoundParts = withoutCompound.split(' ');
    expect(compoundParts.length).toBeGreaterThan(nonCompoundParts.length);
  });

  it('returns deterministic class names for the same config', () => {
    const makeConfig = () => ({
      base: ['p:4'] as string[],
      variants: {
        size: {
          sm: ['h:8'] as string[],
          md: ['h:10'] as string[],
        },
      },
      defaultVariants: { size: 'md' as const },
    });

    const a = variants(makeConfig());
    const b = variants(makeConfig());

    // Identical configs produce identical class names and CSS
    expect(a({ size: 'sm' })).toBe(b({ size: 'sm' }));
    expect(a()).toBe(b());
    expect(a.css).toBe(b.css);
  });

  it('handles variant with no base styles', () => {
    const badge = variants({
      base: [],
      variants: {
        color: {
          red: ['bg:destructive'],
          green: ['bg:success'],
        },
      },
      defaultVariants: { color: 'red' },
    });

    const className = badge({ color: 'green' });
    expect(typeof className).toBe('string');
    expect(className.length).toBeGreaterThan(0);
  });

  it('handles multiple compound variant rules', () => {
    const button = variants({
      base: ['rounded:md'],
      variants: {
        intent: {
          primary: ['bg:primary.600'],
          secondary: ['bg:background'],
        },
        size: {
          sm: ['h:8'],
          md: ['h:10'],
        },
      },
      defaultVariants: { intent: 'primary', size: 'md' },
      compoundVariants: [
        { intent: 'primary', size: 'sm', styles: ['px:2'] },
        { intent: 'secondary', size: 'md', styles: ['px:4'] },
      ],
    });

    const primarySm = button({ intent: 'primary', size: 'sm' });
    const secondaryMd = button({ intent: 'secondary', size: 'md' });
    const primaryMd = button({ intent: 'primary', size: 'md' });

    // Both compound rules should produce different results from non-compound
    expect(primarySm).not.toBe(primaryMd);
    expect(secondaryMd).not.toBe(primaryMd);
  });

  it('allows partial variant overrides (fills from defaults)', () => {
    const button = variants({
      base: ['rounded:md'],
      variants: {
        intent: {
          primary: ['bg:primary.600'],
          secondary: ['bg:background'],
        },
        size: {
          sm: ['h:8'],
          md: ['h:10'],
        },
      },
      defaultVariants: { intent: 'primary', size: 'md' },
    });

    // Only override size, intent should come from defaults
    const partialOverride = button({ size: 'sm' });
    const fullOverride = button({ intent: 'primary', size: 'sm' });
    expect(partialOverride).toBe(fullOverride);
  });

  it('works with empty variants object', () => {
    const box = variants({
      base: ['p:4', 'rounded:md'],
      variants: {},
    });

    const className = box();
    expect(typeof className).toBe('string');
    expect(className.length).toBeGreaterThan(0);
  });

  it('produces CSS output for each used variant combination', () => {
    const button = variants({
      base: ['p:4'],
      variants: {
        size: {
          sm: ['h:8'],
          md: ['h:10'],
        },
      },
      defaultVariants: { size: 'md' },
    });

    // Trigger lazy compilation of both options
    button({ size: 'sm' });
    button({ size: 'md' });

    // The css property should contain all generated CSS rules for used options
    expect(button.css).toBeDefined();
    expect(typeof button.css).toBe('string');
    expect(button.css.length).toBeGreaterThan(0);
    expect(button.css).toContain('padding: 1rem');
    expect(button.css).toContain('height: 2rem'); // h:8 = 2rem
    expect(button.css).toContain('height: 2.5rem'); // h:10 = 2.5rem
  });

  it('compound variant does not apply when conditions are not fully met', () => {
    const button = variants({
      base: ['rounded:md'],
      variants: {
        intent: {
          primary: ['bg:primary.600'],
          secondary: ['bg:background'],
        },
        size: {
          sm: ['h:8'],
          md: ['h:10'],
        },
      },
      defaultVariants: { intent: 'primary', size: 'md' },
      compoundVariants: [{ intent: 'primary', size: 'sm', styles: ['px:2'] }],
    });

    // intent=primary + size=md does NOT match the compound (needs size=sm)
    const noCompound = button({ intent: 'primary', size: 'md' });
    const withCompound = button({ intent: 'primary', size: 'sm' });

    const noCompoundParts = noCompound.split(' ');
    const withCompoundParts = withCompound.split(' ');
    // Compound match should have the extra compound class
    expect(withCompoundParts.length).toBe(noCompoundParts.length + 1);
  });

  it('calling with no args uses all default variants', () => {
    const button = variants({
      base: ['p:4'],
      variants: {
        intent: {
          primary: ['bg:primary'],
          secondary: ['bg:secondary'],
        },
        size: {
          sm: ['h:8'],
          md: ['h:10'],
        },
      },
      defaultVariants: { intent: 'primary', size: 'md' },
    });

    const noArgs = button();
    const explicitDefaults = button({ intent: 'primary', size: 'md' });
    expect(noArgs).toBe(explicitDefaults);
  });
});
