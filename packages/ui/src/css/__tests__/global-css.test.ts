import { afterEach, beforeEach, describe, expect, it } from '@vertz/test';
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
  // Clear ALL adopted stylesheets to prevent cross-file test leaks.
  // resetInjectedStyles() only removes sheets tracked in its internal Set,
  // which may have been cleared by a prior resetInjectedStyles() call in
  // another test file, leaving orphaned sheets behind.
  document.adoptedStyleSheets = [];
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

  it('emits @keyframes with from/to frame selectors', () => {
    const result = globalCss({
      '@keyframes spin': {
        from: { transform: 'rotate(0deg)' },
        to: { transform: 'rotate(360deg)' },
      },
    });

    expect(result.css).toContain('@keyframes spin {');
    expect(result.css).toContain('from {');
    expect(result.css).toContain('to {');
    expect(result.css).toContain('transform: rotate(0deg);');
    expect(result.css).toContain('transform: rotate(360deg);');
  });

  it('emits @keyframes with percentage frames and camelCase properties', () => {
    const result = globalCss({
      '@keyframes pulse': {
        '0%': { opacity: '1' },
        '50%': { opacity: '0.5', backgroundColor: 'red' },
        '100%': { opacity: '1' },
      },
    });

    expect(result.css).toContain('@keyframes pulse {');
    expect(result.css).toContain('0% {');
    expect(result.css).toContain('50% {');
    expect(result.css).toContain('100% {');
    expect(result.css).toContain('background-color: red;');
  });

  it('emits @media with nested selector blocks', () => {
    const result = globalCss({
      '@media (min-width: 768px)': {
        body: { fontSize: '18px' },
        html: { height: '100%' },
      },
    });

    expect(result.css).toBe(
      '@media (min-width: 768px) {\n' +
        '  body {\n' +
        '    font-size: 18px;\n' +
        '  }\n' +
        '  html {\n' +
        '    height: 100%;\n' +
        '  }\n' +
        '}',
    );
  });

  it('emits @supports with nested selector blocks', () => {
    const result = globalCss({
      '@supports (display: grid)': {
        body: { display: 'grid' },
      },
    });

    expect(result.css).toBe(
      '@supports (display: grid) {\n' + '  body {\n' + '    display: grid;\n' + '  }\n' + '}',
    );
  });

  it('skips null and undefined property values', () => {
    const result = globalCss({
      body: {
        margin: '0',
        // @ts-expect-error — test runtime resilience to null/undefined values.
        padding: null,
        // @ts-expect-error — test runtime resilience to null/undefined values.
        color: undefined,
      },
    });

    expect(result.css).toContain('margin: 0;');
    expect(result.css).not.toContain('padding');
    expect(result.css).not.toContain('color');
  });

  it('wraps @keyframes frames inside the at-rule (not as siblings)', () => {
    const result = globalCss({
      '@keyframes spin': {
        from: { transform: 'rotate(0deg)' },
        to: { transform: 'rotate(360deg)' },
      },
    });

    // Structural check: the at-rule opens once, then frames, then closes once.
    expect(result.css).toBe(
      '@keyframes spin {\n' +
        '  from {\n' +
        '    transform: rotate(0deg);\n' +
        '  }\n' +
        '  to {\n' +
        '    transform: rotate(360deg);\n' +
        '  }\n' +
        '}',
    );
  });
});
