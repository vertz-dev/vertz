import { describe, expect, it } from '@vertz/test';
import { fromSqliteValue, toSqliteValue } from '../sqlite-value-converter';

describe('toSqliteValue', () => {
  it('converts true to 1', () => {
    expect(toSqliteValue(true)).toBe(1);
  });

  it('converts false to 0', () => {
    expect(toSqliteValue(false)).toBe(0);
  });

  it('converts Date to ISO string', () => {
    const date = new Date('2024-01-15T10:30:00.000Z');
    expect(toSqliteValue(date)).toBe('2024-01-15T10:30:00.000Z');
  });

  it('passes through strings unchanged', () => {
    expect(toSqliteValue('hello')).toBe('hello');
  });

  it('passes through numbers unchanged', () => {
    expect(toSqliteValue(42)).toBe(42);
    expect(toSqliteValue(3.14)).toBe(3.14);
  });

  it('passes through null unchanged', () => {
    expect(toSqliteValue(null)).toBe(null);
  });
});

describe('fromSqliteValue', () => {
  it('converts 1 to true for boolean columns', () => {
    expect(fromSqliteValue(1, 'boolean')).toBe(true);
  });

  it('converts 0 to false for boolean columns', () => {
    expect(fromSqliteValue(0, 'boolean')).toBe(false);
  });

  it('converts ISO string to Date for timestamp columns', () => {
    const result = fromSqliteValue('2024-01-15T10:30:00.000Z', 'timestamp');
    expect(result).toBeInstanceOf(Date);
    expect((result as Date).toISOString()).toBe('2024-01-15T10:30:00.000Z');
  });

  it('passes through values for non-converted types', () => {
    expect(fromSqliteValue('hello', 'text')).toBe('hello');
    expect(fromSqliteValue(42, 'integer')).toBe(42);
    expect(fromSqliteValue(null, 'text')).toBe(null);
    expect(fromSqliteValue(1, 'text')).toBe(1); // 1 is not converted if not boolean type
  });

  it('converts ISO string to Date for "timestamp with time zone" columns', () => {
    const result = fromSqliteValue('2024-06-20T15:00:00.000Z', 'timestamp with time zone');
    expect(result).toBeInstanceOf(Date);
    expect((result as Date).toISOString()).toBe('2024-06-20T15:00:00.000Z');
  });

  it('passes through non-0/1 values for boolean columns unchanged', () => {
    // Values other than 0 and 1 should fall through the boolean branch
    expect(fromSqliteValue(null, 'boolean')).toBe(null);
    expect(fromSqliteValue(2, 'boolean')).toBe(2);
    expect(fromSqliteValue('true', 'boolean')).toBe('true');
  });

  it('passes through non-string values for timestamp columns unchanged', () => {
    // Non-string values should fall through the timestamp branch
    expect(fromSqliteValue(null, 'timestamp')).toBe(null);
    expect(fromSqliteValue(12345, 'timestamp')).toBe(12345);
    expect(fromSqliteValue(null, 'timestamp with time zone')).toBe(null);
  });

  it('passes through undefined values', () => {
    expect(fromSqliteValue(undefined, 'text')).toBe(undefined);
    expect(fromSqliteValue(undefined, 'boolean')).toBe(undefined);
  });
});
