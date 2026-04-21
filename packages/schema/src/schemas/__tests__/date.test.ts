import { describe, expect, it } from '@vertz/test';
import { ParseError } from '../../core/errors';
import { DateSchema } from '../date';

describe('DateSchema', () => {
  it('accepts valid Date, rejects non-Date and invalid Date (strict)', () => {
    const schema = new DateSchema();
    const now = new Date();
    expect(schema.parse(now).data).toBe(now);

    // Rejects non-Date values (strict — no auto-coercion)
    for (const value of ['2024-01-01', 1234567890, true, null, undefined]) {
      const result = schema.safeParse(value);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toBeInstanceOf(ParseError);
      }
    }

    // Rejects invalid Date (NaN time)
    const invalid = new Date('not a date');
    expect(schema.safeParse(invalid).ok).toBe(false);
  });

  it('.min()/.max() range validation with custom error messages', () => {
    const min = new Date('2024-01-01');
    const max = new Date('2024-12-31');
    const schema = new DateSchema().min(min, 'Too early').max(max, 'Too late');

    expect(schema.parse(new Date('2024-06-15')).data).toEqual(new Date('2024-06-15'));
    expect(schema.parse(min).data).toEqual(min);
    expect(schema.parse(max).data).toEqual(max);

    const tooEarly = schema.safeParse(new Date('2023-12-31'));
    expect(tooEarly.ok).toBe(false);
    if (!tooEarly.ok) {
      expect(tooEarly.error.issues[0]?.message).toBe('Too early');
    }

    const tooLate = schema.safeParse(new Date('2025-01-01'));
    expect(tooLate.ok).toBe(false);
    if (!tooLate.ok) {
      expect(tooLate.error.issues[0]?.message).toBe('Too late');
    }
  });

  it('.toJSONSchema() returns { type: "string", format: "date-time" }', () => {
    const schema = new DateSchema();
    expect(schema.toJSONSchema()).toEqual({ type: 'string', format: 'date-time' });
  });

  it('produces user-friendly invalid-type message for unparseable strings', () => {
    const schema = new DateSchema();
    const result = schema.safeParse('not-a-date');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.issues[0]?.message).toBe('Must be a valid date');
    }
  });

  it('produces user-friendly invalid-type message for non-Date values', () => {
    const schema = new DateSchema();
    for (const value of ['2024-01-01', 1234567890, true, null, undefined]) {
      const result = schema.safeParse(value);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.issues[0]?.message).toBe('Must be a valid date');
      }
    }
  });

  it('produces user-friendly message for an invalid Date (NaN time)', () => {
    const schema = new DateSchema();
    const result = schema.safeParse(new Date('not a date'));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.issues[0]?.message).toBe('Must be a valid date');
    }
  });

  it('.message() overrides the invalid-type message', () => {
    const schema = new DateSchema().message('Enter a valid date');
    const result = schema.safeParse('not-a-date');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.issues[0]?.message).toBe('Enter a valid date');
    }
  });

  it('.message() is preserved across clones (e.g. after .min())', () => {
    const schema = new DateSchema().message('Enter a valid date').min(new Date('2024-01-01'));
    const result = schema.safeParse('nope');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.issues[0]?.message).toBe('Enter a valid date');
    }
  });
});
