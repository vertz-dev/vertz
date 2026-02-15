import { describe, expect, it } from 'vitest';
import { EnumSchema } from '../enum';

describe('EnumSchema.values', () => {
  it('exposes the enum values via a public getter', () => {
    const schema = new EnumSchema(['admin', 'editor', 'viewer'] as const);
    expect(schema.values).toEqual(['admin', 'editor', 'viewer']);
  });

  it('returns a readonly tuple preserving the original values', () => {
    const vals = ['a', 'b'] as const;
    const schema = new EnumSchema(vals);
    expect(schema.values).toBe(vals);
  });
});
