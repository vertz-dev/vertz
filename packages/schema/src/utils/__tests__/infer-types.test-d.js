import { describe, expectTypeOf, it } from 'vitest';
import { s } from '../../index';

describe('Infer', () => {
  it('extracts output type', () => {
    const _schema = s.string();
    expectTypeOf().toEqualTypeOf();
  });
  it('rejects non-schema types', () => {});
});
describe('Input', () => {
  it('differs from output on transform', () => {
    const _schema = s.string().transform((v) => v.length);
    expectTypeOf().toEqualTypeOf();
    expectTypeOf().toEqualTypeOf();
  });
  it('rejects non-schema types', () => {});
});
describe('Output', () => {
  it('equivalent to Infer', () => {
    const _schema = s.number();
    expectTypeOf().toEqualTypeOf();
  });
});
//# sourceMappingURL=infer-types.test-d.js.map
