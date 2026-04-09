import { describe, expect, it } from '@vertz/test';
import { Minimal } from '../../templates/minimal';
import { findStyleValue, findTextInTree } from '../test-helpers';

describe('OGTemplate.Minimal', () => {
  it('returns a valid SatoriElement with the given title', () => {
    const result = Minimal({ title: 'Clean Title' });
    expect(result.type).toBe('div');
    expect(findTextInTree(result, 'Clean Title')).toBe(true);
  });

  it('applies accent color to the left border', () => {
    const result = Minimal({ title: 'Title', accent: '#e11d48' });
    expect(findStyleValue(result, 'borderLeft')).toContain('#e11d48');
  });

  it('uses default accent color when not specified', () => {
    const result = Minimal({ title: 'Title' });
    expect(findStyleValue(result, 'borderLeft')).toContain('#3b82f6');
  });
});
