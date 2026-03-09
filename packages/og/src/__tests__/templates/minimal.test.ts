import { describe, expect, it } from 'bun:test';
import { Minimal } from '../../templates/minimal';

describe('OGTemplate.Minimal', () => {
  it('returns a valid SatoriElement with the given title', () => {
    const result = Minimal({ title: 'Clean Title' });
    expect(result.type).toBe('div');
    expect(findText(result, 'Clean Title')).toBe(true);
  });

  it('applies accent color to the left border', () => {
    const result = Minimal({ title: 'Title', accent: '#e11d48' });
    expect(findStyle(result, 'borderLeft')).toContain('#e11d48');
  });

  it('uses default accent color when not specified', () => {
    const result = Minimal({ title: 'Title' });
    // Default accent is blue (#3b82f6)
    expect(findStyle(result, 'borderLeft')).toContain('#3b82f6');
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

function findStyle(node: unknown, prop: string): string {
  if (node == null || typeof node !== 'object') return '';
  const el = node as { props?: { style?: Record<string, unknown>; children?: unknown } };
  const val = el.props?.style?.[prop];
  if (typeof val === 'string') return val;
  const children = el.props?.children;
  if (children == null) return '';
  if (Array.isArray(children)) {
    for (const c of children) {
      const found = findStyle(c, prop);
      if (found) return found;
    }
  } else if (typeof children === 'object') {
    return findStyle(children, prop);
  }
  return '';
}
