import { describe, expect, it } from '@vertz/test';
import { JsonbParseError } from '../../errors';
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

  it('stringifies plain objects to JSON', () => {
    expect(toSqliteValue({ a: 1, b: 'x' })).toBe('{"a":1,"b":"x"}');
  });

  it('stringifies arrays to JSON', () => {
    expect(toSqliteValue([1, 2, 3])).toBe('[1,2,3]');
  });

  it('stringifies null-prototype objects to JSON', () => {
    const obj = Object.create(null) as Record<string, unknown>;
    obj.a = 1;
    expect(toSqliteValue(obj)).toBe('{"a":1}');
  });

  it('passes through Date unchanged as ISO (not stringified as object)', () => {
    const date = new Date('2024-01-15T10:30:00.000Z');
    expect(toSqliteValue(date)).toBe('2024-01-15T10:30:00.000Z');
  });

  it('passes through Uint8Array unchanged (not JSON-stringified)', () => {
    const buf = new Uint8Array([1, 2, 3]);
    expect(toSqliteValue(buf)).toBe(buf);
  });

  it('passes through Int32Array unchanged', () => {
    const arr = new Int32Array([1, 2]);
    expect(toSqliteValue(arr)).toBe(arr);
  });

  it('passes through ArrayBuffer unchanged', () => {
    const buf = new ArrayBuffer(8);
    expect(toSqliteValue(buf)).toBe(buf);
  });

  it('passes through Map unchanged (JSON.stringify would silently corrupt it)', () => {
    const m = new Map<string, number>([['a', 1]]);
    expect(toSqliteValue(m)).toBe(m);
  });

  it('passes through Set unchanged', () => {
    const s = new Set([1, 2, 3]);
    expect(toSqliteValue(s)).toBe(s);
  });

  it('passes through URL unchanged', () => {
    const u = new URL('https://vertz.dev');
    expect(toSqliteValue(u)).toBe(u);
  });

  it('passes through RegExp unchanged', () => {
    const re = /abc/;
    expect(toSqliteValue(re)).toBe(re);
  });

  it('passes through class instances unchanged', () => {
    class Widget {
      constructor(public n: number) {}
    }
    const w = new Widget(1);
    expect(toSqliteValue(w)).toBe(w);
  });

  it('passes through undefined unchanged', () => {
    expect(toSqliteValue(undefined)).toBe(undefined);
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

  it('parses JSON string to object for jsonb columns', () => {
    expect(fromSqliteValue('{"a":1}', 'jsonb')).toEqual({ a: 1 });
  });

  it('parses JSON string to object for json columns', () => {
    expect(fromSqliteValue('{"b":2}', 'json')).toEqual({ b: 2 });
  });

  it('parses JSON arrays for jsonb columns', () => {
    expect(fromSqliteValue('[1,2,3]', 'jsonb')).toEqual([1, 2, 3]);
  });

  it('passes through null unchanged for jsonb columns', () => {
    expect(fromSqliteValue(null, 'jsonb')).toBe(null);
  });

  it('throws JsonbParseError on invalid JSON for jsonb columns', () => {
    expect(() => fromSqliteValue('not json', 'jsonb')).toThrow(JsonbParseError);
  });

  describe('bytea columns', () => {
    it('passes through Uint8Array unchanged for bytea columns', () => {
      const buf = new Uint8Array([1, 2, 3, 255]);
      const result = fromSqliteValue(buf, 'bytea');
      expect(result).toBeInstanceOf(Uint8Array);
      expect(Array.from(result as Uint8Array)).toEqual([1, 2, 3, 255]);
    });

    it('normalizes Node Buffer to plain Uint8Array for bytea columns', () => {
      // Buffer is a Uint8Array subclass; normalize so callers don't receive
      // Node-specific objects.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Buffer is a test-only subclass probe
      const Buffer = (globalThis as any).Buffer as { from(arr: number[]): Uint8Array } | undefined;
      if (!Buffer) return;
      const buf = Buffer.from([1, 2, 3]);
      const result = fromSqliteValue(buf, 'bytea');
      expect(result).toBeInstanceOf(Uint8Array);
      // Strict Uint8Array, not Buffer
      expect(Object.getPrototypeOf(result)).toBe(Uint8Array.prototype);
      expect(Array.from(result as Uint8Array)).toEqual([1, 2, 3]);
    });

    it('converts ArrayBuffer to Uint8Array for bytea columns', () => {
      const ab = new ArrayBuffer(3);
      new Uint8Array(ab).set([7, 8, 9]);
      const result = fromSqliteValue(ab, 'bytea');
      expect(result).toBeInstanceOf(Uint8Array);
      expect(Array.from(result as Uint8Array)).toEqual([7, 8, 9]);
    });

    it('passes through null for bytea columns', () => {
      expect(fromSqliteValue(null, 'bytea')).toBe(null);
    });

    it('passes through undefined for bytea columns', () => {
      expect(fromSqliteValue(undefined, 'bytea')).toBe(undefined);
    });

    it('passes through non-bytes values unchanged for bytea columns', () => {
      // Defensive: if a driver ever returns a string/number, return it as-is
      // rather than silently constructing a Uint8Array from it.
      expect(fromSqliteValue('not-bytes', 'bytea')).toBe('not-bytes');
      expect(fromSqliteValue(42, 'bytea')).toBe(42);
    });
  });
});
