import { describe, expect, it } from 'bun:test';
import { d } from '@vertz/db';
import { entity } from '../../entity/entity';
import { EntityRegistry } from '../../entity/entity-registry';
import { action } from '../action';
import { generateActionRoutes } from '../route-generator';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const usersTable = d.table('users', {
  id: d.uuid().primary(),
  email: d.text().unique(),
  name: d.text(),
});

const usersModel = d.model(usersTable);
const usersEntity = entity('users', { model: usersModel });

const bodySchema = {
  parse(value: unknown) {
    const v = value as Record<string, unknown>;
    if (typeof v?.email !== 'string') {
      return { ok: false as const, error: new Error('email is required') };
    }
    return { ok: true as const, data: v as { email: string } };
  },
};

const responseSchema = {
  parse(value: unknown) {
    return { ok: true as const, data: value as { token: string } };
  },
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Feature: generateActionRoutes', () => {
  describe('Given an action with access rules', () => {
    describe('When generating routes', () => {
      it('Then generates POST route for action handler with access rule', () => {
        const authAction = action('auth', {
          access: { login: () => true },
          actions: {
            login: {
              body: bodySchema,
              response: responseSchema,
              handler: async (input) => ({ token: `tok-${input.email}` }),
            },
          },
        });

        const registry = new EntityRegistry();
        const routes = generateActionRoutes(authAction, registry);

        expect(routes).toHaveLength(1);
        expect(routes[0]?.method).toBe('POST');
        expect(routes[0]?.path).toBe('/api/auth/login');
      });
    });
  });

  describe('Given an action handler with no access rule', () => {
    describe('When generating routes', () => {
      it('Then skips the handler (deny by default)', () => {
        const authAction = action('auth', {
          access: { login: () => true },
          actions: {
            login: {
              body: bodySchema,
              response: responseSchema,
              handler: async () => ({ token: 'tok' }),
            },
            secret: {
              body: bodySchema,
              response: responseSchema,
              handler: async () => ({ token: 'secret' }),
            },
          },
        });

        const registry = new EntityRegistry();
        const routes = generateActionRoutes(authAction, registry);

        // Only 'login' has access rule, 'secret' is skipped
        expect(routes).toHaveLength(1);
        expect(routes[0]?.path).toBe('/api/auth/login');
      });
    });
  });

  describe('Given an action with custom apiPrefix', () => {
    describe('When generating routes', () => {
      it('Then uses the custom prefix', () => {
        const authAction = action('auth', {
          access: { login: () => true },
          actions: {
            login: {
              body: bodySchema,
              response: responseSchema,
              handler: async () => ({ token: 'tok' }),
            },
          },
        });

        const registry = new EntityRegistry();
        const routes = generateActionRoutes(authAction, registry, { apiPrefix: '/v2' });

        expect(routes[0]?.path).toBe('/v2/auth/login');
      });
    });
  });

  describe('Given an action with access: false (disabled)', () => {
    describe('When generating routes', () => {
      it('Then generates 405 handler', async () => {
        const authAction = action('auth', {
          access: { login: false },
          actions: {
            login: {
              body: bodySchema,
              response: responseSchema,
              handler: async () => ({ token: 'tok' }),
            },
          },
        });

        const registry = new EntityRegistry();
        const routes = generateActionRoutes(authAction, registry);

        expect(routes).toHaveLength(1);
        const response = await routes[0]?.handler({});
        expect(response.status).toBe(405);
      });
    });
  });

  describe('Given an action handler that returns data', () => {
    describe('When the route handler is called with valid input', () => {
      it('Then returns 200 with the handler result', async () => {
        const authAction = action('auth', {
          access: { login: () => true },
          actions: {
            login: {
              body: bodySchema,
              response: responseSchema,
              handler: async (input) => ({ token: `tok-${input.email}` }),
            },
          },
        });

        const registry = new EntityRegistry();
        const routes = generateActionRoutes(authAction, registry);

        const response = await routes[0]?.handler({
          body: { email: 'alice@example.com' },
        });

        expect(response.status).toBe(200);
        const body = await response.json();
        expect(body.token).toBe('tok-alice@example.com');
      });
    });
  });

  describe('Given an action handler with body validation', () => {
    describe('When called with invalid body', () => {
      it('Then returns 400 with validation error', async () => {
        const authAction = action('auth', {
          access: { login: () => true },
          actions: {
            login: {
              body: bodySchema,
              response: responseSchema,
              handler: async (input) => ({ token: `tok-${input.email}` }),
            },
          },
        });

        const registry = new EntityRegistry();
        const routes = generateActionRoutes(authAction, registry);

        const response = await routes[0]?.handler({
          body: {},
        });

        expect(response.status).toBe(400);
      });
    });
  });

  describe('Given an action with entity DI', () => {
    describe('When the handler accesses injected entities', () => {
      it('Then ctx.entities provides the registry proxy', async () => {
        const authAction = action('auth', {
          inject: { users: usersEntity },
          access: { login: () => true },
          actions: {
            login: {
              body: bodySchema,
              response: responseSchema,
              handler: async (_input, ctx) => {
                // Verify ctx.entities is available (proxy)
                expect(ctx.entities).toBeDefined();
                return { token: 'tok' };
              },
            },
          },
        });

        const registry = new EntityRegistry();
        const routes = generateActionRoutes(authAction, registry);

        await routes[0]?.handler({
          body: { email: 'alice@example.com' },
        });
      });
    });
  });

  describe('Given an action with access rule that denies', () => {
    describe('When the route handler is called', () => {
      it('Then returns 403', async () => {
        const authAction = action('auth', {
          access: { login: () => false },
          actions: {
            login: {
              body: bodySchema,
              response: responseSchema,
              handler: async () => ({ token: 'tok' }),
            },
          },
        });

        const registry = new EntityRegistry();
        const routes = generateActionRoutes(authAction, registry);

        const response = await routes[0]?.handler({
          body: { email: 'alice@example.com' },
        });

        expect(response.status).toBe(403);
      });
    });
  });
});
