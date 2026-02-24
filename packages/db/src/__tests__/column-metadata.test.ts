import { describe, expect, it } from 'bun:test';
import { d } from '../d';

// ---------------------------------------------------------------------------
// Column-type-specific metadata — runtime tests
// ---------------------------------------------------------------------------

describe('Column-type-specific metadata — runtime', () => {
  it('varchar carries length in _meta', () => {
    const col = d.varchar(255);
    expect(col._meta.length).toBe(255);
  });

  it('decimal carries precision and scale in _meta', () => {
    const col = d.decimal(10, 2);
    expect(col._meta.precision).toBe(10);
    expect(col._meta.scale).toBe(2);
  });

  it('enum carries enumName and enumValues in _meta', () => {
    const col = d.enum('status', ['active', 'inactive']);
    expect(col._meta.enumName).toBe('status');
    expect(col._meta.enumValues).toEqual(['active', 'inactive']);
  });

  it('email carries format in _meta', () => {
    const col = d.email();
    expect(col._meta.format).toBe('email');
  });

  it('timestamp does not carry extra fields', () => {
    const col = d.timestamp();
    expect(col._meta.format).toBeUndefined();
    expect(col._meta.length).toBeUndefined();
  });

  it('text does not carry extra fields', () => {
    const col = d.text();
    expect(col._meta.length).toBeUndefined();
    expect(col._meta.enumName).toBeUndefined();
  });

  it('metadata survives chaining modifiers', () => {
    const col = d.varchar(100).nullable().unique();
    expect(col._meta.length).toBe(100);
    expect(col._meta.nullable).toBe(true);
    expect(col._meta.unique).toBe(true);
  });

  it('enum metadata survives chaining modifiers', () => {
    const col = d.enum('role', ['admin', 'user']).default('user');
    expect(col._meta.enumName).toBe('role');
    expect(col._meta.enumValues).toEqual(['admin', 'user']);
    expect(col._meta.hasDefault).toBe(true);
  });

  it('decimal metadata survives chaining modifiers', () => {
    const col = d.decimal(8, 4).nullable().default('0.0000');
    expect(col._meta.precision).toBe(8);
    expect(col._meta.scale).toBe(4);
    expect(col._meta.nullable).toBe(true);
    expect(col._meta.hasDefault).toBe(true);
  });
});
