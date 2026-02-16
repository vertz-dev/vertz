import { describe, expectTypeOf, it } from 'vitest';

describe('RouteTableGenerator type-level tests', () => {
  it('RouteTableEntry requires all required fields', () => {
    // @ts-expect-error — missing required fields
    const _bad = { method: 'GET' };
  });
  it('RouteTableGenerator satisfies Generator interface', () => {
    expectTypeOf().toMatchTypeOf();
  });
});
//# sourceMappingURL=route-table-generator.test-d.js.map
