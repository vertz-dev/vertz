import { describe, expectTypeOf, it } from 'vitest';
import { d } from '../d';

// ---------------------------------------------------------------------------
// Column-type-specific metadata — type-level tests
// ---------------------------------------------------------------------------

describe('Column-type-specific metadata — type-level', () => {
  it('varchar meta includes length at the type level', () => {
    const col = d.varchar(255);
    type Meta = (typeof col)['_meta'];
    expectTypeOf<Meta['length']>().toEqualTypeOf<255>();
  });

  it('decimal meta includes precision and scale at the type level', () => {
    const col = d.decimal(10, 2);
    type Meta = (typeof col)['_meta'];
    expectTypeOf<Meta['precision']>().toEqualTypeOf<10>();
    expectTypeOf<Meta['scale']>().toEqualTypeOf<2>();
  });

  it('enum meta includes enumName and enumValues at the type level', () => {
    const col = d.enum('status', ['active', 'inactive']);
    type Meta = (typeof col)['_meta'];
    expectTypeOf<Meta['enumName']>().toEqualTypeOf<'status'>();
    expectTypeOf<Meta['enumValues']>().toEqualTypeOf<readonly ['active', 'inactive']>();
  });

  it('email meta includes format at the type level', () => {
    const col = d.email();
    type Meta = (typeof col)['_meta'];
    expectTypeOf<Meta['format']>().toEqualTypeOf<'email'>();
  });

  it('text meta does not carry column-specific fields', () => {
    const col = d.text();
    type Meta = (typeof col)['_meta'];
    // These should be absent from the type
    expectTypeOf<Meta>().not.toHaveProperty('length');
    expectTypeOf<Meta>().not.toHaveProperty('precision');
    expectTypeOf<Meta>().not.toHaveProperty('enumName');
    expectTypeOf<Meta>().not.toHaveProperty('format');
  });

  it('varchar meta preserves length through modifier chains', () => {
    const col = d.varchar(100).nullable().unique();
    type Meta = (typeof col)['_meta'];
    expectTypeOf<Meta['length']>().toEqualTypeOf<100>();
    expectTypeOf<Meta['nullable']>().toEqualTypeOf<true>();
    expectTypeOf<Meta['unique']>().toEqualTypeOf<true>();
  });

  it('enum meta preserves enumName and enumValues through modifier chains', () => {
    const col = d.enum('role', ['admin', 'user'] as const).default('user');
    type Meta = (typeof col)['_meta'];
    expectTypeOf<Meta['enumName']>().toEqualTypeOf<'role'>();
    expectTypeOf<Meta['enumValues']>().toEqualTypeOf<readonly ['admin', 'user']>();
    expectTypeOf<Meta['hasDefault']>().toEqualTypeOf<true>();
  });

  it('decimal meta preserves precision and scale through modifier chains', () => {
    const col = d.decimal(8, 4).nullable();
    type Meta = (typeof col)['_meta'];
    expectTypeOf<Meta['precision']>().toEqualTypeOf<8>();
    expectTypeOf<Meta['scale']>().toEqualTypeOf<4>();
    expectTypeOf<Meta['nullable']>().toEqualTypeOf<true>();
  });

  it('uuid meta does not include column-specific fields', () => {
    const col = d.uuid();
    type Meta = (typeof col)['_meta'];
    expectTypeOf<Meta>().not.toHaveProperty('length');
    expectTypeOf<Meta>().not.toHaveProperty('precision');
    expectTypeOf<Meta>().not.toHaveProperty('enumName');
    expectTypeOf<Meta>().not.toHaveProperty('format');
  });

  it('integer meta does not include column-specific fields', () => {
    const col = d.integer();
    type Meta = (typeof col)['_meta'];
    expectTypeOf<Meta>().not.toHaveProperty('length');
    expectTypeOf<Meta>().not.toHaveProperty('precision');
    expectTypeOf<Meta>().not.toHaveProperty('enumName');
  });
});
