// REMOVED-IN-PHASE-4: this file tests the `s()` template-tag helper and its
// shorthand parser — both removed in Phase 4. Delete this file together with
// `packages/ui/src/css/s.ts`.
import { describe, expect, it } from '@vertz/test';
import { InlineStyleError, s } from '../s';

describe('s()', () => {
  it('converts shorthand to inline style object', () => {
    const result = s(['p:4', 'bg:primary']);
    expect(result).toEqual({
      padding: '1rem',
      backgroundColor: 'var(--color-primary)',
    });
  });

  it('converts kebab-case CSS properties to camelCase', () => {
    const result = s(['rounded:lg']);
    expect(result).toEqual({
      borderRadius: 'calc(var(--radius) * 1.33)',
    });
  });

  it('handles display keywords', () => {
    const result = s(['flex']);
    expect(result).toEqual({
      display: 'flex',
    });
  });

  it('handles multiple entries', () => {
    const result = s(['p:4', 'm:2', 'gap:4', 'items:center']);
    expect(result).toEqual({
      padding: '1rem',
      margin: '0.5rem',
      gap: '1rem',
      alignItems: 'center',
    });
  });

  it('throws on pseudo-state in inline styles', () => {
    expect(() => s(['hover:bg:primary'])).toThrow(InlineStyleError);
    expect(() => s(['hover:bg:primary'])).toThrow('not supported in inline styles');
  });

  it('returns empty object for empty array', () => {
    const result = s([]);
    expect(result).toEqual({});
  });
});
