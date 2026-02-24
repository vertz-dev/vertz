import { describe, expect, it } from 'bun:test';
import { ParseError } from '../../core/errors';
import { NumberSchema } from '../number';

describe('NumberSchema', () => {
  it('accepts a valid number and rejects non-number including NaN', () => {
    const schema = new NumberSchema();
    expect(schema.parse(42)).toBe(42);
    expect(schema.parse(0)).toBe(0);
    expect(schema.parse(-3.14)).toBe(-3.14);

    for (const value of ['hello', true, null, undefined, {}, [], NaN]) {
      const result = schema.safeParse(value);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBeInstanceOf(ParseError);
      }
    }
  });

  it('.gte()/.min() inclusive minimum and .gt() exclusive minimum', () => {
    const gte = new NumberSchema().gte(5);
    expect(gte.parse(5)).toBe(5);
    expect(gte.parse(10)).toBe(10);
    expect(() => gte.parse(4)).toThrow(ParseError);

    const min = new NumberSchema().min(5);
    expect(min.parse(5)).toBe(5);
    expect(() => min.parse(4)).toThrow(ParseError);

    const gt = new NumberSchema().gt(5);
    expect(gt.parse(6)).toBe(6);
    expect(() => gt.parse(5)).toThrow(ParseError);
  });

  it('.lte()/.max() inclusive maximum and .lt() exclusive maximum', () => {
    const lte = new NumberSchema().lte(10);
    expect(lte.parse(10)).toBe(10);
    expect(lte.parse(5)).toBe(5);
    expect(() => lte.parse(11)).toThrow(ParseError);

    const max = new NumberSchema().max(10);
    expect(max.parse(10)).toBe(10);
    expect(() => max.parse(11)).toThrow(ParseError);

    const lt = new NumberSchema().lt(10);
    expect(lt.parse(9)).toBe(9);
    expect(() => lt.parse(10)).toThrow(ParseError);
  });

  it('.int() rejects floats, .positive/.negative/.nonnegative/.nonpositive validate sign', () => {
    const int = new NumberSchema().int();
    expect(int.parse(5)).toBe(5);
    expect(() => int.parse(5.5)).toThrow(ParseError);

    expect(new NumberSchema().positive().parse(1)).toBe(1);
    expect(() => new NumberSchema().positive().parse(0)).toThrow(ParseError);
    expect(() => new NumberSchema().positive().parse(-1)).toThrow(ParseError);

    expect(new NumberSchema().negative().parse(-1)).toBe(-1);
    expect(() => new NumberSchema().negative().parse(0)).toThrow(ParseError);

    expect(new NumberSchema().nonnegative().parse(0)).toBe(0);
    expect(new NumberSchema().nonnegative().parse(1)).toBe(1);
    expect(() => new NumberSchema().nonnegative().parse(-1)).toThrow(ParseError);

    expect(new NumberSchema().nonpositive().parse(0)).toBe(0);
    expect(new NumberSchema().nonpositive().parse(-1)).toBe(-1);
    expect(() => new NumberSchema().nonpositive().parse(1)).toThrow(ParseError);
  });

  it('.multipleOf()/.step() and .finite()', () => {
    const mult = new NumberSchema().multipleOf(3);
    expect(mult.parse(9)).toBe(9);
    expect(() => mult.parse(10)).toThrow(ParseError);

    const step = new NumberSchema().step(5);
    expect(step.parse(15)).toBe(15);
    expect(() => step.parse(7)).toThrow(ParseError);

    const fin = new NumberSchema().finite();
    expect(fin.parse(42)).toBe(42);
    expect(() => fin.parse(Infinity)).toThrow(ParseError);
    expect(() => fin.parse(-Infinity)).toThrow(ParseError);
  });

  it('.gt() and .lt() support custom error messages', () => {
    const gtSchema = new NumberSchema().gt(5, 'Must be above 5');
    const gtResult = gtSchema.safeParse(5);
    expect(gtResult.success).toBe(false);
    if (!gtResult.success) {
      expect(gtResult.error.issues[0]?.message).toBe('Must be above 5');
    }

    const ltSchema = new NumberSchema().lt(10, 'Must be below 10');
    const ltResult = ltSchema.safeParse(10);
    expect(ltResult.success).toBe(false);
    if (!ltResult.success) {
      expect(ltResult.error.issues[0]?.message).toBe('Must be below 10');
    }
  });

  it('supports custom error messages and .toJSONSchema()', () => {
    const schema = new NumberSchema().gte(1, 'Must be at least 1').lte(100, 'Must be at most 100');
    const result = schema.safeParse(0);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe('Must be at least 1');
    }

    const jsonSchema = new NumberSchema().gte(0).lt(100).int().multipleOf(5).toJSONSchema();
    expect(jsonSchema).toEqual({
      type: 'integer',
      minimum: 0,
      exclusiveMaximum: 100,
      multipleOf: 5,
    });
  });
});
