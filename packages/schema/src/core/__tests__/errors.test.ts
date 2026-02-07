import { describe, expect, it } from 'vitest';
import type { ValidationIssue } from '../errors';
import { ErrorCode, ParseError } from '../errors';

describe('ErrorCode', () => {
  it('has InvalidType value', () => {
    expect(ErrorCode.InvalidType).toBe('invalid_type');
  });

  it('has all expected enum values', () => {
    expect(ErrorCode.TooSmall).toBe('too_small');
    expect(ErrorCode.TooBig).toBe('too_big');
    expect(ErrorCode.InvalidString).toBe('invalid_string');
    expect(ErrorCode.InvalidEnumValue).toBe('invalid_enum_value');
    expect(ErrorCode.InvalidLiteral).toBe('invalid_literal');
    expect(ErrorCode.InvalidUnion).toBe('invalid_union');
    expect(ErrorCode.InvalidDate).toBe('invalid_date');
    expect(ErrorCode.MissingProperty).toBe('missing_property');
    expect(ErrorCode.UnrecognizedKeys).toBe('unrecognized_keys');
    expect(ErrorCode.Custom).toBe('custom');
    expect(ErrorCode.InvalidIntersection).toBe('invalid_intersection');
    expect(ErrorCode.NotMultipleOf).toBe('not_multiple_of');
    expect(ErrorCode.NotFinite).toBe('not_finite');
  });
});

describe('ParseError', () => {
  it('constructs with issues, extends Error, and formats message', () => {
    const issues: ValidationIssue[] = [
      {
        code: ErrorCode.InvalidType,
        message: 'Expected string, received number',
        path: [],
      },
    ];
    const error = new ParseError(issues);

    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(ParseError);
    expect(error.name).toBe('ParseError');
    expect(error.issues).toEqual(issues);
    expect(error.message).toBe('Expected string, received number');
  });

  it('formats message with paths for multiple issues', () => {
    const issues: ValidationIssue[] = [
      {
        code: ErrorCode.InvalidType,
        message: 'Expected string',
        path: ['user', 'name'],
      },
      {
        code: ErrorCode.TooSmall,
        message: 'Too short',
        path: ['user', 'email'],
      },
    ];
    const error = new ParseError(issues);

    expect(error.message).toBe('Expected string at "user.name"; Too short at "user.email"');
    expect(error.issues).toHaveLength(2);
  });
});
