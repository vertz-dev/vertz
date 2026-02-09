import { describe, expect, it } from 'vitest';
import {
  emitAuthStrategyBuilder,
  emitOperationMethod,
  emitSDKConfig,
} from '../../generators/typescript/emit-client';
import type { CodegenAuth, CodegenOperation } from '../../types';

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

function makeAuth(overrides: Partial<CodegenAuth>): CodegenAuth {
  return {
    schemes: [],
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
});
