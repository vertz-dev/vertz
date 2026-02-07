import { describe, expect, it } from 'vitest';
import { SchemaType } from '../types';

describe('SchemaType', () => {
  it('has all expected schema type values', () => {
    expect(SchemaType.String).toBe('string');
    expect(SchemaType.Number).toBe('number');
    expect(SchemaType.BigInt).toBe('bigint');
    expect(SchemaType.Boolean).toBe('boolean');
    expect(SchemaType.Date).toBe('date');
    expect(SchemaType.Symbol).toBe('symbol');
    expect(SchemaType.Undefined).toBe('undefined');
    expect(SchemaType.Null).toBe('null');
    expect(SchemaType.Void).toBe('void');
    expect(SchemaType.Any).toBe('any');
    expect(SchemaType.Unknown).toBe('unknown');
    expect(SchemaType.Never).toBe('never');
    expect(SchemaType.NaN).toBe('nan');
    expect(SchemaType.Object).toBe('object');
    expect(SchemaType.Array).toBe('array');
    expect(SchemaType.Tuple).toBe('tuple');
    expect(SchemaType.Enum).toBe('enum');
    expect(SchemaType.Union).toBe('union');
    expect(SchemaType.DiscriminatedUnion).toBe('discriminatedUnion');
    expect(SchemaType.Intersection).toBe('intersection');
    expect(SchemaType.Record).toBe('record');
    expect(SchemaType.Map).toBe('map');
    expect(SchemaType.Set).toBe('set');
    expect(SchemaType.Literal).toBe('literal');
    expect(SchemaType.Lazy).toBe('lazy');
    expect(SchemaType.Custom).toBe('custom');
    expect(SchemaType.InstanceOf).toBe('instanceof');
    expect(SchemaType.File).toBe('file');
  });
});
