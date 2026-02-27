import { describe, expect, it } from 'bun:test';
import { fingerprint } from '../fingerprint';

describe('fingerprint', () => {
  it('produces a deterministic hash for the same query shape', async () => {
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

    expect(await fingerprint(shape1)).toBe(await fingerprint(shape2));
  });

  it('produces different hashes for different tables', async () => {
    const shape1 = { table: 'users', operation: 'list' };
    const shape2 = { table: 'posts', operation: 'list' };

    expect(await fingerprint(shape1)).not.toBe(await fingerprint(shape2));
  });

  it('produces different hashes for different operations', async () => {
    const shape1 = { table: 'users', operation: 'list' };
    const shape2 = { table: 'users', operation: 'get' };

    expect(await fingerprint(shape1)).not.toBe(await fingerprint(shape2));
  });

  it('produces different hashes for different where keys', async () => {
    const shape1 = { table: 'users', operation: 'list', where: { email: 'x' } };
    const shape2 = { table: 'users', operation: 'list', where: { name: 'x' } };

    expect(await fingerprint(shape1)).not.toBe(await fingerprint(shape2));
  });

  it('ignores parameter values — only keys matter', async () => {
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

    expect(await fingerprint(shape1)).toBe(await fingerprint(shape2));
  });

  it('produces same hash regardless of key order in where', async () => {
    const shape1 = { table: 'users', operation: 'list', where: { a: 1, b: 2 } };
    const shape2 = { table: 'users', operation: 'list', where: { b: 2, a: 1 } };

    expect(await fingerprint(shape1)).toBe(await fingerprint(shape2));
  });

  it('includes select keys in fingerprint', async () => {
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

    expect(await fingerprint(shape1)).not.toBe(await fingerprint(shape2));
  });

  it('includes include keys in fingerprint', async () => {
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

    expect(await fingerprint(shape1)).not.toBe(await fingerprint(shape2));
  });

  it('returns a string', async () => {
    const result = await fingerprint({ table: 'users', operation: 'list' });
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });
});
