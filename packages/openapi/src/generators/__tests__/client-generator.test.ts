import { describe, expect, it } from 'bun:test';
import type { ParsedResource } from '../../parser/types';
import { generateClient } from '../client-generator';

function makeResources(): ParsedResource[] {
  return [
    {
      name: 'Tasks',
      identifier: 'tasks',
      operations: [
        {
          operationId: 'listTasks',
          methodName: 'list',
          method: 'GET',
          path: '/tasks',
          pathParams: [],
          queryParams: [],
          responseStatus: 200,
          tags: ['tasks'],
        },
      ],
    },
    {
      name: 'Users',
      identifier: 'users',
      operations: [
        {
          operationId: 'listUsers',
          methodName: 'list',
          method: 'GET',
          path: '/users',
          pathParams: [],
          queryParams: [],
          responseStatus: 200,
          tags: ['users'],
        },
      ],
    },
  ];
}

describe('generateClient', () => {
  it('generates client.ts file', () => {
    const file = generateClient(makeResources(), {});
    expect(file.path).toBe('client.ts');
  });

  it('defines HttpClient interface with all 5 HTTP methods including query support', () => {
    const file = generateClient(makeResources(), {});
    expect(file.content).toContain('export interface HttpClient {');
    expect(file.content).toContain(
      'get<T>(path: string, options?: { query?: Record<string, unknown> }): Promise<T>;',
    );
    expect(file.content).toContain(
      'post<T>(path: string, body?: unknown, options?: { query?: Record<string, unknown> }): Promise<T>;',
    );
    expect(file.content).toContain(
      'put<T>(path: string, body?: unknown, options?: { query?: Record<string, unknown> }): Promise<T>;',
    );
    expect(file.content).toContain(
      'patch<T>(path: string, body?: unknown, options?: { query?: Record<string, unknown> }): Promise<T>;',
    );
    expect(file.content).toContain(
      'delete<T>(path: string, options?: { query?: Record<string, unknown> }): Promise<T>;',
    );
  });

  it('defines ClientOptions interface', () => {
    const file = generateClient(makeResources(), {});
    expect(file.content).toContain('export interface ClientOptions {');
    expect(file.content).toContain('baseURL?: string;');
    expect(file.content).toContain('headers?: Record<string, string>;');
    expect(file.content).toContain('fetch?: typeof globalThis.fetch;');
  });

  it('generates createClient factory composing all resources', () => {
    const file = generateClient(makeResources(), {});
    expect(file.content).toContain('export function createClient(options: ClientOptions = {})');
    expect(file.content).toContain('tasks: createTasksResource(client),');
    expect(file.content).toContain('users: createUsersResource(client),');
  });

  it('imports resource factories', () => {
    const file = generateClient(makeResources(), {});
    expect(file.content).toContain(
      "import { createTasksResource } from './resources/tasks';",
    );
    expect(file.content).toContain(
      "import { createUsersResource } from './resources/users';",
    );
  });

  it('uses string concatenation for URL building (no new URL())', () => {
    const file = generateClient(makeResources(), {});
    expect(file.content).toContain('`${baseURL}${path}`');
    expect(file.content).not.toContain('new URL(');
  });

  it('handles 204 No Content without calling res.json()', () => {
    const file = generateClient(makeResources(), {});
    expect(file.content).toContain('if (res.status === 204) return undefined as T;');
  });

  it('generates ApiError class with name, status, data, and static from()', () => {
    const file = generateClient(makeResources(), {});
    expect(file.content).toContain('export class ApiError extends Error {');
    expect(file.content).toContain("override name = 'ApiError';");
    expect(file.content).toContain('public data: unknown;');
    expect(file.content).toContain('constructor(public status: number, body: string)');
    expect(file.content).toContain('static async from(res: Response): Promise<ApiError>');
  });

  it('exports Client type as ReturnType<typeof createClient>', () => {
    const file = generateClient(makeResources(), {});
    expect(file.content).toContain('export type Client = ReturnType<typeof createClient>;');
  });

  it('default baseURL is empty string', () => {
    const file = generateClient(makeResources(), {});
    expect(file.content).toContain("options.baseURL ?? ''");
  });

  it('supports custom fetch function', () => {
    const file = generateClient(makeResources(), {});
    expect(file.content).toContain('options.fetch ?? globalThis.fetch.bind(globalThis)');
  });

  it('serializes query params with URLSearchParams', () => {
    const file = generateClient(makeResources(), {});
    expect(file.content).toContain('new URLSearchParams()');
  });

  it('uses baseURL from config when provided', () => {
    const file = generateClient(makeResources(), { baseURL: '/api' });
    // Should still use options.baseURL at runtime, config baseURL is just the default
    expect(file.content).toContain("options.baseURL ?? '/api'");
  });
});
