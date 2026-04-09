import { describe, expect, it } from '@vertz/test';
import { Hero } from '../../templates/hero';
import { findTextInTree } from '../test-helpers';

describe('OGTemplate.Hero', () => {
  it('returns a valid SatoriElement with the given title', () => {
    const result = Hero({ title: 'Big Hero Title' });
    expect(result.type).toBe('div');
    expect(findTextInTree(result, 'Big Hero Title')).toBe(true);
  });

  it('includes subtitle when provided', () => {
    const result = Hero({ title: 'Title', subtitle: 'A subtitle here' });
    expect(findTextInTree(result, 'A subtitle here')).toBe(true);
  });

  it('uses center-aligned layout by default', () => {
    const result = Hero({ title: 'Title' });
    expect(result.props.style?.alignItems).toBe('center');
    expect(result.props.style?.justifyContent).toBe('center');
  });

  it('applies gradient colors when both are provided', () => {
    const result = Hero({ title: 'Title', gradientFrom: '#1a1a2e', gradientTo: '#16213e' });
    const bg = result.props.style?.background as string;
    expect(bg).toContain('#1a1a2e');
    expect(bg).toContain('#16213e');
  });

  it('uses default background when no gradient is provided', () => {
    const result = Hero({ title: 'Title' });
    expect(result.props.style?.backgroundColor).toBe('#0a0a0b');
  });

  it('applies gradient with default end color when only gradientFrom is provided', () => {
    const result = Hero({ title: 'Title', gradientFrom: '#ff0000' });
    const bg = result.props.style?.background as string;
    expect(bg).toContain('#ff0000');
    expect(bg).toContain('#1a1a2e'); // default gradientTo
  });

  it('applies gradient with default start color when only gradientTo is provided', () => {
    const result = Hero({ title: 'Title', gradientTo: '#00ff00' });
    const bg = result.props.style?.background as string;
    expect(bg).toContain('#0a0a0b'); // default gradientFrom
    expect(bg).toContain('#00ff00');
  });
});
