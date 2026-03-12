/**
 * Shared test factory for UserStore behavioral parity.
 *
 * Runs the same tests against both InMemory and DB implementations
 * to guarantee they behave identically.
 */

import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import type { AuthUser, UserStore } from '../types';

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

export function userStoreTests(
  name: string,
  factory: () => Promise<{ store: UserStore; cleanup: () => Promise<void> }>,
) {
  describe(`UserStore: ${name}`, () => {
    let store: UserStore;
    let cleanup: () => Promise<void>;

    beforeEach(async () => {
      const result = await factory();
      store = result.store;
      cleanup = result.cleanup;
    });

    afterEach(async () => {
      await cleanup();
    });

    it('creates and finds user by email', async () => {
      const user = makeUser({ email: 'alice@example.com' });
      await store.createUser(user, 'hashed-password');

      const found = await store.findByEmail('alice@example.com');
      expect(found).not.toBeNull();
      expect(found!.user.id).toBe(user.id);
      expect(found!.user.email).toBe('alice@example.com');
      expect(found!.passwordHash).toBe('hashed-password');
    });

    it('findByEmail is case-insensitive', async () => {
      const user = makeUser({ email: 'Alice@Example.COM' });
      await store.createUser(user, 'hash');

      const found = await store.findByEmail('alice@example.com');
      expect(found).not.toBeNull();
      expect(found!.user.id).toBe(user.id);
    });

    it('retrieves user by id', async () => {
      const user = makeUser({ id: 'user-id-123' });
      await store.createUser(user, 'hash');

      const found = await store.findById('user-id-123');
      expect(found).not.toBeNull();
      expect(found!.email).toBe(user.email);
    });

    it('returns null for non-existent email', async () => {
      const found = await store.findByEmail('nobody@example.com');
      expect(found).toBeNull();
    });

    it('returns null for non-existent id', async () => {
      const found = await store.findById('nonexistent');
      expect(found).toBeNull();
    });

    it('accepts null passwordHash (OAuth-only user)', async () => {
      const user = makeUser({ email: 'oauth@example.com' });
      await store.createUser(user, null);

      const found = await store.findByEmail('oauth@example.com');
      expect(found).not.toBeNull();
      expect(found!.passwordHash).toBeNull();
    });

    it('updates password hash', async () => {
      const user = makeUser({ email: 'pw@example.com' });
      await store.createUser(user, 'old-hash');

      await store.updatePasswordHash(user.id, 'new-hash');

      const found = await store.findByEmail('pw@example.com');
      expect(found!.passwordHash).toBe('new-hash');
    });

    it('updates email verified status', async () => {
      const user = makeUser({ email: 'verify@example.com', emailVerified: false });
      await store.createUser(user, 'hash');

      await store.updateEmailVerified(user.id, true);

      const found = await store.findById(user.id);
      expect(found!.emailVerified).toBe(true);
    });

    it('preserves user role', async () => {
      const user = makeUser({ role: 'admin' });
      await store.createUser(user, 'hash');

      const found = await store.findById(user.id);
      expect(found!.role).toBe('admin');
    });

    it('deletes a user by id', async () => {
      const user = makeUser({ email: 'delete-me@example.com' });
      await store.createUser(user, 'hash');

      await store.deleteUser(user.id);

      const byId = await store.findById(user.id);
      expect(byId).toBeNull();

      const byEmail = await store.findByEmail('delete-me@example.com');
      expect(byEmail).toBeNull();
    });

    it('deleteUser is a no-op for non-existent id', async () => {
      // Should not throw
      await store.deleteUser('nonexistent-id');
    });

    it('deletes a user by id', async () => {
      const user = makeUser({ email: 'delete-me@example.com' });
      await store.createUser(user, 'hash');

      await store.deleteUser(user.id);

      const byId = await store.findById(user.id);
      expect(byId).toBeNull();

      const byEmail = await store.findByEmail('delete-me@example.com');
      expect(byEmail).toBeNull();
    });

    it('deleteUser is a no-op for non-existent id', async () => {
      // Should not throw
      await store.deleteUser('nonexistent-id');
    });
  });
}
