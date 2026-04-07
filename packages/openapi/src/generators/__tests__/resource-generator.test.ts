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
  it('generates resources/<resource>.ts with factory function using FetchClient', () => {
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
    expect(tasksFile!.content).toContain(
      'export function createTasksResource(client: FetchClient)',
    );
    expect(tasksFile!.content).toContain(
      "import type { FetchClient, FetchResponse } from '@vertz/fetch';",
    );
  });

  it('does not import HttpClient from ../client', () => {
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
    expect(tasksFile!.content).not.toContain('HttpClient');
    expect(tasksFile!.content).not.toContain("from '../client'");
  });

  it('generates resources/index.ts barrel export', () => {
    const resources: ParsedResource[] = [makeResource()];

    const files = generateResources(resources);
    const indexFile = files.find((f) => f.path === 'resources/index.ts');
    expect(indexFile).toBeDefined();
    expect(indexFile!.content).toContain("export { createTasksResource } from './tasks';");
  });

  it('generates GET list method with FetchResponse return type', () => {
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
    expect(tasksFile!.content).toContain(
      'list: (query?: ListQuery): Promise<FetchResponse<Task[]>>',
    );
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
    expect(tasksFile!.content).toContain('get: (taskId: string): Promise<FetchResponse<Task>>');
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
    expect(tasksFile!.content).toContain(
      'create: (body: CreateTaskInput): Promise<FetchResponse<Task>>',
    );
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
      'update: (taskId: string, body: UpdateTaskInput): Promise<FetchResponse<Task>>',
    );
    expect(tasksFile!.content).toContain(
      'client.put(`/tasks/${encodeURIComponent(taskId)}`, body)',
    );
  });

  it('generates DELETE method returning Promise<FetchResponse<void>> for 204', () => {
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
    expect(tasksFile!.content).toContain('delete: (taskId: string): Promise<FetchResponse<void>>');
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
    expect(tasksFile!.content).toContain('archive: (taskId: string): Promise<FetchResponse<Task>>');
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
      'patch: (taskId: string, body: PatchTaskInput): Promise<FetchResponse<Task>>',
    );
    expect(tasksFile!.content).toContain(
      'client.patch(`/tasks/${encodeURIComponent(taskId)}`, body)',
    );
  });

  it('returns Promise<FetchResponse<void>> when no response schema', () => {
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
    expect(tasksFile!.content).toContain('ping: (): Promise<FetchResponse<void>>');
  });

  it('uses methodName-based fallback response name instead of verbose operationId (#2415)', () => {
    const resources: ParsedResource[] = [
      makeResource({
        operations: [
          {
            operationId:
              'archive_web_organizations__organization_id__brands__brand_id__archive_post',
            methodName: 'archive',
            method: 'POST',
            path: '/web/organizations/{organization_id}/brands/{brand_id}/archive',
            pathParams: [
              { name: 'organization_id', required: true, schema: { type: 'string' } },
              { name: 'brand_id', required: true, schema: { type: 'string' } },
            ],
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
    // Should use the clean methodName-based prefix
    expect(tasksFile!.content).toContain('ArchiveResponse');
    expect(tasksFile!.content).not.toContain('WebOrganizations');
    expect(tasksFile!.content).not.toContain('OrganizationId');
  });

  it('derives response name from methodName when schema has no name', () => {
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
    expect(tasksFile!.content).toContain('check: (): Promise<FetchResponse<CheckResponse>>');
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

  it('duplicate method error shows raw tag names for excludeTags (#2216)', () => {
    const resources: ParsedResource[] = [
      makeResource({
        name: 'Internal',
        identifier: 'internal',
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
        ],
      }),
    ];

    try {
      generateResources(resources);
      throw new Error('Expected to throw');
    } catch (err) {
      const message = (err as Error).message;
      // Error should show the raw tag name so users know what to use for excludeTags
      expect(message).toContain('tags: "internal"');
    }
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

  it('imports component types from types/components when schemas are provided', () => {
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
    const schemas = [
      {
        name: 'Task',
        jsonSchema: { type: 'object', properties: { id: { type: 'string' } } },
      },
    ];

    const files = generateResources(resources, schemas);
    const tasksFile = files.find((f) => f.path === 'resources/tasks.ts');
    expect(tasksFile!.content).toContain("import type { Task } from '../types/components';");
    expect(tasksFile!.content).toContain("import type { ListQuery } from '../types/tasks';");
  });

  it('uses typePrefix for fallback type names instead of long operationId', () => {
    const resources: ParsedResource[] = [
      makeResource({
        operations: [
          {
            operationId: 'list_brand_competitors_web_brand_id_competitors_get',
            methodName: 'listBrandCompetitors',
            typePrefix: 'ListBrandCompetitors',
            method: 'GET',
            path: '/web/brand/{brandId}/competitors',
            pathParams: [{ name: 'brandId', required: true, schema: { type: 'string' } }],
            queryParams: [{ name: 'limit', required: false, schema: { type: 'integer' } }],
            response: {
              jsonSchema: { type: 'object', properties: { items: { type: 'array' } } },
            },
            responseStatus: 200,
            tags: ['tasks'],
          },
        ],
      }),
    ];

    const files = generateResources(resources);
    const tasksFile = files.find((f) => f.path === 'resources/tasks.ts');
    // Should use typePrefix-based names, not the long operationId
    expect(tasksFile!.content).toContain('ListBrandCompetitorsQuery');
    expect(tasksFile!.content).toContain('ListBrandCompetitorsResponse');
    // Should NOT contain the long operationId-based names
    expect(tasksFile!.content).not.toContain('ListBrandCompetitorsWebBrandIdCompetitorsGetQuery');
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
    expect(tasksFile!.content).toContain('search: (): Promise<FetchResponse<unknown[]>>');
  });

  it('generates AsyncGenerator return type for SSE streaming operation', () => {
    const resources: ParsedResource[] = [
      makeResource({
        operations: [
          {
            operationId: 'streamTaskEvents',
            methodName: 'streamEvents',
            method: 'GET',
            path: '/tasks/{taskId}/events',
            pathParams: [{ name: 'taskId', required: true, schema: { type: 'string' } }],
            queryParams: [],
            response: {
              name: 'TaskEvent',
              jsonSchema: { type: 'object', properties: { type: { type: 'string' } } },
            },
            responseStatus: 200,
            tags: ['tasks'],
            streamingFormat: 'sse',
          },
        ],
      }),
    ];

    const files = generateResources(resources);
    const tasksFile = files.find((f) => f.path === 'resources/tasks.ts');
    expect(tasksFile!.content).toContain('AsyncGenerator<TaskEvent>');
    expect(tasksFile!.content).toContain("format: 'sse'");
    expect(tasksFile!.content).toContain('client.requestStream<TaskEvent>');
    expect(tasksFile!.content).toContain("method: 'GET'");
    expect(tasksFile!.content).toContain('signal: options?.signal');
  });

  it('generates NDJSON streaming operation with format: ndjson', () => {
    const resources: ParsedResource[] = [
      makeResource({
        operations: [
          {
            operationId: 'streamLogs',
            methodName: 'streamLogs',
            method: 'GET',
            path: '/logs/stream',
            pathParams: [],
            queryParams: [],
            response: {
              name: 'LogEntry',
              jsonSchema: { type: 'object', properties: { message: { type: 'string' } } },
            },
            responseStatus: 200,
            tags: ['tasks'],
            streamingFormat: 'ndjson',
          },
        ],
      }),
    ];

    const files = generateResources(resources);
    const tasksFile = files.find((f) => f.path === 'resources/tasks.ts');
    expect(tasksFile!.content).toContain('AsyncGenerator<LogEntry>');
    expect(tasksFile!.content).toContain("format: 'ndjson'");
  });

  it('generates POST streaming method with body in options object', () => {
    const resources: ParsedResource[] = [
      makeResource({
        operations: [
          {
            operationId: 'searchLogs',
            methodName: 'search',
            method: 'POST',
            path: '/logs/search',
            pathParams: [],
            queryParams: [],
            requestBody: {
              name: 'LogSearchInput',
              jsonSchema: { type: 'object', properties: { query: { type: 'string' } } },
            },
            response: {
              name: 'LogEntry',
              jsonSchema: { type: 'object', properties: { message: { type: 'string' } } },
            },
            responseStatus: 200,
            tags: ['tasks'],
            streamingFormat: 'sse',
          },
        ],
      }),
    ];

    const files = generateResources(resources);
    const tasksFile = files.find((f) => f.path === 'resources/tasks.ts');
    expect(tasksFile!.content).toContain(
      'search: (body: LogSearchInput, options?: { signal?: AbortSignal }): AsyncGenerator<LogEntry>',
    );
    expect(tasksFile!.content).toContain("method: 'POST'");
    expect(tasksFile!.content).toContain('body, signal');
  });

  it('generates AsyncGenerator<unknown> when streaming response has no schema', () => {
    const resources: ParsedResource[] = [
      makeResource({
        operations: [
          {
            operationId: 'streamEvents',
            methodName: 'stream',
            method: 'GET',
            path: '/events',
            pathParams: [],
            queryParams: [],
            responseStatus: 200,
            tags: ['tasks'],
            streamingFormat: 'sse',
          },
        ],
      }),
    ];

    const files = generateResources(resources);
    const tasksFile = files.find((f) => f.path === 'resources/tasks.ts');
    expect(tasksFile!.content).toContain('AsyncGenerator<unknown>');
    expect(tasksFile!.content).toContain('client.requestStream<unknown>');
  });

  it('streaming event type name uses methodName-based prefix, not verbose operationId (#2415)', () => {
    const resources: ParsedResource[] = [
      makeResource({
        operations: [
          {
            operationId:
              'stream_brand_draft_web_organizations_organization_id_brands_draft_brand_post',
            methodName: 'streamBrandDraft',
            method: 'POST',
            path: '/web/organizations/{organization_id}/brands/draft-brand',
            pathParams: [{ name: 'organization_id', required: true, schema: { type: 'string' } }],
            queryParams: [],
            requestBody: {
              name: 'DraftInput',
              jsonSchema: { type: 'object', properties: { prompt: { type: 'string' } } },
            },
            response: {
              jsonSchema: { type: 'object', properties: { chunk: { type: 'string' } } },
            },
            responseStatus: 200,
            tags: ['tasks'],
            streamingFormat: 'sse',
          },
        ],
      }),
    ];

    const files = generateResources(resources);
    const tasksFile = files.find((f) => f.path === 'resources/tasks.ts');
    // Should use the clean methodName-based event type name
    expect(tasksFile!.content).toContain('AsyncGenerator<StreamBrandDraftEvent>');
    expect(tasksFile!.content).not.toContain('WebOrganizations');
  });

  it('streaming method includes JSDoc @throws annotation', () => {
    const resources: ParsedResource[] = [
      makeResource({
        operations: [
          {
            operationId: 'streamTaskEvents',
            methodName: 'streamEvents',
            method: 'GET',
            path: '/tasks/events',
            pathParams: [],
            queryParams: [],
            response: {
              name: 'TaskEvent',
              jsonSchema: { type: 'object' },
            },
            responseStatus: 200,
            tags: ['tasks'],
            streamingFormat: 'sse',
          },
        ],
      }),
    ];

    const files = generateResources(resources);
    const tasksFile = files.find((f) => f.path === 'resources/tasks.ts');
    expect(tasksFile!.content).toContain('/** @throws {FetchError} on non-2xx response */');
  });

  it('streaming method with query params passes query in options', () => {
    const resources: ParsedResource[] = [
      makeResource({
        operations: [
          {
            operationId: 'searchLogs',
            methodName: 'search',
            method: 'POST',
            path: '/logs/search',
            pathParams: [],
            queryParams: [{ name: 'format', required: false, schema: { type: 'string' } }],
            requestBody: {
              name: 'LogSearchInput',
              jsonSchema: { type: 'object' },
            },
            response: {
              name: 'LogEntry',
              jsonSchema: { type: 'object' },
            },
            responseStatus: 200,
            tags: ['tasks'],
            streamingFormat: 'sse',
          },
        ],
      }),
    ];

    const files = generateResources(resources);
    const tasksFile = files.find((f) => f.path === 'resources/tasks.ts');
    expect(tasksFile!.content).toContain(
      'search: (body: LogSearchInput, query?: SearchQuery, options?: { signal?: AbortSignal }): AsyncGenerator<LogEntry>',
    );
    expect(tasksFile!.content).toContain('body, query, signal');
  });

  it('generates both JSON and streaming methods for dual content type', () => {
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
              name: 'TaskEvent',
              jsonSchema: { type: 'object', properties: { type: { type: 'string' } } },
            },
            responseStatus: 200,
            tags: ['tasks'],
            streamingFormat: 'sse',
            jsonResponse: {
              name: 'TaskList',
              jsonSchema: { type: 'object', properties: { items: { type: 'array' } } },
            },
          },
        ],
      }),
    ];

    const files = generateResources(resources);
    const tasksFile = files.find((f) => f.path === 'resources/tasks.ts');
    // Standard JSON method
    expect(tasksFile!.content).toContain('list: (): Promise<FetchResponse<TaskList>>');
    expect(tasksFile!.content).toContain("client.get('/tasks')");
    // Streaming method with Stream suffix
    expect(tasksFile!.content).toContain(
      'listStream: (options?: { signal?: AbortSignal }): AsyncGenerator<TaskEvent>',
    );
    expect(tasksFile!.content).toContain('client.requestStream<TaskEvent>');
  });

  it('throws when dual-content Stream suffix collides with existing method name', () => {
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
              name: 'TaskEvent',
              jsonSchema: { type: 'object' },
            },
            responseStatus: 200,
            tags: ['tasks'],
            streamingFormat: 'sse',
            jsonResponse: {
              name: 'TaskList',
              jsonSchema: { type: 'object' },
            },
          },
          {
            operationId: 'listTasksStream',
            methodName: 'listStream',
            method: 'GET',
            path: '/tasks/stream',
            pathParams: [],
            queryParams: [],
            response: {
              name: 'TaskStreamEvent',
              jsonSchema: { type: 'object' },
            },
            responseStatus: 200,
            tags: ['tasks'],
            streamingFormat: 'sse',
          },
        ],
      }),
    ];

    expect(() => generateResources(resources)).toThrow(
      /Method name collision.*dual-content.*"listTasks".*"listStream"/,
    );
  });

  it('generates GET streaming method with query params', () => {
    const resources: ParsedResource[] = [
      makeResource({
        operations: [
          {
            operationId: 'streamFilteredEvents',
            methodName: 'streamFiltered',
            method: 'GET',
            path: '/events',
            pathParams: [],
            queryParams: [{ name: 'severity', required: false, schema: { type: 'string' } }],
            response: {
              name: 'Event',
              jsonSchema: { type: 'object' },
            },
            responseStatus: 200,
            tags: ['tasks'],
            streamingFormat: 'sse',
          },
        ],
      }),
    ];

    const files = generateResources(resources);
    const tasksFile = files.find((f) => f.path === 'resources/tasks.ts');
    expect(tasksFile!.content).toContain(
      'streamFiltered: (query?: StreamFilteredQuery, options?: { signal?: AbortSignal }): AsyncGenerator<Event>',
    );
    expect(tasksFile!.content).toContain('query, signal');
  });

  it('imports both JSON and streaming response types for dual content', () => {
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
              name: 'TaskEvent',
              jsonSchema: { type: 'object' },
            },
            responseStatus: 200,
            tags: ['tasks'],
            streamingFormat: 'sse',
            jsonResponse: {
              name: 'TaskList',
              jsonSchema: { type: 'object' },
            },
          },
        ],
      }),
    ];

    const files = generateResources(resources);
    const tasksFile = files.find((f) => f.path === 'resources/tasks.ts');
    expect(tasksFile!.content).toContain('TaskEvent');
    expect(tasksFile!.content).toContain('TaskList');
  });
});
