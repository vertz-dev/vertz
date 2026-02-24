import { describe, expect, it } from 'bun:test';
import { CustomSchema } from '../custom';

describe('CustomSchema', () => {
  it('accepts when predicate returns true', () => {
    const schema = new CustomSchema<number>((v) => typeof v === 'number' && (v as number) > 0);
    expect(schema.parse(42)).toBe(42);
  });

  it('rejects when predicate returns false', () => {
    const schema = new CustomSchema<number>(
      (v) => typeof v === 'number' && (v as number) > 0,
      'Must be positive',
    );
    const result = schema.safeParse(-1);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe('Must be positive');
    }
  });
});
