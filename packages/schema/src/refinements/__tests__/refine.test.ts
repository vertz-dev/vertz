import { describe, expect, it } from 'bun:test';
import { ErrorCode } from '../../core/errors';
import { StringSchema } from '../../schemas/string';

describe('.refine()', () => {
  it('passes when predicate returns true', () => {
    const schema = new StringSchema().refine((val) => val.length > 0);
    expect(schema.parse('hello').data).toBe('hello');
  });

  it('fails with Custom error when predicate returns false', () => {
    const schema = new StringSchema().refine((val) => val.length > 0);
    const result = schema.safeParse('');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.issues[0]?.code).toBe(ErrorCode.Custom);
    }
  });

  it('uses custom error message', () => {
    const schema = new StringSchema().refine((val) => val.length > 0, 'Must not be empty');
    const result = schema.safeParse('');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.issues[0]?.message).toBe('Must not be empty');
    }
  });

  it('uses custom path from params object', () => {
    const schema = new StringSchema().refine((val) => val.length > 0, {
      message: 'Required',
      path: ['name'],
    });
    const result = schema.safeParse('');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.issues[0]?.path).toEqual(['name']);
    }
  });
});
