/**
 * onUserCreated Callback Tests — Auth-Entity Bridge
 */

import { describe, expect, it } from 'bun:test';
import { InMemoryClosureStore } from '../closure-store';
import { defineAccess } from '../define-access';
import { createAuth } from '../index';
import { InMemoryRoleAssignmentStore } from '../role-assignment-store';
import type { AuthCallbackContext, AuthConfig, AuthInstance, OnUserCreatedPayload } from '../types';
import { InMemoryUserStore } from '../user-store';
import { TEST_PRIVATE_KEY, TEST_PUBLIC_KEY } from './test-keys';

function createTestAuth(overrides?: Partial<AuthConfig>): AuthInstance {
  return createAuth({
    session: { strategy: 'jwt', ttl: '60s', refreshTtl: '7d' },
    privateKey: TEST_PRIVATE_KEY,
    publicKey: TEST_PUBLIC_KEY,
    isProduction: false,
    ...overrides,
  });
}

describe('onUserCreated — email/password sign-up', () => {
  it('fires with provider: null and signUpData on email/password sign-up', async () => {
    const userStore = new InMemoryUserStore();
    let callbackPayload: OnUserCreatedPayload | null = null;

    const auth = createTestAuth({
      userStore,
      onUserCreated: async (payload) => {
        callbackPayload = payload;
      },
    });

    await auth.handler(
      new Request('http://localhost/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'test@example.com',
          password: 'password123',
          name: 'Test User',
          avatarUrl: 'https://example.com/avatar.png',
        }),
      }),
    );

    expect(callbackPayload).not.toBeNull();
    expect(callbackPayload?.provider).toBeNull();
    expect(callbackPayload?.user.email).toBe('test@example.com');
    // signUpData should contain extra fields (name, avatarUrl) but NOT email/password
    const payload = callbackPayload as Extract<OnUserCreatedPayload, { provider: null }>;
    expect(payload.signUpData.name).toBe('Test User');
    expect(payload.signUpData.avatarUrl).toBe('https://example.com/avatar.png');
    expect(payload.signUpData).not.toHaveProperty('email');
    expect(payload.signUpData).not.toHaveProperty('password');
  });

  it('provides ctx.entities in callback', async () => {
    const userStore = new InMemoryUserStore();
    let receivedEntities: unknown = null;

    const mockProxy = {
      users: {
        get: async () => null,
        list: async () => ({ items: [], total: 0 }),
        create: async (data: Record<string, unknown>) => data,
        update: async (_id: string, data: Record<string, unknown>) => data,
        delete: async () => {},
      },
    };

    const auth = createTestAuth({
      userStore,
      _entityProxy: mockProxy,
      onUserCreated: async (_payload, ctx) => {
        receivedEntities = ctx.entities;
      },
    });

    await auth.handler(
      new Request('http://localhost/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'test@example.com', password: 'password123' }),
      }),
    );

    expect(receivedEntities).toBe(mockProxy);
  });

  it('rolls back auth user when callback throws', async () => {
    const userStore = new InMemoryUserStore();

    const auth = createTestAuth({
      userStore,
      onUserCreated: async () => {
        throw new Error('Entity creation failed');
      },
    });

    const res = await auth.handler(
      new Request('http://localhost/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'test@example.com', password: 'password123' }),
      }),
    );

    // Should return error response with CALLBACK_FAILED constraint
    const body = await res.json();
    expect(body.error).toBeDefined();
    expect(body.error.code).toBe('AUTH_VALIDATION_ERROR');
    expect(body.error.field).toBe('general');
    expect(body.error.constraint).toBe('CALLBACK_FAILED');

    // User should be rolled back (deleted)
    const found = await userStore.findByEmail('test@example.com');
    expect(found).toBeNull();
  });

  it('works normally when onUserCreated is not provided', async () => {
    const userStore = new InMemoryUserStore();

    const auth = createTestAuth({
      userStore,
      // No onUserCreated
    });

    const res = await auth.handler(
      new Request('http://localhost/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'test@example.com', password: 'password123' }),
      }),
    );

    const body = await res.json();
    expect(body.user).toBeDefined();
    expect(body.user.email).toBe('test@example.com');

    const found = await userStore.findByEmail('test@example.com');
    expect(found).not.toBeNull();
  });

  it('signUpData excludes reserved fields (role, id, etc.)', async () => {
    const userStore = new InMemoryUserStore();
    let callbackPayload: OnUserCreatedPayload | null = null;

    const auth = createTestAuth({
      userStore,
      onUserCreated: async (payload) => {
        callbackPayload = payload;
      },
    });

    await auth.handler(
      new Request('http://localhost/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'test@example.com',
          password: 'password123',
          name: 'Test',
          role: 'admin',
          id: 'evil-id',
        }),
      }),
    );

    expect(callbackPayload).not.toBeNull();
    const payload = callbackPayload as Extract<OnUserCreatedPayload, { provider: null }>;
    // Reserved fields should NOT be in signUpData
    expect(payload.signUpData).not.toHaveProperty('role');
    expect(payload.signUpData).not.toHaveProperty('id');
    // Normal extra fields should be present
    expect(payload.signUpData.name).toBe('Test');
  });
});

describe('onUserCreated — ctx.roles', () => {
  const accessDef = defineAccess({
    entities: {
      workspace: { roles: ['owner', 'member'] },
    },
    entitlements: {
      'workspace:read': { roles: ['owner', 'member'] },
    },
  });

  it('provides ctx.roles.assign when auth.access is configured', async () => {
    const userStore = new InMemoryUserStore();
    const roleStore = new InMemoryRoleAssignmentStore();
    const closureStore = new InMemoryClosureStore();
    let receivedCtx: AuthCallbackContext | null = null;

    const auth = createTestAuth({
      userStore,
      access: { definition: accessDef, roleStore, closureStore },
      onUserCreated: async (_payload, ctx) => {
        receivedCtx = ctx;
      },
    });

    await auth.handler(
      new Request('http://localhost/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'test@example.com', password: 'password123' }),
      }),
    );

    expect(receivedCtx).not.toBeNull();
    expect(receivedCtx!.roles).toBeDefined();
    expect(typeof receivedCtx!.roles.assign).toBe('function');
    expect(typeof receivedCtx!.roles.revoke).toBe('function');
  });

  it('ctx.roles.assign delegates to the role store', async () => {
    const userStore = new InMemoryUserStore();
    const roleStore = new InMemoryRoleAssignmentStore();
    const closureStore = new InMemoryClosureStore();
    let assignedUserId: string | null = null;

    const auth = createTestAuth({
      userStore,
      access: { definition: accessDef, roleStore, closureStore },
      onUserCreated: async (payload, ctx) => {
        assignedUserId = payload.user.id;
        await ctx.roles!.assign(payload.user.id, 'workspace', 'ws-1', 'member');
      },
    });

    await auth.handler(
      new Request('http://localhost/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'test@example.com', password: 'password123' }),
      }),
    );

    // The role assignment should be in the store
    expect(assignedUserId).not.toBeNull();
    const roles = await roleStore.getRoles(assignedUserId!, 'workspace', 'ws-1');
    expect(roles).toContain('member');
  });

  it('ctx.roles is undefined when auth.access is NOT configured', async () => {
    const userStore = new InMemoryUserStore();
    let receivedCtx: AuthCallbackContext | null = null;

    const auth = createTestAuth({
      userStore,
      // No access config
      onUserCreated: async (_payload, ctx) => {
        receivedCtx = ctx;
      },
    });

    await auth.handler(
      new Request('http://localhost/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'test@example.com', password: 'password123' }),
      }),
    );

    expect(receivedCtx).not.toBeNull();
    expect(receivedCtx!.roles).toBeUndefined();
  });
});
