import { describe, expect, it } from 'bun:test';
import { Card } from '../../templates/card';
import { findStyleInTree, findTextInTree } from '../test-helpers';

describe('OGTemplate.Card', () => {
  it('returns a valid SatoriElement with the given title', () => {
    const result = Card({ title: 'My Page Title' });
    expect(result.type).toBe('div');
    expect(result.props).toBeDefined();
    expect(findTextInTree(result, 'My Page Title')).toBe(true);
  });

  it('includes description when provided', () => {
    const result = Card({ title: 'Title', description: 'Some description' });
    expect(findTextInTree(result, 'Some description')).toBe(true);
  });

  it('includes badge when provided', () => {
    const result = Card({ title: 'Title', badge: 'Public Beta' });
    expect(findTextInTree(result, 'Public Beta')).toBe(true);
  });

  it('includes url when provided', () => {
    const result = Card({ title: 'Title', url: 'myapp.com' });
    expect(findTextInTree(result, 'myapp.com')).toBe(true);
  });

  it('applies custom brand color to the badge dot', () => {
    const result = Card({ title: 'Title', badge: 'Beta', brandColor: '#ff0000' });
    expect(findStyleInTree(result, 'backgroundColor', '#ff0000')).toBe(true);
  });

  it('uses default dark background when no backgroundColor specified', () => {
    const result = Card({ title: 'Title' });
    expect(result.props.style?.backgroundColor).toBe('#0a0a0b');
  });

  it('applies custom background color', () => {
    const result = Card({ title: 'Title', backgroundColor: '#1a1a2e' });
    expect(result.props.style?.backgroundColor).toBe('#1a1a2e');
  });
});
