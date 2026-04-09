import { describe, it } from '@vertz/test';
import type { Equal, Expect } from '../../__tests__/_type-helpers';
import { d } from '../../d';
import type { InferColumnType } from '../column';

describe('column type inference', () => {
  it('d.uuid() infers string', () => {
    const col = d.uuid();
    type _t1 = Expect<Equal<InferColumnType<typeof col>, string>>;
  });

  it('d.text() infers string', () => {
    const col = d.text();
    type _t1 = Expect<Equal<InferColumnType<typeof col>, string>>;
  });

  it('d.varchar(n) infers string', () => {
    const col = d.varchar(255);
    type _t1 = Expect<Equal<InferColumnType<typeof col>, string>>;
  });

  it('d.email() infers string', () => {
    const col = d.email();
    type _t1 = Expect<Equal<InferColumnType<typeof col>, string>>;
  });

  it('d.boolean() infers boolean', () => {
    const col = d.boolean();
    type _t1 = Expect<Equal<InferColumnType<typeof col>, boolean>>;
  });

  it('d.integer() infers number', () => {
    const col = d.integer();
    type _t1 = Expect<Equal<InferColumnType<typeof col>, number>>;
  });

  it('d.bigint() infers bigint', () => {
    const col = d.bigint();
    type _t1 = Expect<Equal<InferColumnType<typeof col>, bigint>>;
  });

  it('d.decimal(p, s) infers string (precision-safe)', () => {
    const col = d.decimal(10, 2);
    type _t1 = Expect<Equal<InferColumnType<typeof col>, string>>;
  });

  it('d.real() infers number', () => {
    const col = d.real();
    type _t1 = Expect<Equal<InferColumnType<typeof col>, number>>;
  });

  it('d.doublePrecision() infers number', () => {
    const col = d.doublePrecision();
    type _t1 = Expect<Equal<InferColumnType<typeof col>, number>>;
  });

  it('d.serial() infers number', () => {
    const col = d.serial();
    type _t1 = Expect<Equal<InferColumnType<typeof col>, number>>;
  });

  it('d.timestamp() infers Date', () => {
    const col = d.timestamp();
    type _t1 = Expect<Equal<InferColumnType<typeof col>, Date>>;
  });

  it('d.date() infers string', () => {
    const col = d.date();
    type _t1 = Expect<Equal<InferColumnType<typeof col>, string>>;
  });

  it('d.time() infers string', () => {
    const col = d.time();
    type _t1 = Expect<Equal<InferColumnType<typeof col>, string>>;
  });

  it('d.jsonb<T>() infers T', () => {
    interface Settings {
      theme: string;
    }
    const col = d.jsonb<Settings>();
    type _t1 = Expect<Equal<InferColumnType<typeof col>, Settings>>;
  });

  it('d.textArray() infers string[]', () => {
    const col = d.textArray();
    type _t1 = Expect<Equal<InferColumnType<typeof col>, string[]>>;
  });

  it('d.integerArray() infers number[]', () => {
    const col = d.integerArray();
    type _t1 = Expect<Equal<InferColumnType<typeof col>, number[]>>;
  });

  it('d.enum(name, values) infers union literal type', () => {
    const col = d.enum('role', ['admin', 'editor']);
    type _t1 = Expect<Equal<InferColumnType<typeof col>, 'admin' | 'editor'>>;
  });
});

describe('chainable builder type inference', () => {
  it('.nullable() adds | null to the inferred type', () => {
    const col = d.text().nullable();
    type _t1 = Expect<Equal<InferColumnType<typeof col>, string | null>>;
  });

  it('.nullable() on boolean adds | null', () => {
    const col = d.boolean().nullable();
    type _t1 = Expect<Equal<InferColumnType<typeof col>, boolean | null>>;
  });

  it('.nullable() on integer adds | null', () => {
    const col = d.integer().nullable();
    type _t1 = Expect<Equal<InferColumnType<typeof col>, number | null>>;
  });

  it('.nullable() on enum adds | null', () => {
    const col = d.enum('role', ['admin', 'editor']).nullable();
    type _t1 = Expect<Equal<InferColumnType<typeof col>, 'admin' | 'editor' | null>>;
  });

  it('.primary() does not change the inferred type', () => {
    const col = d.uuid().primary();
    type _t1 = Expect<Equal<InferColumnType<typeof col>, string>>;
  });

  it('.default() does not change the inferred type', () => {
    const col = d.boolean().default(true);
    type _t1 = Expect<Equal<InferColumnType<typeof col>, boolean>>;
  });

  it('chaining preserves type correctly', () => {
    const col = d.text().unique().nullable().default('hello');
    type _t1 = Expect<Equal<InferColumnType<typeof col>, string | null>>;
  });
});

describe('type-level negative tests', () => {
  it('rejects assigning number to uuid column type', () => {
    const col = d.uuid();
    type T = InferColumnType<typeof col>;
    const _valid: T = 'hello';
    // @ts-expect-error -- number is not assignable to string
    const _invalid: T = 42;
    void _valid;
    void _invalid;
  });

  it('rejects assigning string to boolean column type', () => {
    const col = d.boolean();
    type T = InferColumnType<typeof col>;
    // @ts-expect-error -- string is not assignable to boolean
    const _invalid: T = 'true';
    void _invalid;
  });

  it('rejects assigning string to integer column type', () => {
    const col = d.integer();
    type T = InferColumnType<typeof col>;
    // @ts-expect-error -- string is not assignable to number
    const _invalid: T = 'hello';
    void _invalid;
  });

  it('rejects assigning number to timestamp column type', () => {
    const col = d.timestamp();
    type T = InferColumnType<typeof col>;
    // @ts-expect-error -- number is not assignable to Date
    const _invalid: T = 123;
    void _invalid;
  });

  it('rejects invalid enum value', () => {
    const col = d.enum('role', ['admin', 'editor']);
    type T = InferColumnType<typeof col>;
    const _valid: T = 'admin';
    // @ts-expect-error -- 'viewer' is not assignable to 'admin' | 'editor'
    const _invalid: T = 'viewer';
    void _valid;
    void _invalid;
  });

  it('rejects null on non-nullable column', () => {
    const col = d.text();
    type T = InferColumnType<typeof col>;
    // @ts-expect-error -- null is not assignable to string
    const _invalid: T = null;
    void _invalid;
  });

  it('accepts null on nullable column', () => {
    const col = d.text().nullable();
    type T = InferColumnType<typeof col>;
    const _valid: T = null;
    void _valid;
  });
});

describe('validation constraint type scoping', () => {
  it('d.text() supports .min(), .max(), .regex()', () => {
    d.text().min(1);
    d.text().max(100);
    d.text().regex(/^[a-z]+$/);
    d.text().min(1).max(10).regex(/abc/);
  });

  it('d.varchar() supports .min(), .max(), .regex()', () => {
    d.varchar(255).min(1);
    d.varchar(255).max(100);
    d.varchar(255).regex(/^[a-z]+$/);
  });

  it('d.email() supports .min() and .max()', () => {
    d.email().min(5).max(255);
  });

  it('d.integer() supports .min() and .max()', () => {
    d.integer().min(0);
    d.integer().max(100);
    d.integer().min(0).max(100);
  });

  it('d.real() supports .min() and .max()', () => {
    d.real().min(0).max(5);
  });

  it('d.doublePrecision() supports .min() and .max()', () => {
    d.doublePrecision().min(-1).max(1);
  });

  it('d.boolean() does NOT support .min() or .regex()', () => {
    // @ts-expect-error — boolean has no min
    d.boolean().min(1);
    // @ts-expect-error — boolean has no regex
    d.boolean().regex(/abc/);
  });

  it('d.integer() does NOT support .regex()', () => {
    // @ts-expect-error — integer has no regex
    d.integer().regex(/abc/);
  });

  it('d.timestamp() does NOT support .min()', () => {
    // @ts-expect-error — timestamp has no min
    d.timestamp().min(1);
  });

  it('d.uuid() does NOT support .min()', () => {
    // @ts-expect-error — uuid has no min
    d.uuid().min(1);
  });

  it('constraint methods survive chaining with base methods', () => {
    // text: min -> unique -> max must compile
    d.text().min(1).unique().max(5);
    // text: unique -> min must compile
    d.text().unique().min(1);
    // integer: min -> unique -> max must compile
    d.integer().min(0).unique().max(100);
    // text: nullable -> regex must compile
    d.text().nullable().regex(/abc/);
  });

  it('type inference is preserved with constraint methods', () => {
    const col = d.text().min(1).max(10);
    type _t1 = Expect<Equal<InferColumnType<typeof col>, string>>;

    const col2 = d.integer().min(0).max(100);
    type _t2 = Expect<Equal<InferColumnType<typeof col2>, number>>;

    const col3 = d.text().min(1).nullable();
    type _t3 = Expect<Equal<InferColumnType<typeof col3>, string | null>>;
  });
});

describe('metadata type-level tracking', () => {
  it('.primary() sets primary to true in metadata type', () => {
    const col = d.uuid().primary();
    // Type-level assertion: primary should be true
    const _primary: typeof col._meta.primary = true;
    // @ts-expect-error -- primary is true after .primary(), false should not be assignable
    const _notPrimary: typeof col._meta.primary = false;
    void _primary;
    void _notPrimary;
  });

  it('.nullable() sets nullable to true in metadata type', () => {
    const col = d.text().nullable();
    const _nullable: typeof col._meta.nullable = true;
    // @ts-expect-error -- nullable is true after .nullable(), false should not be assignable
    const _notNullable: typeof col._meta.nullable = false;
    void _nullable;
    void _notNullable;
  });

  it('.default() sets hasDefault to true in metadata type', () => {
    const col = d.boolean().default(true);
    const _hasDefault: typeof col._meta.hasDefault = true;
    // @ts-expect-error -- hasDefault is true after .default(), false should not be assignable
    const _noDefault: typeof col._meta.hasDefault = false;
    void _hasDefault;
    void _noDefault;
  });

  it('.is() adds annotation to _annotations in metadata type', () => {
    const col = d.email().is('sensitive');
    const _sensitive: typeof col._meta._annotations.sensitive = true;
    // @ts-expect-error -- sensitive is true after .is('sensitive'), false should not be assignable
    const _notSensitive: typeof col._meta._annotations.sensitive = false;
    void _sensitive;
    void _notSensitive;
  });

  it('.is() accumulates multiple annotations', () => {
    const col = d.text().is('hidden').is('patchable');
    const _hidden: typeof col._meta._annotations.hidden = true;
    const _patchable: typeof col._meta._annotations.patchable = true;
    // @ts-expect-error -- hidden is true after .is('hidden'), false should not be assignable
    const _notHidden: typeof col._meta._annotations.hidden = false;
    void _hidden;
    void _patchable;
    void _notHidden;
  });

  it('.hidden() sets hidden annotation in metadata type', () => {
    const col = d.text().hidden();
    const _hidden: typeof col._meta._annotations.hidden = true;
    // @ts-expect-error -- hidden is true after .hidden(), false should not be assignable
    const _notHidden: typeof col._meta._annotations.hidden = false;
    void _hidden;
    void _notHidden;
  });

  it('.hidden() is type-equivalent to .is("hidden")', () => {
    const viaHidden = d.text().hidden();
    const viaIs = d.text().is('hidden');
    type A = typeof viaHidden._meta._annotations;
    type B = typeof viaIs._meta._annotations;
    type _t1 = Expect<Equal<A, B>>;
  });

  it('.hidden() preserves StringColumnBuilder return type', () => {
    // .min() is only on StringColumnBuilder — this must compile
    d.text().hidden().min(1).max(10);
  });

  it('.hidden() preserves NumericColumnBuilder return type', () => {
    // .min() is only on NumericColumnBuilder — this must compile
    d.integer().hidden().min(0).max(100);
  });

  it('.hidden() accumulates with .is() annotations at type level', () => {
    const col = d.text().is('sensitive').hidden();
    const _sensitive: typeof col._meta._annotations.sensitive = true;
    const _hidden: typeof col._meta._annotations.hidden = true;
    void _sensitive;
    void _hidden;
  });

  it('serial has hasDefault true by default', () => {
    const col = d.serial();
    const _hasDefault: typeof col._meta.hasDefault = true;
    // @ts-expect-error -- serial has implicit default, false should not be assignable
    const _noDefault: typeof col._meta.hasDefault = false;
    void _hasDefault;
    void _noDefault;
  });

  it('.unique() sets unique to true in metadata type', () => {
    const col = d.text().unique();
    const _unique: typeof col._meta.unique = true;
    // @ts-expect-error -- unique is true after .unique(), false should not be assignable
    const _notUnique: typeof col._meta.unique = false;
    void _unique;
    void _notUnique;
  });

  it('d.jsonb<T>() with validator preserves type parameter', () => {
    interface Settings {
      theme: string;
    }
    const validator = { parse: (v: unknown): Settings => v as Settings };
    const col = d.jsonb<Settings>({ validator });
    type _t1 = Expect<Equal<InferColumnType<typeof col>, Settings>>;
  });

  it('d.jsonb() with schema passed directly preserves type parameter', () => {
    interface Settings {
      theme: string;
    }
    const schema = {
      parse: (v: unknown): { ok: true; data: Settings } | { ok: false; error: Error } =>
        ({ ok: true, data: v as Settings }) as const,
    };
    const col = d.jsonb<Settings>(schema);
    type _t1 = Expect<Equal<InferColumnType<typeof col>, Settings>>;
  });
});
