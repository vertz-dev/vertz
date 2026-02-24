import { describe, expect, it } from 'bun:test';
import {
  emitInterfaceFromSchema,
  emitModuleTypesFile,
  emitOperationInputType,
  emitOperationResponseType,
  emitSharedTypesFile,
  emitStreamingEventType,
} from '../../generators/typescript/emit-types';
import type { CodegenModule, CodegenOperation, CodegenSchema } from '../../types';

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

function makeSchema(overrides: Partial<CodegenSchema>): CodegenSchema {
  return {
    name: 'TestSchema',
    jsonSchema: { type: 'object' },
    annotations: { namingParts: {} },
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

// ── emitInterfaceFromSchema ──────────────────────────────────────

describe('emitInterfaceFromSchema', () => {
  it('converts a named schema with object properties into an exported interface', () => {
    const result = emitInterfaceFromSchema(
      makeSchema({
        name: 'CreateUserBody',
        jsonSchema: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            email: { type: 'string' },
          },
          required: ['name', 'email'],
        },
        annotations: { namingParts: { operation: 'create', entity: 'User', part: 'Body' } },
      }),
    );

    expect(result.content).toContain('export interface CreateUserBody');
    expect(result.content).toContain('name: string');
    expect(result.content).toContain('email: string');
    expect(result.imports).toEqual([]);
  });

  it('emits a type alias for non-object schemas (e.g. array, union)', () => {
    const result = emitInterfaceFromSchema(
      makeSchema({
        name: 'UserIds',
        jsonSchema: { type: 'array', items: { type: 'string' } },
      }),
    );

    expect(result.content).toContain('export type UserIds = string[]');
    expect(result.imports).toEqual([]);
  });

  it('emits a type alias for enum schemas', () => {
    const result = emitInterfaceFromSchema(
      makeSchema({
        name: 'UserRole',
        jsonSchema: { enum: ['admin', 'user', 'guest'] },
      }),
    );

    expect(result.content).toContain("export type UserRole = 'admin' | 'user' | 'guest'");
  });

  it('includes JSDoc description when annotation has description', () => {
    const result = emitInterfaceFromSchema(
      makeSchema({
        name: 'User',
        jsonSchema: {
          type: 'object',
          properties: { id: { type: 'string' } },
          required: ['id'],
        },
        annotations: { description: 'A user in the system', namingParts: {} },
      }),
    );

    expect(result.content).toContain('/** A user in the system */');
    expect(result.content).toContain('export interface User');
  });

  it('includes @deprecated tag when annotation is deprecated', () => {
    const result = emitInterfaceFromSchema(
      makeSchema({
        name: 'LegacyUser',
        jsonSchema: {
          type: 'object',
          properties: { id: { type: 'string' } },
          required: ['id'],
        },
        annotations: { deprecated: true, namingParts: {} },
      }),
    );

    expect(result.content).toContain('@deprecated');
    expect(result.content).toContain('export interface LegacyUser');
  });

  it('includes both description and @deprecated in JSDoc', () => {
    const result = emitInterfaceFromSchema(
      makeSchema({
        name: 'OldUser',
        jsonSchema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
        annotations: {
          description: 'Use NewUser instead',
          deprecated: true,
          namingParts: {},
        },
      }),
    );

    expect(result.content).toContain('Use NewUser instead');
    expect(result.content).toContain('@deprecated');
  });

  it('extracts $defs as additional exported types', () => {
    const result = emitInterfaceFromSchema(
      makeSchema({
        name: 'UserResponse',
        jsonSchema: {
          $defs: {
            Address: {
              type: 'object',
              properties: { city: { type: 'string' } },
              required: ['city'],
            },
          },
          type: 'object',
          properties: {
            name: { type: 'string' },
            address: { $ref: '#/$defs/Address' },
          },
          required: ['name', 'address'],
        },
      }),
    );

    expect(result.content).toContain('export interface Address');
    expect(result.content).toContain('export interface UserResponse');
  });

  it('handles empty object schemas as Record<string, unknown>', () => {
    const result = emitInterfaceFromSchema(
      makeSchema({
        name: 'Metadata',
        jsonSchema: { type: 'object' },
      }),
    );

    expect(result.content).toContain('export type Metadata = Record<string, unknown>');
  });
});

// ── emitOperationInputType ───────────────────────────────────────

describe('emitOperationInputType', () => {
  it('generates input type with params, query, and body slots', () => {
    const result = emitOperationInputType(
      makeOp({
        operationId: 'createUser',
        method: 'POST',
        path: '/api/users',
        params: {
          type: 'object',
          properties: { orgId: { type: 'string' } },
          required: ['orgId'],
        },
        query: { type: 'object', properties: { notify: { type: 'boolean' } } },
        body: {
          type: 'object',
          properties: { name: { type: 'string' } },
          required: ['name'],
        },
      }),
    );

    expect(result.content).toContain('export interface CreateUserInput');
    expect(result.content).toContain('params: { orgId: string }');
    expect(result.content).toContain('query?: { notify?: boolean }');
    expect(result.content).toContain('body: { name: string }');
    expect(result.imports).toEqual([]);
  });

  it('generates empty content for operation with no inputs', () => {
    const result = emitOperationInputType(makeOp({ operationId: 'healthCheck' }));

    expect(result.content).toBe('');
    expect(result.imports).toEqual([]);
  });

  it('uses named schema ref for body when schemaRef is present', () => {
    const result = emitOperationInputType(
      makeOp({
        operationId: 'createUser',
        method: 'POST',
        body: { type: 'object', properties: { name: { type: 'string' } } },
        schemaRefs: { body: 'CreateUserBody' },
      }),
    );

    expect(result.content).toContain('body: CreateUserBody');
    expect(result.imports).toContainEqual({ from: '', name: 'CreateUserBody', isType: true });
  });

  it('uses named schema refs for multiple slots', () => {
    const result = emitOperationInputType(
      makeOp({
        operationId: 'updateUser',
        method: 'PUT',
        params: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
        body: { type: 'object', properties: { name: { type: 'string' } } },
        schemaRefs: { params: 'GetUserParams', body: 'UpdateUserBody' },
      }),
    );

    expect(result.content).toContain('params: GetUserParams');
    expect(result.content).toContain('body: UpdateUserBody');
    expect(result.imports).toHaveLength(2);
  });

  it('includes JSDoc comment for input type', () => {
    const result = emitOperationInputType(
      makeOp({
        operationId: 'listUsers',
        description: 'List all users',
        query: { type: 'object', properties: { page: { type: 'number' } } },
      }),
    );

    expect(result.content).toContain('/** Input for listUsers */');
    expect(result.content).toContain('export interface ListUsersInput');
  });

  it('generates headers slot as optional', () => {
    const result = emitOperationInputType(
      makeOp({
        operationId: 'listUsers',
        headers: {
          type: 'object',
          properties: { 'x-tenant': { type: 'string' } },
          required: ['x-tenant'],
        },
      }),
    );

    expect(result.content).toContain('headers?:');
  });
});

// ── emitOperationResponseType ────────────────────────────────────

describe('emitOperationResponseType', () => {
  it('generates response type from inline schema', () => {
    const result = emitOperationResponseType(
      makeOp({
        operationId: 'listUsers',
        response: {
          type: 'object',
          properties: {
            items: { type: 'array', items: { type: 'string' } },
            total: { type: 'number' },
          },
          required: ['items', 'total'],
        },
      }),
    );

    expect(result.content).toContain('export interface ListUsersResponse');
    expect(result.content).toContain('items: string[]');
    expect(result.content).toContain('total: number');
  });

  it('returns void type alias when no response schema exists', () => {
    const result = emitOperationResponseType(
      makeOp({ operationId: 'deleteUser', method: 'DELETE' }),
    );

    expect(result.content).toContain('export type DeleteUserResponse = void');
  });

  it('uses named schema ref for response when available', () => {
    const result = emitOperationResponseType(
      makeOp({
        operationId: 'getUser',
        response: { type: 'object', properties: { id: { type: 'string' } } },
        schemaRefs: { response: 'UserResponse' },
      }),
    );

    expect(result.content).toContain('export type GetUserResponse = UserResponse');
    expect(result.imports).toContainEqual({ from: '', name: 'UserResponse', isType: true });
  });

  it('emits array response type correctly', () => {
    const result = emitOperationResponseType(
      makeOp({
        operationId: 'listTags',
        response: { type: 'array', items: { type: 'string' } },
      }),
    );

    expect(result.content).toContain('export type ListTagsResponse = string[]');
  });
});

// ── emitStreamingEventType ───────────────────────────────────────

describe('emitStreamingEventType', () => {
  it('generates event type from streaming eventSchema', () => {
    const result = emitStreamingEventType(
      makeOp({
        operationId: 'streamEvents',
        streaming: {
          format: 'sse',
          eventSchema: {
            type: 'object',
            properties: { type: { type: 'string' }, data: { type: 'string' } },
            required: ['type', 'data'],
          },
        },
      }),
    );

    expect(result.content).toContain('export interface StreamEventsEvent');
    expect(result.content).toContain('type: string');
    expect(result.content).toContain('data: string');
  });

  it('returns unknown type when no eventSchema is provided', () => {
    const result = emitStreamingEventType(
      makeOp({
        operationId: 'streamLogs',
        streaming: { format: 'ndjson' },
      }),
    );

    expect(result.content).toContain('export type StreamLogsEvent = unknown');
  });

  it('returns empty content for non-streaming operations', () => {
    const result = emitStreamingEventType(makeOp({ operationId: 'listUsers' }));
    expect(result.content).toBe('');
  });
});

// ── emitModuleTypesFile ──────────────────────────────────────────

describe('emitModuleTypesFile', () => {
  it('assembles a complete types file for a module with operations and schemas', () => {
    const result = emitModuleTypesFile(
      makeModule({
        name: 'users',
        operations: [
          makeOp({
            operationId: 'listUsers',
            query: { type: 'object', properties: { page: { type: 'number' } } },
            response: {
              type: 'object',
              properties: { items: { type: 'array', items: { type: 'string' } } },
              required: ['items'],
            },
          }),
          makeOp({
            operationId: 'createUser',
            method: 'POST',
            body: {
              type: 'object',
              properties: { name: { type: 'string' } },
              required: ['name'],
            },
          }),
        ],
      }),
      [makeSchema({ name: 'UserRole', jsonSchema: { enum: ['admin', 'user'] } })],
    );

    expect(result.content).toContain('Generated by @vertz/codegen');
    expect(result.content).toContain('export interface ListUsersInput');
    expect(result.content).toContain('export interface ListUsersResponse');
    expect(result.content).toContain('export interface CreateUserInput');
    expect(result.content).toContain("export type UserRole = 'admin' | 'user'");
  });

  it('includes auto-generated header comment', () => {
    const result = emitModuleTypesFile(
      makeModule({
        name: 'health',
        operations: [makeOp({ operationId: 'healthCheck' })],
      }),
      [],
    );

    expect(result.content).toMatch(/^\/\/ Generated by @vertz\/codegen/);
  });

  it('produces a GeneratedFile with correct path', () => {
    const result = emitModuleTypesFile(makeModule({ name: 'users' }), []);
    expect(result.path).toBe('types/users.ts');
  });

  it('emits streaming event types in module file', () => {
    const result = emitModuleTypesFile(
      makeModule({
        name: 'events',
        operations: [
          makeOp({
            operationId: 'streamEvents',
            streaming: {
              format: 'sse',
              eventSchema: {
                type: 'object',
                properties: { type: { type: 'string' } },
                required: ['type'],
              },
            },
          }),
        ],
      }),
      [],
    );

    expect(result.content).toContain('export interface StreamEventsEvent');
  });

  it('omits empty input types for operations without inputs', () => {
    const result = emitModuleTypesFile(
      makeModule({
        name: 'health',
        operations: [makeOp({ operationId: 'healthCheck' })],
      }),
      [],
    );

    expect(result.content).not.toContain('HealthCheckInput');
    expect(result.content).toContain('export type HealthCheckResponse = void');
  });

  it('handles module with no operations and no schemas', () => {
    const result = emitModuleTypesFile(makeModule({ name: 'empty' }), []);

    expect(result.path).toBe('types/empty.ts');
    expect(result.content).toContain('Generated by @vertz/codegen');
  });
});

// ── emitSharedTypesFile ──────────────────────────────────────────

describe('emitSharedTypesFile', () => {
  it('generates a shared types file with multiple schemas', () => {
    const result = emitSharedTypesFile([
      makeSchema({
        name: 'Pagination',
        jsonSchema: {
          type: 'object',
          properties: {
            page: { type: 'number' },
            limit: { type: 'number' },
            total: { type: 'number' },
          },
          required: ['page', 'limit', 'total'],
        },
      }),
      makeSchema({
        name: 'ErrorResponse',
        jsonSchema: {
          type: 'object',
          properties: {
            message: { type: 'string' },
            code: { type: 'number' },
          },
          required: ['message', 'code'],
        },
      }),
    ]);

    expect(result.content).toContain('Generated by @vertz/codegen');
    expect(result.content).toContain('export interface Pagination');
    expect(result.content).toContain('export interface ErrorResponse');
    expect(result.path).toBe('types/shared.ts');
  });

  it('generates an empty shared file when no shared schemas exist', () => {
    const result = emitSharedTypesFile([]);

    expect(result.path).toBe('types/shared.ts');
    expect(result.content).toContain('Generated by @vertz/codegen');
  });

  it('preserves schema annotations in shared types', () => {
    const result = emitSharedTypesFile([
      makeSchema({
        name: 'DeprecatedType',
        jsonSchema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
        annotations: {
          description: 'This is old',
          deprecated: true,
          namingParts: {},
        },
      }),
    ]);

    expect(result.content).toContain('/** This is old');
    expect(result.content).toContain('@deprecated');
  });
});

// ── Name collision handling ──────────────────────────────────────

describe('name collision handling', () => {
  it('emits collision-resolved schema names as provided by the IR adapter', () => {
    // The IR adapter resolves collisions before passing to emitters.
    // This test verifies emitters faithfully use the resolved names.
    const result = emitModuleTypesFile(
      makeModule({
        name: 'users',
        operations: [
          makeOp({
            operationId: 'createUser',
            method: 'POST',
            body: { type: 'object' },
            schemaRefs: { body: 'UsersCreateBody' },
          }),
        ],
      }),
      [
        makeSchema({
          name: 'UsersCreateBody',
          jsonSchema: {
            type: 'object',
            properties: { name: { type: 'string' } },
            required: ['name'],
          },
        }),
      ],
    );

    expect(result.content).toContain('export interface UsersCreateBody');
    expect(result.content).toContain('body: UsersCreateBody');
  });

  it('emits distinct types for collision-resolved schemas in shared file', () => {
    const result = emitSharedTypesFile([
      makeSchema({
        name: 'UsersCreateBody',
        jsonSchema: {
          type: 'object',
          properties: { name: { type: 'string' } },
          required: ['name'],
        },
      }),
      makeSchema({
        name: 'OrdersCreateBody',
        jsonSchema: {
          type: 'object',
          properties: { productId: { type: 'string' } },
          required: ['productId'],
        },
      }),
    ]);

    expect(result.content).toContain('export interface UsersCreateBody');
    expect(result.content).toContain('export interface OrdersCreateBody');
    expect(result.content).toContain('name: string');
    expect(result.content).toContain('productId: string');
  });
});
