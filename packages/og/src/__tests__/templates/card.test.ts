import { describe, expect, it } from 'bun:test';
import { Card } from '../../templates/card';
import type { SatoriElement } from '../../types';

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

/** Recursively search for a text string in a Satori element tree. */
function findTextInTree(
  node: SatoriElement | string | number | boolean | null | undefined,
  text: string,
): boolean {
  if (node == null || typeof node === 'boolean') return false;
  if (typeof node === 'string') return node === text;
  if (typeof node === 'number') return String(node) === text;

  const children = node.props.children;
  if (children == null) return false;
  if (typeof children === 'string') return children === text;
  if (typeof children === 'number') return String(children) === text;
  if (typeof children === 'boolean') return false;
  if (Array.isArray(children)) {
    return children.some((child) => findTextInTree(child as SatoriElement, text));
  }
  return findTextInTree(children, text);
}

/** Recursively search for a style property value in a Satori element tree. */
function findStyleInTree(
  node: SatoriElement | string | number | boolean | null | undefined,
  prop: string,
  value: string,
): boolean {
  if (node == null || typeof node !== 'object') return false;

  if (node.props.style && node.props.style[prop] === value) return true;

  const children = node.props.children;
  if (children == null) return false;
  if (Array.isArray(children)) {
    return children.some((child) => findStyleInTree(child as SatoriElement, prop, value));
  }
  if (typeof children === 'object') {
    return findStyleInTree(children, prop, value);
  }
  return false;
}
