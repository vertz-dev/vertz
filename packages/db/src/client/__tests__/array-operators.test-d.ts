/**
 * Type-level tests for typed Postgres array operators (#2885):
 * - `arrayContains`, `arrayContainedBy`, `arrayOverlaps` on
 *   `d.textArray()` / `d.integerArray()` / `d.vector()` columns.
 * - Element-type flow from column metadata (`d.textArray() → string`,
 *   `d.integerArray() → number`, `d.vector(n) → number`).
 * - Dialect gating via the `ArrayFilter_Error_…` brand on SQLite.
 *
 * Negatives use `@ts-expect-error` — if the directive becomes unused, the
 * test fails, catching regressions that loosen the type surface.
 */

import { d } from '../../d';
import type { FilterType } from '../../schema/inference';
import { createDb } from '../database';

const postTable = d.table('post', {
  id: d.uuid().primary({ generate: 'cuid' }),
  tags: d.textArray(),
  ratings: d.integerArray(),
  embedding: d.vector(3),
  // Nullable array column — isNull should still be available alongside array ops.
  labels: d.textArray().nullable(),
});

type PostColumns = (typeof postTable)['_columns'];

// ---------------------------------------------------------------------------
// Postgres — positives per operand element type
// ---------------------------------------------------------------------------

const pgTextContains: FilterType<PostColumns, 'postgres'> = {
  tags: { arrayContains: ['typescript'] },
};
void pgTextContains;

const pgTextContainedBy: FilterType<PostColumns, 'postgres'> = {
  tags: { arrayContainedBy: ['typescript', 'rust', 'go'] },
};
void pgTextContainedBy;

const pgTextOverlaps: FilterType<PostColumns, 'postgres'> = {
  tags: { arrayOverlaps: ['ts', 'js'] },
};
void pgTextOverlaps;

const pgIntContains: FilterType<PostColumns, 'postgres'> = {
  ratings: { arrayContains: [5] },
};
void pgIntContains;

const pgIntOverlaps: FilterType<PostColumns, 'postgres'> = {
  ratings: { arrayOverlaps: [5, 4, 3] },
};
void pgIntOverlaps;

const pgVectorContainedBy: FilterType<PostColumns, 'postgres'> = {
  embedding: { arrayContainedBy: [0.1, 0.2, 0.3] },
};
void pgVectorContainedBy;

// Readonly `as const` operand accepted.
const pgTextAsConst: FilterType<PostColumns, 'postgres'> = {
  tags: { arrayContains: ['typescript', 'rust'] as const },
};
void pgTextAsConst;

// ---------------------------------------------------------------------------
// Postgres — direct-value shorthand still works on array columns
// ---------------------------------------------------------------------------

const pgTagsDirect: FilterType<PostColumns, 'postgres'> = {
  tags: ['typescript', 'rust'],
};
void pgTagsDirect;

const pgRatingsDirect: FilterType<PostColumns, 'postgres'> = {
  ratings: [5, 4],
};
void pgRatingsDirect;

// ---------------------------------------------------------------------------
// Postgres — existing operators still work (eq/ne/in/notIn/isNull)
// ---------------------------------------------------------------------------

const pgTagsEq: FilterType<PostColumns, 'postgres'> = {
  tags: { eq: ['typescript'] },
};
void pgTagsEq;

const pgLabelsIsNull: FilterType<PostColumns, 'postgres'> = {
  labels: { isNull: true },
};
void pgLabelsIsNull;

// Mixing standard + array operators in one object is accepted — TS's union
// contextual typing permits excess properties across arms, and the runtime
// processes every recognized operator key (producing an AND of the clauses).
// The 3-way union (direct | ColumnFilterOperators | ArrayOperatorSlots) is
// what keeps element-type errors narrow per property; it does not aim to
// reject the mixed form.
const pgMixedOps: FilterType<PostColumns, 'postgres'> = {
  tags: { eq: ['typescript'], arrayOverlaps: ['ts'] },
};
void pgMixedOps;

// ---------------------------------------------------------------------------
// Postgres — element-type negatives (operand element type flow)
// ---------------------------------------------------------------------------

const pgTagsWrongElem: FilterType<PostColumns, 'postgres'> = {
  // @ts-expect-error — number is not assignable to string (arrayContains operand element)
  tags: { arrayContains: [42] },
};
void pgTagsWrongElem;

const pgRatingsWrongElem: FilterType<PostColumns, 'postgres'> = {
  // @ts-expect-error — string is not assignable to number (arrayOverlaps operand element)
  ratings: { arrayOverlaps: ['five'] },
};
void pgRatingsWrongElem;

const pgVectorWrongElem: FilterType<PostColumns, 'postgres'> = {
  // @ts-expect-error — string is not assignable to number (arrayContainedBy operand element)
  embedding: { arrayContainedBy: ['0.1'] },
};
void pgVectorWrongElem;

// ---------------------------------------------------------------------------
// Postgres — array operators NOT available on non-array columns
// ---------------------------------------------------------------------------

const plainTable = d.table('plain', {
  id: d.uuid().primary({ generate: 'cuid' }),
  name: d.text(),
  count: d.integer(),
});
type PlainColumns = (typeof plainTable)['_columns'];

const pgPlainNoArrayOps: FilterType<PlainColumns, 'postgres'> = {
  // @ts-expect-error — arrayContains is not available on non-array (text) columns
  name: { arrayContains: ['a'] },
};
void pgPlainNoArrayOps;

// ---------------------------------------------------------------------------
// SQLite — brand diagnostic on each of the three array operators
// ---------------------------------------------------------------------------

const liteContains: FilterType<PostColumns, 'sqlite'> = {
  // @ts-expect-error — ArrayFilter_Error_Requires_Dialect_Postgres_On_SQLite_Fetch_And_Filter_In_JS
  tags: { arrayContains: ['typescript'] },
};
void liteContains;

const liteContainedBy: FilterType<PostColumns, 'sqlite'> = {
  // @ts-expect-error — ArrayFilter_Error_Requires_Dialect_Postgres_On_SQLite_Fetch_And_Filter_In_JS
  tags: { arrayContainedBy: ['typescript'] },
};
void liteContainedBy;

const liteOverlaps: FilterType<PostColumns, 'sqlite'> = {
  // @ts-expect-error — ArrayFilter_Error_Requires_Dialect_Postgres_On_SQLite_Fetch_And_Filter_In_JS
  tags: { arrayOverlaps: ['typescript'] },
};
void liteOverlaps;

const liteIntContains: FilterType<PostColumns, 'sqlite'> = {
  // @ts-expect-error — ArrayFilter_Error_Requires_Dialect_Postgres_On_SQLite_Fetch_And_Filter_In_JS
  ratings: { arrayContains: [5] },
};
void liteIntContains;

const liteVectorOverlaps: FilterType<PostColumns, 'sqlite'> = {
  // @ts-expect-error — ArrayFilter_Error_Requires_Dialect_Postgres_On_SQLite_Fetch_And_Filter_In_JS
  embedding: { arrayOverlaps: [0.5] },
};
void liteVectorOverlaps;

// ---------------------------------------------------------------------------
// SQLite — direct value and existing operators still compile
// ---------------------------------------------------------------------------

const liteDirect: FilterType<PostColumns, 'sqlite'> = {
  tags: ['typescript'],
};
void liteDirect;

const liteEq: FilterType<PostColumns, 'sqlite'> = {
  tags: { eq: ['typescript'] },
};
void liteEq;

const liteLabelsIsNull: FilterType<PostColumns, 'sqlite'> = {
  labels: { isNull: true },
};
void liteLabelsIsNull;

// ---------------------------------------------------------------------------
// createDb end-to-end — gate fires through list() / aggregate() on SQLite
// ---------------------------------------------------------------------------

const sqliteDb = createDb({
  dialect: 'sqlite',
  path: ':memory:',
  models: { post: d.model(postTable) },
  migrations: { autoApply: true },
});

void sqliteDb.post.list({
  where: {
    // @ts-expect-error — ArrayFilter_Error_Requires_Dialect_Postgres_On_SQLite_Fetch_And_Filter_In_JS
    tags: { arrayContains: ['typescript'] },
  },
});

void sqliteDb.post.aggregate({
  _count: true,
  where: {
    // @ts-expect-error — ArrayFilter_Error_Requires_Dialect_Postgres_On_SQLite_Fetch_And_Filter_In_JS
    ratings: { arrayOverlaps: [5] },
  },
});

// Direct equality still works on SQLite.
void sqliteDb.post.list({
  where: { tags: ['typescript'] },
});

const pgDb = createDb({
  dialect: 'postgres',
  url: 'postgres://u:p@localhost/db',
  models: { post: d.model(postTable) },
  _queryFn: (async () => ({ rows: [], rowCount: 0 })) as never,
});

void pgDb.post.list({
  where: { tags: { arrayContains: ['typescript'] } },
});

void pgDb.post.list({
  where: { ratings: { arrayOverlaps: [5] } },
});

void pgDb.post.list({
  where: { embedding: { arrayContainedBy: [0.1, 0.2, 0.3] } },
});

void pgDb.post.aggregate({
  _count: true,
  where: { tags: { arrayOverlaps: ['ts'] } },
});
