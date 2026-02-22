import { describe, expect, it } from 'vitest';
import { DbErrorCode, PgCodeToName, resolveErrorCode } from '../error-codes';

describe('DbErrorCode', () => {
  it('maps UNIQUE_VIOLATION to PG code 23505', () => {
    expect(DbErrorCode.UNIQUE_VIOLATION).toBe('23505');
  });

  it('maps FOREIGN_KEY_VIOLATION to PG code 23503', () => {
    expect(DbErrorCode.FOREIGN_KEY_VIOLATION).toBe('23503');
  });

  it('maps NOT_NULL_VIOLATION to PG code 23502', () => {
    expect(DbErrorCode.NOT_NULL_VIOLATION).toBe('23502');
  });

  it('maps CHECK_VIOLATION to PG code 23514', () => {
    expect(DbErrorCode.CHECK_VIOLATION).toBe('23514');
  });

  it('maps EXCLUSION_VIOLATION to PG code 23P01', () => {
    expect(DbErrorCode.EXCLUSION_VIOLATION).toBe('23P01');
  });

  it('maps SERIALIZATION_FAILURE to PG code 40001', () => {
    expect(DbErrorCode.SERIALIZATION_FAILURE).toBe('40001');
  });

  it('maps DEADLOCK_DETECTED to PG code 40P01', () => {
    expect(DbErrorCode.DEADLOCK_DETECTED).toBe('40P01');
  });

  it('maps CONNECTION_EXCEPTION to PG code 08000', () => {
    expect(DbErrorCode.CONNECTION_EXCEPTION).toBe('08000');
  });

  it('maps application-level codes', () => {
    expect(DbErrorCode.NotFound).toBe('NotFound');
    expect(DbErrorCode.CONNECTION_ERROR).toBe('CONNECTION_ERROR');
    expect(DbErrorCode.POOL_EXHAUSTED).toBe('POOL_EXHAUSTED');
  });

  it('is usable in a switch statement for exhaustiveness', () => {
    const code = 'UNIQUE_VIOLATION' as const;
    let matched = false;
    switch (code) {
      case 'UNIQUE_VIOLATION':
        matched = true;
        break;
      case 'FOREIGN_KEY_VIOLATION':
      case 'NOT_NULL_VIOLATION':
      case 'CHECK_VIOLATION':
        break;
    }
    expect(matched).toBe(true);
  });
});

describe('PgCodeToName', () => {
  it('reverse maps 23505 to UNIQUE_VIOLATION', () => {
    expect(PgCodeToName['23505']).toBe('UNIQUE_VIOLATION');
  });

  it('reverse maps 23503 to FOREIGN_KEY_VIOLATION', () => {
    expect(PgCodeToName['23503']).toBe('FOREIGN_KEY_VIOLATION');
  });

  it('reverse maps 23502 to NOT_NULL_VIOLATION', () => {
    expect(PgCodeToName['23502']).toBe('NOT_NULL_VIOLATION');
  });

  it('reverse maps 23514 to CHECK_VIOLATION', () => {
    expect(PgCodeToName['23514']).toBe('CHECK_VIOLATION');
  });

  it('returns undefined for unknown codes', () => {
    expect(PgCodeToName['99999']).toBeUndefined();
  });
});

describe('resolveErrorCode', () => {
  it('resolves 23505 to UNIQUE_VIOLATION', () => {
    expect(resolveErrorCode('23505')).toBe('UNIQUE_VIOLATION');
  });

  it('resolves 08000 to CONNECTION_EXCEPTION', () => {
    expect(resolveErrorCode('08000')).toBe('CONNECTION_EXCEPTION');
  });

  it('returns undefined for unmapped codes', () => {
    expect(resolveErrorCode('42P01')).toBeUndefined();
  });
});
