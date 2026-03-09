import { describe, expect, it } from 'bun:test';
import { Hero } from '../../templates/hero';

describe('OGTemplate.Hero', () => {
  it('returns a valid SatoriElement with the given title', () => {
    const result = Hero({ title: 'Big Hero Title' });
    expect(result.type).toBe('div');
    expect(findText(result, 'Big Hero Title')).toBe(true);
  });

  it('includes subtitle when provided', () => {
    const result = Hero({ title: 'Title', subtitle: 'A subtitle here' });
    expect(findText(result, 'A subtitle here')).toBe(true);
  });

  it('uses center-aligned layout by default', () => {
    const result = Hero({ title: 'Title' });
    expect(result.props.style?.alignItems).toBe('center');
    expect(result.props.style?.justifyContent).toBe('center');
  });

  it('applies gradient colors when provided', () => {
    const result = Hero({ title: 'Title', gradientFrom: '#1a1a2e', gradientTo: '#16213e' });
    const bg = result.props.style?.background as string;
    expect(bg).toContain('#1a1a2e');
    expect(bg).toContain('#16213e');
  });
});

function findText(node: unknown, text: string): boolean {
  if (node == null || typeof node === 'boolean') return false;
  if (typeof node === 'string') return node === text;
  if (typeof node === 'number') return String(node) === text;
  if (typeof node !== 'object') return false;
  const el = node as { props?: { children?: unknown } };
  const children = el.props?.children;
  if (children == null) return false;
  if (typeof children === 'string') return children === text;
  if (Array.isArray(children)) return children.some((c) => findText(c, text));
  return findText(children, text);
}
