import { describe, expect, it } from '@vertz/test';
import { generateStyleBlock } from './generator';

describe('generateStyleBlock — single entries', () => {
  it('emits a single spacing entry', () => {
    expect(generateStyleBlock(['p:4'])).toBe('{ padding: token.spacing[4] }');
  });

  it('emits a single color entry', () => {
    expect(generateStyleBlock(['bg:primary'])).toBe('{ backgroundColor: token.color.primary }');
  });

  it('emits a single literal for CSS color keyword', () => {
    expect(generateStyleBlock(['bg:white'])).toBe("{ backgroundColor: 'white' }");
  });
});

describe('generateStyleBlock — multiple base entries', () => {
  it('joins multiple shorthands in one block', () => {
    expect(generateStyleBlock(['p:4', 'bg:primary'])).toBe(
      '{ padding: token.spacing[4], backgroundColor: token.color.primary }',
    );
  });

  it('expands multi-declaration keywords (truncate)', () => {
    expect(generateStyleBlock(['truncate'])).toBe(
      "{ overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }",
    );
  });

  it('preserves shorthand order', () => {
    expect(generateStyleBlock(['flex', 'items:center', 'justify:between'])).toBe(
      "{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }",
    );
  });
});

describe('generateStyleBlock — pseudo grouping', () => {
  it('groups a single hover shorthand under &:hover', () => {
    expect(generateStyleBlock(['hover:bg:primary'])).toBe(
      "{ '&:hover': { backgroundColor: token.color.primary } }",
    );
  });

  it('merges multiple shorthands that share the same pseudo', () => {
    expect(generateStyleBlock(['hover:bg:primary', 'hover:text:white'])).toBe(
      "{ '&:hover': { backgroundColor: token.color.primary, color: 'white' } }",
    );
  });

  it('places base entries before pseudo group', () => {
    expect(generateStyleBlock(['p:4', 'hover:bg:primary'])).toBe(
      "{ padding: token.spacing[4], '&:hover': { backgroundColor: token.color.primary } }",
    );
  });

  it('emits multiple distinct pseudo groups in first-seen order', () => {
    expect(
      generateStyleBlock(['p:4', 'hover:bg:primary', 'focus:outline-none', 'hover:text:white']),
    ).toBe(
      "{ padding: token.spacing[4], '&:hover': { backgroundColor: token.color.primary, color: 'white' }, '&:focus': { outline: 'none' } }",
    );
  });
});

describe('generateStyleBlock — edge cases', () => {
  it('returns {} for an empty array', () => {
    expect(generateStyleBlock([])).toBe('{}');
  });

  it('handles a disabled pseudo prefix', () => {
    expect(generateStyleBlock(['disabled:opacity:0.5'])).toBe(
      "{ '&:disabled': { opacity: '0.5' } }",
    );
  });

  it('handles decimal spacing keys', () => {
    expect(generateStyleBlock(['mt:0.5'])).toBe("{ marginTop: token.spacing['0.5'] }");
  });

  it('dedupes base entries with the same cssKey (last-wins)', () => {
    expect(generateStyleBlock(['bg:primary', 'bg:white'])).toBe(
      "{ backgroundColor: 'white' }",
    );
  });

  it('dedupes pseudo entries with the same cssKey (last-wins)', () => {
    expect(generateStyleBlock(['focus:outline-none', 'focus:ring:2'])).toBe(
      "{ '&:focus': { outline: '2px solid var(--color-ring)' } }",
    );
  });
});
