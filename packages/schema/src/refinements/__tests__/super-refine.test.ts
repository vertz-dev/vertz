import { describe, expect, it } from 'bun:test';
import { ErrorCode } from '../../core/errors';
import { StringSchema } from '../../schemas/string';

describe('.superRefine()', () => {
  it('can add multiple issues via ctx.addIssue', () => {
    const schema = new StringSchema().superRefine((val, ctx) => {
      if (val.length < 3) {
        ctx.addIssue({ code: ErrorCode.Custom, message: 'Too short' });
      }
      if (!val.includes('@')) {
        ctx.addIssue({ code: ErrorCode.Custom, message: 'Missing @' });
      }
    });
    const result = schema.safeParse('ab');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.issues.length).toBe(2);
      expect(result.error.issues[0]?.message).toBe('Too short');
      expect(result.error.issues[1]?.message).toBe('Missing @');
    }
  });

  it('ctx.addIssue supports custom error codes', () => {
    const schema = new StringSchema().superRefine((val, ctx) => {
      if (val !== 'admin') {
        ctx.addIssue({ code: ErrorCode.Custom, message: 'Not admin' });
      }
    });
    const result = schema.safeParse('user');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.issues[0]?.code).toBe(ErrorCode.Custom);
    }
  });

  it('.check() is an alias for superRefine', () => {
    const schema = new StringSchema().check((val, ctx) => {
      if (val.length === 0) {
        ctx.addIssue({ code: ErrorCode.Custom, message: 'Empty' });
      }
    });
    expect(schema.parse('hello').data).toBe('hello');
    const result = schema.safeParse('');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.issues[0]?.message).toBe('Empty');
    }
  });
});
