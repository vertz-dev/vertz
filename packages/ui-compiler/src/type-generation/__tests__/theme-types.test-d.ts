/**
 * Type-level tests for theme type generation.
 *
 * These tests verify that the generated types are structurally correct
 * and that the generator functions have proper type signatures.
 */

import { describe, it } from 'vitest';
import type { CSSPropertiesInput } from '../css-properties';
import { generateCSSProperties } from '../css-properties';
import type { ThemeTypeInput } from '../theme-types';
import { generateThemeTypes } from '../theme-types';

describe('type-level: ThemeTypeInput', () => {
  it('accepts correct shapes with colors and spacing', () => {
    const _validInput: ThemeTypeInput = {
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
    const _missingColors: ThemeTypeInput = {};
    void _missingColors;
  });

  it('allows spacing to be optional', () => {
    const _noSpacing: ThemeTypeInput = {
      colors: { primary: { 500: '#3b82f6' } },
    };
    void _noSpacing;
  });
});

describe('type-level: generateThemeTypes', () => {
  it('returns a string', () => {
    const _result: string = generateThemeTypes({
      colors: { primary: { 500: '#3b82f6' } },
    });
    void _result;
  });
});

describe('type-level: CSSPropertiesInput', () => {
  it('accepts correct shapes', () => {
    const _validCSSInput: CSSPropertiesInput = {
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
    const _noSpacingCSS: CSSPropertiesInput = {
      colors: { primary: { 500: '#3b82f6' } },
    };
    void _noSpacingCSS;
  });
});

describe('type-level: generateCSSProperties', () => {
  it('returns a string', () => {
    const _cssResult: string = generateCSSProperties({
      colors: { primary: { 500: '#3b82f6' } },
    });
    void _cssResult;
  });
});
