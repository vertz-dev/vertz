import { afterEach, describe, expect, it } from '@vertz/test';
import { getInjectedCSS, resetInjectedStyles } from '../css';
import { variants } from '../variants';
import { token } from '@vertz/ui';

describe('variants() lazy compilation', () => {
  afterEach(() => {
    resetInjectedStyles();
  });

  it('only injects base CSS when the variant function is created but never called', () => {
    resetInjectedStyles();
    const button = variants({
      base: { padding: token.spacing[4] },
      variants: {
        intent: {
          primary: { backgroundColor: token.color.primary },
          secondary: { backgroundColor: token.color.secondary },
        },
        size: {
          sm: { height: token.spacing[8] },
          md: { height: token.spacing[10] },
        },
      },
      defaultVariants: { intent: 'primary', size: 'md' },
    });

    const injected = getInjectedCSS();
    // Base CSS should be injected
    expect(injected.some((css) => css.includes('padding: var(--spacing-4)'))).toBe(true);
    // Variant option CSS should NOT be injected yet
    expect(injected.some((css) => css.includes('height: var(--spacing-8)'))).toBe(false); // h:8
    expect(injected.some((css) => css.includes('height: var(--spacing-10)'))).toBe(false); // h:10
    // Suppress unused var
    void button;
  });

  it('injects CSS for only the used variant options when called', () => {
    resetInjectedStyles();
    const button = variants({
      base: { padding: token.spacing[4] },
      variants: {
        intent: {
          primary: { backgroundColor: token.color.primary },
          secondary: { backgroundColor: token.color.secondary },
        },
        size: {
          sm: { height: token.spacing[8] },
          md: { height: token.spacing[10] },
        },
      },
      defaultVariants: { intent: 'primary', size: 'md' },
    });

    // Call with specific options
    button({ intent: 'primary', size: 'sm' });

    const injected = getInjectedCSS();
    // Used options should be injected
    expect(injected.some((css) => css.includes('height: var(--spacing-8)'))).toBe(true); // h:8 = sm
    // Unused options should NOT be injected
    expect(injected.some((css) => css.includes('height: var(--spacing-10)'))).toBe(false); // h:10 = md
  });

  it('does not re-inject CSS for already-compiled variant options', () => {
    resetInjectedStyles();
    const button = variants({
      base: { padding: token.spacing[4] },
      variants: {
        size: {
          sm: { height: token.spacing[8] },
          md: { height: token.spacing[10] },
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
      base: { borderRadius: token.radius.md },
      variants: {
        intent: {
          primary: { backgroundColor: token.color.primary[600] },
          secondary: { backgroundColor: token.color.background },
        },
        size: {
          sm: { height: token.spacing[8] },
          md: { height: token.spacing[10] },
        },
      },
      defaultVariants: { intent: 'primary', size: 'md' },
      compoundVariants: [
        { intent: 'primary', size: 'sm', styles: { paddingInline: token.spacing[2] } },
      ],
    });

    // Call without matching compound conditions
    button({ intent: 'secondary', size: 'sm' });
    const beforeCompound = getInjectedCSS();
    expect(
      beforeCompound.some(
        (css) => css.includes('padding-inline:') && css.includes('var(--spacing-2)'),
      ),
    ).toBe(false);

    // Call with matching compound conditions
    button({ intent: 'primary', size: 'sm' });
    const afterCompound = getInjectedCSS();
    expect(afterCompound.some((css) => css.includes('var(--spacing-2)'))).toBe(true);
  });

  it('fn.css returns only CSS for base + used options', () => {
    resetInjectedStyles();
    const button = variants({
      base: { padding: token.spacing[4] },
      variants: {
        size: {
          sm: { height: token.spacing[8] },
          md: { height: token.spacing[10] },
        },
      },
      defaultVariants: { size: 'md' },
    });

    // Before any call — only base CSS
    expect(button.css).toContain('padding: var(--spacing-4)');
    expect(button.css).not.toContain('height: var(--spacing-8)');
    expect(button.css).not.toContain('height: var(--spacing-10)');

    // After calling with size: 'sm'
    button({ size: 'sm' });
    expect(button.css).toContain('height: var(--spacing-8)'); // h:8
    expect(button.css).not.toContain('height: var(--spacing-10)'); // h:10 still unused
  });
});

describe('variants()', () => {
  // IT-2B-1: variants() generates classes per variant combination
  it('generates correct classes for each variant', () => {
    const button = variants({
      base: {
        display: 'flex',
        fontWeight: token.font.weight.medium,
        borderRadius: token.radius.md,
      },
      variants: {
        intent: {
          primary: { backgroundColor: token.color.primary[600], color: token.color.foreground },
          secondary: { backgroundColor: token.color.background, color: token.color.muted },
        },
        size: {
          sm: { fontSize: token.font.size.xs, height: token.spacing[8] },
          md: { fontSize: token.font.size.sm, height: token.spacing[10] },
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
      base: { borderRadius: token.radius.md },
      variants: { size: { sm: { height: token.spacing[8] }, md: { height: token.spacing[10] } } },
      defaultVariants: { size: 'md' },
    });
    const defaultClass = button();
    const smClass = button({ size: 'sm' });
    expect(defaultClass).not.toBe(smClass);
  });

  it('returns a string class name from base styles alone', () => {
    const box = variants({
      base: { padding: token.spacing[4], backgroundColor: token.color.background },
      variants: {},
    });

    const className = box();
    expect(typeof className).toBe('string');
    expect(className.length).toBeGreaterThan(0);
  });

  it('merges base and variant class names', () => {
    const button = variants({
      base: { borderRadius: token.radius.md },
      variants: {
        size: {
          sm: { height: token.spacing[8] },
          md: { height: token.spacing[10] },
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
      base: { display: 'flex', borderRadius: token.radius.md },
      variants: {
        intent: {
          primary: { backgroundColor: token.color.primary[600] },
          secondary: { backgroundColor: token.color.background },
        },
        size: {
          sm: { height: token.spacing[8] },
          md: { height: token.spacing[10] },
        },
      },
      defaultVariants: { intent: 'primary', size: 'md' },
      compoundVariants: [
        { intent: 'primary', size: 'sm', styles: { paddingInline: token.spacing[2] } },
      ],
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
      base: { padding: token.spacing[4] },
      variants: {
        size: {
          sm: { height: token.spacing[8] },
          md: { height: token.spacing[10] },
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
          red: { backgroundColor: token.color.destructive },
          green: { backgroundColor: token.color.success },
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
      base: { borderRadius: token.radius.md },
      variants: {
        intent: {
          primary: { backgroundColor: token.color.primary[600] },
          secondary: { backgroundColor: token.color.background },
        },
        size: {
          sm: { height: token.spacing[8] },
          md: { height: token.spacing[10] },
        },
      },
      defaultVariants: { intent: 'primary', size: 'md' },
      compoundVariants: [
        { intent: 'primary', size: 'sm', styles: { paddingInline: token.spacing[2] } },
        { intent: 'secondary', size: 'md', styles: { paddingInline: token.spacing[4] } },
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
      base: { borderRadius: token.radius.md },
      variants: {
        intent: {
          primary: { backgroundColor: token.color.primary[600] },
          secondary: { backgroundColor: token.color.background },
        },
        size: {
          sm: { height: token.spacing[8] },
          md: { height: token.spacing[10] },
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
      base: { padding: token.spacing[4], borderRadius: token.radius.md },
      variants: {},
    });

    const className = box();
    expect(typeof className).toBe('string');
    expect(className.length).toBeGreaterThan(0);
  });

  it('produces CSS output for each used variant combination', () => {
    const button = variants({
      base: { padding: token.spacing[4] },
      variants: {
        size: {
          sm: { height: token.spacing[8] },
          md: { height: token.spacing[10] },
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
    expect(button.css).toContain('padding: var(--spacing-4)');
    expect(button.css).toContain('height: var(--spacing-8)'); // h:8 = 2rem
    expect(button.css).toContain('height: var(--spacing-10)'); // h:10 = 2.5rem
  });

  it('compound variant does not apply when conditions are not fully met', () => {
    const button = variants({
      base: { borderRadius: token.radius.md },
      variants: {
        intent: {
          primary: { backgroundColor: token.color.primary[600] },
          secondary: { backgroundColor: token.color.background },
        },
        size: {
          sm: { height: token.spacing[8] },
          md: { height: token.spacing[10] },
        },
      },
      defaultVariants: { intent: 'primary', size: 'md' },
      compoundVariants: [
        { intent: 'primary', size: 'sm', styles: { paddingInline: token.spacing[2] } },
      ],
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
      base: { padding: token.spacing[4] },
      variants: {
        intent: {
          primary: { backgroundColor: token.color.primary },
          secondary: { backgroundColor: token.color.secondary },
        },
        size: {
          sm: { height: token.spacing[8] },
          md: { height: token.spacing[10] },
        },
      },
      defaultVariants: { intent: 'primary', size: 'md' },
    });

    const noArgs = button();
    const explicitDefaults = button({ intent: 'primary', size: 'md' });
    expect(noArgs).toBe(explicitDefaults);
  });
});
