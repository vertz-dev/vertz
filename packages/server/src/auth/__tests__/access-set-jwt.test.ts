import { describe, expect, it } from '@vertz/test';
import { createPrivateKey, createPublicKey } from 'node:crypto';
import type { AccessSet } from '../access-set';
import { InMemoryClosureStore } from '../closure-store';
import { defineAccess } from '../define-access';
import { createAuth } from '../index';
import { verifyJWT } from '../jwt';
import { InMemoryRoleAssignmentStore } from '../role-assignment-store';
import { TEST_PRIVATE_KEY, TEST_PUBLIC_KEY } from './test-keys';

const accessDef = defineAccess({
  entities: {
    organization: { roles: ['owner', 'admin', 'member'] },
    team: {
      roles: ['lead', 'editor', 'viewer'],
      inherits: {
        'organization:owner': 'lead',
        'organization:admin': 'editor',
        'organization:member': 'viewer',
      },
    },
  },
  entitlements: {
    'organization:create-project': { roles: ['admin', 'owner'] },
    'team:view': { roles: ['viewer', 'editor', 'lead'] },
    'organization:use': { roles: [] },
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
    privateKey: TEST_PRIVATE_KEY,
    publicKey: TEST_PUBLIC_KEY,
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
    await closureStore.addResource('organization', 'org-1');

    const result = await auth.api.signUp({
      email: 'test@example.com',
      password: 'Password123!',
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const payload = await verifyJWT(
      result.data.tokens?.jwt ?? '',
      createPublicKey(TEST_PUBLIC_KEY),
    );
    expect(payload).not.toBeNull();
    expect(payload?.acl).toBeDefined();
  });

  it('signIn with access config produces JWT with acl claim', async () => {
    const { auth, roleStore, closureStore } = createTestAuth();
    await closureStore.addResource('organization', 'org-1');

    const signUpResult = await auth.api.signUp({
      email: 'test@example.com',
      password: 'Password123!',
    });
    expect(signUpResult.ok).toBe(true);
    if (!signUpResult.ok) return;

    await roleStore.assign(signUpResult.data.user.id, 'organization', 'org-1', 'admin');

    const result = await auth.api.signIn({
      email: 'test@example.com',
      password: 'Password123!',
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const payload = await verifyJWT(
      result.data.tokens?.jwt ?? '',
      createPublicKey(TEST_PUBLIC_KEY),
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
      createPublicKey(TEST_PUBLIC_KEY),
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
      createPublicKey(TEST_PUBLIC_KEY),
    );
    expect(payload?.acl?.hash).toBeTruthy();
    expect(typeof payload?.acl?.hash).toBe('string');
    expect(payload?.acl?.hash.length).toBe(64);
  });

  it('no acl claim when no access config', async () => {
    const auth = createAuth({
      session: { strategy: 'jwt', ttl: '60s' },
      emailPassword: { enabled: true },
      privateKey: TEST_PRIVATE_KEY,
      publicKey: TEST_PUBLIC_KEY,
    });

    const result = await auth.api.signUp({
      email: 'test@example.com',
      password: 'Password123!',
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const payload = await verifyJWT(
      result.data.tokens?.jwt ?? '',
      createPublicKey(TEST_PUBLIC_KEY),
    );
    expect(payload?.acl).toBeUndefined();
  });

  it('refresh recomputes acl from fresh user data', async () => {
    const { auth, roleStore, closureStore } = createTestAuth();
    await closureStore.addResource('organization', 'org-1');

    const signUpResult = await auth.api.signUp({
      email: 'test@example.com',
      password: 'Password123!',
    });
    expect(signUpResult.ok).toBe(true);
    if (!signUpResult.ok) return;

    const userId = signUpResult.data.user.id;
    const tokens = signUpResult.data.tokens;
    expect(tokens).toBeDefined();

    const initialPayload = await verifyJWT(tokens?.jwt ?? '', createPublicKey(TEST_PUBLIC_KEY));
    expect(
      initialPayload?.acl?.set?.entitlements['organization:create-project']?.allowed,
    ).toBeFalsy();

    await roleStore.assign(userId, 'organization', 'org-1', 'admin');

    const headers = new Headers();
    headers.set('Cookie', `vertz.sid=${tokens?.jwt}; vertz.ref=${tokens?.refreshToken}`);
    const refreshResult = await auth.api.refreshSession({ headers });
    expect(refreshResult.ok).toBe(true);
    if (!refreshResult.ok) return;

    const refreshedPayload = await verifyJWT(
      refreshResult.data.tokens?.jwt ?? '',
      createPublicKey(TEST_PUBLIC_KEY),
    );
    expect(refreshedPayload?.acl?.set?.entitlements['organization:create-project']?.allowed).toBe(
      true,
    );
  });

  it('GET /api/auth/access-set returns full access set for authenticated user', async () => {
    const { auth, roleStore, closureStore } = createTestAuth();
    await closureStore.addResource('organization', 'org-1');

    const signUpResult = await auth.api.signUp({
      email: 'test@example.com',
      password: 'Password123!',
    });
    expect(signUpResult.ok).toBe(true);
    if (!signUpResult.ok) return;

    await roleStore.assign(signUpResult.data.user.id, 'organization', 'org-1', 'admin');
    const tokens = signUpResult.data.tokens;
    expect(tokens).toBeDefined();

    const request = new Request('http://localhost/api/auth/access-set', {
      headers: { Cookie: `vertz.sid=${tokens?.jwt}` },
    });
    const response = await auth.handler(request);

    expect(response.status).toBe(200);
    const body = (await response.json()) as { accessSet: AccessSet };
    expect(body.accessSet).toBeDefined();
    expect(body.accessSet.entitlements['organization:create-project'].allowed).toBe(true);
  });

  it('GET /api/auth/access-set returns 304 when ETag matches hash', async () => {
    const { auth, roleStore, closureStore } = createTestAuth();
    await closureStore.addResource('organization', 'org-1');

    const signUpResult = await auth.api.signUp({
      email: 'test@example.com',
      password: 'Password123!',
    });
    expect(signUpResult.ok).toBe(true);
    if (!signUpResult.ok) return;

    await roleStore.assign(signUpResult.data.user.id, 'organization', 'org-1', 'admin');
    const tokens = signUpResult.data.tokens;
    expect(tokens).toBeDefined();

    const firstRequest = new Request('http://localhost/api/auth/access-set', {
      headers: { Cookie: `vertz.sid=${tokens?.jwt}` },
    });
    const firstResponse = await auth.handler(firstRequest);
    const etag = firstResponse.headers.get('ETag');
    expect(etag).toBeTruthy();
    expect(etag).toMatch(/^"[a-f0-9]+"$/);

    const secondRequest = new Request('http://localhost/api/auth/access-set', {
      headers: {
        Cookie: `vertz.sid=${tokens?.jwt}`,
        'If-None-Match': etag ?? '',
      },
    });
    const secondResponse = await auth.handler(secondRequest);
    expect(secondResponse.status).toBe(304);
  });

  it('GET /api/auth/access-set is private and varies on cookies', async () => {
    const { auth } = createTestAuth();

    const signUpResult = await auth.api.signUp({
      email: 'cache-headers@example.com',
      password: 'Password123!',
    });
    expect(signUpResult.ok).toBe(true);
    if (!signUpResult.ok) return;

    const response = await auth.handler(
      new Request('http://localhost/api/auth/access-set', {
        headers: { Cookie: `vertz.sid=${signUpResult.data.tokens?.jwt}` },
      }),
    );

    expect(response.headers.get('Cache-Control')).toBe('private, no-cache');
    expect(response.headers.get('Vary')).toBe('Cookie');
  });

  it('GET /api/auth/access-set returns 401 for unauthenticated request', async () => {
    const { auth } = createTestAuth();

    const request = new Request('http://localhost/api/auth/access-set');
    const response = await auth.handler(request);

    expect(response.status).toBe(401);
  });

  it('acl.overflow is true when access set exceeds 2KB', async () => {
    const manyEntitlements: Record<string, { roles: string[] }> = {};
    for (let i = 0; i < 200; i++) {
      manyEntitlements[`organization:${i}-with-long-name-to-inflate-size`] = {
        roles: ['admin'],
      };
    }

    const overflowAccessDef = defineAccess({
      entities: {
        organization: { roles: ['owner', 'admin', 'member'] },
      },
      entitlements: manyEntitlements,
    });

    const roleStore = new InMemoryRoleAssignmentStore();
    const closureStore = new InMemoryClosureStore();
    await closureStore.addResource('organization', 'org-1');

    const auth = createAuth({
      session: { strategy: 'jwt', ttl: '60s' },
      emailPassword: { enabled: true },
      privateKey: TEST_PRIVATE_KEY,
      publicKey: TEST_PUBLIC_KEY,
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
      createPublicKey(TEST_PUBLIC_KEY),
    );
    expect(payload).not.toBeNull();
    expect(payload?.acl?.overflow).toBe(true);
    expect(payload?.acl?.set).toBeUndefined();
    expect(payload?.acl?.hash).toBeTruthy();
  });

  it('acl claim is present alongside other custom claims', async () => {
    const roleStore = new InMemoryRoleAssignmentStore();
    const closureStore = new InMemoryClosureStore();
    await closureStore.addResource('organization', 'org-1');

    const auth = createAuth({
      session: { strategy: 'jwt', ttl: '60s' },
      emailPassword: { enabled: true },
      privateKey: TEST_PRIVATE_KEY,
      publicKey: TEST_PUBLIC_KEY,
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
      createPublicKey(TEST_PUBLIC_KEY),
    );
    expect(payload).not.toBeNull();
    expect(payload?.acl).toBeDefined();
    expect(payload?.acl?.hash).toBeTruthy();
    expect(payload?.customField).toBe('hello-coexist-test@example.com');
  });
});
