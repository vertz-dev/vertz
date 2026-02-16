import { describe, expectTypeOf, it } from 'vitest';
import { s } from '../../index';

describe('shape inference', () => {
  it('infers correct shape', () => {
    const _schema = s.object({ name: s.string(), age: s.number() });
    expectTypeOf().toEqualTypeOf();
  });
  it('rejects missing required properties', () => {
    const _schema = s.object({ name: s.string(), age: s.number() });
    // @ts-expect-error — missing 'age' property
    const _bad = { name: 'hello' };
    void _bad;
  });
  it('rejects extra properties', () => {
    const _schema = s.object({ name: s.string() });
    // @ts-expect-error — 'extra' does not exist on type
    const _bad = { name: 'hello', extra: true };
    void _bad;
  });
});
describe('partial', () => {
  it('makes all properties optional', () => {
    const _schema = s.object({ name: s.string(), age: s.number() }).partial();
    expectTypeOf().toMatchTypeOf();
  });
  it('rejects wrong property types', () => {
    const _schema = s.object({ name: s.string() }).partial();
    // @ts-expect-error — boolean is not assignable to string | undefined
    const _bad = { name: true };
    void _bad;
  });
});
describe('pick', () => {
  it('keeps only specified keys', () => {
    const schema = s.object({ name: s.string(), age: s.number(), active: s.boolean() });
    const _picked = schema.pick('name', 'age');
    expectTypeOf().toEqualTypeOf();
  });
  it('rejects omitted keys', () => {
    const schema = s.object({ name: s.string(), age: s.number(), active: s.boolean() });
    const _picked = schema.pick('name');
    // @ts-expect-error — 'age' does not exist on picked type
    const _check = { name: 'hello', age: 42 };
    void _check;
  });
});
describe('omit', () => {
  it('removes specified keys', () => {
    const schema = s.object({ name: s.string(), age: s.number(), active: s.boolean() });
    const _omitted = schema.omit('active');
    expectTypeOf().toEqualTypeOf();
  });
});
describe('extend', () => {
  it('adds new properties', () => {
    const base = s.object({ name: s.string() });
    const _extended = base.extend({ age: s.number() });
    expectTypeOf().toEqualTypeOf();
  });
});
describe('merge', () => {
  it('combines two object schemas', () => {
    const a = s.object({ name: s.string() });
    const b = s.object({ age: s.number() });
    const _merged = a.merge(b);
    expectTypeOf().toEqualTypeOf();
  });
});
//# sourceMappingURL=object-types.test-d.js.map
