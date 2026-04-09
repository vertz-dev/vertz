import { describe, expect, it } from '@vertz/test';
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

  it('throws for zero dimensions', () => {
    expect(() => d.vector(0)).toThrow(/dimensions must be an integer between 1 and 16000/);
  });

  it('throws for negative dimensions', () => {
    expect(() => d.vector(-1)).toThrow(/dimensions must be an integer between 1 and 16000/);
  });

  it('throws for non-integer dimensions', () => {
    expect(() => d.vector(1.5)).toThrow(/dimensions must be an integer between 1 and 16000/);
  });

  it('throws for dimensions exceeding pgvector max', () => {
    expect(() => d.vector(16001)).toThrow(/dimensions must be an integer between 1 and 16000/);
  });

  it('accepts boundary values', () => {
    expect(d.vector(1)._meta.dimensions).toBe(1);
    expect(d.vector(16000)._meta.dimensions).toBe(16000);
  });
});
