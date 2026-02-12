import { describe, expect, it } from 'vitest';
import {
  escapeAttr,
  escapeHtml,
  isRawHtml,
  RAW_TEXT_ELEMENTS,
  serializeToHtml,
  VOID_ELEMENTS,
} from './html-serializer';
import type { RawHtml, VNode } from './types';

describe('escapeHtml', () => {
  it('escapes ampersands', () => {
    expect(escapeHtml('a&b')).toBe('a&amp;b');
  });

  it('escapes angle brackets', () => {
    expect(escapeHtml('<div>')).toBe('&lt;div&gt;');
  });

  it('escapes double quotes', () => {
    expect(escapeHtml('"hello"')).toBe('&quot;hello&quot;');
  });
});

describe('escapeAttr', () => {
  it('escapes ampersands', () => {
    expect(escapeAttr('a&b')).toBe('a&amp;b');
  });

  it('escapes double quotes', () => {
    expect(escapeAttr('a"b')).toBe('a&quot;b');
  });

  it('does not escape angle brackets (attr context)', () => {
    expect(escapeAttr('a<b')).toBe('a<b');
  });
});

describe('isRawHtml', () => {
  it('returns true for RawHtml objects', () => {
    const raw: RawHtml = { __raw: true, html: '<b>bold</b>' };
    expect(isRawHtml(raw)).toBe(true);
  });

  it('returns false for strings', () => {
    // biome-ignore lint/suspicious/noExplicitAny: testing runtime type guard with invalid input
    expect(isRawHtml('hello' as any)).toBe(false);
  });

  it('returns false for VNodes', () => {
    const node: VNode = { tag: 'div', attrs: {}, children: [] };
    expect(isRawHtml(node)).toBe(false);
  });
});

describe('VOID_ELEMENTS', () => {
  it('is a Set containing void elements', () => {
    expect(VOID_ELEMENTS).toBeInstanceOf(Set);
    expect(VOID_ELEMENTS.has('br')).toBe(true);
    expect(VOID_ELEMENTS.has('img')).toBe(true);
    expect(VOID_ELEMENTS.has('div')).toBe(false);
  });
});

describe('RAW_TEXT_ELEMENTS', () => {
  it('is a Set containing script and style', () => {
    expect(RAW_TEXT_ELEMENTS).toBeInstanceOf(Set);
    expect(RAW_TEXT_ELEMENTS.has('script')).toBe(true);
    expect(RAW_TEXT_ELEMENTS.has('style')).toBe(true);
    expect(RAW_TEXT_ELEMENTS.has('div')).toBe(false);
  });
});

describe('serializeToHtml', () => {
  it('serializes a string with escaping', () => {
    expect(serializeToHtml('<b>bold</b>')).toBe('&lt;b&gt;bold&lt;/b&gt;');
  });

  it('serializes a RawHtml node without escaping', () => {
    const raw: RawHtml = { __raw: true, html: '<b>bold</b>' };
    expect(serializeToHtml(raw)).toBe('<b>bold</b>');
  });

  it('serializes a VNode with children', () => {
    const node: VNode = {
      tag: 'div',
      attrs: { class: 'test' },
      children: ['hello'],
    };
    expect(serializeToHtml(node)).toBe('<div class="test">hello</div>');
  });

  it('serializes void elements without closing tag', () => {
    const node: VNode = { tag: 'br', attrs: {}, children: [] };
    expect(serializeToHtml(node)).toBe('<br>');
  });
});
