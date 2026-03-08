import { describe, expect, it } from 'bun:test';
import type { AuthUser } from '../types';
import { InMemoryUserStore } from '../user-store';

function makeUser(overrides?: Partial<AuthUser>): AuthUser {
  const now = new Date();
  return {
    id: crypto.randomUUID(),
    email: 'test@example.com',
    role: 'user',
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

describe('InMemoryUserStore', () => {
  it('creates a user and retrieves by email', async () => {
    const store = new InMemoryUserStore();
    const user = makeUser({ email: 'alice@example.com' });

    await store.createUser(user, 'hashed-password');

    const found = await store.findByEmail('alice@example.com');
    expect(found).not.toBeNull();
    expect(found?.user.id).toBe(user.id);
    expect(found?.passwordHash).toBe('hashed-password');
  });

  it('retrieves a user by id', async () => {
    const store = new InMemoryUserStore();
    const user = makeUser({ id: 'user-id-123' });

    await store.createUser(user, 'hash');

    const found = await store.findById('user-id-123');
    expect(found).not.toBeNull();
    expect(found?.email).toBe(user.email);
  });

  it('returns null for non-existent user', async () => {
    const store = new InMemoryUserStore();

    const byEmail = await store.findByEmail('nobody@example.com');
    expect(byEmail).toBeNull();

    const byId = await store.findById('nonexistent');
    expect(byId).toBeNull();
  });
});
