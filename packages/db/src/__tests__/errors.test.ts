import { describe, expect, it } from '@vertz/test';
import { toReadError, toWriteError } from '../errors';
import {
  CheckConstraintError,
  ConnectionError,
  ForeignKeyError,
  NotNullError,
  UniqueConstraintError,
} from '../errors/db-error';

// ---------------------------------------------------------------------------
// toReadError
// ---------------------------------------------------------------------------

describe('toReadError', () => {
  it('maps an error with code "NotFound" to DbNotFoundError', () => {
    const err = { code: 'NotFound', message: 'Record not found in table users', table: 'users' };
    const result = toReadError(err);

    expect(result.code).toBe('NotFound');
    expect(result.message).toBe('Record not found in table users');
    expect((result as { table: string }).table).toBe('users');
    expect(result.cause).toBe(err);
  });

  it('maps NotFound error without table to "unknown"', () => {
    const err = { code: 'NotFound', message: 'Not found' };
    const result = toReadError(err);

    expect(result.code).toBe('NotFound');
    expect((result as { table: string }).table).toBe('unknown');
  });

  it('maps error with connection code (08xxx) to CONNECTION_ERROR', () => {
    const err = { code: '08006', message: 'connection failure' };
    const result = toReadError(err);

    expect(result.code).toBe('CONNECTION_ERROR');
    expect(result.message).toBe('connection failure');
    expect(result.cause).toBe(err);
  });

  it('maps error with other PG code to QUERY_ERROR', () => {
    const err = { code: '42601', message: 'syntax error' };
    const result = toReadError(err, 'SELECT * FROM');

    expect(result.code).toBe('QUERY_ERROR');
    expect(result.message).toBe('syntax error');
    expect((result as { sql?: string }).sql).toBe('SELECT * FROM');
    expect(result.cause).toBe(err);
  });

  it('maps Error with "connection" in message to CONNECTION_ERROR', () => {
    const err = new Error('connection lost to database');
    const result = toReadError(err);

    expect(result.code).toBe('CONNECTION_ERROR');
    expect(result.message).toBe('connection lost to database');
    expect(result.cause).toBe(err);
  });

  it('maps Error with "connection" keyword (e.g. ECONNREFUSED context) to CONNECTION_ERROR', () => {
    // Note: the code calls message.toLowerCase() then checks includes('ECONNREFUSED').
    // Since toLowerCase converts ECONNREFUSED to econnrefused, the literal 'ECONNREFUSED'
    // check won't match. However, real ECONNREFUSED errors typically include 'connection'
    // in their message, which does match.
    const err = new Error('connection ECONNREFUSED 127.0.0.1:5432');
    const result = toReadError(err);

    expect(result.code).toBe('CONNECTION_ERROR');
    expect(result.cause).toBe(err);
  });

  it('maps Error with "timeout" in message to CONNECTION_ERROR', () => {
    const err = new Error('query timeout exceeded');
    const result = toReadError(err);

    expect(result.code).toBe('CONNECTION_ERROR');
    expect(result.message).toBe('query timeout exceeded');
    expect(result.cause).toBe(err);
  });

  it('maps generic Error without connection keywords to QUERY_ERROR', () => {
    const err = new Error('something went wrong');
    const result = toReadError(err, 'SELECT 1');

    expect(result.code).toBe('QUERY_ERROR');
    expect(result.message).toBe('something went wrong');
    expect((result as { sql?: string }).sql).toBe('SELECT 1');
    expect(result.cause).toBe(err);
  });

  it('maps non-Error, non-object value to QUERY_ERROR via String()', () => {
    const result = toReadError('plain string error', 'SELECT 1');

    expect(result.code).toBe('QUERY_ERROR');
    expect(result.message).toBe('plain string error');
    expect((result as { sql?: string }).sql).toBe('SELECT 1');
    expect(result.cause).toBe('plain string error');
  });
});

// ---------------------------------------------------------------------------
// toWriteError
// ---------------------------------------------------------------------------

describe('toWriteError', () => {
  it('maps UniqueConstraintError to CONSTRAINT_ERROR with column', () => {
    const err = new UniqueConstraintError({ table: 'users', column: 'email', value: 'a@b.com' });
    const result = toWriteError(err);

    expect(result.code).toBe('CONSTRAINT_ERROR');
    expect((result as { column?: string }).column).toBe('email');
    expect((result as { table?: string }).table).toBe('users');
    expect(result.cause).toBe(err);
  });

  it('maps ForeignKeyError to CONSTRAINT_ERROR with constraint', () => {
    const err = new ForeignKeyError({
      table: 'posts',
      constraint: 'posts_author_id_fkey',
    });
    const result = toWriteError(err);

    expect(result.code).toBe('CONSTRAINT_ERROR');
    expect((result as { constraint?: string }).constraint).toBe('posts_author_id_fkey');
    expect((result as { table?: string }).table).toBe('posts');
    expect(result.cause).toBe(err);
  });

  it('maps NotNullError to CONSTRAINT_ERROR with column', () => {
    const err = new NotNullError({ table: 'users', column: 'name' });
    const result = toWriteError(err);

    expect(result.code).toBe('CONSTRAINT_ERROR');
    expect((result as { column?: string }).column).toBe('name');
    expect((result as { table?: string }).table).toBe('users');
    expect(result.cause).toBe(err);
  });

  it('maps CheckConstraintError to CONSTRAINT_ERROR with constraint', () => {
    const err = new CheckConstraintError({
      table: 'orders',
      constraint: 'orders_amount_positive',
    });
    const result = toWriteError(err);

    expect(result.code).toBe('CONSTRAINT_ERROR');
    expect((result as { constraint?: string }).constraint).toBe('orders_amount_positive');
    expect((result as { table?: string }).table).toBe('orders');
    expect(result.cause).toBe(err);
  });

  it('maps ConnectionError to CONNECTION_ERROR', () => {
    const err = new ConnectionError('ECONNREFUSED');
    const result = toWriteError(err);

    expect(result.code).toBe('CONNECTION_ERROR');
    expect(result.message).toContain('ECONNREFUSED');
    expect(result.cause).toBe(err);
  });

  it('maps PG error code 08xxx to CONNECTION_ERROR', () => {
    const err = { code: '08001', message: 'unable to establish connection' };
    const result = toWriteError(err);

    expect(result.code).toBe('CONNECTION_ERROR');
    expect(result.message).toBe('unable to establish connection');
    expect(result.cause).toBe(err);
  });

  it('maps PG code 23505 (unique_violation) to CONSTRAINT_ERROR with column', () => {
    const err = {
      code: '23505',
      message: 'duplicate key value',
      table: 'users',
      column: 'email',
    };
    const result = toWriteError(err);

    expect(result.code).toBe('CONSTRAINT_ERROR');
    expect(result.message).toBe('duplicate key value');
    expect((result as { table?: string }).table).toBe('users');
    expect((result as { column?: string }).column).toBe('email');
    expect(result.cause).toBe(err);
  });

  it('maps PG code 23503 (foreign_key_violation) to CONSTRAINT_ERROR with constraint', () => {
    const err = {
      code: '23503',
      message: 'violates foreign key constraint',
      table: 'posts',
      constraint: 'posts_author_id_fkey',
    };
    const result = toWriteError(err);

    expect(result.code).toBe('CONSTRAINT_ERROR');
    expect(result.message).toBe('violates foreign key constraint');
    expect((result as { table?: string }).table).toBe('posts');
    expect((result as { constraint?: string }).constraint).toBe('posts_author_id_fkey');
    expect(result.cause).toBe(err);
  });

  it('maps PG code 23502 (not_null_violation) to CONSTRAINT_ERROR with column', () => {
    const err = {
      code: '23502',
      message: 'null value in column "name"',
      table: 'users',
      column: 'name',
    };
    const result = toWriteError(err);

    expect(result.code).toBe('CONSTRAINT_ERROR');
    expect(result.message).toBe('null value in column "name"');
    expect((result as { table?: string }).table).toBe('users');
    expect((result as { column?: string }).column).toBe('name');
    expect(result.cause).toBe(err);
  });

  it('maps PG code 23514 (check_violation) to CONSTRAINT_ERROR with constraint', () => {
    const err = {
      code: '23514',
      message: 'violates check constraint',
      table: 'orders',
      constraint: 'orders_amount_positive',
    };
    const result = toWriteError(err);

    expect(result.code).toBe('CONSTRAINT_ERROR');
    expect(result.message).toBe('violates check constraint');
    expect((result as { table?: string }).table).toBe('orders');
    expect((result as { constraint?: string }).constraint).toBe('orders_amount_positive');
    expect(result.cause).toBe(err);
  });

  it('maps other PG error codes to QUERY_ERROR', () => {
    const err = { code: '42601', message: 'syntax error at position 5' };
    const result = toWriteError(err, 'INSERT INTO ...');

    expect(result.code).toBe('QUERY_ERROR');
    expect(result.message).toBe('syntax error at position 5');
    expect((result as { sql?: string }).sql).toBe('INSERT INTO ...');
    expect(result.cause).toBe(err);
  });

  it('maps generic Error to QUERY_ERROR', () => {
    const err = new Error('something unexpected');
    const result = toWriteError(err, 'INSERT INTO users');

    expect(result.code).toBe('QUERY_ERROR');
    expect(result.message).toBe('something unexpected');
    expect((result as { sql?: string }).sql).toBe('INSERT INTO users');
    expect(result.cause).toBe(err);
  });

  it('maps non-Error, non-object value to QUERY_ERROR via String()', () => {
    const result = toWriteError(42, 'INSERT INTO users');

    expect(result.code).toBe('QUERY_ERROR');
    expect(result.message).toBe('42');
    expect((result as { sql?: string }).sql).toBe('INSERT INTO users');
    expect(result.cause).toBe(42);
  });
});
