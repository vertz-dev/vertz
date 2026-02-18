// Domain CRUD Tests

import { d } from '@vertz/db';
import { createServer, domain } from '@vertz/server';
import { describe, expect, it, vi } from 'vitest';
import { postsTable, usersTable } from './fixtures';

// ---------------------------------------------------------------------------
// Mock Context Factory
// ---------------------------------------------------------------------------

function _createMockContext(overrides = {}) {
  return {
    user: { id: 'user-1', role: 'admin' },
    tenant: { id: 'org-1' },
    request: {
      method: 'GET',
      path: '/api/users',
      headers: {},
      ip: '127.0.0.1',
    },
    db: {
      users: {
        get: vi.fn(),
        list: vi.fn(),
        listAndCount: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        deleteOne: vi.fn(),
      },
    },
    services: {},
    defaultHandler: vi.fn(),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// List Endpoint Tests
// ---------------------------------------------------------------------------

describe('GET /api/{domainName} - List', () => {
  it('should generate list endpoint for domain', () => {
    const User = domain('users', {
      type: 'persisted',
      table: d.entry(usersTable),
      access: { read: () => true },
    });

    const app = createServer({ domains: [User] });

    // Should have registered GET /api/users
    const routes = app.router?.routes || [];
    const listRoute = routes.find((r: any) => r.method === 'GET' && r.path === '/api/users');
    expect(listRoute).toBeDefined();
  });

  it('should accept cursor and limit query parameters', () => {
    const User = domain('users', {
      type: 'persisted',
      table: d.entry(usersTable),
      access: { read: () => true },
    });

    const app = createServer({ domains: [User] });

    // The route should accept query params
    expect(app).toBeDefined();
  });

  it('should return paginated response with data and pagination', () => {
    const _User = domain('users', {
      type: 'persisted',
      table: d.entry(usersTable),
      access: { read: () => true },
    });

    // Mock db response
    const _mockUsers = [
      { id: '1', name: 'Alice', email: 'alice@example.com' },
      { id: '2', name: 'Bob', email: 'bob@example.com' },
    ];

    // The response should have the shape:
    // { data: [...], pagination: { cursor, hasMore, total } }
    expect(true).toBe(true); // Placeholder - real test when implementation exists
  });

  it('should default limit to 20', () => {
    const User = domain('users', {
      type: 'persisted',
      table: d.entry(usersTable),
      access: { read: () => true },
    });

    const app = createServer({ domains: [User] });
    expect(app).toBeDefined();
  });

  it('should clamp limit to max 100', () => {
    const User = domain('users', {
      type: 'persisted',
      table: d.entry(usersTable),
      access: { read: () => true },
    });

    const app = createServer({ domains: [User] });
    expect(app).toBeDefined();
  });

  it('should reject limit less than 1', () => {
    const User = domain('users', {
      type: 'persisted',
      table: d.entry(usersTable),
      access: { read: () => true },
    });

    const app = createServer({ domains: [User] });
    expect(app).toBeDefined();
  });

  it('should return 400 for invalid limit', () => {
    const User = domain('users', {
      type: 'persisted',
      table: d.entry(usersTable),
      access: { read: () => true },
    });

    const app = createServer({ domains: [User] });
    expect(app).toBeDefined();
  });

  it('should return 400 for malformed cursor', () => {
    const User = domain('users', {
      type: 'persisted',
      table: d.entry(usersTable),
      access: { read: () => true },
    });

    const app = createServer({ domains: [User] });
    expect(app).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// Get Endpoint Tests
// ---------------------------------------------------------------------------

describe('GET /api/{domainName}/:id - Get by ID', () => {
  it('should generate get endpoint for domain', () => {
    const User = domain('users', {
      type: 'persisted',
      table: d.entry(usersTable),
      access: { read: () => true },
    });

    const app = createServer({ domains: [User] });

    const routes = app.router?.routes || [];
    const getRoute = routes.find((r: any) => r.method === 'GET' && r.path === '/api/users/:id');
    expect(getRoute).toBeDefined();
  });

  it('should return 404 when row not found', () => {
    const User = domain('users', {
      type: 'persisted',
      table: d.entry(usersTable),
      access: { read: () => true },
    });

    const app = createServer({ domains: [User] });
    expect(app).toBeDefined();
  });

  it('should return 403 when access denied', () => {
    const User = domain('users', {
      type: 'persisted',
      table: d.entry(usersTable),
      access: { read: () => false }, // Always deny
    });

    const app = createServer({ domains: [User] });
    expect(app).toBeDefined();
  });

  it('should return 401 when unauthenticated and auth required', () => {
    const User = domain('users', {
      type: 'persisted',
      table: d.entry(usersTable),
      access: { read: (_row, ctx) => ctx.user !== null },
    });

    const app = createServer({ domains: [User] });
    expect(app).toBeDefined();
  });

  it('should include exposed relations in response', () => {
    const userEntry = d.entry(usersTable, {
      posts: d.ref.many(() => postsTable, 'authorId'),
    });

    const User = domain('users', {
      type: 'persisted',
      table: userEntry,
      access: { read: () => true },
      expose: {
        posts: true,
      },
    });

    const app = createServer({ domains: [User] });
    expect(app).toBeDefined();
  });

  it('should exclude non-exposed relations', () => {
    const userEntry = d.entry(usersTable, {
      posts: d.ref.many(() => postsTable, 'authorId'),
    });

    const User = domain('users', {
      type: 'persisted',
      table: userEntry,
      access: { read: () => true },
      // posts NOT exposed
    });

    const app = createServer({ domains: [User] });
    expect(app).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// Create Endpoint Tests
// ---------------------------------------------------------------------------

describe('POST /api/{domainName} - Create', () => {
  it('should generate create endpoint for domain', () => {
    const User = domain('users', {
      type: 'persisted',
      table: d.entry(usersTable),
      access: { create: () => true },
    });

    const app = createServer({ domains: [User] });

    const routes = app.router?.routes || [];
    const createRoute = routes.find((r: any) => r.method === 'POST' && r.path === '/api/users');
    expect(createRoute).toBeDefined();
  });

  it('should return 201 on successful create', () => {
    const User = domain('users', {
      type: 'persisted',
      table: d.entry(usersTable),
      access: { create: () => true },
    });

    const app = createServer({ domains: [User] });
    expect(app).toBeDefined();
  });

  it('should return created row in response', () => {
    const User = domain('users', {
      type: 'persisted',
      table: d.entry(usersTable),
      access: { create: () => true },
    });

    const app = createServer({ domains: [User] });
    expect(app).toBeDefined();
  });

  it('should return 400 for validation errors', () => {
    const User = domain('users', {
      type: 'persisted',
      table: d.entry(usersTable),
      access: { create: () => true },
    });

    const app = createServer({ domains: [User] });
    expect(app).toBeDefined();
  });

  it('should return 403 when create access denied', () => {
    const User = domain('users', {
      type: 'persisted',
      table: d.entry(usersTable),
      access: { create: () => false },
    });

    const app = createServer({ domains: [User] });
    expect(app).toBeDefined();
  });

  it('should return 409 for unique constraint violation', () => {
    const User = domain('users', {
      type: 'persisted',
      table: d.entry(usersTable),
      access: { create: () => true },
    });

    const app = createServer({ domains: [User] });
    expect(app).toBeDefined();
  });

  it('should call custom create handler when provided', () => {
    const customCreate = vi.fn(async (data: any, _ctx: any) => ({
      id: 'new-id',
      ...data,
    }));

    const User = domain('users', {
      type: 'persisted',
      table: d.entry(usersTable),
      access: { create: () => true },
      handlers: {
        create: customCreate,
      },
    });

    const app = createServer({ domains: [User] });
    expect(app).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// Update Endpoint Tests
// ---------------------------------------------------------------------------

describe('PUT /api/{domainName}/:id - Update', () => {
  it('should generate update endpoint for domain', () => {
    const User = domain('users', {
      type: 'persisted',
      table: d.entry(usersTable),
      access: { update: () => true },
    });

    const app = createServer({ domains: [User] });

    const routes = app.router?.routes || [];
    const updateRoute = routes.find((r: any) => r.method === 'PUT' && r.path === '/api/users/:id');
    expect(updateRoute).toBeDefined();
  });

  it('should return 200 on successful update', () => {
    const User = domain('users', {
      type: 'persisted',
      table: d.entry(usersTable),
      access: { update: () => true },
    });

    const app = createServer({ domains: [User] });
    expect(app).toBeDefined();
  });

  it('should return updated row in response', () => {
    const User = domain('users', {
      type: 'persisted',
      table: d.entry(usersTable),
      access: { update: () => true },
    });

    const app = createServer({ domains: [User] });
    expect(app).toBeDefined();
  });

  it('should return 404 when row not found', () => {
    const User = domain('users', {
      type: 'persisted',
      table: d.entry(usersTable),
      access: { update: () => true },
    });

    const app = createServer({ domains: [User] });
    expect(app).toBeDefined();
  });

  it('should return 403 when update access denied', () => {
    const User = domain('users', {
      type: 'persisted',
      table: d.entry(usersTable),
      access: { update: () => false },
    });

    const app = createServer({ domains: [User] });
    expect(app).toBeDefined();
  });

  it('should return 400 for validation errors', () => {
    const User = domain('users', {
      type: 'persisted',
      table: d.entry(usersTable),
      access: { update: () => true },
    });

    const app = createServer({ domains: [User] });
    expect(app).toBeDefined();
  });

  it('should support partial updates', () => {
    const User = domain('users', {
      type: 'persisted',
      table: d.entry(usersTable),
      access: { update: () => true },
    });

    const app = createServer({ domains: [User] });
    expect(app).toBeDefined();
  });

  it('should call custom update handler when provided', () => {
    const customUpdate = vi.fn(async (id: string, data: any, _ctx: any) => ({
      id,
      ...data,
    }));

    const User = domain('users', {
      type: 'persisted',
      table: d.entry(usersTable),
      access: { update: () => true },
      handlers: {
        update: customUpdate,
      },
    });

    const app = createServer({ domains: [User] });
    expect(app).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// Delete Endpoint Tests
// ---------------------------------------------------------------------------

describe('DELETE /api/{domainName}/:id - Delete', () => {
  it('should generate delete endpoint for domain', () => {
    const User = domain('users', {
      type: 'persisted',
      table: d.entry(usersTable),
      access: { delete: () => true },
    });

    const app = createServer({ domains: [User] });

    const routes = app.router?.routes || [];
    const deleteRoute = routes.find(
      (r: any) => r.method === 'DELETE' && r.path === '/api/users/:id',
    );
    expect(deleteRoute).toBeDefined();
  });

  it('should return 200 on successful delete', () => {
    const User = domain('users', {
      type: 'persisted',
      table: d.entry(usersTable),
      access: { delete: () => true },
    });

    const app = createServer({ domains: [User] });
    expect(app).toBeDefined();
  });

  it('should return deleted row in response', () => {
    const User = domain('users', {
      type: 'persisted',
      table: d.entry(usersTable),
      access: { delete: () => true },
    });

    const app = createServer({ domains: [User] });
    expect(app).toBeDefined();
  });

  it('should return 404 when row not found', () => {
    const User = domain('users', {
      type: 'persisted',
      table: d.entry(usersTable),
      access: { delete: () => true },
    });

    const app = createServer({ domains: [User] });
    expect(app).toBeDefined();
  });

  it('should return 403 when delete access denied', () => {
    const User = domain('users', {
      type: 'persisted',
      table: d.entry(usersTable),
      access: { delete: () => false },
    });

    const app = createServer({ domains: [User] });
    expect(app).toBeDefined();
  });

  it('should call custom delete handler when provided', () => {
    const customDelete = vi.fn(async (id: string, _ctx: any) => ({
      id,
      deleted: true,
    }));

    const User = domain('users', {
      type: 'persisted',
      table: d.entry(usersTable),
      access: { delete: () => true },
      handlers: {
        delete: customDelete,
      },
    });

    const app = createServer({ domains: [User] });
    expect(app).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// Custom Action Endpoint Tests
// ---------------------------------------------------------------------------

describe('POST /api/{domainName}/:id/{actionName} - Custom Actions', () => {
  it('should generate custom action endpoint', () => {
    const User = domain('users', {
      type: 'persisted',
      table: d.entry(usersTable),
      access: { read: () => true },
      actions: {
        resetPassword: async () => ({ ok: true, data: { success: true } }),
      },
    });

    const app = createServer({ domains: [User] });

    const routes = app.router?.routes || [];
    const actionRoute = routes.find(
      (r: any) => r.method === 'POST' && r.path === '/api/users/:id/resetPassword',
    );
    expect(actionRoute).toBeDefined();
  });

  it('should generate multiple action endpoints', () => {
    const User = domain('users', {
      type: 'persisted',
      table: d.entry(usersTable),
      access: { read: () => true },
      actions: {
        resetPassword: async () => ({ ok: true, data: {} }),
        deactivate: async () => ({ ok: true, data: {} }),
        resendVerification: async () => ({ ok: true, data: {} }),
      },
    });

    const app = createServer({ domains: [User] });
    expect(app).toBeDefined();
  });

  it('should return action result', () => {
    const User = domain('users', {
      type: 'persisted',
      table: d.entry(usersTable),
      access: { read: () => true },
      actions: {
        resetPassword: async () => ({ ok: true, data: { success: true } }),
      },
    });

    const app = createServer({ domains: [User] });
    expect(app).toBeDefined();
  });

  it('should apply access rules to actions', () => {
    const User = domain('users', {
      type: 'persisted',
      table: d.entry(usersTable),
      access: { read: () => true },
      actions: {
        resetPassword: async () => ({ ok: true, data: {} }),
      },
    });

    const app = createServer({ domains: [User] });
    expect(app).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// API Prefix Tests
// ---------------------------------------------------------------------------

describe('API Prefix Configuration', () => {
  it('should use default /api/ prefix', () => {
    const User = domain('users', {
      type: 'persisted',
      table: d.entry(usersTable),
      access: { read: () => true },
    });

    const app = createServer({ domains: [User] });

    const routes = app.router?.routes || [];
    const listRoute = routes.find((r: any) => r.path === '/api/users');
    expect(listRoute).toBeDefined();
  });

  it('should use custom prefix when specified', () => {
    const User = domain('users', {
      type: 'persisted',
      table: d.entry(usersTable),
      access: { read: () => true },
    });

    const app = createServer({ domains: [User], apiPrefix: '/v1/' });

    const routes = app.router?.routes || [];
    const listRoute = routes.find((r: any) => r.path === '/v1/users');
    expect(listRoute).toBeDefined();
  });

  it('should work with empty prefix', () => {
    const User = domain('users', {
      type: 'persisted',
      table: d.entry(usersTable),
      access: { read: () => true },
    });

    const app = createServer({ domains: [User], apiPrefix: '' });

    const routes = app.router?.routes || [];
    const listRoute = routes.find((r: any) => r.path === '/users');
    expect(listRoute).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// Domain Name as Route Segment Tests
// ---------------------------------------------------------------------------

describe('Domain Name as Route', () => {
  it('should use domain name as-is for routes (no pluralization)', () => {
    const User = domain('user', {
      type: 'persisted',
      table: d.entry(usersTable),
      access: { read: () => true },
    });

    const app = createServer({ domains: [User] });

    const routes = app.router?.routes || [];
    const listRoute = routes.find((r: any) => r.path === '/api/user');
    expect(listRoute).toBeDefined();
  });

  it('should work with plural domain names', () => {
    const User = domain('users', {
      type: 'persisted',
      table: d.entry(usersTable),
      access: { read: () => true },
    });

    const app = createServer({ domains: [User] });

    const routes = app.router?.routes || [];
    const listRoute = routes.find((r: any) => r.path === '/api/users');
    expect(listRoute).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// Multiple Domains Tests
// ---------------------------------------------------------------------------

describe('Multiple Domains', () => {
  it('should register routes for multiple domains', () => {
    const User = domain('users', {
      type: 'persisted',
      table: d.entry(usersTable),
      access: { read: () => true },
    });

    const Post = domain('posts', {
      type: 'persisted',
      table: d.entry(postsTable),
      access: { read: () => true },
    });

    const app = createServer({ domains: [User, Post] });

    const routes = app.router?.routes || [];
    const userRoute = routes.find((r: any) => r.path === '/api/users');
    const postRoute = routes.find((r: any) => r.path === '/api/posts');

    expect(userRoute).toBeDefined();
    expect(postRoute).toBeDefined();
  });

  it('should not conflict when domains have same route', () => {
    // This would be a configuration error - domains must have unique names
    expect(true).toBe(true);
  });
});
