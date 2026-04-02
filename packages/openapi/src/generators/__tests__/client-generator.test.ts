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

  it('imports FetchClient and FetchClientConfig from @vertz/fetch', () => {
    const file = generateClient(makeResources(), {});
    expect(file.content).toContain("import { FetchClient } from '@vertz/fetch';");
    expect(file.content).toContain("import type { FetchClientConfig } from '@vertz/fetch';");
  });

  it('does not define HttpClient interface or ApiError class', () => {
    const file = generateClient(makeResources(), {});
    expect(file.content).not.toContain('interface HttpClient');
    expect(file.content).not.toContain('class ApiError');
    expect(file.content).not.toContain('globalThis.fetch');
    expect(file.content).not.toContain('URLSearchParams');
  });

  it('exports ClientOptions as FetchClientConfig', () => {
    const file = generateClient(makeResources(), {});
    expect(file.content).toContain('export type ClientOptions = FetchClientConfig;');
  });

  it('generates createClient factory that instantiates FetchClient', () => {
    const file = generateClient(makeResources(), {});
    expect(file.content).toContain('export function createClient(options: ClientOptions = {})');
    expect(file.content).toContain('new FetchClient(');
  });

  it('composes all resources from FetchClient instance', () => {
    const file = generateClient(makeResources(), {});
    expect(file.content).toContain('tasks: createTasksResource(client),');
    expect(file.content).toContain('users: createUsersResource(client),');
  });

  it('imports resource factories', () => {
    const file = generateClient(makeResources(), {});
    expect(file.content).toContain("import { createTasksResource } from './resources/tasks';");
    expect(file.content).toContain("import { createUsersResource } from './resources/users';");
  });

  it('uses config baseURL as default in FetchClient constructor', () => {
    const file = generateClient(makeResources(), { baseURL: 'https://api.example.com' });
    expect(file.content).toContain("baseURL: 'https://api.example.com'");
  });

  it('default baseURL is empty string when not configured', () => {
    const file = generateClient(makeResources(), {});
    expect(file.content).toContain("baseURL: ''");
  });

  it('spreads user options to allow overriding baseURL at runtime', () => {
    const file = generateClient(makeResources(), {});
    expect(file.content).toContain('...options');
  });

  it('exports Client type as ReturnType<typeof createClient>', () => {
    const file = generateClient(makeResources(), {});
    expect(file.content).toContain('export type Client = ReturnType<typeof createClient>;');
  });
});
