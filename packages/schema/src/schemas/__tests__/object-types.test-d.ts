import { describe, expectTypeOf, it } from 'vitest';
import { s } from '../../index';

describe('shape inference', () => {
  it('infers correct shape', () => {
    const schema = s.object({ name: s.string(), age: s.number() });
    type Output = ReturnType<typeof schema.parse>;
    expectTypeOf<Output>().toEqualTypeOf<{ name: string; age: number }>();
  });

  it('rejects missing required properties', () => {
    const schema = s.object({ name: s.string(), age: s.number() });
    type Output = ReturnType<typeof schema.parse>;
    // @ts-expect-error — missing 'age' property
    const _bad: Output = { name: 'hello' };
    void _bad;
  });

  it('rejects extra properties', () => {
    const schema = s.object({ name: s.string() });
    type Output = ReturnType<typeof schema.parse>;
    // @ts-expect-error — 'extra' does not exist on type
    const _bad: Output = { name: 'hello', extra: true };
    void _bad;
  });
});

describe('partial', () => {
  it('makes all properties optional', () => {
    const schema = s.object({ name: s.string(), age: s.number() }).partial();
    type Output = ReturnType<typeof schema.parse>;
    expectTypeOf<Output>().toMatchTypeOf<{
      name: string | undefined;
      age: number | undefined;
    }>();
  });

  it('rejects wrong property types', () => {
    const schema = s.object({ name: s.string() }).partial();
    type Output = ReturnType<typeof schema.parse>;
    // @ts-expect-error — boolean is not assignable to string | undefined
    const _bad: Output = { name: true };
    void _bad;
  });
});

describe('pick', () => {
  it('keeps only specified keys', () => {
    const schema = s.object({ name: s.string(), age: s.number(), active: s.boolean() });
    const picked = schema.pick('name', 'age');
    type Output = ReturnType<typeof picked.parse>;
    expectTypeOf<Output>().toEqualTypeOf<{ name: string; age: number }>();
  });

  it('rejects omitted keys', () => {
    const schema = s.object({ name: s.string(), age: s.number(), active: s.boolean() });
    const picked = schema.pick('name');
    type Output = ReturnType<typeof picked.parse>;
    // @ts-expect-error — 'age' does not exist on picked type
    const _check: Output = { name: 'hello', age: 42 };
    void _check;
  });
});

describe('omit', () => {
  it('removes specified keys', () => {
    const schema = s.object({ name: s.string(), age: s.number(), active: s.boolean() });
    const omitted = schema.omit('active');
    type Output = ReturnType<typeof omitted.parse>;
    expectTypeOf<Output>().toEqualTypeOf<{ name: string; age: number }>();
  });
});

describe('extend', () => {
  it('adds new properties', () => {
    const base = s.object({ name: s.string() });
    const extended = base.extend({ age: s.number() });
    type Output = ReturnType<typeof extended.parse>;
    expectTypeOf<Output>().toEqualTypeOf<{ name: string; age: number }>();
  });
});

describe('merge', () => {
  it('combines two object schemas', () => {
    const a = s.object({ name: s.string() });
    const b = s.object({ age: s.number() });
    const merged = a.merge(b);
    type Output = ReturnType<typeof merged.parse>;
    expectTypeOf<Output>().toEqualTypeOf<{ name: string; age: number }>();
  });
});
