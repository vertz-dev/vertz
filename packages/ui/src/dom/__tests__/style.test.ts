import { describe, expect, it } from 'bun:test';
import { styleObjectToString } from '../style';

describe('styleObjectToString', () => {
  describe('Given an object with camelCase CSS properties', () => {
    it('Then converts to kebab-case CSS string', () => {
      expect(styleObjectToString({ backgroundColor: 'red' })).toBe('background-color: red');
    });
  });

  describe('Given multiple properties', () => {
    it('Then joins with semicolon and space', () => {
      expect(styleObjectToString({ backgroundColor: 'red', marginTop: '1rem' })).toBe(
        'background-color: red; margin-top: 1rem',
      );
    });
  });

  describe('Given numeric values', () => {
    it('Then appends px for dimensional properties', () => {
      expect(styleObjectToString({ width: 200 })).toBe('width: 200px');
    });

    it('Then does NOT append px for unitless properties', () => {
      expect(styleObjectToString({ opacity: 0.5 })).toBe('opacity: 0.5');
      expect(styleObjectToString({ zIndex: 10 })).toBe('z-index: 10');
      expect(styleObjectToString({ fontWeight: 600 })).toBe('font-weight: 600');
      expect(styleObjectToString({ lineHeight: 1.5 })).toBe('line-height: 1.5');
      expect(styleObjectToString({ flexGrow: 1 })).toBe('flex-grow: 1');
    });

    it('Then does NOT append px for zero values regardless of property', () => {
      expect(styleObjectToString({ margin: 0 })).toBe('margin: 0');
      expect(styleObjectToString({ padding: 0 })).toBe('padding: 0');
      expect(styleObjectToString({ opacity: 0 })).toBe('opacity: 0');
    });
  });

  describe('Given vendor-prefixed properties', () => {
    it('Then converts WebkitX to -webkit-x', () => {
      expect(styleObjectToString({ WebkitTransform: 'rotate(45deg)' })).toBe(
        '-webkit-transform: rotate(45deg)',
      );
    });

    it('Then converts MozX to -moz-x', () => {
      expect(styleObjectToString({ MozTransform: 'rotate(45deg)' })).toBe(
        '-moz-transform: rotate(45deg)',
      );
    });

    it('Then converts msX to -ms-x (lowercase ms gets leading dash)', () => {
      expect(styleObjectToString({ msTransform: 'rotate(45deg)' })).toBe(
        '-ms-transform: rotate(45deg)',
      );
    });
  });

  describe('Given CSS custom properties', () => {
    it('Then passes through as-is', () => {
      expect(styleObjectToString({ '--my-color': 'red' })).toBe('--my-color: red');
    });

    it('Then does NOT append px for numeric values', () => {
      expect(styleObjectToString({ '--grid-columns': 3 })).toBe('--grid-columns: 3');
    });
  });

  describe('Given null/undefined values', () => {
    it('Then skips those properties', () => {
      expect(styleObjectToString({ color: 'red', background: undefined })).toBe('color: red');
      expect(styleObjectToString({ color: 'red', background: null })).toBe('color: red');
    });
  });

  describe('Given an empty object', () => {
    it('Then returns an empty string', () => {
      expect(styleObjectToString({})).toBe('');
    });
  });
});
