import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { css, getInjectedCSS, injectCSS, resetInjectedStyles } from '../css';

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
}

describe('css() runtime style injection', () => {
  beforeEach(cleanupStyles);
  afterEach(cleanupStyles);

  it('injects generated CSS into the document via adoptedStyleSheets', () => {
    css({ card: ['p:4', 'bg:background'] }, 'inject-test.tsx');

    const sheets = getAdoptedCSSText();
    expect(sheets.length).toBe(1);
    const cssText = sheets[0];
    expect(cssText).toContain('padding: 1rem');
    expect(cssText).toContain('background-color: var(--color-background)');
  });

  it('does not inject the same CSS twice (deduplication)', () => {
    css({ card: ['p:4'] }, 'dedup-test.tsx');
    css({ card: ['p:4'] }, 'dedup-test.tsx');

    const sheets = getAdoptedCSSText();
    expect(sheets.length).toBe(1);
  });

  it('injects separate stylesheets for different css() calls', () => {
    css({ a: ['p:4'] }, 'file-a.tsx');
    css({ b: ['m:4'] }, 'file-b.tsx');

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
  afterEach(() => {
    for (const el of document.head.querySelectorAll('style[data-vertz-css]')) {
      el.remove();
    }
    resetInjectedStyles();
    delete globalThis.__SSR_URL__;
  });

  it('bypasses dedup Set when __SSR_URL__ is set', () => {
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

    // Set SSR flag and inject same CSS — should bypass dedup
    globalThis.__SSR_URL__ = '/';
    injectCSS(cssText);
    expect(getAdoptedCSSText().length).toBe(2);
  });

  it('adds to dedup Set during SSR for collection via getInjectedCSS', () => {
    const cssText = '.test-set-tracking { color: blue; }';

    // Inject during SSR — should populate the Set for collection
    globalThis.__SSR_URL__ = '/';
    injectCSS(cssText);
    delete globalThis.__SSR_URL__;

    // getInjectedCSS should include the SSR-injected CSS
    const collected = getInjectedCSS();
    expect(collected).toContain(cssText);
  });

  it('produces styles on consecutive SSR requests with fresh document.head', () => {
    // Simulate two SSR "requests" using css() (which calls injectCSS internally)
    for (let req = 1; req <= 2; req++) {
      // Reset per request (simulating installDomShim)
      resetInjectedStyles();
      globalThis.__SSR_URL__ = `/page-${req}`;

      css({ card: ['p:4', 'bg:background'] }, 'ssr-multi.tsx');

      const sheets = getAdoptedCSSText();
      expect(sheets.length).toBe(1);
      expect(sheets[0]).toContain('padding: 1rem');
    }
  });
});

describe('css()', () => {
  it('returns class names for each block', () => {
    const result = css(
      {
        card: ['p:4'],
        title: ['font:xl'],
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
        card: ['p:4', 'bg:background'],
      },
      'test.tsx',
    );

    expect(result.css).toContain(`.${result.card}`);
    expect(result.css).toContain('padding: 1rem');
    expect(result.css).toContain('background-color: var(--color-background)');
  });

  it('produces deterministic class names', () => {
    const a = css({ card: ['p:4'] }, 'test.tsx');
    const b = css({ card: ['p:4'] }, 'test.tsx');
    expect(a.card).toBe(b.card);
  });

  it('handles display keywords', () => {
    const result = css(
      {
        layout: ['flex', 'gap:4'],
      },
      'test.tsx',
    );

    expect(result.css).toContain('display: flex');
    expect(result.css).toContain('gap: 1rem');
  });

  it('handles pseudo-state prefixes', () => {
    const result = css(
      {
        button: ['bg:primary', 'hover:bg:primary.700'],
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
        input: ['bg:background', 'hover:bg:primary.100', 'focus:bg:primary.200'],
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
        card: ['p:4', { '&::after': ['block'] }],
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
        card: ['p:4', 'bg:background', 'hover:bg:primary.100', { '&::before': ['block'] }],
      },
      'test.tsx',
    );

    const className = result.card as string;
    expect(result.css).toContain('padding: 1rem');
    expect(result.css).toContain('var(--color-background)');
    expect(result.css).toContain(`.${className}:hover`);
    expect(result.css).toContain(`.${className}::before`);
  });

  it('handles multiple blocks', () => {
    const result = css(
      {
        card: ['p:4', 'rounded:lg'],
        title: ['font:xl', 'weight:bold'],
        body: ['text:foreground', 'leading:normal'],
      },
      'test.tsx',
    );

    expect(result.css).toContain('padding: 1rem');
    expect(result.css).toContain('border-radius: 0.5rem');
    expect(result.css).toContain('font-size: 1.25rem');
    expect(result.css).toContain('font-weight: 700');
    expect(result.css).toContain('color: var(--color-foreground)');
    expect(result.css).toContain('line-height: 1.5');
  });

  it('uses default file path when none provided', () => {
    const result = css({ root: ['p:4'] });
    expect(result.root).toBeDefined();
    expect(result.css).toContain('padding: 1rem');
  });

  it('handles content:empty in object form (documented API)', () => {
    const result = css(
      {
        card: ['p:4', { '&::after': ['content:empty', 'block'] }],
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
        button: ['bg:primary', 'focus-visible:ring:2'],
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
        layout: ['w:screen', 'h:screen'],
      },
      'test.tsx',
    );

    expect(result.css).toContain('width: 100vw');
    expect(result.css).toContain('height: 100vh');
  });

  it('css property is non-enumerable (Object.keys excludes it)', () => {
    const result = css({ card: ['p:4'] }, 'test.tsx');
    expect(Object.keys(result)).toEqual(['card']);
    expect(result.css).toContain('padding: 1rem');
  });

  it('spreading drops the non-enumerable css property', () => {
    const result = css({ card: ['p:4'] }, 'test.tsx');
    const spread = { ...result };
    expect(spread).toHaveProperty('card');
    expect(spread).not.toHaveProperty('css');
  });

  it('throws when block name is "css" (reserved)', () => {
    expect(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (css as any)({ css: ['p:4'] }, 'test.tsx');
    }).toThrow("css(): block name 'css' is reserved");
  });
});
