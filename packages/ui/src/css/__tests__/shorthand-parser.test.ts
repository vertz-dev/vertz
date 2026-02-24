import { describe, expect, it } from 'bun:test';
import { parseShorthand, ShorthandParseError } from '../shorthand-parser';

describe('parseShorthand', () => {
  describe('property:value syntax', () => {
    it('parses simple property:value', () => {
      const result = parseShorthand('p:4');
      expect(result).toEqual({ property: 'p', value: '4', pseudo: null });
    });

    it('parses color token with dot notation', () => {
      const result = parseShorthand('bg:background');
      expect(result).toEqual({ property: 'bg', value: 'background', pseudo: null });
    });

    it('parses size shorthand', () => {
      const result = parseShorthand('rounded:lg');
      expect(result).toEqual({ property: 'rounded', value: 'lg', pseudo: null });
    });

    it('parses shadow shorthand', () => {
      const result = parseShorthand('shadow:sm');
      expect(result).toEqual({ property: 'shadow', value: 'sm', pseudo: null });
    });
  });

  describe('keyword syntax (no value)', () => {
    it('parses flex keyword', () => {
      const result = parseShorthand('flex');
      expect(result).toEqual({ property: 'flex', value: null, pseudo: null });
    });

    it('parses grid keyword', () => {
      const result = parseShorthand('grid');
      expect(result).toEqual({ property: 'grid', value: null, pseudo: null });
    });

    it('parses block keyword', () => {
      const result = parseShorthand('block');
      expect(result).toEqual({ property: 'block', value: null, pseudo: null });
    });

    it('parses hidden keyword', () => {
      const result = parseShorthand('hidden');
      expect(result).toEqual({ property: 'hidden', value: null, pseudo: null });
    });
  });

  describe('pseudo:property:value syntax', () => {
    it('parses hover pseudo', () => {
      const result = parseShorthand('hover:bg:primary.700');
      expect(result).toEqual({
        property: 'bg',
        value: 'primary.700',
        pseudo: ':hover',
      });
    });

    it('parses focus-visible pseudo', () => {
      const result = parseShorthand('focus-visible:ring:2');
      expect(result).toEqual({
        property: 'ring',
        value: '2',
        pseudo: ':focus-visible',
      });
    });

    it('parses active pseudo', () => {
      const result = parseShorthand('active:bg:primary.800');
      expect(result).toEqual({
        property: 'bg',
        value: 'primary.800',
        pseudo: ':active',
      });
    });

    it('parses disabled pseudo', () => {
      const result = parseShorthand('disabled:bg:muted');
      expect(result).toEqual({
        property: 'bg',
        value: 'muted',
        pseudo: ':disabled',
      });
    });

    it('parses first pseudo', () => {
      const result = parseShorthand('first:m:0');
      expect(result).toEqual({
        property: 'm',
        value: '0',
        pseudo: ':first-child',
      });
    });

    it('parses last pseudo', () => {
      const result = parseShorthand('last:mb:0');
      expect(result).toEqual({
        property: 'mb',
        value: '0',
        pseudo: ':last-child',
      });
    });
  });

  describe('pseudo:keyword syntax', () => {
    it('parses hover:hidden', () => {
      const result = parseShorthand('hover:hidden');
      expect(result).toEqual({
        property: 'hidden',
        value: null,
        pseudo: ':hover',
      });
    });
  });

  describe('error cases', () => {
    it('throws on empty string', () => {
      expect(() => parseShorthand('')).toThrow(ShorthandParseError);
    });

    it('throws on whitespace-only string', () => {
      expect(() => parseShorthand('   ')).toThrow(ShorthandParseError);
    });

    it('throws on too many segments', () => {
      expect(() => parseShorthand('a:b:c:d')).toThrow(ShorthandParseError);
      expect(() => parseShorthand('a:b:c:d')).toThrow('Too many segments');
    });

    it('throws on unknown pseudo prefix with 3 segments', () => {
      expect(() => parseShorthand('unknown:bg:red')).toThrow(ShorthandParseError);
      expect(() => parseShorthand('unknown:bg:red')).toThrow('Unknown pseudo prefix');
    });

    it('preserves input in error', () => {
      try {
        parseShorthand('');
      } catch (e) {
        expect(e).toBeInstanceOf(ShorthandParseError);
        expect((e as ShorthandParseError).input).toBe('');
      }
    });
  });
});
