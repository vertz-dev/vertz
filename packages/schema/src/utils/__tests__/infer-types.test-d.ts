import { describe, it } from 'bun:test';
import type { Equal, Expect } from '../../__tests__/_type-helpers';
import { s } from '../../index';
import type { Infer, Input, Output } from '../type-inference';

describe('Infer', () => {
  it('extracts output type', () => {
    const schema = s.string();
    type _t1 = Expect<Equal<Infer<typeof schema>, string>>;
  });

  it('rejects non-schema types', () => {
    // @ts-expect-error — string is not a schema type
    type _Bad = Infer<string>;
  });
});

describe('Input', () => {
  it('differs from output on transform', () => {
    const schema = s.string().transform((v) => v.length);
    type _t1 = Expect<Equal<Input<typeof schema>, string>>;
    type _t2 = Expect<Equal<Infer<typeof schema>, number>>;
  });

  it('rejects non-schema types', () => {
    // @ts-expect-error — number is not a schema type
    type _Bad = Input<number>;
  });
});

describe('Output', () => {
  it('equivalent to Infer', () => {
    const schema = s.number();
    type _t1 = Expect<Equal<Output<typeof schema>, Infer<typeof schema>>>;
  });
});
