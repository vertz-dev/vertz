/**
 * Type-level tests for typed aggregate args and results (#2283, #2284).
 *
 * Phase 1: TypedAggregateArgs validates columns, restricts _avg/_sum to numeric.
 * Phase 2: AggregateResult computes return shape from requested fields.
 */
import { describe, it } from '@vertz/test';
import type { InferColumnType } from '../../schema/column';
import type { ModelEntry } from '../../schema/inference';
import type { AggregateResult, GroupByResult, TypedAggregateArgs } from '../aggregate';
import { d } from '../../d';
import type { Equal, Expect, Extends, HasKey, Not } from '../../__tests__/_type-helpers';

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
    type _t1 = Expect<
      Extends<{ where: { price: { gte: 10 } }; _count: true }, TypedAggregateArgs<ProductEntry>>
    >;
  });

  it('rejects invalid column names in where', () => {
    type _t1 = Expect<
      Not<Extends<{ where: { invalidCol: 'value' } }, TypedAggregateArgs<ProductEntry>>>
    >;
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
    type _t1 = Expect<
      Not<Extends<{ _avg: { createdAt: true } }, TypedAggregateArgs<ProductEntry>>>
    >;
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
    type _t1 = Expect<
      Not<Extends<{ _min: { nonExistent: true } }, TypedAggregateArgs<ProductEntry>>>
    >;
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
    type _t1 = Expect<
      Extends<{ _count: { name: true; price: true } }, TypedAggregateArgs<ProductEntry>>
    >;
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

// ---------------------------------------------------------------------------
// Alias for product columns to use in AggregateResult tests
// ---------------------------------------------------------------------------

type ProductCols = (typeof productsTable)['_columns'];

// ---------------------------------------------------------------------------
// 6. AggregateResult — _count: true returns number
// ---------------------------------------------------------------------------

describe('AggregateResult — _count: true', () => {
  it('result has _count as number', () => {
    type R = AggregateResult<ProductCols, { _count: true }>;
    type _t1 = Expect<Equal<R['_count'], number>>;
  });
});

// ---------------------------------------------------------------------------
// 7. AggregateResult — per-column _count returns record of numbers
// ---------------------------------------------------------------------------

describe('AggregateResult — per-column _count', () => {
  it('result._count has requested columns as number', () => {
    type R = AggregateResult<ProductCols, { _count: { name: true; price: true } }>;
    type _t1 = Expect<Equal<R['_count'], { name: number; price: number }>>;
  });
});

// ---------------------------------------------------------------------------
// 8. AggregateResult — _avg returns number | null for each column
// ---------------------------------------------------------------------------

describe('AggregateResult — _avg', () => {
  it('result._avg.price is number | null', () => {
    type R = AggregateResult<ProductCols, { _avg: { price: true } }>;
    type _t1 = Expect<Equal<R['_avg'], { price: number | null }>>;
  });

  it('result._avg with multiple columns', () => {
    type R = AggregateResult<ProductCols, { _avg: { price: true; stock: true } }>;
    type _t1 = Expect<Equal<R['_avg'], { price: number | null; stock: number | null }>>;
  });
});

// ---------------------------------------------------------------------------
// 9. AggregateResult — _sum returns number | null
// ---------------------------------------------------------------------------

describe('AggregateResult — _sum', () => {
  it('result._sum.stock is number | null', () => {
    type R = AggregateResult<ProductCols, { _sum: { stock: true } }>;
    type _t1 = Expect<Equal<R['_sum'], { stock: number | null }>>;
  });
});

// ---------------------------------------------------------------------------
// 10. AggregateResult — _min/_max preserves column type
// ---------------------------------------------------------------------------

describe('AggregateResult — _min/_max column-aware types', () => {
  it('_min on numeric column returns number | null', () => {
    type R = AggregateResult<ProductCols, { _min: { price: true } }>;
    type _t1 = Expect<Equal<R['_min'], { price: number | null }>>;
  });

  it('_min on text column returns string | null', () => {
    type R = AggregateResult<ProductCols, { _min: { name: true } }>;
    type _t1 = Expect<Equal<R['_min'], { name: string | null }>>;
  });

  it('_max on text column returns string | null', () => {
    type R = AggregateResult<ProductCols, { _max: { category: true } }>;
    type _t1 = Expect<Equal<R['_max'], { category: string | null }>>;
  });

  it('_min with mixed column types', () => {
    type R = AggregateResult<ProductCols, { _min: { price: true; name: true } }>;
    type _t1 = Expect<Equal<R['_min'], { price: number | null; name: string | null }>>;
  });

  it('_min on timestamp column returns Date | null', () => {
    type R = AggregateResult<ProductCols, { _min: { createdAt: true } }>;
    type _t1 = Expect<Equal<R['_min'], { createdAt: Date | null }>>;
  });

  it('_max on timestamp column returns Date | null', () => {
    type R = AggregateResult<ProductCols, { _max: { createdAt: true } }>;
    type _t1 = Expect<Equal<R['_max'], { createdAt: Date | null }>>;
  });
});

// ---------------------------------------------------------------------------
// 11. AggregateResult — combined fields
// ---------------------------------------------------------------------------

describe('AggregateResult — combined', () => {
  it('result has all requested aggregation fields', () => {
    type R = AggregateResult<
      ProductCols,
      {
        _avg: { price: true };
        _sum: { stock: true };
        _count: true;
      }
    >;
    type _t1 = Expect<HasKey<R, '_avg'>>;
    type _t2 = Expect<HasKey<R, '_sum'>>;
    type _t3 = Expect<HasKey<R, '_count'>>;
  });

  it('result does NOT have unrequested fields', () => {
    type R = AggregateResult<ProductCols, { _count: true }>;
    type _t1 = Expect<Not<HasKey<R, '_avg'>>>;
    type _t2 = Expect<Not<HasKey<R, '_sum'>>>;
    type _t3 = Expect<Not<HasKey<R, '_min'>>>;
    type _t4 = Expect<Not<HasKey<R, '_max'>>>;
  });
});

// ---------------------------------------------------------------------------
// 12. AggregateResult — empty args returns empty object
// ---------------------------------------------------------------------------

describe('AggregateResult — empty args', () => {
  it('returns empty object type', () => {
    type R = AggregateResult<ProductCols, {}>;
    type Keys = keyof R;
    type _t1 = Expect<Equal<Keys, never>>;
  });
});

// ===========================================================================
// Phase 3: GroupByResult — typed groupBy return values
// ===========================================================================

// ---------------------------------------------------------------------------
// 13. GroupByResult — group-by string columns are typed
// ---------------------------------------------------------------------------

describe('GroupByResult — string columns in by', () => {
  it('row has typed group-by column', () => {
    type R = GroupByResult<ProductCols, { by: readonly ['name']; _count: true }>;
    type _t1 = Expect<Equal<R['name'], InferColumnType<ProductCols['name']>>>;
    type _t2 = Expect<Equal<R['_count'], number>>;
  });

  it('row has multiple typed group-by columns', () => {
    type R = GroupByResult<ProductCols, { by: readonly ['name', 'category']; _count: true }>;
    type _t1 = Expect<HasKey<R, 'name'>>;
    type _t2 = Expect<HasKey<R, 'category'>>;
    type _t3 = Expect<HasKey<R, '_count'>>;
  });
});

// ---------------------------------------------------------------------------
// 14. GroupByResult — aggregation fields included
// ---------------------------------------------------------------------------

describe('GroupByResult — includes aggregation fields', () => {
  it('includes _avg and _count alongside group-by columns', () => {
    type R = GroupByResult<
      ProductCols,
      {
        by: readonly ['category'];
        _avg: { price: true };
        _count: true;
      }
    >;
    type _t1 = Expect<HasKey<R, 'category'>>;
    type _t2 = Expect<HasKey<R, '_avg'>>;
    type _t3 = Expect<Equal<R['_avg'], { price: number | null }>>;
    type _t4 = Expect<Equal<R['_count'], number>>;
  });
});

// ---------------------------------------------------------------------------
// 15. GroupByResult — expression entries contribute Record<string, unknown>
// ---------------------------------------------------------------------------

describe('GroupByResult — expression fallback', () => {
  it('non-string by entries add Record<string, unknown> index signature', () => {
    // GroupByExpression in the by array means the result has a string index fallback
    type R = GroupByResult<
      ProductCols,
      {
        by: readonly [
          'name',
          { _tag: 'GroupByExpression'; _column: 'createdAt'; sql: string; alias: string },
        ];
        _count: true;
      }
    >;
    type _t1 = Expect<HasKey<R, 'name'>>;
    type _t2 = Expect<HasKey<R, '_count'>>;
    // Expression aliases accessible via string index
    type _t3 = Expect<Extends<string, R[string]>>;
  });
});

// ---------------------------------------------------------------------------
// 16. GroupByResult — unrequested aggregation fields absent
// ---------------------------------------------------------------------------

describe('GroupByResult — unrequested fields absent', () => {
  it('does not have _avg if not requested', () => {
    type R = GroupByResult<ProductCols, { by: readonly ['name']; _count: true }>;
    type _t1 = Expect<Not<HasKey<R, '_avg'>>>;
    type _t2 = Expect<Not<HasKey<R, '_sum'>>>;
  });
});
