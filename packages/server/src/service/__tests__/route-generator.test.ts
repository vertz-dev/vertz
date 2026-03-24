import { describe, expect, it } from 'bun:test';
import { d } from '@vertz/db';
import { content } from '../../content';
import { entity } from '../../entity/entity';
import { EntityRegistry } from '../../entity/entity-registry';
import { response } from '../../response';
import { generateServiceRoutes } from '../route-generator';
import { service } from '../service';

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

describe('Feature: generateServiceRoutes', () => {
  describe('Given a service with access rules', () => {
    describe('When generating routes', () => {
      it('Then generates POST route for service handler with access rule', () => {
        const authService = service('auth', {
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
        const routes = generateServiceRoutes(authService, registry);

        expect(routes).toHaveLength(1);
        expect(routes[0]?.method).toBe('POST');
        expect(routes[0]?.path).toBe('/api/auth/login');
      });
    });
  });

  describe('Given a service handler with no access rule', () => {
    describe('When generating routes', () => {
      it('Then skips the handler (deny by default)', () => {
        const authService = service('auth', {
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
        const routes = generateServiceRoutes(authService, registry);

        // Only 'login' has access rule, 'secret' is skipped
        expect(routes).toHaveLength(1);
        expect(routes[0]?.path).toBe('/api/auth/login');
      });
    });
  });

  describe('Given a service with custom apiPrefix', () => {
    describe('When generating routes', () => {
      it('Then uses the custom prefix', () => {
        const authService = service('auth', {
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
        const routes = generateServiceRoutes(authService, registry, { apiPrefix: '/v2' });

        expect(routes[0]?.path).toBe('/v2/auth/login');
      });
    });
  });

  describe('Given a service with access: false (disabled)', () => {
    describe('When generating routes', () => {
      it('Then generates 405 handler', async () => {
        const authService = service('auth', {
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
        const routes = generateServiceRoutes(authService, registry);

        expect(routes).toHaveLength(1);
        const response = await routes[0]?.handler({});
        expect(response.status).toBe(405);
      });
    });
  });

  describe('Given a service handler that returns data', () => {
    describe('When the route handler is called with valid input', () => {
      it('Then returns 200 with the handler result', async () => {
        const authService = service('auth', {
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
        const routes = generateServiceRoutes(authService, registry);

        const response = await routes[0]?.handler({
          body: { email: 'alice@example.com' },
        });

        expect(response.status).toBe(200);
        const body = await response.json();
        expect(body.token).toBe('tok-alice@example.com');
      });
    });
  });

  describe('Given a service handler with body validation', () => {
    describe('When called with invalid body', () => {
      it('Then returns 400 with validation error', async () => {
        const authService = service('auth', {
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
        const routes = generateServiceRoutes(authService, registry);

        const response = await routes[0]?.handler({
          body: {},
        });

        expect(response.status).toBe(400);
      });
    });
  });

  describe('Given a service with entity DI', () => {
    describe('When the handler accesses injected entities', () => {
      it('Then ctx.entities provides the registry proxy', async () => {
        const authService = service('auth', {
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
        const routes = generateServiceRoutes(authService, registry);

        await routes[0]?.handler({
          body: { email: 'alice@example.com' },
        });
      });
    });
  });

  describe('Given a service with access rule that denies', () => {
    describe('When the route handler is called', () => {
      it('Then returns 403', async () => {
        const authService = service('auth', {
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
        const routes = generateServiceRoutes(authService, registry);

        const response = await routes[0]?.handler({
          body: { email: 'alice@example.com' },
        });

        expect(response.status).toBe(403);
      });
    });
  });

  describe('Given a GET action with no body', () => {
    describe('When the route handler is called', () => {
      it('Then handler receives undefined as input and does not crash', async () => {
        const healthService = service('health', {
          access: { check: () => true },
          actions: {
            check: {
              method: 'GET',
              response: content.text(),
              handler: async () => 'OK',
            },
          },
        });

        const registry = new EntityRegistry();
        const routes = generateServiceRoutes(healthService, registry);

        expect(routes).toHaveLength(1);
        expect(routes[0]?.method).toBe('GET');

        const response = await routes[0]?.handler({});
        expect(response.status).toBe(200);
      });
    });
  });

  describe('Given an action with response: content.xml()', () => {
    describe('When the handler returns a string', () => {
      it('Then response has content-type application/xml', async () => {
        const xmlService = service('xml', {
          access: { metadata: () => true },
          actions: {
            metadata: {
              method: 'GET',
              response: content.xml(),
              handler: async () => '<EntityDescriptor/>',
            },
          },
        });

        const registry = new EntityRegistry();
        const routes = generateServiceRoutes(xmlService, registry);
        const response = await routes[0]?.handler({});

        expect(response.status).toBe(200);
        expect(response.headers.get('content-type')).toBe('application/xml');
        expect(await response.text()).toBe('<EntityDescriptor/>');
      });
    });
  });

  describe('Given an action with response: content.html()', () => {
    describe('When the handler returns a string', () => {
      it('Then response has content-type text/html', async () => {
        const htmlService = service('html', {
          access: { page: () => true },
          actions: {
            page: {
              method: 'GET',
              response: content.html(),
              handler: async () => '<html><body>Hello</body></html>',
            },
          },
        });

        const registry = new EntityRegistry();
        const routes = generateServiceRoutes(htmlService, registry);
        const response = await routes[0]?.handler({});

        expect(response.status).toBe(200);
        expect(response.headers.get('content-type')).toBe('text/html');
        expect(await response.text()).toBe('<html><body>Hello</body></html>');
      });
    });
  });

  describe('Given an action with body: content.xml() and response: s.object()', () => {
    describe('When called with XML body', () => {
      it('Then handler receives string input and response is JSON', async () => {
        const mixedService = service('mixed', {
          access: { process: () => true },
          actions: {
            process: {
              method: 'POST',
              body: content.xml(),
              response: responseSchema,
              handler: async (input) => ({ token: `parsed-${(input as string).length}` }),
            },
          },
        });

        const registry = new EntityRegistry();
        const routes = generateServiceRoutes(mixedService, registry);
        const response = await routes[0]?.handler({
          body: '<data>hello</data>',
        });

        expect(response.status).toBe(200);
        expect(response.headers.get('content-type')).toBe('application/json');
        const body = await response.json();
        expect(body.token).toBe('parsed-18');
      });
    });
  });

  describe('Given a service action handler', () => {
    describe('When the handler accesses ctx.request', () => {
      it('Then ctx.request has url, method, headers, body, and params', async () => {
        let capturedRequest: unknown;

        const svc = service('test', {
          access: { action: () => true },
          actions: {
            action: {
              method: 'POST',
              body: bodySchema,
              response: responseSchema,
              handler: async (_input, ctx) => {
                capturedRequest = ctx.request;
                return { token: 'tok' };
              },
            },
          },
        });

        const registry = new EntityRegistry();
        const routes = generateServiceRoutes(svc, registry);

        await routes[0]?.handler({
          body: { email: 'test@example.com' },
          raw: {
            url: 'http://localhost:3000/api/test/action',
            method: 'POST',
            headers: new Headers({ 'content-type': 'application/json' }),
          },
        });

        expect(capturedRequest).toBeDefined();
        const req = capturedRequest as {
          url: string;
          method: string;
          headers: Headers;
          body: unknown;
          params: Record<string, string>;
        };
        expect(req.url).toBe('http://localhost:3000/api/test/action');
        expect(req.method).toBe('POST');
        expect(req.headers).toBeInstanceOf(Headers);
        expect(req.body).toEqual({ email: 'test@example.com' });
        expect(req.params).toEqual({});
      });
    });
  });

  describe('Given an action with body: content.xml()', () => {
    describe('When called with application/json content-type', () => {
      it('Then returns 415 Unsupported Media Type', async () => {
        const xmlService = service('xml', {
          access: { process: () => true },
          actions: {
            process: {
              method: 'POST',
              body: content.xml(),
              response: content.xml(),
              handler: async (input) => `<echo>${input}</echo>`,
            },
          },
        });

        const registry = new EntityRegistry();
        const routes = generateServiceRoutes(xmlService, registry);
        const response = await routes[0]?.handler({
          body: { some: 'json' },
          headers: { 'content-type': 'application/json' },
          raw: {
            url: 'http://localhost:3000/api/xml/process',
            method: 'POST',
            headers: new Headers({ 'content-type': 'application/json' }),
          },
        });

        expect(response.status).toBe(415);
        const body = await response.json();
        expect(body.error.code).toBe('UnsupportedMediaType');
      });
    });

    describe('When called with text/xml content-type', () => {
      it('Then accepts (both XML MIME types)', async () => {
        const xmlService = service('xml', {
          access: { process: () => true },
          actions: {
            process: {
              method: 'POST',
              body: content.xml(),
              response: content.xml(),
              handler: async (input) => `<echo>${input}</echo>`,
            },
          },
        });

        const registry = new EntityRegistry();
        const routes = generateServiceRoutes(xmlService, registry);
        const response = await routes[0]?.handler({
          body: '<data/>',
          headers: { 'content-type': 'text/xml' },
          raw: {
            url: 'http://localhost:3000/api/xml/process',
            method: 'POST',
            headers: new Headers({ 'content-type': 'text/xml' }),
          },
        });

        expect(response.status).toBe(200);
        expect(await response.text()).toBe('<echo><data/></echo>');
      });
    });
  });

  describe('Given a service with a custom path containing :provider param', () => {
    describe('When the route handler is invoked with a matching URL', () => {
      it('Then ctx.request.params contains { provider: "github" }', async () => {
        let capturedParams: unknown;

        const svc = service('auth', {
          access: { callback: () => true },
          actions: {
            callback: {
              method: 'GET',
              path: '/api/auth/callback/:provider',
              response: responseSchema,
              handler: async (_input, ctx) => {
                capturedParams = ctx.request.params;
                return { token: 'tok' };
              },
            },
          },
        });

        const registry = new EntityRegistry();
        const routes = generateServiceRoutes(svc, registry);

        await routes[0]?.handler({
          params: { provider: 'github' },
          raw: {
            url: 'http://localhost:3000/api/auth/callback/github',
            method: 'GET',
            headers: new Headers(),
          },
        });

        expect(capturedParams).toEqual({ provider: 'github' });
      });
    });
  });

  describe('Given a service with no path params', () => {
    describe('When the route handler is invoked', () => {
      it('Then ctx.request.params is an empty object {}', async () => {
        let capturedParams: unknown;

        const svc = service('auth', {
          access: { login: () => true },
          actions: {
            login: {
              body: bodySchema,
              response: responseSchema,
              handler: async (_input, ctx) => {
                capturedParams = ctx.request.params;
                return { token: 'tok' };
              },
            },
          },
        });

        const registry = new EntityRegistry();
        const routes = generateServiceRoutes(svc, registry);

        await routes[0]?.handler({
          body: { email: 'test@example.com' },
        });

        expect(capturedParams).toEqual({});
      });
    });
  });

  describe('Given an action with JSON body and response (unchanged)', () => {
    describe('When called with valid JSON', () => {
      it('Then behavior is unchanged', async () => {
        const authService = service('auth', {
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
        const routes = generateServiceRoutes(authService, registry);
        const resp = await routes[0]?.handler({
          body: { email: 'alice@example.com' },
        });

        expect(resp.status).toBe(200);
        expect(resp.headers.get('content-type')).toBe('application/json');
        const body = await resp.json();
        expect(body.token).toBe('tok-alice@example.com');
      });
    });
  });

  // -------------------------------------------------------------------------
  // ResponseDescriptor tests
  // -------------------------------------------------------------------------

  describe('Given a handler that returns response() with custom headers', () => {
    describe('When the route is invoked', () => {
      it('Then HTTP response includes the custom headers', async () => {
        const svc = service('cloud', {
          access: { jwks: () => true },
          actions: {
            jwks: {
              method: 'GET',
              response: responseSchema,
              handler: async () =>
                response(
                  { token: 'key1' },
                  { headers: { 'Cache-Control': 'public, max-age=3600' } },
                ),
            },
          },
        });

        const registry = new EntityRegistry();
        const routes = generateServiceRoutes(svc, registry);
        const resp = await routes[0]?.handler({});

        expect(resp.headers.get('Cache-Control')).toBe('public, max-age=3600');
      });

      it('Then content-type: application/json is preserved', async () => {
        const svc = service('cloud', {
          access: { jwks: () => true },
          actions: {
            jwks: {
              method: 'GET',
              response: responseSchema,
              handler: async () =>
                response({ token: 'key1' }, { headers: { 'X-Request-Id': 'req-123' } }),
            },
          },
        });

        const registry = new EntityRegistry();
        const routes = generateServiceRoutes(svc, registry);
        const resp = await routes[0]?.handler({});

        expect(resp.headers.get('content-type')).toBe('application/json');
      });
    });
  });

  describe('Given a handler that returns response() with custom status', () => {
    describe('When the route is invoked', () => {
      it('Then HTTP response uses the custom status code', async () => {
        const svc = service('cloud', {
          access: { create: () => true },
          actions: {
            create: {
              method: 'POST',
              body: bodySchema,
              response: responseSchema,
              handler: async () => response({ token: 'new' }, { status: 201 }),
            },
          },
        });

        const registry = new EntityRegistry();
        const routes = generateServiceRoutes(svc, registry);
        const resp = await routes[0]?.handler({ body: { email: 'a@b.com' } });

        expect(resp.status).toBe(201);
      });
    });
  });

  describe('Given a handler that returns plain data (backward compat)', () => {
    describe('When the route is invoked', () => {
      it('Then response is 200 with application/json (unchanged behavior)', async () => {
        const svc = service('auth', {
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
        const routes = generateServiceRoutes(svc, registry);
        const resp = await routes[0]?.handler({ body: { email: 'a@b.com' } });

        expect(resp.status).toBe(200);
        expect(resp.headers.get('content-type')).toBe('application/json');
        const body = await resp.json();
        expect(body.token).toBe('tok');
      });
    });
  });

  describe('Given a handler that tries to override content-type header', () => {
    describe('When the route is invoked', () => {
      it('Then content-type remains application/json (Title-Case)', async () => {
        const svc = service('cloud', {
          access: { data: () => true },
          actions: {
            data: {
              method: 'GET',
              response: responseSchema,
              handler: async () =>
                response(
                  { token: 'tok' },
                  { headers: { 'Content-Type': 'text/plain', 'X-Custom': 'val' } },
                ),
            },
          },
        });

        const registry = new EntityRegistry();
        const routes = generateServiceRoutes(svc, registry);
        const resp = await routes[0]?.handler({});

        expect(resp.headers.get('content-type')).toBe('application/json');
        expect(resp.headers.get('X-Custom')).toBe('val');
      });

      it('Then content-type remains application/json (all-lowercase)', async () => {
        const svc = service('cloud', {
          access: { data: () => true },
          actions: {
            data: {
              method: 'GET',
              response: responseSchema,
              handler: async () =>
                response(
                  { token: 'tok' },
                  { headers: { 'content-type': 'text/plain', 'X-Other': 'yes' } },
                ),
            },
          },
        });

        const registry = new EntityRegistry();
        const routes = generateServiceRoutes(svc, registry);
        const resp = await routes[0]?.handler({});

        expect(resp.headers.get('content-type')).toBe('application/json');
        expect(resp.headers.get('X-Other')).toBe('yes');
      });
    });
  });

  describe('Given a content descriptor response with response() wrapper', () => {
    describe('When the route is invoked', () => {
      it('Then custom headers are merged but content-type uses the descriptor', async () => {
        const svc = service('xml', {
          access: { metadata: () => true },
          actions: {
            metadata: {
              method: 'GET',
              response: content.xml(),
              handler: async () =>
                response('<EntityDescriptor/>', {
                  headers: { 'X-Request-Id': 'req-456' },
                }),
            },
          },
        });

        const registry = new EntityRegistry();
        const routes = generateServiceRoutes(svc, registry);
        const resp = await routes[0]?.handler({});

        expect(resp.status).toBe(200);
        expect(resp.headers.get('content-type')).toBe('application/xml');
        expect(resp.headers.get('X-Request-Id')).toBe('req-456');
        expect(await resp.text()).toBe('<EntityDescriptor/>');
      });
    });
  });

  describe('Given response() with only data (no options)', () => {
    describe('When the route is invoked', () => {
      it('Then behaves like plain return (200, application/json)', async () => {
        const svc = service('cloud', {
          access: { data: () => true },
          actions: {
            data: {
              method: 'GET',
              response: responseSchema,
              handler: async () => response({ token: 'tok' }),
            },
          },
        });

        const registry = new EntityRegistry();
        const routes = generateServiceRoutes(svc, registry);
        const resp = await routes[0]?.handler({});

        expect(resp.status).toBe(200);
        expect(resp.headers.get('content-type')).toBe('application/json');
        const body = await resp.json();
        expect(body.token).toBe('tok');
      });
    });
  });
});
