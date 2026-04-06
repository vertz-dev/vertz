import { describe, expect, it } from 'bun:test';
import { d } from '../../d';

describe('d.vector(N) column type', () => {
  it('creates a column with sqlType vector and stores dimensions', () => {
    const col = d.vector(1536);
    expect(col._meta.sqlType).toBe('vector');
    expect(col._meta.dimensions).toBe(1536);
    expect(col._meta.primary).toBe(false);
    expect(col._meta.nullable).toBe(false);
    expect(col._meta.hasDefault).toBe(false);
  });

  it('supports different dimension sizes', () => {
    const col384 = d.vector(384);
    expect(col384._meta.dimensions).toBe(384);

    const col3 = d.vector(3);
    expect(col3._meta.dimensions).toBe(3);
  });

  it('supports .nullable()', () => {
    const col = d.vector(1536).nullable();
    expect(col._meta.sqlType).toBe('vector');
    expect(col._meta.dimensions).toBe(1536);
    expect(col._meta.nullable).toBe(true);
  });

  it('supports .unique()', () => {
    const col = d.vector(1536).unique();
    expect(col._meta.unique).toBe(true);
    expect(col._meta.dimensions).toBe(1536);
  });
});
