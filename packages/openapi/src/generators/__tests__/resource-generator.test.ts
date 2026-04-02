import { describe, expect, it } from 'bun:test';
import type { ParsedResource } from '../../parser/types';
import { generateResources } from '../resource-generator';

function makeResource(overrides: Partial<ParsedResource> = {}): ParsedResource {
  return {
    name: 'Tasks',
    identifier: 'tasks',
    operations: [],
    ...overrides,
  };
}

describe('generateResources', () => {
  it('generates resources/<resource>.ts with factory function', () => {
    const resources: ParsedResource[] = [
      makeResource({
        operations: [
          {
            operationId: 'listTasks',
            methodName: 'list',
            method: 'GET',
            path: '/tasks',
            pathParams: [],
            queryParams: [{ name: 'status', required: false, schema: { type: 'string' } }],
            response: {
              name: 'Task',
              jsonSchema: { type: 'object', properties: { id: { type: 'string' } } },
            },
            responseStatus: 200,
            tags: ['tasks'],
          },
        ],
      }),
    ];

    const files = generateResources(resources);
    const tasksFile = files.find((f) => f.path === 'resources/tasks.ts');
    expect(tasksFile).toBeDefined();
    expect(tasksFile!.content).toContain('export function createTasksResource(client: HttpClient)');
    expect(tasksFile!.content).toContain("import type { HttpClient } from '../client';");
  });

  it('generates resources/index.ts barrel export', () => {
    const resources: ParsedResource[] = [makeResource()];

    const files = generateResources(resources);
    const indexFile = files.find((f) => f.path === 'resources/index.ts');
    expect(indexFile).toBeDefined();
    expect(indexFile!.content).toContain("export { createTasksResource } from './tasks';");
  });

  it('generates GET list method with optional query param', () => {
    const resources: ParsedResource[] = [
      makeResource({
        operations: [
          {
            operationId: 'listTasks',
            methodName: 'list',
            method: 'GET',
            path: '/tasks',
            pathParams: [],
            queryParams: [{ name: 'status', required: false, schema: { type: 'string' } }],
            response: {
              name: 'Task',
              jsonSchema: {
                type: 'array',
                items: { type: 'object', properties: { id: { type: 'string' } } },
              },
            },
            responseStatus: 200,
            tags: ['tasks'],
          },
        ],
      }),
    ];

    const files = generateResources(resources);
    const tasksFile = files.find((f) => f.path === 'resources/tasks.ts');
    expect(tasksFile!.content).toContain('list: (query?: ListTasksQuery): Promise<Task[]>');
    expect(tasksFile!.content).toContain("client.get('/tasks', { query })");
  });

  it('generates GET by ID method with path param using encodeURIComponent', () => {
    const resources: ParsedResource[] = [
      makeResource({
        operations: [
          {
            operationId: 'getTask',
            methodName: 'get',
            method: 'GET',
            path: '/tasks/{taskId}',
            pathParams: [{ name: 'taskId', required: true, schema: { type: 'string' } }],
            queryParams: [],
            response: {
              name: 'Task',
              jsonSchema: { type: 'object', properties: { id: { type: 'string' } } },
            },
            responseStatus: 200,
            tags: ['tasks'],
          },
        ],
      }),
    ];

    const files = generateResources(resources);
    const tasksFile = files.find((f) => f.path === 'resources/tasks.ts');
    expect(tasksFile!.content).toContain('get: (taskId: string): Promise<Task>');
    expect(tasksFile!.content).toContain('client.get(`/tasks/${encodeURIComponent(taskId)}`)');
  });

  it('generates POST method with typed body', () => {
    const resources: ParsedResource[] = [
      makeResource({
        operations: [
          {
            operationId: 'createTask',
            methodName: 'create',
            method: 'POST',
            path: '/tasks',
            pathParams: [],
            queryParams: [],
            requestBody: {
              name: 'CreateTaskInput',
              jsonSchema: {
                type: 'object',
                properties: { title: { type: 'string' } },
              },
            },
            response: {
              name: 'Task',
              jsonSchema: { type: 'object', properties: { id: { type: 'string' } } },
            },
            responseStatus: 201,
            tags: ['tasks'],
          },
        ],
      }),
    ];

    const files = generateResources(resources);
    const tasksFile = files.find((f) => f.path === 'resources/tasks.ts');
    expect(tasksFile!.content).toContain('create: (body: CreateTaskInput): Promise<Task>');
    expect(tasksFile!.content).toContain("client.post('/tasks', body)");
  });

  it('generates PUT method with path param and body', () => {
    const resources: ParsedResource[] = [
      makeResource({
        operations: [
          {
            operationId: 'updateTask',
            methodName: 'update',
            method: 'PUT',
            path: '/tasks/{taskId}',
            pathParams: [{ name: 'taskId', required: true, schema: { type: 'string' } }],
            queryParams: [],
            requestBody: {
              name: 'UpdateTaskInput',
              jsonSchema: {
                type: 'object',
                properties: { title: { type: 'string' } },
              },
            },
            response: {
              name: 'Task',
              jsonSchema: { type: 'object', properties: { id: { type: 'string' } } },
            },
            responseStatus: 200,
            tags: ['tasks'],
          },
        ],
      }),
    ];

    const files = generateResources(resources);
    const tasksFile = files.find((f) => f.path === 'resources/tasks.ts');
    expect(tasksFile!.content).toContain(
      'update: (taskId: string, body: UpdateTaskInput): Promise<Task>',
    );
    expect(tasksFile!.content).toContain(
      'client.put(`/tasks/${encodeURIComponent(taskId)}`, body)',
    );
  });

  it('generates DELETE method returning Promise<void> for 204', () => {
    const resources: ParsedResource[] = [
      makeResource({
        operations: [
          {
            operationId: 'deleteTask',
            methodName: 'delete',
            method: 'DELETE',
            path: '/tasks/{taskId}',
            pathParams: [{ name: 'taskId', required: true, schema: { type: 'string' } }],
            queryParams: [],
            responseStatus: 204,
            tags: ['tasks'],
          },
        ],
      }),
    ];

    const files = generateResources(resources);
    const tasksFile = files.find((f) => f.path === 'resources/tasks.ts');
    expect(tasksFile!.content).toContain('delete: (taskId: string): Promise<void>');
    expect(tasksFile!.content).toContain('client.delete(`/tasks/${encodeURIComponent(taskId)}`)');
  });

  it('imports types from ../types/<resource>', () => {
    const resources: ParsedResource[] = [
      makeResource({
        operations: [
          {
            operationId: 'listTasks',
            methodName: 'list',
            method: 'GET',
            path: '/tasks',
            pathParams: [],
            queryParams: [],
            response: {
              name: 'Task',
              jsonSchema: { type: 'object', properties: { id: { type: 'string' } } },
            },
            responseStatus: 200,
            tags: ['tasks'],
          },
        ],
      }),
    ];

    const files = generateResources(resources);
    const tasksFile = files.find((f) => f.path === 'resources/tasks.ts');
    expect(tasksFile!.content).toContain("import type { Task } from '../types/tasks';");
  });

  it('handles non-CRUD custom actions with correct HTTP method', () => {
    const resources: ParsedResource[] = [
      makeResource({
        operations: [
          {
            operationId: 'archiveTask',
            methodName: 'archive',
            method: 'POST',
            path: '/tasks/{taskId}/archive',
            pathParams: [{ name: 'taskId', required: true, schema: { type: 'string' } }],
            queryParams: [],
            response: {
              name: 'Task',
              jsonSchema: { type: 'object', properties: { id: { type: 'string' } } },
            },
            responseStatus: 200,
            tags: ['tasks'],
          },
        ],
      }),
    ];

    const files = generateResources(resources);
    const tasksFile = files.find((f) => f.path === 'resources/tasks.ts');
    expect(tasksFile!.content).toContain('archive: (taskId: string): Promise<Task>');
    expect(tasksFile!.content).toContain(
      'client.post(`/tasks/${encodeURIComponent(taskId)}/archive`)',
    );
  });

  it('handles PATCH method', () => {
    const resources: ParsedResource[] = [
      makeResource({
        operations: [
          {
            operationId: 'patchTask',
            methodName: 'patch',
            method: 'PATCH',
            path: '/tasks/{taskId}',
            pathParams: [{ name: 'taskId', required: true, schema: { type: 'string' } }],
            queryParams: [],
            requestBody: {
              name: 'PatchTaskInput',
              jsonSchema: {
                type: 'object',
                properties: { title: { type: 'string' } },
              },
            },
            response: {
              name: 'Task',
              jsonSchema: { type: 'object', properties: { id: { type: 'string' } } },
            },
            responseStatus: 200,
            tags: ['tasks'],
          },
        ],
      }),
    ];

    const files = generateResources(resources);
    const tasksFile = files.find((f) => f.path === 'resources/tasks.ts');
    expect(tasksFile!.content).toContain(
      'patch: (taskId: string, body: PatchTaskInput): Promise<Task>',
    );
    expect(tasksFile!.content).toContain(
      'client.patch(`/tasks/${encodeURIComponent(taskId)}`, body)',
    );
  });

  it('returns Promise<void> when no response schema', () => {
    const resources: ParsedResource[] = [
      makeResource({
        operations: [
          {
            operationId: 'pingTasks',
            methodName: 'ping',
            method: 'POST',
            path: '/tasks/ping',
            pathParams: [],
            queryParams: [],
            responseStatus: 200,
            tags: ['tasks'],
          },
        ],
      }),
    ];

    const files = generateResources(resources);
    const tasksFile = files.find((f) => f.path === 'resources/tasks.ts');
    expect(tasksFile!.content).toContain('ping: (): Promise<void>');
  });

  it('derives response name from operationId when schema has no name', () => {
    const resources: ParsedResource[] = [
      makeResource({
        operations: [
          {
            operationId: 'checkTask',
            methodName: 'check',
            method: 'GET',
            path: '/tasks/check',
            pathParams: [],
            queryParams: [],
            response: {
              jsonSchema: {
                type: 'object',
                properties: { ok: { type: 'boolean' } },
              },
            },
            responseStatus: 200,
            tags: ['tasks'],
          },
        ],
      }),
    ];

    const files = generateResources(resources);
    const tasksFile = files.find((f) => f.path === 'resources/tasks.ts');
    expect(tasksFile!.content).toContain('check: (): Promise<CheckTaskResponse>');
  });

  it('sanitizes hyphenated type names in imports and return types', () => {
    const resources: ParsedResource[] = [
      makeResource({
        operations: [
          {
            operationId: 'createBrand',
            methodName: 'create',
            method: 'POST',
            path: '/brands',
            pathParams: [],
            queryParams: [],
            requestBody: {
              name: 'Brand-Input',
              jsonSchema: { type: 'object', properties: { name: { type: 'string' } } },
            },
            response: {
              name: 'BrandModel-Output',
              jsonSchema: { type: 'object', properties: { id: { type: 'number' } } },
            },
            responseStatus: 200,
            tags: ['tasks'],
          },
        ],
      }),
    ];

    const files = generateResources(resources);
    const tasksFile = files.find((f) => f.path === 'resources/tasks.ts');
    expect(tasksFile!.content).toContain('BrandModelOutput');
    expect(tasksFile!.content).toContain('BrandInput');
    expect(tasksFile!.content).not.toContain('BrandModel-Output');
    expect(tasksFile!.content).not.toContain('Brand-Input');
  });

  it('throws on duplicate method names within a resource', () => {
    const resources: ParsedResource[] = [
      makeResource({
        operations: [
          {
            operationId: 'listIndustries',
            methodName: 'list',
            method: 'GET',
            path: '/industries',
            pathParams: [],
            queryParams: [],
            response: {
              name: 'IndustryList',
              jsonSchema: { type: 'object', properties: { items: { type: 'array' } } },
            },
            responseStatus: 200,
            tags: ['internal'],
          },
          {
            operationId: 'listUsers',
            methodName: 'list',
            method: 'GET',
            path: '/users',
            pathParams: [],
            queryParams: [],
            response: {
              name: 'UserList',
              jsonSchema: { type: 'object', properties: { items: { type: 'array' } } },
            },
            responseStatus: 200,
            tags: ['internal'],
          },
        ],
      }),
    ];

    expect(() => generateResources(resources)).toThrow(
      /Duplicate method name "list" in resource "Tasks"/,
    );
  });

  it('error message lists all duplicate method names and their operationIds', () => {
    const resources: ParsedResource[] = [
      makeResource({
        operations: [
          {
            operationId: 'listIndustries',
            methodName: 'list',
            method: 'GET',
            path: '/industries',
            pathParams: [],
            queryParams: [],
            responseStatus: 200,
            tags: ['internal'],
          },
          {
            operationId: 'listUsers',
            methodName: 'list',
            method: 'GET',
            path: '/users',
            pathParams: [],
            queryParams: [],
            responseStatus: 200,
            tags: ['internal'],
          },
          {
            operationId: 'getIndustry',
            methodName: 'get',
            method: 'GET',
            path: '/industries/{id}',
            pathParams: [{ name: 'id', required: true, schema: { type: 'string' } }],
            queryParams: [],
            responseStatus: 200,
            tags: ['internal'],
          },
          {
            operationId: 'getBrand',
            methodName: 'get',
            method: 'GET',
            path: '/brands/{id}',
            pathParams: [{ name: 'id', required: true, schema: { type: 'string' } }],
            queryParams: [],
            responseStatus: 200,
            tags: ['internal'],
          },
        ],
      }),
    ];

    try {
      generateResources(resources);
      throw new Error('Expected to throw');
    } catch (err) {
      const message = (err as Error).message;
      expect(message).toContain('"list"');
      expect(message).toContain('"get"');
      expect(message).toContain('listIndustries');
      expect(message).toContain('listUsers');
      expect(message).toContain('getIndustry');
      expect(message).toContain('getBrand');
    }
  });

  it('handles unnamed array response', () => {
    const resources: ParsedResource[] = [
      makeResource({
        operations: [
          {
            operationId: 'searchTasks',
            methodName: 'search',
            method: 'GET',
            path: '/tasks/search',
            pathParams: [],
            queryParams: [],
            response: {
              jsonSchema: {
                type: 'array',
                items: { type: 'object', properties: { id: { type: 'string' } } },
              },
            },
            responseStatus: 200,
            tags: ['tasks'],
          },
        ],
      }),
    ];

    const files = generateResources(resources);
    const tasksFile = files.find((f) => f.path === 'resources/tasks.ts');
    expect(tasksFile!.content).toContain('search: (): Promise<unknown[]>');
  });
});
