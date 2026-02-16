import { describe, expectTypeOf, it } from 'vitest';

describe('FileChange', () => {
  it('kind is a union type', () => {
    expectTypeOf().toEqualTypeOf();
  });
});
describe('FileCategory', () => {
  it('has no unknown variant', () => {
    // @ts-expect-error - 'unknown' is not a valid FileCategory
    const _bad = 'unknown';
  });
});
describe('IncrementalResult', () => {
  it('is a discriminated union on kind', () => {
    expectTypeOf().toMatchTypeOf();
  });
});
describe('IncrementalCompiler', () => {
  it('constructor requires Compiler', () => {
    expectTypeOf().toEqualTypeOf();
  });
  it('handleChanges returns Promise<IncrementalResult>', () => {
    expectTypeOf().returns.resolves.toMatchTypeOf();
  });
});
describe('TypecheckResult', () => {
  it('includes diagnostics array', () => {
    expectTypeOf().toBeArray();
  });
  it('includes success boolean', () => {
    expectTypeOf().toBeBoolean();
  });
});
//# sourceMappingURL=incremental.test-d.js.map
