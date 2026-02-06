import { describe, it, expect } from 'vitest';
import { ParseContext } from '../parse-context';
import { ErrorCode } from '../errors';

describe('ParseContext', () => {
  it('starts with no issues', () => {
    const ctx = new ParseContext();
    expect(ctx.hasIssues()).toBe(false);
    expect(ctx.issues).toEqual([]);
  });

  it('addIssue creates issue with empty path at top level', () => {
    const ctx = new ParseContext();
    ctx.addIssue({ code: ErrorCode.InvalidType, message: 'Expected string' });

    expect(ctx.hasIssues()).toBe(true);
    expect(ctx.issues).toEqual([
      { code: ErrorCode.InvalidType, message: 'Expected string', path: [] },
    ]);
  });

  it('pushPath/popPath tracks nested paths for issues', () => {
    const ctx = new ParseContext();
    ctx.pushPath('user');
    ctx.pushPath('name');
    ctx.addIssue({ code: ErrorCode.InvalidType, message: 'Expected string' });
    ctx.popPath();
    ctx.popPath();

    expect(ctx.issues[0]!.path).toEqual(['user', 'name']);
    expect(ctx.path).toEqual([]);
  });
});
