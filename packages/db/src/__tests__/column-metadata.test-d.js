import { describe, expectTypeOf, it } from 'vitest';
import { d } from '../d';

// ---------------------------------------------------------------------------
// Column-type-specific metadata — type-level tests
// ---------------------------------------------------------------------------
describe('Column-type-specific metadata — type-level', () => {
  it('varchar meta includes length at the type level', () => {
    const _col = d.varchar(255);
    expectTypeOf().toEqualTypeOf();
  });
  it('decimal meta includes precision and scale at the type level', () => {
    const _col = d.decimal(10, 2);
    expectTypeOf().toEqualTypeOf();
    expectTypeOf().toEqualTypeOf();
  });
  it('enum meta includes enumName and enumValues at the type level', () => {
    const _col = d.enum('status', ['active', 'inactive']);
    expectTypeOf().toEqualTypeOf();
    expectTypeOf().toEqualTypeOf();
  });
  it('email meta includes format at the type level', () => {
    const _col = d.email();
    expectTypeOf().toEqualTypeOf();
  });
  it('text meta does not carry column-specific fields', () => {
    const _col = d.text();
    // These should be absent from the type
    expectTypeOf().not.toHaveProperty('length');
    expectTypeOf().not.toHaveProperty('precision');
    expectTypeOf().not.toHaveProperty('enumName');
    expectTypeOf().not.toHaveProperty('format');
  });
  it('varchar meta preserves length through modifier chains', () => {
    const _col = d.varchar(100).nullable().unique();
    expectTypeOf().toEqualTypeOf();
    expectTypeOf().toEqualTypeOf();
    expectTypeOf().toEqualTypeOf();
  });
  it('enum meta preserves enumName and enumValues through modifier chains', () => {
    const _col = d.enum('role', ['admin', 'user']).default('user');
    expectTypeOf().toEqualTypeOf();
    expectTypeOf().toEqualTypeOf();
    expectTypeOf().toEqualTypeOf();
  });
  it('decimal meta preserves precision and scale through modifier chains', () => {
    const _col = d.decimal(8, 4).nullable();
    expectTypeOf().toEqualTypeOf();
    expectTypeOf().toEqualTypeOf();
    expectTypeOf().toEqualTypeOf();
  });
  it('uuid meta does not include column-specific fields', () => {
    const _col = d.uuid();
    expectTypeOf().not.toHaveProperty('length');
    expectTypeOf().not.toHaveProperty('precision');
    expectTypeOf().not.toHaveProperty('enumName');
    expectTypeOf().not.toHaveProperty('format');
  });
  it('integer meta does not include column-specific fields', () => {
    const _col = d.integer();
    expectTypeOf().not.toHaveProperty('length');
    expectTypeOf().not.toHaveProperty('precision');
    expectTypeOf().not.toHaveProperty('enumName');
  });
});
//# sourceMappingURL=column-metadata.test-d.js.map
