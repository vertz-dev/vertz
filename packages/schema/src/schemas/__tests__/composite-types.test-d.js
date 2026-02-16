import { describe, expectTypeOf, it } from 'vitest';
import { s } from '../../index';

describe('tuple', () => {
  it('infers positional types', () => {
    const _schema = s.tuple([s.string(), s.number()]);
    expectTypeOf().toEqualTypeOf();
  });
  it('rejects wrong positional type', () => {
    const _schema = s.tuple([s.string(), s.number()]);
    // @ts-expect-error — [string, string] is not assignable to [string, number]
    const _bad = ['hello', 'world'];
    void _bad;
  });
  it('requires at least one item', () => {
    // @ts-expect-error — empty tuple is not assignable to [SchemaAny, ...SchemaAny[]]
    s.tuple([]);
  });
});
describe('union', () => {
  it('infers union of option types', () => {
    const _schema = s.union([s.string(), s.number()]);
    expectTypeOf().toEqualTypeOf();
  });
  it('rejects types not in union', () => {
    const _schema = s.union([s.string(), s.number()]);
    // @ts-expect-error — boolean is not assignable to string | number
    const _bad = true;
    void _bad;
  });
  it('requires at least one option', () => {
    // @ts-expect-error — empty array is not assignable to [SchemaAny, ...SchemaAny[]]
    s.union([]);
  });
});
describe('discriminatedUnion', () => {
  it('infers discriminated output', () => {
    const _schema = s.discriminatedUnion('type', [
      s.object({ type: s.literal('a'), value: s.string() }),
      s.object({ type: s.literal('b'), count: s.number() }),
    ]);
    expectTypeOf().toEqualTypeOf();
  });
  it('requires at least one option', () => {
    // @ts-expect-error — empty array is not assignable to [ObjectSchema, ...ObjectSchema[]]
    s.discriminatedUnion('type', []);
  });
});
describe('intersection', () => {
  it('infers intersection of both', () => {
    const _schema = s.intersection(s.object({ name: s.string() }), s.object({ age: s.number() }));
    expectTypeOf().toEqualTypeOf();
  });
  it('rejects missing properties', () => {
    const _schema = s.intersection(s.object({ name: s.string() }), s.object({ age: s.number() }));
    // @ts-expect-error — missing 'age' from intersection
    const _bad = { name: 'hello' };
    void _bad;
  });
});
describe('enum', () => {
  it('infers union of literal values', () => {
    const _schema = s.enum(['red', 'green', 'blue']);
    expectTypeOf().toEqualTypeOf();
    // @ts-expect-error — 'yellow' is not in the enum
    const _bad = 'yellow';
    void _bad;
  });
});
//# sourceMappingURL=composite-types.test-d.js.map
