import { describe, expect, it } from 'bun:test';
import { deepMergeTokens } from '../merge';

describe('deepMergeTokens', () => {
  it('returns base unchanged when overrides is empty', () => {
    const base = {
      primary: { DEFAULT: '#000', _dark: '#fff' },
    };
    const result = deepMergeTokens(base, {});
    expect(result).toEqual(base);
  });

  it('overrides specific token values', () => {
    const base = {
      primary: { DEFAULT: '#000', _dark: '#fff' },
      background: { DEFAULT: '#fff', _dark: '#000' },
    };
    const result = deepMergeTokens(base, {
      primary: { DEFAULT: '#7c3aed' },
    });
    expect(result.primary).toEqual({ DEFAULT: '#7c3aed', _dark: '#fff' });
    expect(result.background).toEqual({ DEFAULT: '#fff', _dark: '#000' });
  });

  it('preserves non-overridden tokens', () => {
    const base = {
      primary: { DEFAULT: '#000', _dark: '#fff' },
      border: { DEFAULT: '#ccc', _dark: '#333' },
    };
    const result = deepMergeTokens(base, {
      primary: { DEFAULT: '#7c3aed', _dark: '#8b5cf6' },
    });
    expect(result.border).toEqual({ DEFAULT: '#ccc', _dark: '#333' });
  });

  it('does not mutate the base object', () => {
    const base = {
      primary: { DEFAULT: '#000', _dark: '#fff' },
    };
    const baseCopy = JSON.parse(JSON.stringify(base));
    deepMergeTokens(base, { primary: { DEFAULT: '#7c3aed' } });
    expect(base).toEqual(baseCopy);
  });
});
