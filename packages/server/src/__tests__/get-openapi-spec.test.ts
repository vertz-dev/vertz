import { describe, expect, it } from '@vertz/test';
import { d } from '@vertz/db';
import { s } from '@vertz/schema';
import { action } from '../action';
import { rules } from '../auth/rules';
import { createServer } from '../create-server';
import { entity } from '../entity/entity';
import { service } from '../service/service';

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------

const tasksTable = d.table('tasks', {
  id: d.uuid().primary(),
  title: d.text(),
  status: d.enum('status', ['todo', 'in_progress', 'done']),
  createdAt: d.timestamp(),
});

const tasksModel = d.model(tasksTable);

const tasksDef = entity('tasks', {
  model: tasksModel,
  access: {
    list: rules.authenticated(),
    get: rules.authenticated(),
    create: rules.authenticated(),
    update: rules.authenticated(),
  },
});

const analyticsDef = service('analytics', {
  access: { summary: rules.authenticated() },
  actions: {
    summary: action({
      method: 'GET',
      response: s.object({ count: s.number() }),
      handler: async () => ({ count: 42 }),
    }),
  },
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Feature: server.getOpenAPISpec()', () => {
  describe('Given a server with entities and services', () => {
    const server = createServer({
      entities: [tasksDef],
      services: [analyticsDef],
    });

    describe('When getOpenAPISpec() is called', () => {
      it('Then returns a complete OpenAPI 3.1 spec', () => {
        const spec = server.getOpenAPISpec();
        expect(spec.openapi).toBe('3.1.0');
        expect(spec.info).toBeDefined();
        expect(spec.paths).toBeDefined();
        expect(spec.components).toBeDefined();
      });

      it('Then includes both entity and service routes', () => {
        const spec = server.getOpenAPISpec();
        // Entity paths
        expect(spec.paths['/api/tasks']).toBeDefined();
        expect(spec.paths['/api/tasks/{id}']).toBeDefined();
        // Service paths
        expect(spec.paths['/api/analytics/summary']).toBeDefined();
      });

      it('Then uses default info when no options provided', () => {
        const spec = server.getOpenAPISpec();
        expect(spec.info.title).toBe('Vertz API');
        expect(spec.info.version).toBe('0.1.0');
      });

      it('Then memoizes the result (same object on repeat calls)', () => {
        const spec1 = server.getOpenAPISpec();
        const spec2 = server.getOpenAPISpec();
        expect(spec1).toBe(spec2);
      });
    });

    describe('When getOpenAPISpec({ info }) is called', () => {
      it('Then uses the provided info', () => {
        // Note: custom options bypass the memoized default
        const spec = server.getOpenAPISpec({
          info: { title: 'My API', version: '2.0.0' },
        });
        expect(spec.info.title).toBe('My API');
        expect(spec.info.version).toBe('2.0.0');
      });
    });
  });

  describe('Given a server with only entities (no services)', () => {
    const server = createServer({
      entities: [tasksDef],
    });

    describe('When getOpenAPISpec() is called', () => {
      it('Then returns spec with entity paths only', () => {
        const spec = server.getOpenAPISpec();
        expect(spec.paths['/api/tasks']).toBeDefined();
        expect(spec.openapi).toBe('3.1.0');
      });
    });
  });

  describe('Given a server with version in config', () => {
    const server = createServer({
      entities: [tasksDef],
      version: '3.5.0',
    });

    describe('When getOpenAPISpec() is called without options', () => {
      it('Then uses config.version as the default spec version', () => {
        const spec = server.getOpenAPISpec();
        expect(spec.info.version).toBe('3.5.0');
      });
    });
  });
});

// ---------------------------------------------------------------------------
// Phase 3: Auto-serving at /api/openapi.json
// ---------------------------------------------------------------------------

describe('Feature: /api/openapi.json auto-serving', () => {
  describe('Given a server with entities and services', () => {
    const server = createServer({
      entities: [tasksDef],
      services: [analyticsDef],
    });

    describe('When GET /api/openapi.json is requested', () => {
      it('Then returns 200 with the OpenAPI spec as JSON', async () => {
        const request = new Request('http://localhost/api/openapi.json');
        const response = await server.handler(request);
        expect(response.status).toBe(200);
        const body = await response.json();
        expect(body.openapi).toBe('3.1.0');
        expect(body.paths['/api/tasks']).toBeDefined();
        expect(body.paths['/api/analytics/summary']).toBeDefined();
      });

      it('Then Content-Type is application/json', async () => {
        const request = new Request('http://localhost/api/openapi.json');
        const response = await server.handler(request);
        expect(response.headers.get('content-type')).toContain('application/json');
      });
    });

    describe('When POST /api/openapi.json is requested', () => {
      it('Then returns 405 Method Not Allowed', async () => {
        const request = new Request('http://localhost/api/openapi.json', { method: 'POST' });
        const response = await server.handler(request);
        expect(response.status).toBe(405);
      });
    });
  });

  describe('Given a server with openapi: false', () => {
    const server = createServer({
      entities: [tasksDef],
      openapi: false,
    });

    describe('When GET /api/openapi.json is requested', () => {
      it('Then returns 404', async () => {
        const request = new Request('http://localhost/api/openapi.json');
        const response = await server.handler(request);
        expect(response.status).toBe(404);
      });
    });

    describe('When getOpenAPISpec() is called', () => {
      it('Then still returns the spec (only endpoint is disabled)', () => {
        const spec = server.getOpenAPISpec();
        expect(spec.openapi).toBe('3.1.0');
      });
    });
  });
});
