import { describe, expect, it } from 'bun:test';
import { escapeHtmlAttr, sanitizeCssValue } from '../sanitize';

describe('sanitizeCssValue()', () => {
  it('strips semicolons', () => {
    expect(sanitizeCssValue('normal; } * { display: none')).not.toContain(';');
  });

  it('strips curly braces', () => {
    expect(sanitizeCssValue('value { injection } here')).not.toContain('{');
    expect(sanitizeCssValue('value { injection } here')).not.toContain('}');
  });

  it('strips angle brackets', () => {
    expect(sanitizeCssValue('</style><script>')).not.toContain('<');
    expect(sanitizeCssValue('</style><script>')).not.toContain('>');
  });

  it('strips single quotes', () => {
    expect(sanitizeCssValue("Evil' font")).not.toContain("'");
  });

  it('strips url() calls', () => {
    expect(sanitizeCssValue('url(evil.js)')).not.toContain('url(');
  });

  it('strips expression() calls (case-insensitive)', () => {
    expect(sanitizeCssValue('Expression(alert(1))')).not.toContain('expression(');
    expect(sanitizeCssValue('EXPRESSION(alert(1))')).not.toContain('EXPRESSION(');
  });

  it('strips @import directives', () => {
    expect(sanitizeCssValue('@import url(evil.css)')).not.toContain('@import');
  });

  it('preserves safe values', () => {
    expect(sanitizeCssValue('normal')).toBe('normal');
    expect(sanitizeCssValue('100 1000')).toBe('100 1000');
    expect(sanitizeCssValue('DM Sans')).toBe('DM Sans');
  });
});

describe('escapeHtmlAttr()', () => {
  it('escapes ampersands', () => {
    expect(escapeHtmlAttr('a&b')).toBe('a&amp;b');
  });

  it('escapes double quotes', () => {
    expect(escapeHtmlAttr('a"b')).toBe('a&quot;b');
  });

  it('escapes less-than', () => {
    expect(escapeHtmlAttr('a<b')).toBe('a&lt;b');
  });

  it('escapes greater-than', () => {
    expect(escapeHtmlAttr('a>b')).toBe('a&gt;b');
  });

  it('escapes single quotes', () => {
    expect(escapeHtmlAttr("a'b")).toBe('a&#39;b');
  });

  it('preserves safe values', () => {
    expect(escapeHtmlAttr('/fonts/dm-sans.woff2')).toBe('/fonts/dm-sans.woff2');
  });

  it('handles combined attack vectors', () => {
    const result = escapeHtmlAttr('" onload="alert(1)');
    expect(result).not.toContain('"');
    expect(result).toContain('&quot;');
  });
});
