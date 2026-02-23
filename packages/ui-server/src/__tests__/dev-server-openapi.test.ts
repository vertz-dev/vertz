import { createServer, type Server } from 'node:http';
import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { createDevServer, type DevServer } from '../dev-server';

describe('createDevServer OpenAPI endpoint', () => {
  let devServer: DevServer | null = null;
  let server: Server | null = null;
  const port = 3147;

  afterEach(async () => {
    if (devServer) {
      await devServer.close();
      devServer = null;
    }
    if (server) {
      server.close();
      server = null;
    }
  });

  it('serves OpenAPI spec at GET /api/openapi.json when openapi option is provided', async () => {
    // Create a simple OpenAPI spec file
    const { writeFileSync, unlinkSync, mkdirSync } = await import('node:fs');
    const { join } = await import('node:path');
    const { tmpdir } = await import('node:os');

    const tmpDir = join(tmpdir(), 'openapi-dev-test-' + Date.now());
    mkdirSync(tmpDir, { recursive: true });
    const specPath = join(tmpDir, 'openapi.json');

    const openapiSpec = {
      openapi: '3.1.0',
      info: { title: 'Test API', version: '1.0.0' },
      paths: {
        '/todos': {
          get: {
            operationId: 'listTodos',
            tags: ['todos'],
            responses: { '200': { description: 'OK' } },
          },
        },
      },
      components: { schemas: {} },
    };

    writeFileSync(specPath, JSON.stringify(openapiSpec));

    try {
      // Create dev server with OpenAPI option
      devServer = createDevServer({
        entry: './src/entry-server.ts',
        port,
        openapi: {
          specPath,
        },
        skipModuleInvalidation: true,
        logRequests: false,
      });

      // Start the dev server
      await devServer.listen();

      // Get the underlying HTTP server
      server = devServer.httpServer;

      // Make request to OpenAPI endpoint
      const response = await fetch(`http://localhost:${port}/api/openapi.json`);
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(response.headers.get('content-type')).toContain('application/json');
      expect(body.openapi).toBe('3.1.0');
      expect(body.paths['/todos']).toBeDefined();
      expect(body.paths['/todos'].get.operationId).toBe('listTodos');
    } finally {
      unlinkSync(specPath);
    }
  });

  it('returns 404 when OpenAPI endpoint is requested but openapi option not provided', async () => {
    devServer = createDevServer({
      entry: './src/entry-server.ts',
      port,
      skipModuleInvalidation: true,
      logRequests: false,
    });

    await devServer.listen();
    server = devServer.httpServer;

    const response = await fetch(`http://localhost:${port}/api/openapi.json`);

    // Should not be handled by our middleware, will be passed to next (which might be 404)
    // The middleware chain should pass through, and since no other handler handles it, it returns 404
    expect(response.status).toBe(404);
  });

  it('serves valid OpenAPI 3.1.0 spec with todo entity paths', async () => {
    const { writeFileSync, unlinkSync, mkdirSync } = await import('node:fs');
    const { join } = await import('node:path');
    const { tmpdir } = await import('node:os');

    const tmpDir = join(tmpdir(), 'openapi-dev-test-' + Date.now());
    mkdirSync(tmpDir, { recursive: true });
    const specPath = join(tmpDir, 'openapi.json');

    // Simulating entity-todo's OpenAPI spec with todo CRUD paths
    const todoSpec = {
      openapi: '3.1.0',
      info: { title: 'Todo API', version: '1.0.0' },
      paths: {
        '/todos': {
          get: {
            operationId: 'todos_list',
            summary: 'List all todos',
            tags: ['todos'],
            responses: { '200': { description: 'OK' } },
          },
          post: {
            operationId: 'todos_create',
            summary: 'Create a todo',
            tags: ['todos'],
            responses: { '201': { description: 'Created' } },
          },
        },
        '/todos/{id}': {
          get: {
            operationId: 'todos_get',
            summary: 'Get a todo',
            tags: ['todos'],
            parameters: [
              { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
            ],
            responses: { '200': { description: 'OK' } },
          },
          patch: {
            operationId: 'todos_update',
            summary: 'Update a todo',
            tags: ['todos'],
            parameters: [
              { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
            ],
            responses: { '200': { description: 'OK' } },
          },
          delete: {
            operationId: 'todos_delete',
            summary: 'Delete a todo',
            tags: ['todos'],
            parameters: [
              { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
            ],
            responses: { '204': { description: 'No Content' } },
          },
        },
      },
      components: {
        schemas: {
          Todo: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              title: { type: 'string' },
              completed: { type: 'boolean' },
            },
          },
        },
      },
    };

    writeFileSync(specPath, JSON.stringify(todoSpec));

    try {
      devServer = createDevServer({
        entry: './src/entry-server.ts',
        port,
        openapi: {
          specPath,
        },
        skipModuleInvalidation: true,
        logRequests: false,
      });

      await devServer.listen();
      server = devServer.httpServer;

      const response = await fetch(`http://localhost:${port}/api/openapi.json`);
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.openapi).toBe('3.1.0');
      
      // Verify todo entity paths
      expect(body.paths['/todos']).toBeDefined();
      expect(body.paths['/todos'].get.operationId).toBe('todos_list');
      expect(body.paths['/todos'].post.operationId).toBe('todos_create');
      expect(body.paths['/todos/{id}']).toBeDefined();
      expect(body.paths['/todos/{id}'].get.operationId).toBe('todos_get');
      expect(body.paths['/todos/{id}'].patch.operationId).toBe('todos_update');
      expect(body.paths['/todos/{id}'].delete.operationId).toBe('todos_delete');
      
      // Verify components/schemas
      expect(body.components.schemas.Todo).toBeDefined();
      expect(body.components.schemas.Todo.properties.id).toEqual({ type: 'string' });
    } finally {
      unlinkSync(specPath);
    }
  });
});
