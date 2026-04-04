/**
 * Type-level tests for GroupByExpression and d.fn builders.
 */
import type { GroupByExpression } from '../expression';
import { fnDate, fnDateTrunc, fnExtract } from '../expression';

// ---------------------------------------------------------------------------
// GroupByExpression phantom type
// ---------------------------------------------------------------------------

// Positive: GroupByExpression<'clickedAt'> is assignable to GroupByExpression<string>
const specific: GroupByExpression<'clickedAt'> = fnDate('clickedAt');
const general: GroupByExpression<string> = specific; // widening is ok
void general;

// ---------------------------------------------------------------------------
// fnDate — captures column literal type
// ---------------------------------------------------------------------------

// Positive: returns GroupByExpression parameterized by the column literal
const dateExpr: GroupByExpression<'clickedAt'> = fnDate('clickedAt');
void dateExpr;

// @ts-expect-error — date() requires a string, not a number
fnDate(123);

// ---------------------------------------------------------------------------
// fnDateTrunc — precision union + column capture
// ---------------------------------------------------------------------------

// Positive: valid precision
const truncExpr: GroupByExpression<'createdAt'> = fnDateTrunc('hour', 'createdAt');
void truncExpr;

// @ts-expect-error — 'invalid' is not a valid DateTruncPrecision
fnDateTrunc('invalid', 'createdAt');

// @ts-expect-error — column must be a string
fnDateTrunc('hour', 42);

// ---------------------------------------------------------------------------
// fnExtract — field union + column capture
// ---------------------------------------------------------------------------

// Positive: valid field
const extractExpr: GroupByExpression<'createdAt'> = fnExtract('month', 'createdAt');
void extractExpr;

// @ts-expect-error — 'invalid' is not a valid ExtractField
fnExtract('invalid', 'createdAt');

// @ts-expect-error — column must be a string
fnExtract('month', 42);
