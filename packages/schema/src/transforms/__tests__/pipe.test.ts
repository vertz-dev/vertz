import { describe, expect, it } from 'vitest';
import { NumberSchema } from '../../schemas/number';
import { StringSchema } from '../../schemas/string';

describe('.pipe()', () => {
  it('chains two schemas — first output feeds into second input', () => {
    const schema = new StringSchema()
      .transform((val) => parseInt(val, 10))
      .pipe(new NumberSchema().min(1));
    expect(schema.parse('42')).toBe(42);
  });

  it('validation errors from either schema propagate', () => {
    const schema = new StringSchema()
      .transform((val) => parseInt(val, 10))
      .pipe(new NumberSchema().min(10));
    const result = schema.safeParse('5');
    expect(result.success).toBe(false);
  });

  it('validation errors from first schema propagate', () => {
    const schema = new StringSchema()
      .min(1)
      .transform((val) => parseInt(val, 10))
      .pipe(new NumberSchema());
    const result = schema.safeParse('');
    expect(result.success).toBe(false);
  });
});
