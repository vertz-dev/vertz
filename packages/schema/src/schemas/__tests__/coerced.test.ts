import { describe, expect, it } from 'bun:test';
import {
  CoercedBigIntSchema,
  CoercedBooleanSchema,
  CoercedDateSchema,
  CoercedNumberSchema,
  CoercedStringSchema,
} from '../coerced';

describe('CoercedStringSchema', () => {
  it('coerces number to string', () => {
    const schema = new CoercedStringSchema();
    expect(schema.parse(42).data).toBe('42');
  });

  it('coerces boolean to string, null and undefined to empty string', () => {
    const schema = new CoercedStringSchema();
    expect(schema.parse(true).data).toBe('true');
    expect(schema.parse(null).data).toBe('');
    expect(schema.parse(undefined).data).toBe('');
  });
});

describe('CoercedNumberSchema', () => {
  it('coerces string to number', () => {
    const schema = new CoercedNumberSchema();
    expect(schema.parse('42').data).toBe(42);
  });

  it('coerces boolean to number', () => {
    const schema = new CoercedNumberSchema();
    expect(schema.parse(true).data).toBe(1);
    expect(schema.parse(false).data).toBe(0);
  });
});

describe('CoercedBooleanSchema', () => {
  it('coerces truthy/falsy values to boolean', () => {
    const schema = new CoercedBooleanSchema();
    expect(schema.parse(1).data).toBe(true);
    expect(schema.parse(0).data).toBe(false);
    expect(schema.parse('').data).toBe(false);
    expect(schema.parse('hello').data).toBe(true);
  });
});

describe('CoercedBigIntSchema', () => {
  it('coerces string and number to bigint', () => {
    const schema = new CoercedBigIntSchema();
    expect(schema.parse('42').data).toBe(42n);
    expect(schema.parse(42).data).toBe(42n);
  });

  it('fails on non-coercible values', () => {
    const schema = new CoercedBigIntSchema();
    const result = schema.safeParse('not-a-number');
    expect(result.ok).toBe(false);
  });
});

describe('CoercedDateSchema', () => {
  it('coerces string to Date', () => {
    const schema = new CoercedDateSchema();
    const result = schema.parse('2024-01-15').data;
    expect(result).toBeInstanceOf(Date);
    expect(result.toISOString()).toContain('2024-01-15');
  });

  it('coerces number (timestamp) to Date', () => {
    const schema = new CoercedDateSchema();
    const now = Date.now();
    const result = schema.parse(now).data;
    expect(result).toBeInstanceOf(Date);
    expect(result.getTime()).toBe(now);
  });

  it('rejects invalid date strings', () => {
    const schema = new CoercedDateSchema();
    const result = schema.safeParse('not-a-date');
    expect(result.ok).toBe(false);
  });
});

describe('coerced schemas inherit constraint methods', () => {
  it('CoercedNumberSchema supports .min()', () => {
    const schema = new CoercedNumberSchema().min(10);
    expect(schema.parse('42').data).toBe(42);
    expect(schema.safeParse('5').ok).toBe(false);
  });

  it('CoercedStringSchema supports .min()', () => {
    const schema = new CoercedStringSchema().min(3);
    expect(schema.parse(1234).data).toBe('1234');
    expect(schema.safeParse(12).ok).toBe(false);
  });

  it('JSON Schema output matches non-coerced counterpart', () => {
    expect(new CoercedStringSchema().toJSONSchema()).toEqual({ type: 'string' });
    expect(new CoercedNumberSchema().toJSONSchema()).toEqual({ type: 'number' });
    expect(new CoercedBooleanSchema().toJSONSchema()).toEqual({ type: 'boolean' });
    expect(new CoercedDateSchema().toJSONSchema()).toEqual({ type: 'string', format: 'date-time' });
  });
});
