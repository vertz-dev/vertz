import { describe, it } from '@vertz/test';
import type { Equal, Expect, Extends } from '../../__tests__/_type-helpers';
import { d } from '../../d';
import type { DbExpr } from '../../sql/expr';

// ---------------------------------------------------------------------------
// Fixture
// ---------------------------------------------------------------------------

const urls = d.table('urls', {
  id: d.uuid().primary(),
  slug: d.text().unique(),
  target: d.text(),
  clickCount: d.integer().default(0),
  updatedAt: d.timestamp().default('now').autoUpdate(),
});

// ---------------------------------------------------------------------------
// $update accepts DbExpr for non-PK columns
// ---------------------------------------------------------------------------

describe('$update accepts DbExpr', () => {
  it('d.increment() is assignable to $update fields', () => {
    type Update = typeof urls.$update;
    const _valid: Update = { clickCount: d.increment(1) };
    void _valid;
  });

  it('d.decrement() is assignable to $update fields', () => {
    type Update = typeof urls.$update;
    const _valid: Update = { clickCount: d.decrement(5) };
    void _valid;
  });

  it('d.expr() is assignable to $update fields', () => {
    type Update = typeof urls.$update;
    const _valid: Update = { slug: d.expr((col) => col) };
    void _valid;
  });

  it('plain values remain assignable to $update fields', () => {
    type Update = typeof urls.$update;
    const _valid: Update = { clickCount: 42, slug: 'new-slug' };
    void _valid;
  });

  it('DbExpr is part of the $update value union', () => {
    type Update = typeof urls.$update;
    type ClickCountType = NonNullable<Update['clickCount']>;
    type _t1 = Expect<Extends<DbExpr, ClickCountType>>;
    type _t2 = Expect<Extends<number, ClickCountType>>;
  });
});

// ---------------------------------------------------------------------------
// $update_input accepts DbExpr
// ---------------------------------------------------------------------------

describe('$update_input accepts DbExpr', () => {
  it('d.increment() is assignable to $update_input fields', () => {
    type UpdateInput = typeof urls.$update_input;
    const _valid: UpdateInput = { clickCount: d.increment(1) };
    void _valid;
  });

  it('plain values remain assignable to $update_input fields', () => {
    type UpdateInput = typeof urls.$update_input;
    const _valid: UpdateInput = { clickCount: 10 };
    void _valid;
  });

  it('DbExpr is part of $update_input value union', () => {
    type UpdateInput = typeof urls.$update_input;
    type ClickCountType = NonNullable<UpdateInput['clickCount']>;
    type _t1 = Expect<Extends<DbExpr, ClickCountType>>;
  });
});

// ---------------------------------------------------------------------------
// Negative tests — rejects wrong types
// ---------------------------------------------------------------------------

describe('$update rejects invalid types', () => {
  it('rejects Prisma-style { increment: 1 } objects', () => {
    type Update = typeof urls.$update;
    // @ts-expect-error — Prisma-style increment objects are not valid
    const _invalid: Update = { clickCount: { increment: 1 } };
    void _invalid;
  });

  it('rejects wrong primitive type', () => {
    type Update = typeof urls.$update;
    // @ts-expect-error — clickCount is number | DbExpr, not string
    const _invalid: Update = { clickCount: 'not a number' };
    void _invalid;
  });
});
