/**
 * Entitlement-based access control E2E tests for the Linear clone.
 *
 * Validates that rules.entitlement() in entity access rules are properly
 * enforced via the CRUD pipeline + AccessContext wiring.
 *
 * Uses a real SQLite database, defineAccess, and the framework's role store
 * to verify entitlement evaluation end-to-end.
 */

import { afterEach, beforeEach, describe, expect, it } from '@vertz/test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createDb } from '@vertz/db';
import {
  type AuthDbClient,
  authModels,
  createMiddleware,
  createServer,
  DbClosureStore,
  DbRoleAssignmentStore,
  defineAccess,
  entity,
  rules,
} from '@vertz/server';
import { projectsModel, usersModel, workspacesModel } from './schema';

// ---------------------------------------------------------------------------
// Access definition — same as the production access.ts
// ---------------------------------------------------------------------------

const access = defineAccess({
  entities: {
    workspace: {
      roles: ['owner', 'admin', 'member'],
    },
    project: {
      roles: ['lead', 'member'],
      inherits: {
        'workspace:owner': 'lead',
        'workspace:admin': 'lead',
        'workspace:member': 'member',
      },
    },
  },
  entitlements: {
    'workspace:read': { roles: ['owner', 'admin', 'member'] },
    'workspace:manage': { roles: ['owner', 'admin'] },
    'workspace:create-project': { roles: ['owner', 'admin', 'member'] },
    'workspace:delete-project': { roles: ['owner', 'admin'] },
    'project:read': { roles: ['lead', 'member'] },
    'project:update': { roles: ['lead'] },
  },
});

// ---------------------------------------------------------------------------
// Fake auth middleware — sets userId and tenantId from headers
// ---------------------------------------------------------------------------

const authMiddleware = createMiddleware({
  name: 'test-auth',
  handler: (ctx): Record<string, unknown> => {
    const headers = ctx.headers as Record<string, string | undefined>;
    return {
      userId: headers['x-user-id'] ?? null,
      tenantId: headers['x-tenant-id'] ?? null,
      roles: [],
    };
  },
});

// ---------------------------------------------------------------------------
// Entities — same access rules as production
// ---------------------------------------------------------------------------

const projectsEntity = entity('projects', {
  model: projectsModel,
  access: {
    list: rules.entitlement('project:read'),
    get: rules.entitlement('project:read'),
    create: rules.entitlement('workspace:create-project'),
    update: rules.entitlement('project:update'),
    delete: rules.entitlement('workspace:delete-project'),
  },
});

const usersEntity = entity('users', {
  model: usersModel,
  access: {
    list: rules.authenticated(),
    get: rules.authenticated(),
    create: rules.public,
    update: rules.all(rules.authenticated(), rules.where({ id: rules.user.id })),
    delete: rules.all(rules.authenticated(), rules.where({ id: rules.user.id })),
  },
});

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function req(
  app: ReturnType<typeof createServer>,
  method: string,
  path: string,
  options?: {
    body?: Record<string, unknown>;
    userId?: string;
    tenantId?: string;
  },
): Promise<Response> {
  const init: RequestInit = { method, headers: {} as Record<string, string> };
  const headers = init.headers as Record<string, string>;
  if (options?.body) {
    headers['content-type'] = 'application/json';
    init.body = JSON.stringify(options.body);
  }
  if (options?.userId) headers['x-user-id'] = options.userId;
  if (options?.tenantId) headers['x-tenant-id'] = options.tenantId;
  return app.handler(new Request(`http://localhost${path}`, init));
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Entitlement-based access control', () => {
  let tmpDir: string;
  let app: ReturnType<typeof createServer>;
  let roleStore: DbRoleAssignmentStore;
  let closureStore: DbClosureStore;

  beforeEach(async () => {
    tmpDir = mkdtempSync(join(tmpdir(), 'entitlement-test-'));
    const dbPath = join(tmpDir, 'test.db');

    const db = createDb({
      models: {
        ...authModels,
        workspaces: workspacesModel,
        users: usersModel,
        projects: projectsModel,
      },
      dialect: 'sqlite',
      path: dbPath,
      migrations: { autoApply: true },
    });

    const authDb = db as unknown as AuthDbClient;
    roleStore = new DbRoleAssignmentStore(authDb);
    closureStore = new DbClosureStore(authDb);

    // Trigger migration
    await db.workspaces.count();

    // Seed workspace
    await db.workspaces.create({ data: { id: 'ws-1', name: 'Test Workspace' } });

    // Seed users
    await db.users.create({ data: { id: 'user-owner', name: 'Owner', email: 'owner@test.com' } });
    await db.users.create({
      data: { id: 'user-member', name: 'Member', email: 'member@test.com' },
    });

    // Seed a project
    await db.projects.create({
      data: {
        id: 'proj-1',
        workspaceId: 'ws-1',
        name: 'Existing Project',
        key: 'EP',
        createdBy: 'user-owner',
      },
    });

    // Register closure hierarchy: workspace → project
    await closureStore.addResource('workspace', 'ws-1');
    await closureStore.addResource('project', 'proj-1', {
      parentType: 'workspace',
      parentId: 'ws-1',
    });

    // Create the server with access config
    app = createServer({
      basePath: '/api',
      entities: [usersEntity, projectsEntity],
      db,
      auth: {
        session: { strategy: 'jwt', ttl: '15m', refreshTtl: '7d' },
        access: {
          definition: access,
          roleStore,
          closureStore,
        },
      },
    });

    // Apply fake auth middleware
    app.middlewares([authMiddleware]);
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('Given a user with "member" role on workspace', () => {
    beforeEach(async () => {
      await roleStore.assign('user-member', 'workspace', 'ws-1', 'member');
    });

    describe('When creating a project (entitlement: workspace:create-project)', () => {
      it('Then succeeds because member role grants workspace:create-project', async () => {
        const res = await req(app, 'POST', '/api/projects', {
          userId: 'user-member',
          tenantId: 'ws-1',
          body: { name: 'New Project', key: 'NP', workspaceId: 'ws-1' },
        });
        expect(res.status).toBe(201);
        const body = (await res.json()) as { name?: string };
        expect(body.name).toBe('New Project');
      });
    });

    describe('When listing projects (entitlement: project:read)', () => {
      it('Then succeeds because member role grants project:read', async () => {
        const res = await req(app, 'GET', '/api/projects', {
          userId: 'user-member',
          tenantId: 'ws-1',
        });
        if (res.status !== 200) {
          console.log('LIST RESPONSE:', res.status, await res.clone().text());
        }
        expect(res.status).toBe(200);
      });
    });

    describe('When deleting a project (entitlement: workspace:delete-project)', () => {
      it('Then returns 403 because member role does NOT grant workspace:delete-project', async () => {
        const res = await req(app, 'DELETE', '/api/projects/proj-1', {
          userId: 'user-member',
          tenantId: 'ws-1',
        });
        expect(res.status).toBe(403);
      });
    });

    describe('When updating a project (entitlement: project:update)', () => {
      it('Then returns 403 because member inherits project:member, not lead', async () => {
        const res = await req(app, 'PATCH', '/api/projects/proj-1', {
          userId: 'user-member',
          tenantId: 'ws-1',
          body: { name: 'Updated Name' },
        });
        expect(res.status).toBe(403);
      });
    });
  });

  describe('Given a user with "owner" role on workspace', () => {
    beforeEach(async () => {
      await roleStore.assign('user-owner', 'workspace', 'ws-1', 'owner');
    });

    describe('When creating a project (entitlement: workspace:create-project)', () => {
      it('Then succeeds because owner role grants workspace:create-project', async () => {
        const res = await req(app, 'POST', '/api/projects', {
          userId: 'user-owner',
          tenantId: 'ws-1',
          body: { name: 'Owner Project', key: 'OP', workspaceId: 'ws-1' },
        });
        expect(res.status).toBe(201);
      });
    });

    describe('When deleting a project (entitlement: workspace:delete-project)', () => {
      it('Then succeeds because owner role grants workspace:delete-project', async () => {
        const res = await req(app, 'DELETE', '/api/projects/proj-1', {
          userId: 'user-owner',
          tenantId: 'ws-1',
        });
        expect(res.status).toBe(204);
      });
    });

    describe('When updating a project (entitlement: project:update)', () => {
      it('Then succeeds because owner inherits project:lead which grants project:update', async () => {
        const res = await req(app, 'PATCH', '/api/projects/proj-1', {
          userId: 'user-owner',
          tenantId: 'ws-1',
          body: { name: 'Updated Name' },
        });
        expect(res.status).toBe(200);
      });
    });
  });

  describe('Given a user with "admin" role on workspace', () => {
    beforeEach(async () => {
      await roleStore.assign('user-owner', 'workspace', 'ws-1', 'admin');
    });

    describe('When deleting a project (entitlement: workspace:delete-project)', () => {
      it('Then succeeds because admin role grants workspace:delete-project', async () => {
        const res = await req(app, 'DELETE', '/api/projects/proj-1', {
          userId: 'user-owner',
          tenantId: 'ws-1',
        });
        expect(res.status).toBe(204);
      });
    });
  });

  describe('Given a user with no role on workspace', () => {
    describe('When listing projects (entitlement: project:read)', () => {
      it('Then returns 403 because no role means no entitlements', async () => {
        const res = await req(app, 'GET', '/api/projects', {
          userId: 'user-member',
          tenantId: 'ws-1',
        });
        expect(res.status).toBe(403);
      });
    });

    describe('When creating a project', () => {
      it('Then returns 403', async () => {
        const res = await req(app, 'POST', '/api/projects', {
          userId: 'user-member',
          tenantId: 'ws-1',
          body: { name: 'Unauthorized', key: 'UA', workspaceId: 'ws-1' },
        });
        expect(res.status).toBe(403);
      });
    });
  });

  describe('Given an unauthenticated request', () => {
    describe('When listing projects', () => {
      it('Then returns 403', async () => {
        const res = await req(app, 'GET', '/api/projects', {});
        expect(res.status).toBe(403);
      });
    });
  });

  describe('Role inheritance — workspace roles inherit project roles', () => {
    it('workspace:owner inherits project:lead → can update projects', async () => {
      await roleStore.assign('user-owner', 'workspace', 'ws-1', 'owner');
      const res = await req(app, 'PATCH', '/api/projects/proj-1', {
        userId: 'user-owner',
        tenantId: 'ws-1',
        body: { name: 'Updated' },
      });
      // owner → lead → project:update allowed
      expect(res.status).toBe(200);
    });

    it('workspace:member inherits project:member → cannot update projects', async () => {
      await roleStore.assign('user-member', 'workspace', 'ws-1', 'member');
      const res = await req(app, 'PATCH', '/api/projects/proj-1', {
        userId: 'user-member',
        tenantId: 'ws-1',
        body: { name: 'Updated' },
      });
      // member → member → project:update NOT granted (only lead)
      expect(res.status).toBe(403);
    });

    it('workspace:admin inherits project:lead → can update projects', async () => {
      await roleStore.assign('user-owner', 'workspace', 'ws-1', 'admin');
      const res = await req(app, 'PATCH', '/api/projects/proj-1', {
        userId: 'user-owner',
        tenantId: 'ws-1',
        body: { name: 'Updated' },
      });
      // admin → lead → project:update allowed
      expect(res.status).toBe(200);
    });
  });
});
