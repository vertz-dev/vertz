import { describe, expect, it } from 'bun:test';
import { SchemaType } from '../../core/types';
import { MapSchema } from '../map';
import { NumberSchema } from '../number';
import { StringSchema } from '../string';

describe('MapSchema', () => {
  it('accepts Map instances with valid key/value types', () => {
    const schema = new MapSchema(new StringSchema(), new NumberSchema());
    const input = new Map([
      ['a', 1],
      ['b', 2],
    ]);
    const result = schema.parse(input).data;
    expect(result).toBeInstanceOf(Map);
    expect(result.get('a')).toBe(1);
  });

  it('rejects non-Map values', () => {
    const schema = new MapSchema(new StringSchema(), new NumberSchema());
    expect(schema.safeParse({}).ok).toBe(false);
    expect(schema.safeParse([]).ok).toBe(false);
    expect(schema.safeParse('hello').ok).toBe(false);
  });

  it('validates each key and value', () => {
    const schema = new MapSchema(new StringSchema(), new NumberSchema());
    const input = new Map<string, string>([['a', 'not-number']]);
    const result = schema.safeParse(input);
    expect(result.ok).toBe(false);
  });

  it('toJSONSchema returns array of tuples', () => {
    const schema = new MapSchema(new StringSchema(), new NumberSchema());
    expect(schema.toJSONSchema()).toEqual({
      type: 'array',
      items: {
        type: 'array',
        prefixItems: [{ type: 'string' }, { type: 'number' }],
        items: false,
      },
    });
  });

  it('metadata.type returns SchemaType.Map', () => {
    expect(new MapSchema(new StringSchema(), new NumberSchema()).metadata.type).toBe(
      SchemaType.Map,
    );
  });

  it('_clone() preserves metadata', () => {
    const schema = new MapSchema(new StringSchema(), new NumberSchema()).describe('str-num map');
    expect(schema.metadata.description).toBe('str-num map');
    const input = new Map([['a', 1]]);
    expect(schema.parse(input).data).toEqual(input);
  });
});
