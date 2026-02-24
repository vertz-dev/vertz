import { describe, expect, it } from 'bun:test';
import { IsoDateSchema, IsoDatetimeSchema, IsoDurationSchema, IsoTimeSchema } from '../iso';

describe('IsoDateSchema', () => {
  it('accepts valid ISO dates', () => {
    const schema = new IsoDateSchema();
    expect(schema.parse('2024-01-15')).toBe('2024-01-15');
  });

  it('rejects invalid ISO dates', () => {
    const schema = new IsoDateSchema();
    expect(schema.safeParse('2024-13-01').success).toBe(false);
    expect(schema.safeParse('2024-00-01').success).toBe(false);
    expect(schema.safeParse('not-a-date').success).toBe(false);
  });

  it('rejects impossible dates like Feb 31', () => {
    const schema = new IsoDateSchema();
    expect(schema.safeParse('2024-02-31').success).toBe(false);
    expect(schema.safeParse('2024-04-31').success).toBe(false);
    expect(schema.safeParse('2025-02-29').success).toBe(false); // not a leap year
  });

  it('toJSONSchema includes format', () => {
    expect(new IsoDateSchema().toJSONSchema()).toEqual({ type: 'string', format: 'date' });
  });
});

describe('IsoTimeSchema', () => {
  it('accepts valid ISO times', () => {
    const schema = new IsoTimeSchema();
    expect(schema.parse('14:30:00')).toBe('14:30:00');
    expect(schema.parse('14:30:00.123Z')).toBe('14:30:00.123Z');
  });

  it('rejects invalid ISO times', () => {
    const schema = new IsoTimeSchema();
    expect(schema.safeParse('25:00:00').success).toBe(false);
    expect(schema.safeParse('not-a-time').success).toBe(false);
  });

  it('toJSONSchema includes format', () => {
    expect(new IsoTimeSchema().toJSONSchema()).toEqual({ type: 'string', format: 'time' });
  });
});

describe('IsoDatetimeSchema', () => {
  it('accepts valid ISO datetimes', () => {
    const schema = new IsoDatetimeSchema();
    expect(schema.parse('2024-01-15T14:30:00Z')).toBe('2024-01-15T14:30:00Z');
  });

  it('rejects invalid ISO datetimes', () => {
    const schema = new IsoDatetimeSchema();
    expect(schema.safeParse('not-a-datetime').success).toBe(false);
  });

  it('toJSONSchema includes format', () => {
    expect(new IsoDatetimeSchema().toJSONSchema()).toEqual({ type: 'string', format: 'date-time' });
  });
});

describe('IsoDurationSchema', () => {
  it('accepts valid ISO durations', () => {
    const schema = new IsoDurationSchema();
    expect(schema.parse('P1Y2M3DT4H5M6S')).toBe('P1Y2M3DT4H5M6S');
    expect(schema.parse('PT1H')).toBe('PT1H');
    expect(schema.parse('P1D')).toBe('P1D');
  });

  it('rejects invalid ISO durations', () => {
    const schema = new IsoDurationSchema();
    expect(schema.safeParse('not-a-duration').success).toBe(false);
    expect(schema.safeParse('P').success).toBe(false); // bare P with no components
  });

  it('toJSONSchema includes format', () => {
    expect(new IsoDurationSchema().toJSONSchema()).toEqual({ type: 'string', format: 'duration' });
  });
});
