import { describe, it, expectTypeOf } from 'vitest';
import type { DeepReadonly } from '../deep-readonly';

describe('DeepReadonly', () => {
  it('makes top-level properties readonly', () => {
    type Input = { name: string; age: number };
    type Result = DeepReadonly<Input>;
    expectTypeOf<Result>().toEqualTypeOf<{ readonly name: string; readonly age: number }>();
  });

  it('makes nested object properties readonly', () => {
    type Input = { user: { name: string } };
    type Result = DeepReadonly<Input>;
    expectTypeOf<Result>().toEqualTypeOf<{
      readonly user: { readonly name: string };
    }>();
  });

  it('makes array elements readonly', () => {
    type Input = { items: string[] };
    type Result = DeepReadonly<Input>;
    expectTypeOf<Result>().toEqualTypeOf<{
      readonly items: readonly string[];
    }>();
  });

  it('preserves primitives as-is', () => {
    expectTypeOf<DeepReadonly<string>>().toEqualTypeOf<string>();
    expectTypeOf<DeepReadonly<number>>().toEqualTypeOf<number>();
    expectTypeOf<DeepReadonly<boolean>>().toEqualTypeOf<boolean>();
  });

  it('handles deeply nested structures', () => {
    type Input = { a: { b: { c: string } } };
    type Result = DeepReadonly<Input>;
    expectTypeOf<Result>().toEqualTypeOf<{
      readonly a: { readonly b: { readonly c: string } };
    }>();
  });
});
