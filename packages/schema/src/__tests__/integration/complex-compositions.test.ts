import { describe, expect, it } from 'vitest';
import { s } from '../..';

describe('Integration: Complex Compositions', () => {
  it('object pick → extend → partial chain', () => {
    const fullUser = s.object({
      id: s.string(),
      name: s.string(),
      email: s.email(),
      age: s.number(),
    });

    const nameOnly = fullUser.pick(['name']);
    expect(nameOnly.parse({ name: 'John' })).toEqual({ name: 'John' });

    const extended = nameOnly.extend({ role: s.string() });
    expect(extended.parse({ name: 'John', role: 'admin' })).toEqual({
      name: 'John',
      role: 'admin',
    });

    const partial = extended.partial();
    expect(partial.parse({})).toEqual({});
    expect(partial.parse({ name: 'John' })).toEqual({ name: 'John' });
  });

  it('discriminated union with named schemas', () => {
    const successSchema = s.object({
      status: s.literal('success'),
      data: s.string(),
    });
    const errorSchema = s.object({
      status: s.literal('error'),
      message: s.string(),
    });
    const responseSchema = s.discriminatedUnion('status', [successSchema, errorSchema]);

    expect(responseSchema.parse({ status: 'success', data: 'hello' })).toEqual({
      status: 'success',
      data: 'hello',
    });
    expect(responseSchema.parse({ status: 'error', message: 'fail' })).toEqual({
      status: 'error',
      message: 'fail',
    });
    expect(responseSchema.safeParse({ status: 'pending' }).success).toBe(false);
  });

  it('transform pipeline: string → parse → number → validate', () => {
    const stringToNumber = s
      .string()
      .transform((v) => parseInt(v, 10))
      .pipe(s.number().int().gte(0));

    expect(stringToNumber.parse('42')).toBe(42);
    expect(stringToNumber.safeParse('abc').success).toBe(false);
    expect(stringToNumber.safeParse('-5').success).toBe(false);
  });

  it('intersection of two objects', () => {
    const withName = s.object({ name: s.string() });
    const withAge = s.object({ age: s.number() });
    const combined = s.intersection(withName, withAge);

    expect(combined.parse({ name: 'John', age: 30 })).toEqual({ name: 'John', age: 30 });
    expect(combined.safeParse({ name: 'John' }).success).toBe(false);
  });

  it('array of discriminated union', () => {
    const catSchema = s.object({ type: s.literal('cat'), name: s.string() });
    const dogSchema = s.object({ type: s.literal('dog'), breed: s.string() });
    const animalSchema = s.discriminatedUnion('type', [catSchema, dogSchema]);
    const animalsSchema = s.array(animalSchema);

    const result = animalsSchema.parse([
      { type: 'cat', name: 'Whiskers' },
      { type: 'dog', breed: 'Labrador' },
    ]);
    expect(result).toHaveLength(2);
  });
});
