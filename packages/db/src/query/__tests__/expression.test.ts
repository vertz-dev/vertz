import { describe, expect, it } from 'bun:test';
import {
  type GroupByExpression,
  VALID_DATE_TRUNC_PRECISIONS,
  VALID_EXTRACT_FIELDS,
  fnDate,
  fnDateTrunc,
  fnExtract,
  isGroupByExpression,
} from '../expression';

describe('GroupByExpression (type guard)', () => {
  it('returns true for a valid GroupByExpression object', () => {
    const expr: GroupByExpression = {
      _tag: 'GroupByExpression',
      _column: 'clickedAt',
      sql: 'DATE("clicked_at")',
      alias: 'dateClickedAt',
    };
    expect(isGroupByExpression(expr)).toBe(true);
  });

  it('returns false for a plain string', () => {
    expect(isGroupByExpression('category')).toBe(false);
  });

  it('returns false for null', () => {
    expect(isGroupByExpression(null as unknown as string)).toBe(false);
  });

  it('returns false for undefined', () => {
    expect(isGroupByExpression(undefined as unknown as string)).toBe(false);
  });

  it('returns false for an object without _tag', () => {
    const obj = { sql: 'DATE("x")', alias: 'y' };
    expect(isGroupByExpression(obj as unknown as string)).toBe(false);
  });

  it('returns false for an object with wrong _tag', () => {
    const obj = { _tag: 'Other', sql: 'x', alias: 'y' };
    expect(isGroupByExpression(obj as unknown as string)).toBe(false);
  });
});

describe('Validation sets', () => {
  it('VALID_DATE_TRUNC_PRECISIONS contains all 10 precisions', () => {
    const expected = [
      'microsecond',
      'millisecond',
      'second',
      'minute',
      'hour',
      'day',
      'week',
      'month',
      'quarter',
      'year',
    ];
    expect(VALID_DATE_TRUNC_PRECISIONS.size).toBe(10);
    for (const p of expected) {
      expect(VALID_DATE_TRUNC_PRECISIONS.has(p)).toBe(true);
    }
  });

  it('VALID_EXTRACT_FIELDS contains all 20 fields', () => {
    const expected = [
      'century',
      'day',
      'decade',
      'dow',
      'doy',
      'epoch',
      'hour',
      'isodow',
      'isoyear',
      'microsecond',
      'millisecond',
      'minute',
      'month',
      'quarter',
      'second',
      'timezone',
      'timezone_hour',
      'timezone_minute',
      'week',
      'year',
    ];
    expect(VALID_EXTRACT_FIELDS.size).toBe(20);
    for (const f of expected) {
      expect(VALID_EXTRACT_FIELDS.has(f)).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// fnDate
// ---------------------------------------------------------------------------

describe('fnDate', () => {
  it('produces correct SQL and camelCase alias for single-word column', () => {
    const expr = fnDate('status');
    expect(expr._tag).toBe('GroupByExpression');
    expect(expr._column).toBe('status');
    expect(expr.sql).toBe('DATE("status")');
    expect(expr.alias).toBe('dateStatus');
  });

  it('converts camelCase column to snake_case in SQL', () => {
    const expr = fnDate('clickedAt');
    expect(expr._column).toBe('clickedAt');
    expect(expr.sql).toBe('DATE("clicked_at")');
    expect(expr.alias).toBe('dateClickedAt');
  });

  it('is recognized by isGroupByExpression', () => {
    expect(isGroupByExpression(fnDate('x'))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// fnDateTrunc
// ---------------------------------------------------------------------------

describe('fnDateTrunc', () => {
  it('produces correct SQL and alias for hour precision', () => {
    const expr = fnDateTrunc('hour', 'clickedAt');
    expect(expr._tag).toBe('GroupByExpression');
    expect(expr._column).toBe('clickedAt');
    expect(expr.sql).toBe('date_trunc(\'hour\', "clicked_at")');
    expect(expr.alias).toBe('dateTruncHourClickedAt');
  });

  it('produces correct SQL and alias for day precision', () => {
    const expr = fnDateTrunc('day', 'createdAt');
    expect(expr.sql).toBe('date_trunc(\'day\', "created_at")');
    expect(expr.alias).toBe('dateTruncDayCreatedAt');
  });

  it('handles all 10 valid precisions', () => {
    const precisions = [
      'microsecond',
      'millisecond',
      'second',
      'minute',
      'hour',
      'day',
      'week',
      'month',
      'quarter',
      'year',
    ] as const;
    for (const p of precisions) {
      const expr = fnDateTrunc(p, 'col');
      expect(expr.sql).toContain(`'${p}'`);
      expect(expr._tag).toBe('GroupByExpression');
    }
  });

  it('throws for invalid precision with helpful message', () => {
    expect(() => fnDateTrunc('invalid' as 'hour', 'col')).toThrow(
      /Invalid date_trunc precision: "invalid"/,
    );
    expect(() => fnDateTrunc('invalid' as 'hour', 'col')).toThrow(/Valid:/);
  });
});

// ---------------------------------------------------------------------------
// fnExtract
// ---------------------------------------------------------------------------

describe('fnExtract', () => {
  it('produces correct SQL and alias for month field', () => {
    const expr = fnExtract('month', 'createdAt');
    expect(expr._tag).toBe('GroupByExpression');
    expect(expr._column).toBe('createdAt');
    expect(expr.sql).toBe('EXTRACT(month FROM "created_at")');
    expect(expr.alias).toBe('extractMonthCreatedAt');
  });

  it('produces correct SQL and alias for year field', () => {
    const expr = fnExtract('year', 'createdAt');
    expect(expr.sql).toBe('EXTRACT(year FROM "created_at")');
    expect(expr.alias).toBe('extractYearCreatedAt');
  });

  it('produces correct alias for dow field', () => {
    const expr = fnExtract('dow', 'createdAt');
    expect(expr.sql).toBe('EXTRACT(dow FROM "created_at")');
    expect(expr.alias).toBe('extractDowCreatedAt');
  });

  it('handles all 20 valid fields', () => {
    const fields = [
      'century',
      'day',
      'decade',
      'dow',
      'doy',
      'epoch',
      'hour',
      'isodow',
      'isoyear',
      'microsecond',
      'millisecond',
      'minute',
      'month',
      'quarter',
      'second',
      'timezone',
      'timezone_hour',
      'timezone_minute',
      'week',
      'year',
    ] as const;
    for (const f of fields) {
      const expr = fnExtract(f, 'col');
      expect(expr.sql).toContain(f.replace('_', ' '));
      expect(expr._tag).toBe('GroupByExpression');
    }
  });

  it('throws for invalid field with helpful message', () => {
    expect(() => fnExtract('invalid' as 'month', 'col')).toThrow(
      /Invalid EXTRACT field: "invalid"/,
    );
    expect(() => fnExtract('invalid' as 'month', 'col')).toThrow(/Valid:/);
  });
});
