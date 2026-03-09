import { describe, expect, it } from 'bun:test';
import type { AccessSet } from '../access-set';
import { InMemoryClosureStore } from '../closure-store';
import { defineAccess } from '../define-access';
import { createAuth } from '../index';
import { verifyJWT } from '../jwt';
import { InMemoryRoleAssignmentStore } from '../role-assignment-store';

const accessDef = defineAccess({
  hierarchy: ['Organization', 'Team'],
  roles: {
    Organization: ['owner', 'admin', 'member'],
    Team: ['lead', 'editor', 'viewer'],
  },
  inheritance: {
    Organization: { owner: 'lead', admin: 'editor', member: 'viewer' },
  },
  entitlements: {
    'project:create': { roles: ['admin', 'owner'] },
    'project:view': { roles: ['viewer', 'editor', 'lead', 'member'] },
    'app:use': { roles: [] },
  },
});

function createTestAuth(options?: {
  roleStore?: InMemoryRoleAssignmentStore;
  closureStore?: InMemoryClosureStore;
}) {
  const roleStore = options?.roleStore ?? new InMemoryRoleAssignmentStore();
  const closureStore = options?.closureStore ?? new InMemoryClosureStore();

  const auth = createAuth({
    session: { strategy: 'jwt', ttl: '60s' },
    emailPassword: { enabled: true },
    jwtSecret: 'test-secret-at-least-32-chars-long',
    access: {
      definition: accessDef,
      roleStore,
      closureStore,
    },
  });

  return { auth, roleStore, closureStore };
}

describe('JWT acl claim', () => {
  it('signUp with access config produces JWT with acl claim', async () => {
    const { auth, closureStore } = createTestAuth();
    await closureStore.addResource('Organization', 'org-1');

    const result = await auth.api.signUp({
      email: 'test@example.com',
      password: 'Password123!',
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const payload = await verifyJWT(
      result.data.tokens?.jwt ?? '',
      'test-secret-at-least-32-chars-long',
      'HS256',
    );
    expect(payload).not.toBeNull();
    expect(payload?.acl).toBeDefined();
  });

  it('signIn with access config produces JWT with acl claim', async () => {
    const { auth, roleStore, closureStore } = createTestAuth();
    await closureStore.addResource('Organization', 'org-1');

    // Create user first
    const signUpResult = await auth.api.signUp({
      email: 'test@example.com',
      password: 'Password123!',
    });
    expect(signUpResult.ok).toBe(true);
    if (!signUpResult.ok) return;

    // Assign role to the created user
    await roleStore.assign(signUpResult.data.user.id, 'Organization', 'org-1', 'admin');

    // Sign in
    const result = await auth.api.signIn({
      email: 'test@example.com',
      password: 'Password123!',
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const payload = await verifyJWT(
      result.data.tokens?.jwt ?? '',
      'test-secret-at-least-32-chars-long',
      'HS256',
    );
    expect(payload).not.toBeNull();
    expect(payload?.acl).toBeDefined();
    expect(payload?.acl?.hash).toBeTruthy();
  });

  it('acl.set contains full access set when within 2KB budget', async () => {
    const { auth } = createTestAuth();

    const result = await auth.api.signUp({
      email: 'test@example.com',
      password: 'Password123!',
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const payload = await verifyJWT(
      result.data.tokens?.jwt ?? '',
      'test-secret-at-least-32-chars-long',
      'HS256',
    );
    expect(payload?.acl?.set).toBeDefined();
    expect(payload?.acl?.overflow).toBe(false);
  });

  it('acl.hash is always present (SHA-256 of canonical JSON)', async () => {
    const { auth } = createTestAuth();

    const result = await auth.api.signUp({
      email: 'test@example.com',
      password: 'Password123!',
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const payload = await verifyJWT(
      result.data.tokens?.jwt ?? '',
      'test-secret-at-least-32-chars-long',
      'HS256',
    );
    expect(payload?.acl?.hash).toBeTruthy();
    expect(typeof payload?.acl?.hash).toBe('string');
    // SHA-256 hex is 64 chars
    expect(payload?.acl?.hash.length).toBe(64);
  });

  it('no acl claim when no access config', async () => {
    const auth = createAuth({
      session: { strategy: 'jwt', ttl: '60s' },
      emailPassword: { enabled: true },
      jwtSecret: 'test-secret-at-least-32-chars-long',
    });

    const result = await auth.api.signUp({
      email: 'test@example.com',
      password: 'Password123!',
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const payload = await verifyJWT(
      result.data.tokens?.jwt ?? '',
      'test-secret-at-least-32-chars-long',
      'HS256',
    );
    expect(payload?.acl).toBeUndefined();
  });

  it('refresh recomputes acl from fresh user data', async () => {
    const { auth, roleStore, closureStore } = createTestAuth();
    await closureStore.addResource('Organization', 'org-1');

    // Sign up (no roles yet)
    const signUpResult = await auth.api.signUp({
      email: 'test@example.com',
      password: 'Password123!',
    });
    expect(signUpResult.ok).toBe(true);
    if (!signUpResult.ok) return;

    const userId = signUpResult.data.user.id;
    const tokens = signUpResult.data.tokens;
    expect(tokens).toBeDefined();

    // Verify initial acl has no roles
    const initialPayload = await verifyJWT(
      tokens?.jwt ?? '',
      'test-secret-at-least-32-chars-long',
      'HS256',
    );
    expect(initialPayload?.acl?.set?.entitlements['project:create']?.allowed).toBeFalsy();

    // Assign admin role
    await roleStore.assign(userId, 'Organization', 'org-1', 'admin');

    // Refresh session
    const headers = new Headers();
    headers.set('Cookie', `vertz.sid=${tokens?.jwt}; vertz.ref=${tokens?.refreshToken}`);
    const refreshResult = await auth.api.refreshSession({ headers });
    expect(refreshResult.ok).toBe(true);
    if (!refreshResult.ok) return;

    // Verify refreshed acl has the new role
    const refreshedPayload = await verifyJWT(
      refreshResult.data.tokens?.jwt ?? '',
      'test-secret-at-least-32-chars-long',
      'HS256',
    );
    expect(refreshedPayload?.acl?.set?.entitlements['project:create']?.allowed).toBe(true);
  });

  it('GET /api/auth/access-set returns full access set for authenticated user', async () => {
    const { auth, roleStore, closureStore } = createTestAuth();
    await closureStore.addResource('Organization', 'org-1');

    const signUpResult = await auth.api.signUp({
      email: 'test@example.com',
      password: 'Password123!',
    });
    expect(signUpResult.ok).toBe(true);
    if (!signUpResult.ok) return;

    await roleStore.assign(signUpResult.data.user.id, 'Organization', 'org-1', 'admin');
    const tokens = signUpResult.data.tokens;
    expect(tokens).toBeDefined();

    const request = new Request('http://localhost/api/auth/access-set', {
      headers: { Cookie: `vertz.sid=${tokens?.jwt}` },
    });
    const response = await auth.handler(request);

    expect(response.status).toBe(200);
    const body = (await response.json()) as { accessSet: AccessSet };
    expect(body.accessSet).toBeDefined();
    expect(body.accessSet.entitlements['project:create'].allowed).toBe(true);
  });

  it('GET /api/auth/access-set returns 304 when ETag matches hash', async () => {
    const { auth, roleStore, closureStore } = createTestAuth();
    await closureStore.addResource('Organization', 'org-1');

    const signUpResult = await auth.api.signUp({
      email: 'test@example.com',
      password: 'Password123!',
    });
    expect(signUpResult.ok).toBe(true);
    if (!signUpResult.ok) return;

    await roleStore.assign(signUpResult.data.user.id, 'Organization', 'org-1', 'admin');
    const tokens = signUpResult.data.tokens;
    expect(tokens).toBeDefined();

    // First request to get the ETag
    const firstRequest = new Request('http://localhost/api/auth/access-set', {
      headers: { Cookie: `vertz.sid=${tokens?.jwt}` },
    });
    const firstResponse = await auth.handler(firstRequest);
    const etag = firstResponse.headers.get('ETag');
    expect(etag).toBeTruthy();
    // ETag must be RFC 7232 compliant (quoted string)
    expect(etag).toMatch(/^"[a-f0-9]+"$/);

    // Second request with matching ETag
    const secondRequest = new Request('http://localhost/api/auth/access-set', {
      headers: {
        Cookie: `vertz.sid=${tokens?.jwt}`,
        'If-None-Match': etag ?? '',
      },
    });
    const secondResponse = await auth.handler(secondRequest);
    expect(secondResponse.status).toBe(304);
  });

  it('GET /api/auth/access-set returns 401 for unauthenticated request', async () => {
    const { auth } = createTestAuth();

    const request = new Request('http://localhost/api/auth/access-set');
    const response = await auth.handler(request);

    expect(response.status).toBe(401);
  });

  it('acl.overflow is true when access set exceeds 2KB', async () => {
    // Create access config with many entitlements to exceed 2KB budget
    const manyEntitlements: Record<string, { roles: string[] }> = {};
    for (let i = 0; i < 200; i++) {
      manyEntitlements[`entitlement:${i}:with-long-name-to-inflate-size`] = {
        roles: ['admin'],
      };
    }

    const overflowAccessDef = defineAccess({
      hierarchy: ['Organization'],
      roles: { Organization: ['owner', 'admin', 'member'] },
      inheritance: {},
      entitlements: manyEntitlements,
    });

    const roleStore = new InMemoryRoleAssignmentStore();
    const closureStore = new InMemoryClosureStore();
    await closureStore.addResource('Organization', 'org-1');

    const auth = createAuth({
      session: { strategy: 'jwt', ttl: '60s' },
      emailPassword: { enabled: true },
      jwtSecret: 'test-secret-at-least-32-chars-long',
      access: {
        definition: overflowAccessDef,
        roleStore,
        closureStore,
      },
    });

    const result = await auth.api.signUp({
      email: 'overflow-test@example.com',
      password: 'Password123!',
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const payload = await verifyJWT(
      result.data.tokens?.jwt ?? '',
      'test-secret-at-least-32-chars-long',
      'HS256',
    );
    expect(payload).not.toBeNull();
    expect(payload?.acl?.overflow).toBe(true);
    expect(payload?.acl?.set).toBeUndefined();
    expect(payload?.acl?.hash).toBeTruthy();
  });

  it('acl claim is present alongside other custom claims', async () => {
    // When both access config and custom claims are configured,
    // verify the acl claim coexists without clobbering
    const roleStore = new InMemoryRoleAssignmentStore();
    const closureStore = new InMemoryClosureStore();
    await closureStore.addResource('Organization', 'org-1');

    const auth = createAuth({
      session: { strategy: 'jwt', ttl: '60s' },
      emailPassword: { enabled: true },
      jwtSecret: 'test-secret-at-least-32-chars-long',
      claims: (user) => ({ customField: `hello-${user.email}` }),
      access: {
        definition: accessDef,
        roleStore,
        closureStore,
      },
    });

    const result = await auth.api.signUp({
      email: 'coexist-test@example.com',
      password: 'Password123!',
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const payload = await verifyJWT(
      result.data.tokens?.jwt ?? '',
      'test-secret-at-least-32-chars-long',
      'HS256',
    );
    expect(payload).not.toBeNull();
    // Both acl and custom claims present
    expect(payload?.acl).toBeDefined();
    expect(payload?.acl?.hash).toBeTruthy();
    expect(payload?.customField).toBe('hello-coexist-test@example.com');
  });
});
