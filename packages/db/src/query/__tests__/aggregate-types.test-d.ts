/**
 * Type-level tests for typed aggregate args and results (#2283, #2284).
 *
 * Phase 1: TypedAggregateArgs validates columns, restricts _avg/_sum to numeric.
 */
import { describe, it } from 'bun:test';
import type { ModelEntry } from '../../schema/inference';
import type { TypedAggregateArgs } from '../aggregate';
import { d } from '../../d';
import type { Expect, Extends, Not } from '../../__tests__/_type-helpers';

// ---------------------------------------------------------------------------
// Fixture: model with numeric and non-numeric columns
// ---------------------------------------------------------------------------

const productsTable = d.table('products', {
  id: d.uuid().primary(),
  name: d.text(),
  price: d.real(),
  stock: d.integer(),
  category: d.text(),
  createdAt: d.timestamp().default('now'),
});

type ProductEntry = { table: typeof productsTable; relations: {} };

// ---------------------------------------------------------------------------
// 1. TypedAggregateArgs accepts valid column names in where
// ---------------------------------------------------------------------------

describe('TypedAggregateArgs — where clause', () => {
  it('accepts valid column names in where', () => {
    type _t1 = Expect<Extends<{ where: { price: { gte: 10 } }; _count: true }, TypedAggregateArgs<ProductEntry>>>;
  });

  it('rejects invalid column names in where', () => {
    type _t1 = Expect<Not<Extends<{ where: { invalidCol: 'value' } }, TypedAggregateArgs<ProductEntry>>>>;
  });
});

// ---------------------------------------------------------------------------
// 2. _avg and _sum restricted to numeric columns
// ---------------------------------------------------------------------------

describe('TypedAggregateArgs — _avg and _sum restricted to numeric', () => {
  it('accepts numeric columns in _avg', () => {
    type _t1 = Expect<Extends<{ _avg: { price: true } }, TypedAggregateArgs<ProductEntry>>>;
  });

  it('accepts numeric columns in _sum', () => {
    type _t1 = Expect<Extends<{ _sum: { stock: true } }, TypedAggregateArgs<ProductEntry>>>;
  });

  it('rejects text columns in _avg', () => {
    type _t1 = Expect<Not<Extends<{ _avg: { name: true } }, TypedAggregateArgs<ProductEntry>>>>;
  });

  it('rejects text columns in _sum', () => {
    type _t1 = Expect<Not<Extends<{ _sum: { category: true } }, TypedAggregateArgs<ProductEntry>>>>;
  });

  it('rejects timestamp columns in _avg', () => {
    type _t1 = Expect<Not<Extends<{ _avg: { createdAt: true } }, TypedAggregateArgs<ProductEntry>>>>;
  });
});

// ---------------------------------------------------------------------------
// 3. _min and _max accept any column
// ---------------------------------------------------------------------------

describe('TypedAggregateArgs — _min and _max accept any column', () => {
  it('accepts numeric columns in _min', () => {
    type _t1 = Expect<Extends<{ _min: { price: true } }, TypedAggregateArgs<ProductEntry>>>;
  });

  it('accepts text columns in _min', () => {
    type _t1 = Expect<Extends<{ _min: { name: true } }, TypedAggregateArgs<ProductEntry>>>;
  });

  it('accepts text columns in _max', () => {
    type _t1 = Expect<Extends<{ _max: { category: true } }, TypedAggregateArgs<ProductEntry>>>;
  });

  it('rejects non-existent columns in _min', () => {
    type _t1 = Expect<Not<Extends<{ _min: { nonExistent: true } }, TypedAggregateArgs<ProductEntry>>>>;
  });

  it('rejects non-existent columns in _max', () => {
    type _t1 = Expect<Not<Extends<{ _max: { fake: true } }, TypedAggregateArgs<ProductEntry>>>>;
  });
});

// ---------------------------------------------------------------------------
// 4. _count accepts true or per-column record
// ---------------------------------------------------------------------------

describe('TypedAggregateArgs — _count', () => {
  it('accepts _count: true', () => {
    type _t1 = Expect<Extends<{ _count: true }, TypedAggregateArgs<ProductEntry>>>;
  });

  it('accepts per-column _count with valid columns', () => {
    type _t1 = Expect<Extends<{ _count: { name: true; price: true } }, TypedAggregateArgs<ProductEntry>>>;
  });

  it('rejects per-column _count with invalid columns', () => {
    type _t1 = Expect<Not<Extends<{ _count: { fake: true } }, TypedAggregateArgs<ProductEntry>>>>;
  });
});

// ---------------------------------------------------------------------------
// 5. Combined args — all fields together
// ---------------------------------------------------------------------------

describe('TypedAggregateArgs — combined fields', () => {
  it('accepts a full valid aggregate call', () => {
    type Args = {
      where: { price: { gte: 10 } };
      _avg: { price: true };
      _sum: { stock: true };
      _min: { name: true };
      _max: { price: true };
      _count: true;
    };
    type _t1 = Expect<Extends<Args, TypedAggregateArgs<ProductEntry>>>;
  });

  it('accepts empty args', () => {
    type _t1 = Expect<Extends<{}, TypedAggregateArgs<ProductEntry>>>;
  });
});
