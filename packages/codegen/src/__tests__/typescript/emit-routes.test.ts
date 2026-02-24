import { describe, expect, it } from 'bun:test';
import { emitRouteMapType } from '../../generators/typescript/emit-routes';
import type { CodegenIR, CodegenModule, CodegenOperation } from '../../types';

// ── Fixture helpers ──────────────────────────────────────────────

function makeOp(overrides: Partial<CodegenOperation>): CodegenOperation {
  return {
    operationId: 'test',
    method: 'GET',
    path: '/test',
    tags: [],
    schemaRefs: {},
    ...overrides,
  };
}

function makeModule(overrides: Partial<CodegenModule>): CodegenModule {
  return {
    name: 'test',
    operations: [],
    ...overrides,
  };
}

function makeIR(overrides: Partial<CodegenIR>): CodegenIR {
  return {
    basePath: '/api',
    modules: [],
    schemas: [],
    auth: { schemes: [] },
    ...overrides,
  };
}

// ── emitRouteMapType ──────────────────────────────────────────────

describe('emitRouteMapType', () => {
  it('generates an empty route map for IR with no modules', () => {
    const result = emitRouteMapType(makeIR({ modules: [] }));

    expect(result.content).toContain('export interface AppRouteMap');
    expect(result.content).toContain('[key: string]: never;');
  });

  it('generates route map entry for GET /users', () => {
    const result = emitRouteMapType(
      makeIR({
        modules: [
          makeModule({
            name: 'users',
            operations: [
              makeOp({
                operationId: 'listUsers',
                method: 'GET',
                path: '/users',
                response: {
                  type: 'array',
                  items: { type: 'object', properties: { id: { type: 'string' } } },
                },
                schemaRefs: { response: 'User[]' },
              }),
            ],
          }),
        ],
      }),
    );

    expect(result.content).toContain("'GET /users':");
    expect(result.content).toContain('response: User[]');
    expect(result.content).toContain('params: Record<string, never>');
    expect(result.content).toContain('query: Record<string, never>');
    expect(result.content).toContain('body: never');
    expect(result.content).toContain('headers: Record<string, never>');
  });

  it('generates route map entry with params for GET /users/:id', () => {
    const result = emitRouteMapType(
      makeIR({
        modules: [
          makeModule({
            name: 'users',
            operations: [
              makeOp({
                operationId: 'getUser',
                method: 'GET',
                path: '/users/:id',
                params: {
                  type: 'object',
                  properties: { id: { type: 'string' } },
                  required: ['id'],
                },
                response: { type: 'object', properties: { id: { type: 'string' } } },
                schemaRefs: { response: 'User' },
              }),
            ],
          }),
        ],
      }),
    );

    expect(result.content).toContain("'GET /users/:id':");
    expect(result.content).toContain('params: { id: string }');
  });

  it('generates route map entry with body for POST /users', () => {
    const result = emitRouteMapType(
      makeIR({
        modules: [
          makeModule({
            name: 'users',
            operations: [
              makeOp({
                operationId: 'createUser',
                method: 'POST',
                path: '/users',
                body: {
                  type: 'object',
                  properties: { name: { type: 'string' } },
                  required: ['name'],
                },
                response: {
                  type: 'object',
                  properties: { id: { type: 'string' }, name: { type: 'string' } },
                },
                schemaRefs: { body: 'CreateUserInput', response: 'User' },
              }),
            ],
          }),
        ],
      }),
    );

    expect(result.content).toContain("'POST /users':");
    expect(result.content).toContain('body: CreateUserInput');
  });

  it('generates route map entry with query params for GET /users with query', () => {
    const result = emitRouteMapType(
      makeIR({
        modules: [
          makeModule({
            name: 'users',
            operations: [
              makeOp({
                operationId: 'listUsers',
                method: 'GET',
                path: '/users',
                query: {
                  type: 'object',
                  properties: { page: { type: 'number' }, limit: { type: 'number' } },
                },
                response: { type: 'array', items: { type: 'object' } },
              }),
            ],
          }),
        ],
      }),
    );

    expect(result.content).toContain("'GET /users':");
    expect(result.content).toContain('query: { page?: number; limit?: number }');
  });

  it('generates route map entry with headers for authenticated endpoint', () => {
    const result = emitRouteMapType(
      makeIR({
        modules: [
          makeModule({
            name: 'users',
            operations: [
              makeOp({
                operationId: 'createUser',
                method: 'POST',
                path: '/users',
                headers: {
                  type: 'object',
                  properties: { 'x-tenant': { type: 'string' } },
                  required: ['x-tenant'],
                },
                body: { type: 'object', properties: { name: { type: 'string' } } },
                response: { type: 'object', properties: { id: { type: 'string' } } },
              }),
            ],
          }),
        ],
      }),
    );

    expect(result.content).toContain("'POST /users':");
    expect(result.content).toContain('headers: { x-tenant: string }');
  });

  it('handles multiple routes in same module', () => {
    const result = emitRouteMapType(
      makeIR({
        modules: [
          makeModule({
            name: 'users',
            operations: [
              makeOp({
                operationId: 'listUsers',
                method: 'GET',
                path: '/users',
                response: { type: 'array', items: { type: 'object' } },
              }),
              makeOp({
                operationId: 'getUser',
                method: 'GET',
                path: '/users/:id',
                params: {
                  type: 'object',
                  properties: { id: { type: 'string' } },
                  required: ['id'],
                },
                response: { type: 'object', properties: { id: { type: 'string' } } },
              }),
              makeOp({
                operationId: 'createUser',
                method: 'POST',
                path: '/users',
                body: { type: 'object', properties: { name: { type: 'string' } } },
                response: { type: 'object', properties: { id: { type: 'string' } } },
              }),
            ],
          }),
        ],
      }),
    );

    expect(result.content).toContain("'GET /users':");
    expect(result.content).toContain("'GET /users/:id':");
    expect(result.content).toContain("'POST /users':");
  });

  it('handles multiple HTTP methods on same path', () => {
    const result = emitRouteMapType(
      makeIR({
        modules: [
          makeModule({
            name: 'users',
            operations: [
              makeOp({
                operationId: 'getUser',
                method: 'GET',
                path: '/users/:id',
                params: {
                  type: 'object',
                  properties: { id: { type: 'string' } },
                  required: ['id'],
                },
                response: { type: 'object', properties: { id: { type: 'string' } } },
              }),
              makeOp({
                operationId: 'updateUser',
                method: 'PUT',
                path: '/users/:id',
                params: {
                  type: 'object',
                  properties: { id: { type: 'string' } },
                  required: ['id'],
                },
                body: { type: 'object', properties: { name: { type: 'string' } } },
                response: { type: 'object', properties: { id: { type: 'string' } } },
              }),
              makeOp({
                operationId: 'deleteUser',
                method: 'DELETE',
                path: '/users/:id',
                params: {
                  type: 'object',
                  properties: { id: { type: 'string' } },
                  required: ['id'],
                },
                response: { type: 'object', properties: { success: { type: 'boolean' } } },
              }),
            ],
          }),
        ],
      }),
    );

    expect(result.content).toContain("'GET /users/:id':");
    expect(result.content).toContain("'PUT /users/:id':");
    expect(result.content).toContain("'DELETE /users/:id':");
  });

  it('includes header comment', () => {
    const result = emitRouteMapType(makeIR({ modules: [] }));

    expect(result.content).toMatch(/^\/\/ Generated by @vertz\/codegen/);
  });

  it('uses inline types when no schemaRefs are available', () => {
    const result = emitRouteMapType(
      makeIR({
        modules: [
          makeModule({
            name: 'users',
            operations: [
              makeOp({
                operationId: 'listUsers',
                method: 'GET',
                path: '/users',
                query: { type: 'object', properties: { page: { type: 'number' } } },
                response: {
                  type: 'array',
                  items: { type: 'object', properties: { id: { type: 'string' } } },
                },
              }),
            ],
          }),
        ],
      }),
    );

    expect(result.content).toContain('query: { page?: number }');
    expect(result.content).toContain('response: { id?: string }[]');
  });
});
