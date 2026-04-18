import { afterEach, beforeEach, describe, expect, it } from '@vertz/test';
import { createTestSSRContext, disableTestSSR, enableTestSSR } from '../../ssr/test-ssr-helpers';
import { css, getInjectedCSS, injectCSS, resetInjectedStyles } from '../css';
import { token } from '@vertz/ui';

/** Read all CSS text from adopted stylesheets (used by injectCSS when available). */
function getAdoptedCSSText(): string[] {
  return Array.from(document.adoptedStyleSheets).map((sheet) =>
    Array.from(sheet.cssRules)
      .map((r) => r.cssText)
      .join('\n'),
  );
}

function cleanupStyles(): void {
  for (const el of document.head.querySelectorAll('style[data-vertz-css]')) {
    el.remove();
  }
  resetInjectedStyles();
  // Clear ALL adopted stylesheets to prevent cross-file test leaks.
  // resetInjectedStyles() only removes sheets tracked in its internal Set,
  // which may have been cleared by a prior resetInjectedStyles() call in
  // another test file, leaving orphaned sheets behind.
  document.adoptedStyleSheets = [];
}

describe('css() runtime style injection', () => {
  beforeEach(cleanupStyles);
  afterEach(cleanupStyles);

  it('injects generated CSS into the document via adoptedStyleSheets', () => {
    css(
      { card: { padding: token.spacing[4], backgroundColor: token.color.background } },
      'inject-test.tsx',
    );

    const sheets = getAdoptedCSSText();
    expect(sheets.length).toBe(1);
    const cssText = sheets[0];
    expect(cssText).toContain('padding: var(--spacing-4)');
    expect(cssText).toContain('background-color: var(--color-background)');
  });

  it('does not inject the same CSS twice (deduplication)', () => {
    css({ card: { padding: token.spacing[4] } }, 'dedup-test.tsx');
    css({ card: { padding: token.spacing[4] } }, 'dedup-test.tsx');

    const sheets = getAdoptedCSSText();
    expect(sheets.length).toBe(1);
  });

  it('injects separate stylesheets for different css() calls', () => {
    css({ a: { padding: token.spacing[4] } }, 'file-a.tsx');
    css({ b: { margin: token.spacing[4] } }, 'file-b.tsx');

    const sheets = getAdoptedCSSText();
    expect(sheets.length).toBe(2);
  });

  it('does not inject when css produces empty output', () => {
    css({}, 'empty-test.tsx');

    const sheets = getAdoptedCSSText();
    expect(sheets.length).toBe(0);
  });
});

describe('injectCSS SSR behavior', () => {
  beforeEach(() => {
    resetInjectedStyles();
    if (typeof document !== 'undefined') document.adoptedStyleSheets = [];
  });
  afterEach(() => {
    if (typeof document !== 'undefined') {
      for (const el of document.head.querySelectorAll('style[data-vertz-css]')) {
        el.remove();
      }
      document.adoptedStyleSheets = [];
    }
    resetInjectedStyles();
    disableTestSSR();
  });

  it('bypasses dedup Set when SSR context is active', () => {
    const cssText = '.test-ssr { color: red; }';

    // First injection (browser mode) — populates dedup Set
    injectCSS(cssText);
    expect(getAdoptedCSSText().length).toBe(1);

    // Reset to simulate fresh request (clears adopted sheets and dedup set)
    resetInjectedStyles();

    // Re-inject in browser mode first to populate dedup Set
    injectCSS(cssText);
    const countAfterBrowser = getAdoptedCSSText().length;
    expect(countAfterBrowser).toBe(1);

    // Enable SSR context and inject same CSS — should skip DOM injection
    // but still add to the Set for collection via getInjectedCSS()
    enableTestSSR();
    injectCSS(cssText);
    // DOM adopted sheets unchanged (SSR skips DOM injection)
    expect(getAdoptedCSSText().length).toBe(1);
    // But injectedCSS Set still tracks it (bypasses dedup in SSR)
    const collected = getInjectedCSS();
    expect(collected).toContain(cssText);
  });

  it('adds to dedup Set during SSR for collection via getInjectedCSS', () => {
    const cssText = '.test-set-tracking { color: blue; }';

    // Inject during SSR — should populate the Set for collection
    enableTestSSR();
    injectCSS(cssText);
    disableTestSSR();

    // getInjectedCSS should include the SSR-injected CSS
    const collected = getInjectedCSS();
    expect(collected).toContain(cssText);
  });

  it('tracks CSS on consecutive SSR requests via getInjectedCSS', () => {
    // Simulate two SSR "requests" using css() (which calls injectCSS internally)
    for (let req = 1; req <= 2; req++) {
      resetInjectedStyles();
      enableTestSSR(createTestSSRContext(`/page-${req}`));

      css(
        { card: { padding: token.spacing[4], backgroundColor: token.color.background } },
        'ssr-multi.tsx',
      );

      // CSS is tracked in the Set, not in DOM
      const collected = getInjectedCSS();
      expect(collected.length).toBe(1);
      expect(collected[0]).toContain('padding: var(--spacing-4)');
    }
  });
});

describe('css()', () => {
  it('returns class names for each block', () => {
    const result = css(
      {
        card: { padding: token.spacing[4] },
        title: { fontSize: token.font.size.xl },
      },
      'test.tsx',
    );

    expect(result.card).toBeDefined();
    expect(result.title).toBeDefined();
    expect(result.card).not.toBe(result.title);
  });

  it('produces valid CSS with class selectors', () => {
    const result = css(
      {
        card: { padding: token.spacing[4], backgroundColor: token.color.background },
      },
      'test.tsx',
    );

    expect(result.css).toContain(`.${result.card}`);
    expect(result.css).toContain('padding: var(--spacing-4)');
    expect(result.css).toContain('background-color: var(--color-background)');
  });

  it('produces deterministic class names', () => {
    const a = css({ card: { padding: token.spacing[4] } }, 'test.tsx');
    const b = css({ card: { padding: token.spacing[4] } }, 'test.tsx');
    expect(a.card).toBe(b.card);
  });

  it('handles display keywords', () => {
    const result = css(
      {
        layout: { display: 'flex', gap: token.spacing[4] },
      },
      'test.tsx',
    );

    expect(result.css).toContain('display: flex');
    expect(result.css).toContain('gap: var(--spacing-4)');
  });

  it('handles pseudo-state prefixes', () => {
    const result = css(
      {
        button: {
          backgroundColor: token.color.primary,
          '&:hover': { backgroundColor: token.color.primary[700] },
        },
      },
      'test.tsx',
    );

    const className = result.button as string;
    expect(result.css).toContain(`.${className}:hover`);
    expect(result.css).toContain('var(--color-primary-700)');
  });

  it('handles multiple pseudo-states', () => {
    const result = css(
      {
        input: {
          backgroundColor: token.color.background,
          '&:hover': { backgroundColor: token.color.primary[100] },
          '&:focus': { backgroundColor: token.color.primary[200] },
        },
      },
      'test.tsx',
    );

    const className = result.input as string;
    expect(result.css).toContain(`.${className}:hover`);
    expect(result.css).toContain(`.${className}:focus`);
  });

  it('handles object form for complex selectors', () => {
    const result = css(
      {
        card: { padding: token.spacing[4], '&::after': { display: 'block' } },
      },
      'test.tsx',
    );

    const className = result.card as string;
    expect(result.css).toContain(`.${className}::after`);
    expect(result.css).toContain('display: block');
  });

  it('handles mixed array and object entries', () => {
    const result = css(
      {
        card: {
          padding: token.spacing[4],
          backgroundColor: token.color.background,
          '&:hover': { backgroundColor: token.color.primary[100] },
          '&::before': { display: 'block' },
        },
      },
      'test.tsx',
    );

    const className = result.card as string;
    expect(result.css).toContain('padding: var(--spacing-4)');
    expect(result.css).toContain('var(--color-background)');
    expect(result.css).toContain(`.${className}:hover`);
    expect(result.css).toContain(`.${className}::before`);
  });

  it('handles multiple blocks', () => {
    const result = css(
      {
        card: { padding: token.spacing[4], borderRadius: token.radius.lg },
        title: { fontSize: token.font.size.xl, fontWeight: token.font.weight.bold },
        body: { color: token.color.foreground, lineHeight: token.font.lineHeight.normal },
      },
      'test.tsx',
    );

    expect(result.css).toContain('padding: var(--spacing-4)');
    expect(result.css).toContain('border-radius: var(--radius-lg)');
    expect(result.css).toContain('font-size: var(--font-size-xl)');
    expect(result.css).toContain('font-weight: var(--font-weight-bold)');
    expect(result.css).toContain('color: var(--color-foreground)');
    expect(result.css).toContain('line-height: var(--font-lineHeight-normal)');
  });

  it('uses default file path when none provided', () => {
    const result = css({ root: { padding: token.spacing[4] } });
    expect(result.root).toBeDefined();
    expect(result.css).toContain('padding: var(--spacing-4)');
  });

  it('handles content:empty in object form (documented API)', () => {
    const result = css(
      {
        card: { padding: token.spacing[4], '&::after': { content: "''", display: 'block' } },
      },
      'test.tsx',
    );

    const className = result.card as string;
    expect(result.css).toContain(`.${className}::after`);
    expect(result.css).toContain("content: ''");
    expect(result.css).toContain('display: block');
  });

  it('handles ring:2 with focus-visible pseudo', () => {
    const result = css(
      {
        button: {
          backgroundColor: token.color.primary,
          '&:focus-visible': { outline: '2px solid var(--color-ring)' },
        },
      },
      'test.tsx',
    );

    const className = result.button as string;
    expect(result.css).toContain(`.${className}:focus-visible`);
    expect(result.css).toContain('outline: 2px solid var(--color-ring)');
  });

  it('handles h:screen as 100vh (axis-aware)', () => {
    const result = css(
      {
        layout: { width: '100vw', height: '100vh' },
      },
      'test.tsx',
    );

    expect(result.css).toContain('width: 100vw');
    expect(result.css).toContain('height: 100vh');
  });

  it('css property is non-enumerable (Object.keys excludes it)', () => {
    const result = css({ card: { padding: token.spacing[4] } }, 'test.tsx');
    expect(Object.keys(result)).toEqual(['card']);
    expect(result.css).toContain('padding: var(--spacing-4)');
  });

  it('spreading drops the non-enumerable css property', () => {
    const result = css({ card: { padding: token.spacing[4] } }, 'test.tsx');
    const spread = { ...result };
    expect(spread).toHaveProperty('card');
    expect(spread).not.toHaveProperty('css');
  });

  it('produces different class names for same block name with different styles (no runtime collision)', () => {
    // Two different css() calls with the same block name 'title' but different styles.
    // Without a filePath, both use __runtime__ — this must NOT collide.
    const a = css({
      title: {
        fontSize: token.font.size.lg,
        fontWeight: token.font.weight.bold,
        color: token.color.foreground,
      },
    });
    const b = css({
      title: {
        flex: '1 1 0%',
        fontSize: token.font.size.sm,
        fontWeight: token.font.weight.normal,
        color: token.color.foreground,
      },
    });

    expect(a.title).not.toBe(b.title);
  });

  it('still produces same class name for identical block name + styles (dedup)', () => {
    const a = css({ card: { padding: token.spacing[4], backgroundColor: token.color.background } });
    const b = css({ card: { padding: token.spacing[4], backgroundColor: token.color.background } });

    expect(a.card).toBe(b.card);
  });

  it('throws when block name is "css" (reserved)', () => {
    expect(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (css as any)({ css: { padding: token.spacing[4] } }, 'test.tsx');
    }).toThrow("css(): block name 'css' is reserved");
  });

  it('handles direct object form for media queries', () => {
    const result = css(
      {
        layout: {
          display: 'flex',
          flexDirection: 'column',
          '@media (min-width: 640px)': { flexDirection: 'row', alignItems: 'center' },
        },
      },
      'media-obj.tsx',
    );

    const className = result.layout as string;
    expect(result.css).toContain('@media (min-width: 640px)');
    expect(result.css).toContain('flex-direction: row');
    expect(result.css).toContain('align-items: center');
    expect(result.css).toContain(`.${className}`);
  });

  it('handles direct object form for pseudo selectors', () => {
    const result = css(
      {
        btn: { padding: token.spacing[4], '&:hover': { opacity: '1' } },
      },
      'pseudo-obj.tsx',
    );

    const className = result.btn as string;
    expect(result.css).toContain(`.${className}:hover`);
    expect(result.css).toContain('opacity: 1');
  });

  it('handles CSS object elements inside arrays (mixed with shorthands)', () => {
    const result = css(
      {
        card: {
          padding: token.spacing[4],
          '&:hover': { color: token.color.foreground, backgroundColor: 'rgba(0,0,0,0.3)' },
        },
      },
      'mixed-obj.tsx',
    );

    expect(result.css).toContain('color: var(--color-foreground)');
    expect(result.css).toContain('background-color: rgba(0,0,0,0.3)');
  });

  it('handles multiple CSS properties in a single object element within array', () => {
    const result = css(
      {
        overlay: {
          position: 'fixed',
          '&': { backgroundColor: 'oklch(0 0 0 / 50%)', backdropFilter: 'blur(4px)' },
        },
      },
      'multi-prop.tsx',
    );

    expect(result.css).toContain('background-color: oklch(0 0 0 / 50%)');
    expect(result.css).toContain('backdrop-filter: blur(4px)');
  });

  it('produces same class name regardless of key order in CSS object (deterministic fingerprinting)', () => {
    const a = css({
      layout: [
        {
          '@media (min-width: 640px)': {
            'align-items': 'center',
            'flex-direction': 'row',
          },
        },
      ],
    });
    const b = css({
      layout: [
        {
          '@media (min-width: 640px)': {
            'flex-direction': 'row',
            'align-items': 'center',
          },
        },
      ],
    });

    expect(a.layout).toBe(b.layout);
  });
});
