import { describe, expect, it } from '@vertz/test';
import { SchemaType } from '../../core/types';
import { NumberSchema } from '../../schemas/number';
import { preprocess } from '../preprocess';

describe('preprocess()', () => {
  it('transforms input before validation', () => {
    const schema = preprocess((val) => Number(val), new NumberSchema());
    expect(schema.parse('42').data).toBe(42);
  });

  it('preprocessed value is what the schema validates', () => {
    const schema = preprocess((val) => Number(val), new NumberSchema().min(10));
    const result = schema.safeParse('5');
    expect(result.ok).toBe(false);
  });

  it('safeParse catches exceptions thrown by preprocess function', () => {
    const schema = preprocess(() => {
      throw new Error('Preprocess exploded');
    }, new NumberSchema());
    const result = schema.safeParse('hello');
    expect(result.ok).toBe(false);
  });

  it('metadata.type delegates to inner schema', () => {
    const schema = preprocess((val) => Number(val), new NumberSchema());
    expect(schema.metadata.type).toBe(SchemaType.Number);
  });

  it('toJSONSchema() delegates to inner schema', () => {
    const schema = preprocess((val) => Number(val), new NumberSchema());
    expect(schema.toJSONSchema()).toEqual({ type: 'number' });
  });

  it('_clone() preserves metadata', () => {
    const schema = preprocess((val) => Number(val), new NumberSchema()).describe('preprocessed');
    expect(schema.metadata.description).toBe('preprocessed');
    expect(schema.parse('42').data).toBe(42);
  });
});
