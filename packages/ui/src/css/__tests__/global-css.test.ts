import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { resetInjectedStyles } from '../css';
import { globalCss } from '../global-css';

/** Read all CSS text from adopted stylesheets. */
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

describe('globalCss() runtime style injection', () => {
  beforeEach(cleanupStyles);
  afterEach(cleanupStyles);

  it('injects CSS into the document via adoptedStyleSheets', () => {
    globalCss({
      body: {
        margin: '0',
        fontFamily: 'system-ui, sans-serif',
      },
    });

    const sheets = getAdoptedCSSText();
    expect(sheets.length).toBe(1);
    expect(sheets[0]).toContain('margin: 0');
    expect(sheets[0]).toContain('font-family: system-ui, sans-serif');
  });

  it('does not inject the same CSS twice (deduplication)', () => {
    globalCss({
      body: { margin: '0' },
    });
    globalCss({
      body: { margin: '0' },
    });

    const sheets = getAdoptedCSSText();
    expect(sheets.length).toBe(1);
  });
});

describe('globalCss()', () => {
  it('produces CSS rules for each selector', () => {
    const result = globalCss({
      body: {
        margin: '0',
        fontFamily: 'system-ui, sans-serif',
      },
    });

    expect(result.css).toContain('body {');
    expect(result.css).toContain('margin: 0;');
    expect(result.css).toContain('font-family: system-ui, sans-serif;');
  });

  it('converts camelCase properties to kebab-case', () => {
    const result = globalCss({
      '*': {
        boxSizing: 'border-box',
        lineHeight: '1.5',
      },
    });

    expect(result.css).toContain('box-sizing: border-box;');
    expect(result.css).toContain('line-height: 1.5;');
  });

  it('preserves CSS custom properties (--*)', () => {
    const result = globalCss({
      ':root': {
        '--color-primary': '#3b82f6',
        '--color-background': '#ffffff',
      },
    });

    expect(result.css).toContain('--color-primary: #3b82f6;');
    expect(result.css).toContain('--color-background: #ffffff;');
  });

  it('handles complex selectors', () => {
    const result = globalCss({
      '*, *::before, *::after': {
        boxSizing: 'border-box',
      },
    });

    expect(result.css).toContain('*, *::before, *::after {');
    expect(result.css).toContain('box-sizing: border-box;');
  });

  it('handles multiple selectors', () => {
    const result = globalCss({
      body: { margin: '0' },
      html: { height: '100%' },
    });

    expect(result.css).toContain('body {');
    expect(result.css).toContain('html {');
  });
});
