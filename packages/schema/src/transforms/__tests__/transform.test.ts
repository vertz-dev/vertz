import { describe, it, expect } from 'vitest';
import { StringSchema } from '../../schemas/string';
import { NumberSchema } from '../../schemas/number';

describe('.transform()', () => {
  it('changes output value', () => {
    const schema = new StringSchema().transform((val) => val.length);
    expect(schema.parse('hello')).toBe(5);
  });

  it('changes output type (string → number)', () => {
    const schema = new StringSchema().transform((val) => parseInt(val, 10));
    expect(schema.parse('42')).toBe(42);
  });

  it('chaining: .refine().transform() — refine sees pre-transform value', () => {
    const schema = new StringSchema()
      .refine((val) => val.length > 0)
      .transform((val) => val.toUpperCase());
    expect(schema.parse('hello')).toBe('HELLO');
    expect(schema.safeParse('').success).toBe(false);
  });

  it('safeParse catches exceptions thrown by transform function', () => {
    const schema = new StringSchema().transform(() => {
      throw new Error('Transform exploded');
    });
    const result = schema.safeParse('hello');
    expect(result.success).toBe(false);
  });
});
