import { describe, it } from '@vertz/test';
import type { Equal, Expect, Extends, Unwrap } from '../../__tests__/_type-helpers';
import { s } from '../../index';

describe('shape inference', () => {
  it('infers correct shape', () => {
    const schema = s.object({ name: s.string(), age: s.number() });
    type Output = Unwrap<ReturnType<typeof schema.parse>>;
    type _t1 = Expect<Equal<Output, { name: string; age: number }>>;
  });

  it('rejects missing required properties', () => {
    const schema = s.object({ name: s.string(), age: s.number() });
    type Output = Unwrap<ReturnType<typeof schema.parse>>;
    // @ts-expect-error — missing 'age' property
    const _bad: Output = { name: 'hello' };
    void _bad;
  });

  it('rejects extra properties', () => {
    const schema = s.object({ name: s.string() });
    type Output = Unwrap<ReturnType<typeof schema.parse>>;
    // @ts-expect-error — 'extra' does not exist on type
    const _bad: Output = { name: 'hello', extra: true };
    void _bad;
  });
});

describe('partial', () => {
  it('makes all properties optional', () => {
    const schema = s.object({ name: s.string(), age: s.number() }).partial();
    type Output = Unwrap<ReturnType<typeof schema.parse>>;
    type _t1 = Expect<
      Extends<
        Output,
        {
          name: string | undefined;
          age: number | undefined;
        }
      >
    >;
  });

  it('rejects wrong property types', () => {
    const schema = s.object({ name: s.string() }).partial();
    type Output = Unwrap<ReturnType<typeof schema.parse>>;
    // @ts-expect-error — boolean is not assignable to string | undefined
    const _bad: Output = { name: true };
    void _bad;
  });
});

describe('pick', () => {
  it('keeps only specified keys', () => {
    const schema = s.object({ name: s.string(), age: s.number(), active: s.boolean() });
    const picked = schema.pick('name', 'age');
    type Output = Unwrap<ReturnType<typeof picked.parse>>;
    type _t1 = Expect<Equal<Output, { name: string; age: number }>>;
  });

  it('rejects omitted keys', () => {
    const schema = s.object({ name: s.string(), age: s.number(), active: s.boolean() });
    const picked = schema.pick('name');
    type Output = Unwrap<ReturnType<typeof picked.parse>>;
    // @ts-expect-error — 'age' does not exist on picked type
    const _check: Output = { name: 'hello', age: 42 };
    void _check;
  });
});

describe('omit', () => {
  it('removes specified keys', () => {
    const schema = s.object({ name: s.string(), age: s.number(), active: s.boolean() });
    const omitted = schema.omit('active');
    type Output = Unwrap<ReturnType<typeof omitted.parse>>;
    type _t1 = Expect<Equal<Output, { name: string; age: number }>>;
  });
});

describe('extend', () => {
  it('adds new properties', () => {
    const base = s.object({ name: s.string() });
    const extended = base.extend({ age: s.number() });
    type Output = Unwrap<ReturnType<typeof extended.parse>>;
    type _t1 = Expect<Equal<Output, { name: string; age: number }>>;
  });
});

describe('merge', () => {
  it('combines two object schemas', () => {
    const a = s.object({ name: s.string() });
    const b = s.object({ age: s.number() });
    const merged = a.merge(b);
    type Output = Unwrap<ReturnType<typeof merged.parse>>;
    type _t1 = Expect<Equal<Output, { name: string; age: number }>>;
  });
});
