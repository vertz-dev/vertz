import { describe, expect, it } from 'bun:test';
import { SchemaType } from '../../core/types';
import { CustomSchema } from '../custom';

describe('CustomSchema', () => {
  it('accepts when predicate returns true', () => {
    const schema = new CustomSchema<number>((v) => typeof v === 'number' && (v as number) > 0);
    expect(schema.parse(42).data).toBe(42);
  });

  it('rejects when predicate returns false', () => {
    const schema = new CustomSchema<number>(
      (v) => typeof v === 'number' && (v as number) > 0,
      'Must be positive',
    );
    const result = schema.safeParse(-1);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.issues[0].message).toBe('Must be positive');
    }
  });

  it('metadata.type returns SchemaType.Custom', () => {
    const schema = new CustomSchema<number>((v) => typeof v === 'number');
    expect(schema.metadata.type).toBe(SchemaType.Custom);
  });

  it('toJSONSchema() returns empty object', () => {
    const schema = new CustomSchema<number>((v) => typeof v === 'number');
    expect(schema.toJSONSchema()).toEqual({});
  });

  it('_clone() preserves metadata and check function', () => {
    const schema = new CustomSchema<number>((v) => typeof v === 'number').describe('custom num');
    expect(schema.metadata.description).toBe('custom num');
    expect(schema.parse(42).data).toBe(42);
    expect(schema.safeParse('nope').ok).toBe(false);
  });
});
