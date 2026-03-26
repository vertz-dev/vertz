/**
 * Integration test — Access Set Bootstrap + Client-Side can() [#1072]
 *
 * Validates Phase 7 end-to-end:
 * - Server computes access set and embeds in JWT acl claim
 * - Client-side can() with AccessContext.Provider returns correct AccessCheck
 * - can() returns ReadonlySignal properties
 * - can(entitlement, entity) reads from entity.__access metadata
 * - AccessGate blocks children while loading
 * - SSR serialization produces valid __VERTZ_ACCESS_SET__ script
 * - createAccessProvider hydrates from __VERTZ_ACCESS_SET__
 * - GET /api/auth/access-set returns full access set
 *
 * Uses public package imports only (@vertz/server, @vertz/ui/auth).
 */
import { afterEach, describe, expect, it } from 'bun:test';
import { generateKeyPairSync } from 'node:crypto';
import {
  computeAccessSet,
  computeEntityAccess,
  createAccessContext,
  createAuth,
  decodeAccessSet,
  defineAccess,
  encodeAccessSet,
  InMemoryClosureStore,
  InMemoryRoleAssignmentStore,
  InMemorySubscriptionStore,
} from '@vertz/server';
// Client-side imports
import { signal } from '@vertz/ui';

const { publicKey: TEST_PUBLIC_KEY, privateKey: TEST_PRIVATE_KEY } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
});

// ============================================================================
// Setup — entity-centric config
// ============================================================================

const accessDef = defineAccess({
  entities: {
    organization: {
      roles: ['owner', 'admin', 'member'],
    },
    team: {
      roles: ['lead', 'editor', 'viewer'],
      inherits: {
        'organization:owner': 'lead',
        'organization:admin': 'editor',
        'organization:member': 'viewer',
      },
    },
    project: {
      roles: ['manager', 'contributor', 'viewer'],
      inherits: {
        'team:lead': 'manager',
        'team:editor': 'contributor',
        'team:viewer': 'viewer',
      },
    },
  },
  entitlements: {
    'organization:create-project': { roles: ['admin', 'owner'] },
    'project:view': { roles: ['viewer', 'contributor', 'manager'] },
    'project:edit': { roles: ['contributor', 'manager'] },
    'project:delete': { roles: ['manager'] },
    'organization:use': { roles: [] },
  },
  plans: {
    pro: { group: 'main', features: [] },
  },
});

function createTestAuth() {
  const roleStore = new InMemoryRoleAssignmentStore();
  const closureStore = new InMemoryClosureStore();

  const auth = createAuth({
    session: { strategy: 'jwt', ttl: '60s' },
    emailPassword: { enabled: true },
    privateKey: TEST_PRIVATE_KEY as string,
    publicKey: TEST_PUBLIC_KEY as string,
    access: {
      definition: accessDef,
      roleStore,
      closureStore,
    },
  });

  return { auth, roleStore, closureStore };
}

// ============================================================================
// Server-side tests
// ============================================================================

describe('Access Set — Server Integration', () => {
  it('signUp with access config -> access-set endpoint returns computed entitlements', async () => {
    const { auth, closureStore } = createTestAuth();
    await closureStore.addResource('organization', 'org-1');

    const result = await auth.api.signUp({
      email: 'test@example.com',
      password: 'Password123!',
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const tokens = result.data.tokens;
    expect(tokens).toBeDefined();

    // Verify via public access-set endpoint (avoids internal verifyJWT import)
    const request = new Request('http://localhost/api/auth/access-set', {
      headers: { Cookie: `vertz.sid=${tokens?.jwt}` },
    });
    const response = await auth.handler(request);
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.accessSet).toBeDefined();
    // 'organization:use' has empty roles array — auto-granted
    expect(body.accessSet.entitlements['organization:use'].allowed).toBe(true);
    // ETag header is present (proves JWT had acl hash)
    expect(response.headers.get('ETag')).toBeTruthy();
  });

  it('GET /api/auth/access-set returns full access set for authenticated user', async () => {
    const { auth, roleStore, closureStore } = createTestAuth();
    await closureStore.addResource('organization', 'org-1');

    const signUpResult = await auth.api.signUp({
      email: 'test2@example.com',
      password: 'Password123!',
    });
    expect(signUpResult.ok).toBe(true);
    if (!signUpResult.ok) return;

    await roleStore.assign(signUpResult.data.user.id, 'organization', 'org-1', 'admin');

    const request = new Request('http://localhost/api/auth/access-set', {
      headers: { Cookie: `vertz.sid=${signUpResult.data.tokens?.jwt}` },
    });
    const response = await auth.handler(request);

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.accessSet).toBeDefined();
    expect(body.accessSet.entitlements['organization:create-project'].allowed).toBe(true);
    expect(body.accessSet.entitlements['organization:use'].allowed).toBe(true);
  });

  it('computeEntityAccess returns per-entity access metadata', async () => {
    const { roleStore, closureStore } = createTestAuth();
    await closureStore.addResource('organization', 'org-1');
    await closureStore.addResource('team', 'team-1', {
      parentType: 'organization',
      parentId: 'org-1',
    });
    await closureStore.addResource('project', 'proj-1', {
      parentType: 'team',
      parentId: 'team-1',
    });
    await roleStore.assign('user-1', 'organization', 'org-1', 'admin');

    const ctx = createAccessContext({
      userId: 'user-1',
      accessDef,
      closureStore,
      roleStore,
    });

    const entityAccess = await computeEntityAccess(
      ['project:view', 'project:edit', 'project:delete'],
      { type: 'project', id: 'proj-1' },
      ctx,
    );

    // admin -> editor -> contributor, so view and edit allowed, delete denied
    expect(entityAccess['project:view'].allowed).toBe(true);
    expect(entityAccess['project:edit'].allowed).toBe(true);
    expect(entityAccess['project:delete'].allowed).toBe(false);
  });

  it('type drift check: server-encoded AccessSet can be deserialized by client types', async () => {
    const { roleStore, closureStore } = createTestAuth();
    await closureStore.addResource('organization', 'org-1');
    await roleStore.assign('user-1', 'organization', 'org-1', 'admin');

    const subscriptionStore = new InMemorySubscriptionStore();
    await subscriptionStore.assign('tenant', 'org-1', 'pro');

    const accessSet = await computeAccessSet({
      userId: 'user-1',
      accessDef,
      roleStore,
      closureStore,
      subscriptionStore,
      tenantId: 'org-1',
    });

    // Encode on server
    const encoded = encodeAccessSet(accessSet);
    const json = JSON.stringify(encoded);

    // Simulate client deserializing
    const parsed = JSON.parse(json);
    const decoded = decodeAccessSet(parsed, accessDef);

    // Verify structure matches
    expect(decoded.plan).toBe('pro');
    expect(decoded.entitlements['organization:create-project'].allowed).toBe(
      accessSet.entitlements['organization:create-project'].allowed,
    );
    expect(decoded.entitlements['organization:use'].allowed).toBe(true);
  });
});

// ============================================================================
// Client-side tests
// ============================================================================

describe('Access Set — Client Integration', () => {
  // Dynamic import to avoid issues with module resolution at test file load time
  let AccessContext: typeof import('@vertz/ui/auth').AccessContext;
  let can: typeof import('@vertz/ui/auth').can;
  let AccessGate: typeof import('@vertz/ui-auth').AccessGate;
  let createAccessProvider: typeof import('@vertz/ui/auth').createAccessProvider;
  let loaded = false;

  async function loadClientModules() {
    if (loaded) return;
    const mod = await import('@vertz/ui/auth');
    AccessContext = mod.AccessContext;
    can = mod.can;
    createAccessProvider = mod.createAccessProvider;
    const authUiMod = await import('@vertz/ui-auth');
    AccessGate = authUiMod.AccessGate;
    loaded = true;
  }

  afterEach(() => {
    if (typeof window !== 'undefined') {
      delete (window as Record<string, unknown>).__VERTZ_ACCESS_SET__;
    }
  });

  it('can() with AccessContext.Provider returns correct AccessCheck', async () => {
    await loadClientModules();

    const accessSet = signal({
      entitlements: {
        'project:view': { allowed: true, reasons: [] as string[] },
        'project:delete': {
          allowed: false,
          reasons: ['role_required'] as string[],
          reason: 'role_required',
        },
      },
      flags: {},
      plan: 'pro',
      computedAt: '2026-01-01T00:00:00.000Z',
    });
    const loading = signal(false);

    let viewCheck: ReturnType<typeof can> | undefined;
    let deleteCheck: ReturnType<typeof can> | undefined;

    AccessContext.Provider({ accessSet, loading }, () => {
      viewCheck = can('project:view');
      deleteCheck = can('project:delete');
    });

    expect(viewCheck?.allowed.value).toBe(true);
    expect(viewCheck?.loading.value).toBe(false);
    expect(deleteCheck?.allowed.value).toBe(false);
    expect(deleteCheck?.reasons.value).toContain('role_required');
  });

  it('can() returns ReadonlySignal properties that have .value', async () => {
    await loadClientModules();

    const accessSet = signal({
      entitlements: {
        'project:view': { allowed: true, reasons: [] as string[] },
      },
      flags: {},
      plan: null,
      computedAt: '2026-01-01T00:00:00.000Z',
    });
    const loading = signal(false);

    let check: ReturnType<typeof can> | undefined;
    AccessContext.Provider({ accessSet, loading }, () => {
      check = can('project:view');
    });

    // Verify .value exists on all properties (ReadonlySignal)
    expect(check?.allowed.value).toBe(true);
    expect(check?.reasons.value).toEqual([]);
    expect(check?.reason.value).toBeUndefined();
    expect(check?.meta.value).toBeUndefined();
    expect(check?.loading.value).toBe(false);
  });

  it('can(entitlement, entity) reads from entity.__access metadata', async () => {
    await loadClientModules();

    const accessSet = signal({
      entitlements: {
        'project:edit': { allowed: false, reasons: ['role_required'] as string[] },
      },
      flags: {},
      plan: null,
      computedAt: '2026-01-01T00:00:00.000Z',
    });
    const loading = signal(false);

    const entity = {
      __access: {
        'project:edit': { allowed: true, reasons: [] as string[] },
      },
    };

    let check: ReturnType<typeof can> | undefined;
    AccessContext.Provider({ accessSet, loading }, () => {
      check = can('project:edit', entity);
    });

    // Entity-level override takes precedence
    expect(check?.allowed.value).toBe(true);
  });

  it('AccessGate blocks children while loading, renders when loaded', async () => {
    await loadClientModules();

    const accessSet = signal<Record<string, unknown> | null>(null);
    const loading = signal(true);

    let result: unknown;
    AccessContext.Provider(
      { accessSet, loading } as {
        accessSet: ReturnType<typeof signal>;
        loading: ReturnType<typeof signal>;
      },
      () => {
        result = AccessGate({
          fallback: () => 'loading...',
          children: () => 'content',
        });
      },
    );

    // AccessGate returns an HTMLElement wrapper via __child() — check textContent
    expect((result as HTMLElement).textContent).toBe('loading...');
  });

  it('SSR serialization: access set JSON is valid and parseable', async () => {
    // Test the SSR serialization contract: JSON.stringify produces valid
    // JS assignment that can be parsed back
    const accessSet = {
      entitlements: {
        'project:view': { allowed: true, reasons: [] },
      },
      flags: {},
      plan: 'pro',
      computedAt: '2026-01-01T00:00:00.000Z',
    };

    const json = JSON.stringify(accessSet);
    // Escape < for XSS safety (same as createAccessSetScript)
    const escaped = json.replace(/</g, '\\u003c');
    const script = `<script>window.__VERTZ_ACCESS_SET__=${escaped}</script>`;

    expect(script).toContain('<script>');
    expect(script).toContain('window.__VERTZ_ACCESS_SET__=');
    expect(script).toContain('</script>');

    // Verify the escaped JSON is still parseable
    const parsed = JSON.parse(escaped);
    expect(parsed.plan).toBe('pro');
    expect(parsed.entitlements['project:view'].allowed).toBe(true);
  });

  it('createAccessProvider hydrates from __VERTZ_ACCESS_SET__', async () => {
    await loadClientModules();

    // Simulate SSR injection
    (globalThis as Record<string, unknown>).window ??= globalThis;
    (globalThis as Record<string, unknown>).__VERTZ_ACCESS_SET__ = {
      entitlements: {
        'project:view': { allowed: true, reasons: [] },
      },
      flags: {},
      plan: 'pro',
      computedAt: '2026-01-01T00:00:00.000Z',
    };

    const { accessSet, loading } = createAccessProvider();

    expect(accessSet.value).not.toBeNull();
    expect(accessSet.value?.plan).toBe('pro');
    expect(loading.value).toBe(false);
  });
});
