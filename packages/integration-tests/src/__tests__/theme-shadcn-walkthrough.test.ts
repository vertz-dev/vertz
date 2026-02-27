// ===========================================================================
// Theme Shadcn Developer Walkthrough — Public API Validation Test
//
// This test validates that a developer can use the configureTheme() API
// using ONLY public imports from @vertz/theme-shadcn and @vertz/ui.
//
// Covers: configureTheme(), palette selection, token overrides, style
// definitions (button, badge, card, input, label, separator, formGroup),
// and integration with compileTheme().
//
// Uses only public package imports — never relative imports.
// ===========================================================================

import { configureTheme } from '@vertz/theme-shadcn';
import { buttonConfig, badgeConfig } from '@vertz/theme-shadcn/configs';
import { compileTheme, variants } from '@vertz/ui';
import { describe, expect, it } from 'vitest';

describe('Theme Shadcn Walkthrough', () => {
  // ── configureTheme() returns valid result ────────────────────

  it('configureTheme() returns theme, globals, and styles', () => {
    const result = configureTheme();
    expect(result.theme).toBeDefined();
    expect(result.globals).toBeDefined();
    expect(result.styles).toBeDefined();
  });

  it('works with all 5 palettes', () => {
    for (const palette of ['zinc', 'slate', 'stone', 'neutral', 'gray'] as const) {
      const { theme } = configureTheme({ palette });
      expect(theme.colors).toBeDefined();
    }
  });

  // ── compileTheme() integration ───────────────────────────────

  it('theme integrates with compileTheme()', () => {
    const { theme } = configureTheme({ palette: 'zinc' });
    const compiled = compileTheme(theme);
    expect(compiled.css).toContain('--color-primary');
    expect(compiled.css).toContain('--color-background');
    expect(compiled.css).toContain('--color-foreground');
    expect(compiled.css).toContain('data-theme="dark"');
  });

  // ── Token overrides ──────────────────────────────────────────

  it('token overrides are reflected in compiled CSS', () => {
    const { theme } = configureTheme({
      palette: 'zinc',
      overrides: {
        tokens: {
          colors: {
            primary: { DEFAULT: '#7c3aed', _dark: '#8b5cf6' },
          },
        },
      },
    });
    const compiled = compileTheme(theme);
    expect(compiled.css).toContain('#7c3aed');
  });

  it('token overrides can add new tokens', () => {
    const { theme } = configureTheme({
      overrides: {
        tokens: {
          colors: {
            'brand-accent': { DEFAULT: '#ff6b6b', _dark: '#ee5a5a' },
          },
        },
      },
    });
    const compiled = compileTheme(theme);
    expect(compiled.css).toContain('#ff6b6b');
  });

  // ── Style definitions ────────────────────────────────────────

  it('styles.button returns class names for all intents', () => {
    const { styles } = configureTheme();
    for (const intent of ['primary', 'secondary', 'destructive', 'ghost', 'outline']) {
      const className = styles.button({ intent });
      expect(typeof className).toBe('string');
      expect(className.length).toBeGreaterThan(0);
    }
  });

  it('styles.button has generated CSS', () => {
    const { styles } = configureTheme();
    expect(styles.button.css).toContain('opacity');
  });

  it('styles.badge returns class names for all colors', () => {
    const { styles } = configureTheme();
    for (const color of ['blue', 'green', 'yellow', 'red', 'gray']) {
      expect(typeof styles.badge({ color })).toBe('string');
    }
  });

  it('styles.card has all block class names', () => {
    const { styles } = configureTheme();
    expect(typeof styles.card.root).toBe('string');
    expect(typeof styles.card.header).toBe('string');
    expect(typeof styles.card.title).toBe('string');
    expect(typeof styles.card.description).toBe('string');
    expect(typeof styles.card.content).toBe('string');
    expect(typeof styles.card.footer).toBe('string');
  });

  it('styles.input, label, separator, formGroup have base class names', () => {
    const { styles } = configureTheme();
    expect(styles.input.base.length).toBeGreaterThan(0);
    expect(styles.label.base.length).toBeGreaterThan(0);
    expect(styles.separator.base.length).toBeGreaterThan(0);
    expect(styles.formGroup.base.length).toBeGreaterThan(0);
    expect(styles.formGroup.error.length).toBeGreaterThan(0);
  });

  // ── Config spread customization ──────────────────────────────

  it('buttonConfig can be spread to add a new intent', () => {
    const customButton = variants({
      ...buttonConfig,
      variants: {
        ...buttonConfig.variants,
        intent: {
          ...buttonConfig.variants.intent,
          brand: ['bg:primary', 'text:primary-foreground', 'rounded:full'],
        },
      },
    });
    expect(typeof customButton({ intent: 'brand' })).toBe('string');
    expect(typeof customButton({ intent: 'primary' })).toBe('string');
  });

  it('badgeConfig can be spread to add a new color', () => {
    const customBadge = variants({
      ...badgeConfig,
      variants: {
        ...badgeConfig.variants,
        color: {
          ...badgeConfig.variants.color,
          purple: ['bg:accent', 'text:accent-foreground'],
        },
      },
    });
    expect(typeof customBadge({ color: 'purple' })).toBe('string');
    expect(typeof customBadge({ color: 'blue' })).toBe('string');
  });

  // ── Globals ──────────────────────────────────────────────────

  it('globals contain CSS reset and typography', () => {
    const { globals } = configureTheme();
    expect(globals.css).toContain('box-sizing');
    expect(globals.css).toContain('font-family');
  });
});
