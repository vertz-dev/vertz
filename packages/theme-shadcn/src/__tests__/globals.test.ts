import { describe, expect, it } from '@vertz/test';
import { compileTheme } from '@vertz/ui';
import { configureThemeBase } from '../base';

describe('theme globals', () => {
  it('hides dialog elements without open attribute to prevent SSR flash', () => {
    const { globals } = configureThemeBase();
    expect(globals.css).toContain('dialog:not([open])');
    expect(globals.css).toContain('display: none');
  });

  // Regression guard: `token.radius.lg` compiles to `var(--radius-lg)`, but
  // only `--radius` was being emitted — so `border-radius` fell back to 0 and
  // every button/card shipped with squared corners. Emit the shadcn-style
  // calc-based scale plus `full` so the radius tokens resolve out of the box.
  it('emits shadcn-style calc-based radius scale vars so token.radius.* resolves', () => {
    const { globals } = configureThemeBase();
    expect(globals.css).toContain('--radius-none: 0');
    expect(globals.css).toContain('--radius-xs: calc(var(--radius) - 6px)');
    expect(globals.css).toContain('--radius-sm: calc(var(--radius) - 4px)');
    expect(globals.css).toContain('--radius-md: calc(var(--radius) - 2px)');
    expect(globals.css).toContain('--radius-lg: var(--radius)');
    expect(globals.css).toContain('--radius-xl: calc(var(--radius) + 4px)');
    expect(globals.css).toContain('--radius-2xl: calc(var(--radius) + 8px)');
    expect(globals.css).toContain('--radius-3xl: calc(var(--radius) + 12px)');
    expect(globals.css).toContain('--radius-full: 9999px');
  });
});

describe('configureThemeBase() default scales', () => {
  // Regression guard: landing used `token.spacing[4]`, `token.font.size.lg`, etc.
  // Without default scales from `configureThemeBase`, every consumer was shipping
  // unresolvable `var(--spacing-4)` / `var(--font-size-lg)` references and
  // rendering with no padding / unstyled text.
  it('exposes a Tailwind-compatible spacing scale via theme.spacing', () => {
    const { theme } = configureThemeBase();
    expect(theme.spacing?.['4']).toBe('1rem');
    expect(theme.spacing?.['1.5']).toBe('0.375rem');
    expect(theme.spacing?.['80']).toBe('20rem');
  });

  it('exposes a t-shirt font-size scale via theme.fontSize', () => {
    const { theme } = configureThemeBase();
    expect(theme.fontSize?.xs).toBe('0.75rem');
    expect(theme.fontSize?.base).toBe('1rem');
    expect(theme.fontSize?.xl).toBe('1.25rem');
  });

  it('exposes font-weight and line-height scales', () => {
    const { theme } = configureThemeBase();
    expect(theme.fontWeight?.medium).toBe('500');
    expect(theme.fontWeight?.semibold).toBe('600');
    expect(theme.fontLineHeight?.relaxed).toBe('1.625');
    expect(theme.fontLineHeight?.normal).toBe('1.5');
  });

  it('exposes a raw gray ramp on theme.colors.gray', () => {
    const { theme } = configureThemeBase();
    expect(theme.colors.gray?.['500']).toBeDefined();
    expect(theme.colors.gray?.['950']).toBeDefined();
  });

  it('compileTheme(theme) produces the matching CSS custom properties', () => {
    const { theme } = configureThemeBase();
    const { css } = compileTheme(theme);
    expect(css).toContain('--spacing-4: 1rem');
    expect(css).toContain('--font-size-lg: 1.125rem');
    expect(css).toContain('--font-weight-medium: 500');
    expect(css).toContain('--font-line-height-relaxed: 1.625');
    expect(css).toContain('--color-gray-500:');
  });
});
