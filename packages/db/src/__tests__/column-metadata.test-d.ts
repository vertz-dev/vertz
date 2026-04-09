import { describe, it } from '@vertz/test';
import { d } from '../d';
import type { Equal, Expect, HasKey, Not } from './_type-helpers';

// ---------------------------------------------------------------------------
// Column-type-specific metadata — type-level tests
// ---------------------------------------------------------------------------

describe('Column-type-specific metadata — type-level', () => {
  it('varchar meta includes length at the type level', () => {
    const col = d.varchar(255);
    type Meta = (typeof col)['_meta'];
    type _t1 = Expect<Equal<Meta['length'], 255>>;
  });

  it('decimal meta includes precision and scale at the type level', () => {
    const col = d.decimal(10, 2);
    type Meta = (typeof col)['_meta'];
    type _t1 = Expect<Equal<Meta['precision'], 10>>;
    type _t2 = Expect<Equal<Meta['scale'], 2>>;
  });

  it('enum meta includes enumName and enumValues at the type level', () => {
    const col = d.enum('status', ['active', 'inactive']);
    type Meta = (typeof col)['_meta'];
    type _t1 = Expect<Equal<Meta['enumName'], 'status'>>;
    type _t2 = Expect<Equal<Meta['enumValues'], readonly ['active', 'inactive']>>;
  });

  it('email meta includes format at the type level', () => {
    const col = d.email();
    type Meta = (typeof col)['_meta'];
    type _t1 = Expect<Equal<Meta['format'], 'email'>>;
  });

  it('text meta does not carry column-specific fields', () => {
    const col = d.text();
    type Meta = (typeof col)['_meta'];
    // These should be absent from the type
    type _t1 = Expect<Not<HasKey<Meta, 'length'>>>;
    type _t2 = Expect<Not<HasKey<Meta, 'precision'>>>;
    type _t3 = Expect<Not<HasKey<Meta, 'enumName'>>>;
    type _t4 = Expect<Not<HasKey<Meta, 'format'>>>;
  });

  it('varchar meta preserves length through modifier chains', () => {
    const col = d.varchar(100).nullable().unique();
    type Meta = (typeof col)['_meta'];
    type _t1 = Expect<Equal<Meta['length'], 100>>;
    type _t2 = Expect<Equal<Meta['nullable'], true>>;
    type _t3 = Expect<Equal<Meta['unique'], true>>;
  });

  it('enum meta preserves enumName and enumValues through modifier chains', () => {
    const col = d.enum('role', ['admin', 'user'] as const).default('user');
    type Meta = (typeof col)['_meta'];
    type _t1 = Expect<Equal<Meta['enumName'], 'role'>>;
    type _t2 = Expect<Equal<Meta['enumValues'], readonly ['admin', 'user']>>;
    type _t3 = Expect<Equal<Meta['hasDefault'], true>>;
  });

  it('decimal meta preserves precision and scale through modifier chains', () => {
    const col = d.decimal(8, 4).nullable();
    type Meta = (typeof col)['_meta'];
    type _t1 = Expect<Equal<Meta['precision'], 8>>;
    type _t2 = Expect<Equal<Meta['scale'], 4>>;
    type _t3 = Expect<Equal<Meta['nullable'], true>>;
  });

  it('uuid meta does not include column-specific fields', () => {
    const col = d.uuid();
    type Meta = (typeof col)['_meta'];
    type _t1 = Expect<Not<HasKey<Meta, 'length'>>>;
    type _t2 = Expect<Not<HasKey<Meta, 'precision'>>>;
    type _t3 = Expect<Not<HasKey<Meta, 'enumName'>>>;
    type _t4 = Expect<Not<HasKey<Meta, 'format'>>>;
  });

  it('integer meta does not include column-specific fields', () => {
    const col = d.integer();
    type Meta = (typeof col)['_meta'];
    type _t1 = Expect<Not<HasKey<Meta, 'length'>>>;
    type _t2 = Expect<Not<HasKey<Meta, 'precision'>>>;
    type _t3 = Expect<Not<HasKey<Meta, 'enumName'>>>;
  });
});
