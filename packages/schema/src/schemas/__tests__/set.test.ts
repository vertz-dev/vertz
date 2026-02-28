import { describe, expect, it } from 'bun:test';
import { SetSchema } from '../set';
import { StringSchema } from '../string';

describe('SetSchema', () => {
  it('accepts Set instances with valid element types', () => {
    const schema = new SetSchema(new StringSchema());
    const input = new Set(['a', 'b', 'c']);
    const result = schema.parse(input).data;
    expect(result).toBeInstanceOf(Set);
    expect(result.has('a')).toBe(true);
  });

  it('rejects non-Set values', () => {
    const schema = new SetSchema(new StringSchema());
    expect(schema.safeParse([]).ok).toBe(false);
    expect(schema.safeParse('hello').ok).toBe(false);
  });

  it('validates element count with .min()/.max()/.size()', () => {
    const schema = new SetSchema(new StringSchema()).min(2).max(4);
    expect(schema.safeParse(new Set(['a'])).ok).toBe(false);
    expect(schema.parse(new Set(['a', 'b'])).data).toBeInstanceOf(Set);
    expect(schema.safeParse(new Set(['a', 'b', 'c', 'd', 'e'])).ok).toBe(false);

    const exact = new SetSchema(new StringSchema()).size(3);
    expect(exact.parse(new Set(['a', 'b', 'c'])).data).toBeInstanceOf(Set);
    expect(exact.safeParse(new Set(['a', 'b'])).ok).toBe(false);
  });

  it('toJSONSchema returns array with uniqueItems', () => {
    const schema = new SetSchema(new StringSchema());
    expect(schema.toJSONSchema()).toEqual({
      type: 'array',
      uniqueItems: true,
      items: { type: 'string' },
    });
  });

  it('toJSONSchema includes minItems/maxItems from constraints', () => {
    const minMax = new SetSchema(new StringSchema()).min(2).max(5);
    expect(minMax.toJSONSchema()).toEqual({
      type: 'array',
      uniqueItems: true,
      items: { type: 'string' },
      minItems: 2,
      maxItems: 5,
    });

    const exact = new SetSchema(new StringSchema()).size(3);
    expect(exact.toJSONSchema()).toEqual({
      type: 'array',
      uniqueItems: true,
      items: { type: 'string' },
      minItems: 3,
      maxItems: 3,
    });
  });
});
