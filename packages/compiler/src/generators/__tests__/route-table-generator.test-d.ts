import { describe, expectTypeOf, it } from 'vitest';
import type { Generator } from '../base-generator';
import type { RouteTableEntry, RouteTableGenerator } from '../route-table-generator';

describe('RouteTableGenerator type-level tests', () => {
  it('RouteTableEntry requires all required fields', () => {
    // @ts-expect-error — missing required fields
    const _bad: RouteTableEntry = { method: 'GET' };
  });

  it('RouteTableGenerator satisfies Generator interface', () => {
    expectTypeOf<RouteTableGenerator>().toMatchTypeOf<Generator>();
  });
});
