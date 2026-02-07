import { describe, expectTypeOf, it } from 'vitest';
import { s } from '../../index';
import type { Infer, Input, Output } from '../type-inference';

describe('Infer', () => {
  it('extracts output type', () => {
    const schema = s.string();
    expectTypeOf<Infer<typeof schema>>().toEqualTypeOf<string>();
  });

  it('rejects non-schema types', () => {
    // @ts-expect-error — string is not a schema type
    type _Bad = Infer<string>;
  });
});

describe('Input', () => {
  it('differs from output on transform', () => {
    const schema = s.string().transform((v) => v.length);
    expectTypeOf<Input<typeof schema>>().toEqualTypeOf<string>();
    expectTypeOf<Infer<typeof schema>>().toEqualTypeOf<number>();
  });

  it('rejects non-schema types', () => {
    // @ts-expect-error — number is not a schema type
    type _Bad = Input<number>;
  });
});

describe('Output', () => {
  it('equivalent to Infer', () => {
    const schema = s.number();
    expectTypeOf<Output<typeof schema>>().toEqualTypeOf<Infer<typeof schema>>();
  });
});
