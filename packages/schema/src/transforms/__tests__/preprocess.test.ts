import { describe, expect, it } from 'bun:test';
import { NumberSchema } from '../../schemas/number';
import { preprocess } from '../preprocess';

describe('preprocess()', () => {
  it('transforms input before validation', () => {
    const schema = preprocess((val) => Number(val), new NumberSchema());
    expect(schema.parse('42')).toBe(42);
  });

  it('preprocessed value is what the schema validates', () => {
    const schema = preprocess((val) => Number(val), new NumberSchema().min(10));
    const result = schema.safeParse('5');
    expect(result.success).toBe(false);
  });

  it('safeParse catches exceptions thrown by preprocess function', () => {
    const schema = preprocess(() => {
      throw new Error('Preprocess exploded');
    }, new NumberSchema());
    const result = schema.safeParse('hello');
    expect(result.success).toBe(false);
  });
});
