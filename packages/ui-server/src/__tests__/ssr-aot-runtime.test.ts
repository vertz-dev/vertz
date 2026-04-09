import { describe, expect, it } from '@vertz/test';
import { escapeAttr, escapeHtml } from '../html-serializer';
import { __esc, __esc_attr, __ssr_spread, __ssr_style_object } from '../ssr-aot-runtime';

describe('SSR AOT Runtime Helpers', () => {
  describe('__esc()', () => {
    it('escapes HTML special characters', () => {
      expect(__esc('<script>alert("xss")</script>')).toBe(
        '&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;',
      );
    });

    it('matches escapeHtml() output exactly', () => {
      const inputs = [
        'Hello World',
        '<div class="test">',
        'a & b',
        'quote: "hello"',
        '<script>alert(1)</script>',
        'a > b < c & d "e"',
      ];
      for (const input of inputs) {
        expect(__esc(input)).toBe(escapeHtml(input));
      }
    });

    it('returns empty string for null/undefined/false', () => {
      expect(__esc(null)).toBe('');
      expect(__esc(undefined)).toBe('');
      expect(__esc(false)).toBe('');
    });

    it('converts numbers to string', () => {
      expect(__esc(42)).toBe('42');
      expect(__esc(0)).toBe('0');
    });

    it('converts true to "true"', () => {
      expect(__esc(true)).toBe('true');
    });

    it('joins array values', () => {
      expect(__esc(['a', 'b', 'c'])).toBe('abc');
    });

    it('escapes array values individually', () => {
      expect(__esc(['<a>', '&b'])).toBe('&lt;a&gt;&amp;b');
    });

    it('handles nested arrays', () => {
      expect(__esc([['a', 'b'], 'c'])).toBe('abc');
    });
  });

  describe('__esc_attr()', () => {
    it('escapes attribute values matching escapeAttr()', () => {
      const inputs = ['hello', 'a&b', 'a"b', 'a&b"c'];
      for (const input of inputs) {
        expect(__esc_attr(input)).toBe(escapeAttr(input));
      }
    });

    it('coerces non-strings to string', () => {
      expect(__esc_attr(42)).toBe('42');
      expect(__esc_attr(true)).toBe('true');
    });
  });

  describe('__ssr_spread()', () => {
    it('renders spread attributes as HTML string', () => {
      const result = __ssr_spread({ id: 'test', role: 'button' });
      expect(result).toContain('id="test"');
      expect(result).toContain('role="button"');
    });

    it('escapes attribute values', () => {
      const result = __ssr_spread({ title: 'a "b" c' });
      expect(result).toContain('title="a &quot;b&quot; c"');
    });

    it('skips null/undefined values', () => {
      const result = __ssr_spread({ id: 'test', hidden: null, role: undefined });
      expect(result).toContain('id="test"');
      expect(result).not.toContain('hidden');
      expect(result).not.toContain('role');
    });

    it('renders boolean true as attribute name only', () => {
      const result = __ssr_spread({ disabled: true, id: 'btn' });
      expect(result).toContain(' disabled');
      expect(result).not.toContain('disabled="');
    });

    it('skips boolean false', () => {
      const result = __ssr_spread({ disabled: false });
      expect(result).not.toContain('disabled');
    });

    it('skips event handlers (on* props)', () => {
      const result = __ssr_spread({ onClick: () => {}, id: 'btn' });
      expect(result).not.toContain('onClick');
      expect(result).not.toContain('onclick');
      expect(result).toContain('id="btn"');
    });

    it('maps className to class', () => {
      const result = __ssr_spread({ className: 'my-class' });
      expect(result).toContain('class="my-class"');
      expect(result).not.toContain('className');
    });

    it('maps htmlFor to for', () => {
      const result = __ssr_spread({ htmlFor: 'name-input' });
      expect(result).toContain('for="name-input"');
      expect(result).not.toContain('htmlFor');
    });

    it('skips key, ref, and children props', () => {
      const result = __ssr_spread({ key: 'item-1', ref: () => {}, children: 'text', id: 'test' });
      expect(result).not.toContain('key');
      expect(result).not.toContain('ref');
      expect(result).not.toContain('children');
      expect(result).toContain('id="test"');
    });

    it('skips non-event-handler functions', () => {
      const result = __ssr_spread({ ref: () => {}, myCallback: () => {}, id: 'test' });
      expect(result).not.toContain('ref');
      expect(result).not.toContain('myCallback');
      expect(result).toContain('id="test"');
    });

    it('serializes style objects to CSS string', () => {
      const result = __ssr_spread({ style: { color: 'red', fontSize: '16px' }, id: 'styled' });
      expect(result).toContain('style="color: red; font-size: 16px"');
      expect(result).toContain('id="styled"');
    });

    it('returns empty string for empty object', () => {
      expect(__ssr_spread({})).toBe('');
    });
  });

  describe('__ssr_style_object()', () => {
    it('converts camelCase to kebab-case', () => {
      expect(__ssr_style_object({ backgroundColor: 'red' })).toBe('background-color: red');
    });

    it('handles multiple properties', () => {
      const result = __ssr_style_object({ color: 'red', fontSize: '16px' });
      expect(result).toBe('color: red; font-size: 16px');
    });

    it('skips null/undefined values', () => {
      const result = __ssr_style_object({ color: 'red', margin: null, padding: undefined });
      expect(result).toBe('color: red');
    });

    it('skips empty string values', () => {
      const result = __ssr_style_object({ color: 'red', margin: '' });
      expect(result).toBe('color: red');
    });

    it('preserves CSS custom properties (--vars)', () => {
      const result = __ssr_style_object({ '--primary': '#333', color: 'red' });
      expect(result).toContain('--primary: #333');
    });

    it('handles vendor prefixes (Webkit)', () => {
      const result = __ssr_style_object({ WebkitTransform: 'scale(1)' });
      expect(result).toBe('-webkit-transform: scale(1)');
    });

    it('handles ms prefix', () => {
      const result = __ssr_style_object({ msTransform: 'scale(1)' });
      expect(result).toBe('-ms-transform: scale(1)');
    });

    it('adds px to numeric values for pixel properties', () => {
      const result = __ssr_style_object({ width: 100, height: 50 });
      expect(result).toBe('width: 100px; height: 50px');
    });

    it('does not add px to unitless properties', () => {
      const result = __ssr_style_object({ opacity: 0.5, zIndex: 10, fontWeight: 700 });
      expect(result).toBe('opacity: 0.5; z-index: 10; font-weight: 700');
    });

    it('does not add px to zero', () => {
      const result = __ssr_style_object({ margin: 0 });
      expect(result).toBe('margin: 0');
    });

    it('returns empty string for empty object', () => {
      expect(__ssr_style_object({})).toBe('');
    });
  });
});
