import { describe, expect, it } from 'vitest';
import {
  emitInterfaceFromSchema,
  emitOperationInputType,
  emitOperationResponseType,
  emitStreamingEventType,
} from '../../generators/typescript/emit-types';

describe('emitInterfaceFromSchema', () => {
  it('converts a named schema with object properties into an exported interface', () => {
    const result = emitInterfaceFromSchema({
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
    });

    expect(result.content).toContain('export interface CreateUserBody');
    expect(result.content).toContain('name: string');
    expect(result.content).toContain('email: string');
    expect(result.imports).toEqual([]);
  });

  it('emits a type alias for non-object schemas (e.g. array, union)', () => {
    const result = emitInterfaceFromSchema({
      name: 'UserIds',
      jsonSchema: {
        type: 'array',
        items: { type: 'string' },
      },
      annotations: { namingParts: {} },
    });

    expect(result.content).toContain('export type UserIds = string[]');
    expect(result.imports).toEqual([]);
  });

  it('includes JSDoc description when annotation has description', () => {
    const result = emitInterfaceFromSchema({
      name: 'User',
      jsonSchema: {
        type: 'object',
        properties: { id: { type: 'string' } },
        required: ['id'],
      },
      annotations: {
        description: 'A user in the system',
        namingParts: {},
      },
    });

    expect(result.content).toContain('/** A user in the system */');
    expect(result.content).toContain('export interface User');
  });

  it('includes @deprecated tag when annotation is deprecated', () => {
    const result = emitInterfaceFromSchema({
      name: 'LegacyUser',
      jsonSchema: {
        type: 'object',
        properties: { id: { type: 'string' } },
        required: ['id'],
      },
      annotations: {
        deprecated: true,
        namingParts: {},
      },
    });

    expect(result.content).toContain('@deprecated');
    expect(result.content).toContain('export interface LegacyUser');
  });

  it('extracts $defs as additional exported types', () => {
    const result = emitInterfaceFromSchema({
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
      annotations: { namingParts: {} },
    });

    expect(result.content).toContain('export interface Address');
    expect(result.content).toContain('export interface UserResponse');
  });
});

describe('emitOperationInputType', () => {
  it('generates input type with params, query, and body slots', () => {
    const result = emitOperationInputType({
      operationId: 'createUser',
      method: 'POST',
      path: '/api/users',
      tags: [],
      params: {
        type: 'object',
        properties: { orgId: { type: 'string' } },
        required: ['orgId'],
      },
      query: {
        type: 'object',
        properties: { notify: { type: 'boolean' } },
      },
      body: {
        type: 'object',
        properties: { name: { type: 'string' } },
        required: ['name'],
      },
      schemaRefs: {},
    });

    expect(result.content).toContain('export interface CreateUserInput');
    expect(result.content).toContain('params: { orgId: string }');
    expect(result.content).toContain('query?: { notify?: boolean }');
    expect(result.content).toContain('body: { name: string }');
    expect(result.imports).toEqual([]);
  });

  it('generates empty content for operation with no inputs', () => {
    const result = emitOperationInputType({
      operationId: 'healthCheck',
      method: 'GET',
      path: '/health',
      tags: [],
      schemaRefs: {},
    });

    expect(result.content).toBe('');
    expect(result.imports).toEqual([]);
  });

  it('uses named schema ref for body when schemaRef is present', () => {
    const result = emitOperationInputType({
      operationId: 'createUser',
      method: 'POST',
      path: '/api/users',
      tags: [],
      body: { type: 'object', properties: { name: { type: 'string' } } },
      schemaRefs: { body: 'CreateUserBody' },
    });

    expect(result.content).toContain('body: CreateUserBody');
    expect(result.imports).toContainEqual({
      from: '',
      name: 'CreateUserBody',
      isType: true,
    });
  });

  it('includes description JSDoc for input type', () => {
    const result = emitOperationInputType({
      operationId: 'listUsers',
      method: 'GET',
      path: '/api/users',
      description: 'List all users',
      tags: [],
      query: { type: 'object', properties: { page: { type: 'number' } } },
      schemaRefs: {},
    });

    expect(result.content).toContain('/** Input for listUsers */');
    expect(result.content).toContain('export interface ListUsersInput');
  });
});

describe('emitOperationResponseType', () => {
  it('generates response type from inline schema', () => {
    const result = emitOperationResponseType({
      operationId: 'listUsers',
      method: 'GET',
      path: '/api/users',
      tags: [],
      response: {
        type: 'object',
        properties: {
          items: { type: 'array', items: { type: 'string' } },
          total: { type: 'number' },
        },
        required: ['items', 'total'],
      },
      schemaRefs: {},
    });

    expect(result.content).toContain('export interface ListUsersResponse');
    expect(result.content).toContain('items: string[]');
    expect(result.content).toContain('total: number');
  });

  it('returns void type alias when no response schema exists', () => {
    const result = emitOperationResponseType({
      operationId: 'deleteUser',
      method: 'DELETE',
      path: '/api/users/:id',
      tags: [],
      schemaRefs: {},
    });

    expect(result.content).toContain('export type DeleteUserResponse = void');
  });

  it('uses named schema ref for response when available', () => {
    const result = emitOperationResponseType({
      operationId: 'getUser',
      method: 'GET',
      path: '/api/users/:id',
      tags: [],
      response: { type: 'object', properties: { id: { type: 'string' } } },
      schemaRefs: { response: 'UserResponse' },
    });

    expect(result.content).toContain('export type GetUserResponse = UserResponse');
    expect(result.imports).toContainEqual({
      from: '',
      name: 'UserResponse',
      isType: true,
    });
  });
});

describe('emitStreamingEventType', () => {
  it('generates event type from streaming eventSchema', () => {
    const result = emitStreamingEventType({
      operationId: 'streamEvents',
      method: 'GET',
      path: '/api/events',
      tags: [],
      streaming: {
        format: 'sse',
        eventSchema: {
          type: 'object',
          properties: {
            type: { type: 'string' },
            data: { type: 'string' },
          },
          required: ['type', 'data'],
        },
      },
      schemaRefs: {},
    });

    expect(result.content).toContain('export interface StreamEventsEvent');
    expect(result.content).toContain('type: string');
    expect(result.content).toContain('data: string');
  });

  it('returns unknown type when no eventSchema is provided', () => {
    const result = emitStreamingEventType({
      operationId: 'streamLogs',
      method: 'GET',
      path: '/api/logs',
      tags: [],
      streaming: { format: 'ndjson' },
      schemaRefs: {},
    });

    expect(result.content).toContain('export type StreamLogsEvent = unknown');
  });

  it('returns empty content for non-streaming operations', () => {
    const result = emitStreamingEventType({
      operationId: 'listUsers',
      method: 'GET',
      path: '/api/users',
      tags: [],
      schemaRefs: {},
    });

    expect(result.content).toBe('');
  });
});
