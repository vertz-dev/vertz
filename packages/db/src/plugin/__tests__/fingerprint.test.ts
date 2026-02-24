import { describe, expect, it } from 'bun:test';
import { fingerprint } from '../fingerprint';

describe('fingerprint', () => {
  it('produces a deterministic hash for the same query shape', () => {
    const shape1 = {
      table: 'users',
      operation: 'list',
      where: { email: 'alice@example.com' },
      select: { id: true, email: true },
    };

    const shape2 = {
      table: 'users',
      operation: 'list',
      where: { email: 'bob@example.com' },
      select: { id: true, email: true },
    };

    expect(fingerprint(shape1)).toBe(fingerprint(shape2));
  });

  it('produces different hashes for different tables', () => {
    const shape1 = { table: 'users', operation: 'list' };
    const shape2 = { table: 'posts', operation: 'list' };

    expect(fingerprint(shape1)).not.toBe(fingerprint(shape2));
  });

  it('produces different hashes for different operations', () => {
    const shape1 = { table: 'users', operation: 'list' };
    const shape2 = { table: 'users', operation: 'get' };

    expect(fingerprint(shape1)).not.toBe(fingerprint(shape2));
  });

  it('produces different hashes for different where keys', () => {
    const shape1 = { table: 'users', operation: 'list', where: { email: 'x' } };
    const shape2 = { table: 'users', operation: 'list', where: { name: 'x' } };

    expect(fingerprint(shape1)).not.toBe(fingerprint(shape2));
  });

  it('ignores parameter values — only keys matter', () => {
    const shape1 = {
      table: 'users',
      operation: 'list',
      where: { id: '123', email: 'a@b.com' },
    };
    const shape2 = {
      table: 'users',
      operation: 'list',
      where: { id: '456', email: 'c@d.com' },
    };

    expect(fingerprint(shape1)).toBe(fingerprint(shape2));
  });

  it('produces same hash regardless of key order in where', () => {
    const shape1 = { table: 'users', operation: 'list', where: { a: 1, b: 2 } };
    const shape2 = { table: 'users', operation: 'list', where: { b: 2, a: 1 } };

    expect(fingerprint(shape1)).toBe(fingerprint(shape2));
  });

  it('includes select keys in fingerprint', () => {
    const shape1 = {
      table: 'users',
      operation: 'list',
      select: { id: true, email: true },
    };
    const shape2 = {
      table: 'users',
      operation: 'list',
      select: { id: true, name: true },
    };

    expect(fingerprint(shape1)).not.toBe(fingerprint(shape2));
  });

  it('includes include keys in fingerprint', () => {
    const shape1 = {
      table: 'users',
      operation: 'list',
      include: { posts: true },
    };
    const shape2 = {
      table: 'users',
      operation: 'list',
      include: { comments: true },
    };

    expect(fingerprint(shape1)).not.toBe(fingerprint(shape2));
  });

  it('returns a string', () => {
    const result = fingerprint({ table: 'users', operation: 'list' });
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });
});
