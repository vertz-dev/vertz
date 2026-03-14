import { describe, expect, it } from 'bun:test';
import { parseColor } from '../render/renderer';

describe('parseColor', () => {
  it('Then parses 6-digit hex', () => {
    const [r, g, b, a] = parseColor('#ff0000');
    expect(r).toBeCloseTo(1.0);
    expect(g).toBeCloseTo(0.0);
    expect(b).toBeCloseTo(0.0);
    expect(a).toBeCloseTo(1.0);
  });

  it('Then parses 8-digit hex with alpha', () => {
    const [r, g, b, a] = parseColor('#ff000080');
    expect(r).toBeCloseTo(1.0);
    expect(a).toBeCloseTo(0.502, 2);
  });

  it('Then handles transparent', () => {
    const [r, g, b, a] = parseColor('transparent');
    expect(r).toBe(0);
    expect(g).toBe(0);
    expect(b).toBe(0);
    expect(a).toBe(0);
  });

  it('Then handles invalid input', () => {
    const [r, g, b, a] = parseColor('invalid');
    expect(a).toBe(1);
  });
});
