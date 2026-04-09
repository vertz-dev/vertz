/**
 * Tests for HTML-aware CSS filtering.
 *
 * Verifies that filterCSSByHTML() removes CSS rules whose class selectors
 * are not present in the rendered HTML, eliminating unused theme CSS.
 *
 * @see https://github.com/vertz-dev/vertz/issues/1979
 */
import { describe, expect, it } from '@vertz/test';
import { filterCSSByHTML } from '../css-filter';

describe('filterCSSByHTML (#1979)', () => {
  it('keeps CSS rules whose class selectors appear in the HTML', () => {
    const html = '<div class="_abc12345">Hello</div>';
    const css = ['._abc12345 { color: red; }'];

    const result = filterCSSByHTML(html, css);

    expect(result).toEqual(['._abc12345 { color: red; }']);
  });

  it('removes CSS rules whose class selectors do NOT appear in the HTML', () => {
    const html = '<div class="_abc12345">Hello</div>';
    const css = ['._abc12345 { color: red; }', '._unused99 { display: grid; }'];

    const result = filterCSSByHTML(html, css);

    expect(result).toEqual(['._abc12345 { color: red; }']);
  });

  it('handles multiple class selectors in one CSS string', () => {
    const html = '<div class="_used1234"><span class="_used5678">Hi</span></div>';
    const css = [
      '._used1234 { padding: 8px; }\n._used5678 { font-size: 14px; }',
      '._notused1 { margin: 0; }\n._notused2 { border: none; }',
    ];

    const result = filterCSSByHTML(html, css);

    // First string has used classes, second string has none
    expect(result).toHaveLength(1);
    expect(result[0]).toContain('._used1234');
  });

  it('keeps a CSS string if ANY of its class selectors appear in HTML', () => {
    const html = '<div class="_used1234">Hello</div>';
    // This CSS string has both used and unused selectors — keep it
    const css = ['._used1234 { color: red; }\n._othersel { margin: 0; }'];

    const result = filterCSSByHTML(html, css);

    expect(result).toHaveLength(1);
  });

  it('handles pseudo-selectors like :hover, ::before', () => {
    const html = '<button class="_btn12345">Click</button>';
    const css = [
      '._btn12345 { background: blue; }\n._btn12345:hover { background: darkblue; }',
      '._unused00:hover { color: red; }',
    ];

    const result = filterCSSByHTML(html, css);

    expect(result).toHaveLength(1);
    expect(result[0]).toContain('._btn12345');
  });

  it('handles @media rules wrapping class selectors', () => {
    const html = '<div class="_card1234">Card</div>';
    const css = [
      '@media (min-width: 768px) {\n  ._card1234 { flex-direction: row; }\n}',
      '@media (min-width: 768px) {\n  ._unused00 { display: none; }\n}',
    ];

    const result = filterCSSByHTML(html, css);

    expect(result).toHaveLength(1);
    expect(result[0]).toContain('._card1234');
  });

  it('returns empty array when no CSS matches the HTML', () => {
    const html = '<div>No classes</div>';
    const css = ['._abc { color: red; }', '._def { margin: 0; }'];

    const result = filterCSSByHTML(html, css);

    expect(result).toEqual([]);
  });

  it('returns all CSS strings when all match the HTML', () => {
    const html = '<div class="_a1 _b2">Both</div>';
    const css = ['._a1 { color: red; }', '._b2 { margin: 0; }'];

    const result = filterCSSByHTML(html, css);

    expect(result).toEqual(css);
  });

  it('handles empty inputs gracefully', () => {
    expect(filterCSSByHTML('', [])).toEqual([]);
    expect(filterCSSByHTML('<div>Hi</div>', [])).toEqual([]);
    expect(filterCSSByHTML('', ['._a { color: red; }'])).toEqual([]);
  });

  it('keeps non-class CSS rules (element selectors, :root, etc.)', () => {
    const html = '<div class="_abc">Hi</div>';
    const css = [
      ':root { --primary: blue; }',
      'body { margin: 0; }',
      '* { box-sizing: border-box; }',
    ];

    const result = filterCSSByHTML(html, css);

    // Non-class rules should always be kept — they're global resets/vars
    expect(result).toEqual(css);
  });

  it('extracts class names from various HTML attribute formats', () => {
    const html = `
      <div class="_cls1 _cls2">
        <span class="_cls3">text</span>
        <button className="_cls4">btn</button>
      </div>
    `;
    const css = [
      '._cls1 { a: 1; }',
      '._cls2 { b: 2; }',
      '._cls3 { c: 3; }',
      '._cls4 { d: 4; }',
      '._cls5 { e: 5; }',
    ];

    const result = filterCSSByHTML(html, css);

    expect(result).toHaveLength(4);
    expect(result).not.toContainEqual('._cls5 { e: 5; }');
  });

  it('handles class names in data attributes and other places', () => {
    // AOT SSR uses string concatenation, class names may appear in various contexts
    const html = '<div class="_ab12cd34 _ef56gh78">content</div>';
    const css = [
      '._ab12cd34 { padding: 4px; }',
      '._ef56gh78 { margin: 8px; }',
      '._xxxxxxxx { display: none; }',
    ];

    const result = filterCSSByHTML(html, css);

    expect(result).toHaveLength(2);
  });

  // ── @keyframes filtering (#1988) ──────────────────────────────────

  it('filters out standalone @keyframes when no surviving CSS references them', () => {
    const html = '<div class="_used1234">content</div>';
    const css = [
      '._used1234 { color: red; }',
      '._unused99 { animation: vz-fade-in 100ms; }',
      '@keyframes vz-fade-in { from { opacity: 0; } to { opacity: 1; } }',
      '@keyframes vz-zoom-out { from { transform: scale(1); } to { transform: scale(0.95); } }',
    ];

    const result = filterCSSByHTML(html, css);

    // _used1234 kept (in HTML), _unused99 dropped (not in HTML),
    // vz-fade-in dropped (referenced only by dropped CSS), vz-zoom-out dropped
    expect(result).toEqual(['._used1234 { color: red; }']);
  });

  it('keeps @keyframes when surviving CSS references them', () => {
    const html = '<div class="_btn12345">btn</div>';
    const css = [
      '._btn12345 { animation: vz-fade-in 100ms ease-out; }',
      '@keyframes vz-fade-in { from { opacity: 0; } to { opacity: 1; } }',
      '@keyframes vz-zoom-out { from { transform: scale(1); } to { transform: scale(0.95); } }',
    ];

    const result = filterCSSByHTML(html, css);

    // _btn12345 kept (in HTML), vz-fade-in kept (referenced by surviving CSS),
    // vz-zoom-out dropped (not referenced)
    expect(result).toHaveLength(2);
    expect(result[0]).toContain('._btn12345');
    expect(result[1]).toContain('vz-fade-in');
  });

  it('handles CSS with inline @keyframes inside class rules', () => {
    const html = '<div class="_skeleton">loading</div>';
    const skeletonCss =
      '._skeleton { animation: vz-pulse 2s infinite; }\n@keyframes vz-pulse { 50% { opacity: 0.5; } }';
    const unusedCss = '._unused { color: red; }';

    const result = filterCSSByHTML(html, [skeletonCss, unusedCss]);

    // Skeleton CSS has both class selector and @keyframes in same string — class selector
    // matches HTML, so the whole string is kept.
    expect(result).toEqual([skeletonCss]);
  });

  it('filters @keyframes CSS in real-world theme pattern', () => {
    const html = '<div class="_app_root"><h1 class="_app_title">Store</h1></div>';
    const css = [
      // App CSS — used
      '._app_root { display: flex; }\n._app_title { font-size: 2rem; }',
      // Button CSS — NOT used on this page
      '._btn_base { display: inline-flex; }\n._btn_base:hover { opacity: 0.9; }',
      // Card CSS — NOT used on this page
      '._card_root { border-radius: 8px; }',
      // Shared keyframes — should be dropped since no surviving CSS uses them
      '@keyframes vz-fade-in { from { opacity: 0; } to { opacity: 1; } }',
      '@keyframes vz-zoom-in { from { opacity: 0; transform: scale(0.95); } to { opacity: 1; transform: scale(1); } }',
      // Reduced motion — global rule, always kept
      '@media (prefers-reduced-motion: reduce) { *, *::before, *::after { animation-duration: 0.01ms !important; } }',
    ];

    const result = filterCSSByHTML(html, css);

    expect(result).toHaveLength(2);
    expect(result[0]).toContain('._app_root');
    expect(result[1]).toContain('prefers-reduced-motion');
  });
});
