import { describe, expect, it } from 'vitest';
import {
  emitAuthStrategyBuilder,
  emitClientFile,
  emitModuleFile,
  emitOperationMethod,
  emitSDKConfig,
  emitStreamingMethod,
} from '../../generators/typescript/emit-client';
import type { CodegenAuth, CodegenIR, CodegenModule, CodegenOperation } from '../../types';

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

function makeAuth(overrides: Partial<CodegenAuth>): CodegenAuth {
  return {
    schemes: [],
    ...overrides,
  };
}

function makeIR(overrides: Partial<CodegenIR>): CodegenIR {
  return {
    basePath: '/api/v1',
    modules: [],
    schemas: [],
    auth: makeAuth({}),
    ...overrides,
  };
}

// ── emitSDKConfig ────────────────────────────────────────────────

describe('emitSDKConfig', () => {
  it('generates a config interface extending FetchClientConfig with no auth fields when API has no auth', () => {
    const result = emitSDKConfig(makeAuth({}));

    expect(result.content).toContain('export interface SDKConfig extends FetchClientConfig');
    expect(result.content).not.toContain('token');
    expect(result.content).not.toContain('apiKey');
    expect(result.imports).toContainEqual({
      from: '@vertz/fetch',
      name: 'FetchClientConfig',
      isType: true,
    });
  });

  it('adds a token field when API has bearer auth', () => {
    const result = emitSDKConfig(
      makeAuth({
        schemes: [{ type: 'bearer', name: 'bearerAuth' }],
      }),
    );

    expect(result.content).toContain('token?: string | (() => string | Promise<string>)');
  });

  it('adds an apiKey field when API has API key auth', () => {
    const result = emitSDKConfig(
      makeAuth({
        schemes: [{ type: 'apiKey', name: 'apiKeyAuth', in: 'header', paramName: 'X-API-Key' }],
      }),
    );

    expect(result.content).toContain('apiKey?: string | (() => string | Promise<string>)');
    expect(result.content).not.toContain('token');
  });

  it('adds both token and apiKey fields when API has both auth schemes', () => {
    const result = emitSDKConfig(
      makeAuth({
        schemes: [
          { type: 'bearer', name: 'bearerAuth' },
          { type: 'apiKey', name: 'apiKeyAuth', in: 'header', paramName: 'X-API-Key' },
        ],
      }),
    );

    expect(result.content).toContain('token?:');
    expect(result.content).toContain('apiKey?:');
  });
});

// ── emitAuthStrategyBuilder ──────────────────────────────────────

describe('emitAuthStrategyBuilder', () => {
  it('returns empty array spread when API has no auth', () => {
    const result = emitAuthStrategyBuilder(makeAuth({}));

    expect(result.content).toContain(
      'const authStrategies: AuthStrategy[] = [...(config.authStrategies ?? [])]',
    );
    expect(result.content).not.toContain('config.token');
    expect(result.imports).toContainEqual({
      from: '@vertz/fetch',
      name: 'AuthStrategy',
      isType: true,
    });
  });

  it('adds bearer strategy push when API has bearer auth', () => {
    const result = emitAuthStrategyBuilder(
      makeAuth({
        schemes: [{ type: 'bearer', name: 'bearerAuth' }],
      }),
    );

    expect(result.content).toContain('config.token');
    expect(result.content).toContain("type: 'bearer'");
    expect(result.content).toContain('token: config.token');
  });

  it('adds apiKey strategy push when API has API key auth', () => {
    const result = emitAuthStrategyBuilder(
      makeAuth({
        schemes: [{ type: 'apiKey', name: 'apiKeyAuth', in: 'header', paramName: 'X-API-Key' }],
      }),
    );

    expect(result.content).toContain('config.apiKey');
    expect(result.content).toContain("type: 'apiKey'");
    expect(result.content).toContain("name: 'X-API-Key'");
    expect(result.content).toContain("location: 'header'");
  });
});

// ── emitOperationMethod ──────────────────────────────────────────

describe('emitOperationMethod', () => {
  it('generates a GET method with query params', () => {
    const result = emitOperationMethod(
      makeOp({
        operationId: 'listUsers',
        method: 'GET',
        path: '/api/v1/users',
        query: { type: 'object', properties: { page: { type: 'number' } } },
        response: {
          type: 'object',
          properties: { items: { type: 'array', items: { type: 'string' } } },
        },
      }),
    );

    expect(result.content).toContain('listUsers(');
    expect(result.content).toContain("client.request('GET'");
    expect(result.content).toContain("'/api/v1/users'");
    expect(result.content).toContain('query: input?.query');
    expect(result.imports).toContainEqual(
      expect.objectContaining({ name: 'ListUsersInput', isType: true }),
    );
    expect(result.imports).toContainEqual(
      expect.objectContaining({ name: 'ListUsersResponse', isType: true }),
    );
  });

  it('interpolates path parameters using template literal', () => {
    const result = emitOperationMethod(
      makeOp({
        operationId: 'getUser',
        method: 'GET',
        path: '/api/v1/users/:id',
        params: {
          type: 'object',
          properties: { id: { type: 'string' } },
          required: ['id'],
        },
      }),
    );

    // biome-ignore lint/suspicious/noTemplateCurlyInString: testing generated template literals
    expect(result.content).toContain('${input.params.id}');
    expect(result.content).toContain('`/api/v1/users/');
    expect(result.content).not.toContain("'/api/v1/users/:id'");
  });

  it('interpolates multiple path parameters', () => {
    const result = emitOperationMethod(
      makeOp({
        operationId: 'getOrgUser',
        method: 'GET',
        path: '/api/v1/orgs/:orgId/users/:userId',
        params: {
          type: 'object',
          properties: { orgId: { type: 'string' }, userId: { type: 'string' } },
          required: ['orgId', 'userId'],
        },
      }),
    );

    // biome-ignore lint/suspicious/noTemplateCurlyInString: testing generated template literals
    expect(result.content).toContain('${input.params.orgId}');
    // biome-ignore lint/suspicious/noTemplateCurlyInString: testing generated template literals
    expect(result.content).toContain('${input.params.userId}');
  });

  it('generates a POST method with body', () => {
    const result = emitOperationMethod(
      makeOp({
        operationId: 'createUser',
        method: 'POST',
        path: '/api/v1/users',
        body: {
          type: 'object',
          properties: { name: { type: 'string' } },
          required: ['name'],
        },
      }),
    );

    expect(result.content).toContain("client.request('POST'");
    expect(result.content).toContain('body: input.body');
    expect(result.content).toContain('input: CreateUserInput');
  });

  it('generates a no-input method for operations without params, query, body, or headers', () => {
    const result = emitOperationMethod(
      makeOp({
        operationId: 'healthCheck',
        method: 'GET',
        path: '/api/v1/health',
      }),
    );

    expect(result.content).toContain('healthCheck()');
    expect(result.content).not.toContain('input');
    expect(result.imports).not.toContainEqual(
      expect.objectContaining({ name: 'HealthCheckInput' }),
    );
  });

  it('makes input optional when only query is present (no params or body)', () => {
    const result = emitOperationMethod(
      makeOp({
        operationId: 'listUsers',
        method: 'GET',
        path: '/api/v1/users',
        query: { type: 'object', properties: { page: { type: 'number' } } },
      }),
    );

    expect(result.content).toContain('input?: ListUsersInput');
  });

  it('makes input required when params are present', () => {
    const result = emitOperationMethod(
      makeOp({
        operationId: 'getUser',
        method: 'GET',
        path: '/api/v1/users/:id',
        params: {
          type: 'object',
          properties: { id: { type: 'string' } },
          required: ['id'],
        },
      }),
    );

    expect(result.content).toContain('input: GetUserInput');
    expect(result.content).not.toContain('input?:');
  });

  it('includes header forwarding in request options', () => {
    const result = emitOperationMethod(
      makeOp({
        operationId: 'listUsers',
        method: 'GET',
        path: '/api/v1/users',
        headers: {
          type: 'object',
          properties: { 'x-tenant': { type: 'string' } },
        },
      }),
    );

    expect(result.content).toContain('headers: input?.headers');
  });

  it('generates a PUT method with both params and body', () => {
    const result = emitOperationMethod(
      makeOp({
        operationId: 'updateUser',
        method: 'PUT',
        path: '/api/v1/users/:id',
        params: {
          type: 'object',
          properties: { id: { type: 'string' } },
          required: ['id'],
        },
        body: {
          type: 'object',
          properties: { name: { type: 'string' } },
        },
      }),
    );

    expect(result.content).toContain("client.request('PUT'");
    // biome-ignore lint/suspicious/noTemplateCurlyInString: testing generated template literals
    expect(result.content).toContain('${input.params.id}');
    expect(result.content).toContain('body: input.body');
  });

  it('generates a DELETE method', () => {
    const result = emitOperationMethod(
      makeOp({
        operationId: 'deleteUser',
        method: 'DELETE',
        path: '/api/v1/users/:id',
        params: {
          type: 'object',
          properties: { id: { type: 'string' } },
          required: ['id'],
        },
      }),
    );

    expect(result.content).toContain("client.request('DELETE'");
  });

  it('generates a PATCH method', () => {
    const result = emitOperationMethod(
      makeOp({
        operationId: 'patchUser',
        method: 'PATCH',
        path: '/api/v1/users/:id',
        params: {
          type: 'object',
          properties: { id: { type: 'string' } },
          required: ['id'],
        },
        body: { type: 'object', properties: { name: { type: 'string' } } },
      }),
    );

    expect(result.content).toContain("client.request('PATCH'");
    expect(result.content).toContain('body: input.body');
  });

  it('includes both query and body in request options', () => {
    const result = emitOperationMethod(
      makeOp({
        operationId: 'searchUsers',
        method: 'POST',
        path: '/api/v1/users/search',
        query: { type: 'object', properties: { limit: { type: 'number' } } },
        body: { type: 'object', properties: { filter: { type: 'string' } } },
      }),
    );

    expect(result.content).toContain('query: input?.query');
    expect(result.content).toContain('body: input.body');
  });
});

// ── emitStreamingMethod ──────────────────────────────────────────

describe('emitStreamingMethod', () => {
  it('generates an async generator method for SSE streaming operations', () => {
    const result = emitStreamingMethod(
      makeOp({
        operationId: 'streamEvents',
        method: 'GET',
        path: '/api/v1/events',
        streaming: { format: 'sse' },
      }),
    );

    expect(result.content).toContain('async *streamEvents(');
    expect(result.content).toContain('AsyncGenerator<StreamEventsEvent>');
    expect(result.content).toContain('client.requestStream');
    expect(result.content).toContain("format: 'sse'");
    expect(result.imports).toContainEqual(
      expect.objectContaining({ name: 'StreamEventsEvent', isType: true }),
    );
  });

  it('generates an async generator method for NDJSON streaming operations', () => {
    const result = emitStreamingMethod(
      makeOp({
        operationId: 'streamLogs',
        method: 'GET',
        path: '/api/v1/logs',
        streaming: { format: 'ndjson' },
      }),
    );

    expect(result.content).toContain("format: 'ndjson'");
  });

  it('includes query params in streaming request options', () => {
    const result = emitStreamingMethod(
      makeOp({
        operationId: 'streamEvents',
        method: 'GET',
        path: '/api/v1/events',
        streaming: { format: 'sse' },
        query: { type: 'object', properties: { channel: { type: 'string' } } },
      }),
    );

    expect(result.content).toContain('query: input?.query');
    expect(result.content).toContain('input?: StreamEventsInput');
  });

  it('includes path interpolation in streaming methods', () => {
    const result = emitStreamingMethod(
      makeOp({
        operationId: 'streamUserEvents',
        method: 'GET',
        path: '/api/v1/users/:userId/events',
        streaming: { format: 'sse' },
        params: {
          type: 'object',
          properties: { userId: { type: 'string' } },
          required: ['userId'],
        },
      }),
    );

    // biome-ignore lint/suspicious/noTemplateCurlyInString: testing generated template literals
    expect(result.content).toContain('${input.params.userId}');
    expect(result.content).toContain('input: StreamUserEventsInput');
  });

  it('uses yield* to delegate to client.requestStream', () => {
    const result = emitStreamingMethod(
      makeOp({
        operationId: 'streamEvents',
        method: 'GET',
        path: '/api/v1/events',
        streaming: { format: 'sse' },
      }),
    );

    expect(result.content).toContain('yield* client.requestStream');
  });

  it('generates no-input streaming method when no params or query', () => {
    const result = emitStreamingMethod(
      makeOp({
        operationId: 'streamAll',
        method: 'GET',
        path: '/api/v1/stream',
        streaming: { format: 'sse' },
      }),
    );

    expect(result.content).toContain('async *streamAll()');
    expect(result.content).not.toContain('input');
  });
});

// ── emitModuleFile ───────────────────────────────────────────────

describe('emitModuleFile', () => {
  it('generates a module file with a factory function and all operations', () => {
    const result = emitModuleFile(
      makeModule({
        name: 'users',
        operations: [
          makeOp({
            operationId: 'listUsers',
            method: 'GET',
            path: '/api/v1/users',
            query: { type: 'object', properties: { page: { type: 'number' } } },
          }),
          makeOp({
            operationId: 'createUser',
            method: 'POST',
            path: '/api/v1/users',
            body: {
              type: 'object',
              properties: { name: { type: 'string' } },
              required: ['name'],
            },
          }),
        ],
      }),
    );

    expect(result.path).toBe('modules/users.ts');
    expect(result.content).toContain('export function createUsersModule(client: FetchClient)');
    expect(result.content).toContain('listUsers(');
    expect(result.content).toContain('createUser(');
    expect(result.content).toContain('return {');
  });

  it('includes auto-generated header comment', () => {
    const result = emitModuleFile(makeModule({ name: 'health', operations: [] }));

    expect(result.content).toMatch(/^\/\/ Generated by @vertz\/codegen/);
  });

  it('imports FetchClient from @vertz/fetch', () => {
    const result = emitModuleFile(
      makeModule({
        name: 'users',
        operations: [
          makeOp({
            operationId: 'listUsers',
            method: 'GET',
            path: '/api/v1/users',
          }),
        ],
      }),
    );

    expect(result.content).toContain("import { FetchClient } from '@vertz/fetch'");
  });

  it('imports types from the types directory', () => {
    const result = emitModuleFile(
      makeModule({
        name: 'users',
        operations: [
          makeOp({
            operationId: 'listUsers',
            method: 'GET',
            path: '/api/v1/users',
            query: { type: 'object', properties: { page: { type: 'number' } } },
          }),
        ],
      }),
    );

    expect(result.content).toContain("from '../types'");
  });

  it('routes streaming operations to emitStreamingMethod', () => {
    const result = emitModuleFile(
      makeModule({
        name: 'events',
        operations: [
          makeOp({
            operationId: 'streamEvents',
            method: 'GET',
            path: '/api/v1/events',
            streaming: { format: 'sse' },
          }),
        ],
      }),
    );

    expect(result.content).toContain('async *streamEvents');
    expect(result.content).toContain('client.requestStream');
  });

  it('mixes streaming and non-streaming operations in the same module', () => {
    const result = emitModuleFile(
      makeModule({
        name: 'events',
        operations: [
          makeOp({
            operationId: 'listEvents',
            method: 'GET',
            path: '/api/v1/events',
            query: { type: 'object', properties: { page: { type: 'number' } } },
          }),
          makeOp({
            operationId: 'streamEvents',
            method: 'GET',
            path: '/api/v1/events/stream',
            streaming: { format: 'sse' },
          }),
        ],
      }),
    );

    expect(result.content).toContain('listEvents(');
    expect(result.content).toContain('async *streamEvents');
  });

  it('generates correct path for nested module names', () => {
    const result = emitModuleFile(makeModule({ name: 'billing', operations: [] }));
    expect(result.path).toBe('modules/billing.ts');
  });

  it('generates module with no operations', () => {
    const result = emitModuleFile(makeModule({ name: 'empty', operations: [] }));

    expect(result.content).toContain('export function createEmptyModule(client: FetchClient)');
    expect(result.content).toContain('return {');
  });
});

// ── emitClientFile ───────────────────────────────────────────────

describe('emitClientFile', () => {
  it('generates a client.ts that imports and composes all module factories', () => {
    const result = emitClientFile(
      makeIR({
        modules: [
          makeModule({
            name: 'users',
            operations: [
              makeOp({
                operationId: 'listUsers',
                method: 'GET',
                path: '/api/v1/users',
              }),
            ],
          }),
          makeModule({
            name: 'billing',
            operations: [
              makeOp({
                operationId: 'listInvoices',
                method: 'GET',
                path: '/api/v1/invoices',
              }),
            ],
          }),
        ],
      }),
    );

    expect(result.path).toBe('client.ts');
    expect(result.content).toContain('export function createClient(config: SDKConfig)');
    expect(result.content).toContain('users: createUsersModule(client)');
    expect(result.content).toContain('billing: createBillingModule(client)');
  });

  it('includes auto-generated header comment', () => {
    const result = emitClientFile(makeIR({}));
    expect(result.content).toMatch(/^\/\/ Generated by @vertz\/codegen/);
  });

  it('imports FetchClient from @vertz/fetch', () => {
    const result = emitClientFile(makeIR({}));
    expect(result.content).toContain("import { FetchClient } from '@vertz/fetch'");
  });

  it('imports module factories from module files', () => {
    const result = emitClientFile(
      makeIR({
        modules: [
          makeModule({ name: 'users', operations: [] }),
          makeModule({ name: 'billing', operations: [] }),
        ],
      }),
    );

    expect(result.content).toContain("from './modules/users'");
    expect(result.content).toContain("from './modules/billing'");
  });

  it('imports Result and FetchError types from @vertz/errors', () => {
    const result = emitClientFile(makeIR({}));

    expect(result.content).toContain("import type { FetchError, Result } from '@vertz/errors'");
  });

  it('includes SDKConfig interface from emitSDKConfig', () => {
    const result = emitClientFile(
      makeIR({
        auth: makeAuth({
          schemes: [{ type: 'bearer', name: 'bearerAuth' }],
        }),
      }),
    );

    expect(result.content).toContain('export interface SDKConfig extends FetchClientConfig');
    expect(result.content).toContain('token?:');
  });

  it('includes auth strategy builder logic', () => {
    const result = emitClientFile(
      makeIR({
        auth: makeAuth({
          schemes: [{ type: 'bearer', name: 'bearerAuth' }],
        }),
      }),
    );

    expect(result.content).toContain('authStrategies');
    expect(result.content).toContain('config.token');
  });

  it('creates FetchClient with spread config and auth strategies', () => {
    const result = emitClientFile(makeIR({}));

    expect(result.content).toContain('new FetchClient({');
    expect(result.content).toContain('...config');
    expect(result.content).toContain('authStrategies');
  });

  it('generates empty return object when there are no modules', () => {
    const result = emitClientFile(makeIR({ modules: [] }));

    expect(result.content).toContain('return {');
    expect(result.content).toContain('};');
  });

  it('converts module names to camelCase for property names', () => {
    const result = emitClientFile(
      makeIR({
        modules: [makeModule({ name: 'user-profiles', operations: [] })],
      }),
    );

    expect(result.content).toContain('userProfiles: createUserProfilesModule(client)');
  });

  it('handles API with no auth - no token or apiKey fields', () => {
    const result = emitClientFile(makeIR({ auth: makeAuth({}) }));

    expect(result.content).toContain('export interface SDKConfig extends FetchClientConfig {}');
    expect(result.content).not.toContain('config.token');
    expect(result.content).not.toContain('config.apiKey');
  });

  it('handles API with API key auth in query location', () => {
    const result = emitClientFile(
      makeIR({
        auth: makeAuth({
          schemes: [{ type: 'apiKey', name: 'queryKey', in: 'query', paramName: 'api_key' }],
        }),
      }),
    );

    expect(result.content).toContain('apiKey?:');
    expect(result.content).toContain("location: 'query'");
    expect(result.content).toContain("name: 'api_key'");
  });
});

// ── Integration: full IR to generated files ──────────────────────

describe('integration', () => {
  it('generates a complete SDK for an IR with multiple modules and auth', () => {
    const ir = makeIR({
      auth: makeAuth({
        schemes: [{ type: 'bearer', name: 'bearerAuth' }],
      }),
      modules: [
        makeModule({
          name: 'users',
          operations: [
            makeOp({
              operationId: 'listUsers',
              method: 'GET',
              path: '/api/v1/users',
              query: { type: 'object', properties: { page: { type: 'number' } } },
            }),
            makeOp({
              operationId: 'getUser',
              method: 'GET',
              path: '/api/v1/users/:id',
              params: {
                type: 'object',
                properties: { id: { type: 'string' } },
                required: ['id'],
              },
            }),
            makeOp({
              operationId: 'createUser',
              method: 'POST',
              path: '/api/v1/users',
              body: {
                type: 'object',
                properties: { name: { type: 'string' } },
                required: ['name'],
              },
            }),
          ],
        }),
        makeModule({
          name: 'events',
          operations: [
            makeOp({
              operationId: 'streamEvents',
              method: 'GET',
              path: '/api/v1/events',
              streaming: { format: 'sse' },
              query: { type: 'object', properties: { channel: { type: 'string' } } },
            }),
          ],
        }),
      ],
    });

    // Client file
    const clientFile = emitClientFile(ir);
    expect(clientFile.path).toBe('client.ts');
    expect(clientFile.content).toContain('createClient');
    expect(clientFile.content).toContain('users: createUsersModule');
    expect(clientFile.content).toContain('events: createEventsModule');
    expect(clientFile.content).toContain('token?:');

    // Users module
    const usersModule = emitModuleFile(ir.modules[0] ?? makeModule({ name: 'users' }));
    expect(usersModule.path).toBe('modules/users.ts');
    expect(usersModule.content).toContain('createUsersModule');
    expect(usersModule.content).toContain('listUsers');
    expect(usersModule.content).toContain('getUser');
    expect(usersModule.content).toContain('createUser');

    // Events module
    const eventsModule = emitModuleFile(ir.modules[1] ?? makeModule({ name: 'events' }));
    expect(eventsModule.path).toBe('modules/events.ts');
    expect(eventsModule.content).toContain('createEventsModule');
    expect(eventsModule.content).toContain('async *streamEvents');
  });
});
