/**
 * Type-level tests for theme type generation.
 *
 * These tests verify that the generated types are structurally correct
 * and that the generator functions have proper type signatures.
 */
import { describe, it } from 'vitest';
import { generateCSSProperties } from '../css-properties';
import { generateThemeTypes } from '../theme-types';

describe('type-level: ThemeTypeInput', () => {
  it('accepts correct shapes with colors and spacing', () => {
    const _validInput = {
      colors: {
        primary: { 500: '#3b82f6' },
        background: { DEFAULT: 'white', _dark: '#111827' },
      },
      spacing: {
        sm: '0.5rem',
      },
    };
    void _validInput;
  });
  it('requires colors field', () => {
    // @ts-expect-error - colors is required
    const _missingColors = {};
    void _missingColors;
  });
  it('allows spacing to be optional', () => {
    const _noSpacing = {
      colors: { primary: { 500: '#3b82f6' } },
    };
    void _noSpacing;
  });
});
describe('type-level: generateThemeTypes', () => {
  it('returns a string', () => {
    const _result = generateThemeTypes({
      colors: { primary: { 500: '#3b82f6' } },
    });
    void _result;
  });
});
describe('type-level: CSSPropertiesInput', () => {
  it('accepts correct shapes', () => {
    const _validCSSInput = {
      colors: {
        primary: { 500: '#3b82f6' },
      },
      spacing: {
        sm: '0.5rem',
      },
    };
    void _validCSSInput;
  });
  it('allows spacing to be optional', () => {
    const _noSpacingCSS = {
      colors: { primary: { 500: '#3b82f6' } },
    };
    void _noSpacingCSS;
  });
});
describe('type-level: generateCSSProperties', () => {
  it('returns a string', () => {
    const _cssResult = generateCSSProperties({
      colors: { primary: { 500: '#3b82f6' } },
    });
    void _cssResult;
  });
});
//# sourceMappingURL=theme-types.test-d.js.map
