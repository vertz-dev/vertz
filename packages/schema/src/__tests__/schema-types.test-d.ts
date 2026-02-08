import { describe, expectTypeOf, it } from 'vitest';
import type { ReadonlySchema, SchemaAny } from '../core/schema';
import { s } from '../index';

describe('optional', () => {
  it('adds undefined to output', () => {
    const schema = s.string().optional();
    expectTypeOf(schema.parse(undefined)).toEqualTypeOf<string | undefined>();
  });

  it('rejects non-matching type', () => {
    const schema = s.string().optional();
    const result = schema.parse('hello');
    // @ts-expect-error — string | undefined is not assignable to number
    const _bad: number = result;
    void _bad;
  });
});

describe('nullable', () => {
  it('adds null to output', () => {
    const schema = s.string().nullable();
    expectTypeOf(schema.parse(null)).toEqualTypeOf<string | null>();
  });

  it('rejects non-matching type', () => {
    const schema = s.string().nullable();
    const result = schema.parse('hello');
    // @ts-expect-error — string | null is not assignable to number
    const _bad: number = result;
    void _bad;
  });
});

describe('default', () => {
  it('output excludes undefined', () => {
    const schema = s.string().default('fallback');
    expectTypeOf(schema.parse(undefined)).toEqualTypeOf<string>();

    const result = schema.parse(undefined);
    // @ts-expect-error — string is not assignable to undefined
    const _bad: undefined = result;
    void _bad;
  });
});

describe('transform', () => {
  it('changes output type', () => {
    const schema = s.string().transform((v) => v.length);
    expectTypeOf(schema.parse('hello')).toEqualTypeOf<number>();
  });

  it('rejects original type as output', () => {
    const schema = s.string().transform((v) => v.length);
    const result = schema.parse('hello');
    // @ts-expect-error — number is not assignable to string
    const _bad: string = result;
    void _bad;
  });
});

describe('pipe', () => {
  it('changes output to second schema', () => {
    const schema = s.string().transform(Number).pipe(s.number());
    expectTypeOf(schema.parse('42')).toEqualTypeOf<number>();
  });

  it('rejects first schema output type', () => {
    const schema = s.string().transform(Number).pipe(s.number());
    const result = schema.parse('42');
    // @ts-expect-error — number is not assignable to string
    const _bad: string = result;
    void _bad;
  });
});

describe('brand', () => {
  it('plain value not assignable to branded', () => {
    const schema = s.string().brand<'UserId'>();
    type UserId = ReturnType<typeof schema.parse>;
    const plain = 'hello';
    // @ts-expect-error — plain string is not assignable to branded string
    const _bad: UserId = plain;
    void _bad;
  });
});

describe('readonly', () => {
  it('makes output properties readonly', () => {
    type Obj = { name: string };
    type RO = ReadonlySchema<Readonly<Obj>, Obj>;
    const result = {} as RO['_output'];
    // @ts-expect-error — cannot assign to readonly property
    result.name = 'changed';
  });
});

describe('SchemaAny assignability', () => {
  it('accepts StringSchema as SchemaAny', () => {
    const str = s.string();
    const _any: SchemaAny = str;
    void _any;
  });

  it('accepts NumberSchema as SchemaAny', () => {
    const num = s.number();
    const _any: SchemaAny = num;
    void _any;
  });

  it('accepts ObjectSchema as SchemaAny', () => {
    const obj = s.object({ name: s.string() });
    const _any: SchemaAny = obj;
    void _any;
  });
});

describe('catch', () => {
  it('preserves output type', () => {
    const schema = s.string().catch('default');
    expectTypeOf(schema.parse(undefined)).toEqualTypeOf<string>();
  });
});

describe('refine', () => {
  it('preserves schema output type', () => {
    const schema = s.string().refine((v) => v.length > 0);
    expectTypeOf(schema.parse('hello')).toEqualTypeOf<string>();
  });

  it('rejects wrong type', () => {
    const schema = s.string().refine((v) => v.length > 0);
    const result = schema.parse('hello');
    // @ts-expect-error — string is not assignable to number
    const _bad: number = result;
    void _bad;
  });
});
