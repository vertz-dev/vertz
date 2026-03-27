/**
 * Tests for HTML-aware CSS filtering.
 *
 * Verifies that filterCSSByHTML() removes CSS rules whose class selectors
 * are not present in the rendered HTML, eliminating unused theme CSS.
 *
 * @see https://github.com/vertz-dev/vertz/issues/1979
 */
import { describe, expect, it } from 'bun:test';
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
    const css = [
      '._abc12345 { color: red; }',
      '._unused99 { display: grid; }',
    ];

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
});
