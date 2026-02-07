import { describe, expectTypeOf, it } from 'vitest';
import { s } from '../../index';

describe('tuple', () => {
  it('infers positional types', () => {
    const schema = s.tuple([s.string(), s.number()]);
    type Output = ReturnType<typeof schema.parse>;
    expectTypeOf<Output>().toEqualTypeOf<[string, number]>();
  });

  it('rejects wrong positional type', () => {
    const schema = s.tuple([s.string(), s.number()]);
    type Output = ReturnType<typeof schema.parse>;
    // @ts-expect-error — [string, string] is not assignable to [string, number]
    const _bad: Output = ['hello', 'world'];
    void _bad;
  });

  it('requires at least one item', () => {
    // @ts-expect-error — empty tuple is not assignable to [SchemaAny, ...SchemaAny[]]
    s.tuple([]);
  });
});

describe('union', () => {
  it('infers union of option types', () => {
    const schema = s.union([s.string(), s.number()]);
    type Output = ReturnType<typeof schema.parse>;
    expectTypeOf<Output>().toEqualTypeOf<string | number>();
  });

  it('rejects types not in union', () => {
    const schema = s.union([s.string(), s.number()]);
    type Output = ReturnType<typeof schema.parse>;
    // @ts-expect-error — boolean is not assignable to string | number
    const _bad: Output = true;
    void _bad;
  });

  it('requires at least one option', () => {
    // @ts-expect-error — empty array is not assignable to [SchemaAny, ...SchemaAny[]]
    s.union([]);
  });
});

describe('discriminatedUnion', () => {
  it('infers discriminated output', () => {
    const schema = s.discriminatedUnion('type', [
      s.object({ type: s.literal('a'), value: s.string() }),
      s.object({ type: s.literal('b'), count: s.number() }),
    ]);
    type Output = ReturnType<typeof schema.parse>;
    expectTypeOf<Output>().toEqualTypeOf<
      { type: 'a'; value: string } | { type: 'b'; count: number }
    >();
  });

  it('requires at least one option', () => {
    // @ts-expect-error — empty array is not assignable to [ObjectSchema, ...ObjectSchema[]]
    s.discriminatedUnion('type', []);
  });
});

describe('intersection', () => {
  it('infers intersection of both', () => {
    const schema = s.intersection(s.object({ name: s.string() }), s.object({ age: s.number() }));
    type Output = ReturnType<typeof schema.parse>;
    expectTypeOf<Output>().toEqualTypeOf<{ name: string } & { age: number }>();
  });

  it('rejects missing properties', () => {
    const schema = s.intersection(s.object({ name: s.string() }), s.object({ age: s.number() }));
    type Output = ReturnType<typeof schema.parse>;
    // @ts-expect-error — missing 'age' from intersection
    const _bad: Output = { name: 'hello' };
    void _bad;
  });
});

describe('enum', () => {
  it('infers union of literal values', () => {
    const schema = s.enum(['red', 'green', 'blue'] as const);
    type Output = ReturnType<typeof schema.parse>;
    expectTypeOf<Output>().toEqualTypeOf<'red' | 'green' | 'blue'>();

    // @ts-expect-error — 'yellow' is not in the enum
    const _bad: Output = 'yellow';
    void _bad;
  });
});
