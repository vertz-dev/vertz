import { describe, expect, it } from 'bun:test';
import type { ParsedResource, ParsedSchema } from '../../parser/types';
import { generateTypes } from '../types-generator';

function makeResource(overrides: Partial<ParsedResource> = {}): ParsedResource {
  return {
    name: 'Tasks',
    identifier: 'tasks',
    operations: [],
    ...overrides,
  };
}

describe('generateTypes', () => {
  it('generates types/<resource>.ts with response interfaces from component schema names', () => {
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
              jsonSchema: {
                type: 'object',
                properties: {
                  id: { type: 'string' },
                  title: { type: 'string' },
                },
                required: ['id', 'title'],
              },
            },
            responseStatus: 200,
            tags: ['tasks'],
          },
        ],
      }),
    ];
    const schemas: ParsedSchema[] = [
      {
        name: 'Task',
        jsonSchema: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            title: { type: 'string' },
          },
          required: ['id', 'title'],
        },
      },
    ];

    const files = generateTypes(resources, schemas);
    const tasksFile = files.find((f) => f.path === 'types/tasks.ts');
    expect(tasksFile).toBeDefined();
    expect(tasksFile!.content).toContain('export interface Task {');
    expect(tasksFile!.content).toContain('  id: string;');
    expect(tasksFile!.content).toContain('  title: string;');
  });

  it('generates barrel types/index.ts', () => {
    const resources: ParsedResource[] = [makeResource()];
    const schemas: ParsedSchema[] = [];

    const files = generateTypes(resources, schemas);
    const indexFile = files.find((f) => f.path === 'types/index.ts');
    expect(indexFile).toBeDefined();
    expect(indexFile!.content).toContain("export * from './tasks';");
  });

  it('generates input interfaces from request body', () => {
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
                properties: {
                  title: { type: 'string' },
                  description: { type: 'string' },
                },
                required: ['title'],
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
    const schemas: ParsedSchema[] = [];

    const files = generateTypes(resources, schemas);
    const tasksFile = files.find((f) => f.path === 'types/tasks.ts');
    expect(tasksFile).toBeDefined();
    expect(tasksFile!.content).toContain('export interface CreateTaskInput {');
    expect(tasksFile!.content).toContain('  title: string;');
    expect(tasksFile!.content).toContain('  description?: string;');
  });

  it('derives input name from operationId when schema has no name', () => {
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
              jsonSchema: {
                type: 'object',
                properties: { title: { type: 'string' } },
                required: ['title'],
              },
            },
            response: undefined,
            responseStatus: 201,
            tags: ['tasks'],
          },
        ],
      }),
    ];
    const schemas: ParsedSchema[] = [];

    const files = generateTypes(resources, schemas);
    const tasksFile = files.find((f) => f.path === 'types/tasks.ts');
    expect(tasksFile!.content).toContain('export interface CreateTaskInput {');
  });

  it('generates query parameter interfaces', () => {
    const resources: ParsedResource[] = [
      makeResource({
        operations: [
          {
            operationId: 'listTasks',
            methodName: 'list',
            method: 'GET',
            path: '/tasks',
            pathParams: [],
            queryParams: [
              { name: 'status', required: false, schema: { type: 'string' } },
              { name: 'limit', required: false, schema: { type: 'integer' } },
              { name: 'page', required: true, schema: { type: 'integer' } },
            ],
            response: undefined,
            responseStatus: 200,
            tags: ['tasks'],
          },
        ],
      }),
    ];
    const schemas: ParsedSchema[] = [];

    const files = generateTypes(resources, schemas);
    const tasksFile = files.find((f) => f.path === 'types/tasks.ts');
    expect(tasksFile!.content).toContain('export interface ListTasksQuery {');
    expect(tasksFile!.content).toContain('  status?: string;');
    expect(tasksFile!.content).toContain('  limit?: number;');
    expect(tasksFile!.content).toContain('  page: number;');
  });

  it('skips query interface when no query params', () => {
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
            response: undefined,
            responseStatus: 200,
            tags: ['tasks'],
          },
        ],
      }),
    ];
    const schemas: ParsedSchema[] = [];

    const files = generateTypes(resources, schemas);
    const tasksFile = files.find((f) => f.path === 'types/tasks.ts');
    expect(tasksFile!.content).not.toContain('Query');
  });

  it('skips input interface when no request body', () => {
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
            response: undefined,
            responseStatus: 200,
            tags: ['tasks'],
          },
        ],
      }),
    ];
    const schemas: ParsedSchema[] = [];

    const files = generateTypes(resources, schemas);
    const tasksFile = files.find((f) => f.path === 'types/tasks.ts');
    expect(tasksFile!.content).not.toContain('Input');
  });

  it('PascalCases fallback response name from underscore-heavy operationId', () => {
    const resources: ParsedResource[] = [
      makeResource({
        operations: [
          {
            operationId: 'find_many_web_organizations__organization_id__brands__get',
            methodName: 'list',
            method: 'GET',
            path: '/web/organizations/{organization_id}/brands',
            pathParams: [
              { name: 'organization_id', required: true, schema: { type: 'string' } },
            ],
            queryParams: [],
            response: {
              jsonSchema: {
                type: 'object',
                properties: { id: { type: 'string' } },
                required: ['id'],
              },
            },
            responseStatus: 200,
            tags: ['brands'],
          },
        ],
      }),
    ];
    const schemas: ParsedSchema[] = [];

    const files = generateTypes(resources, schemas);
    const tasksFile = files.find((f) => f.path === 'types/tasks.ts');
    expect(tasksFile!.content).toContain(
      'export interface FindManyWebOrganizationsOrganizationIdBrandsGetResponse {',
    );
    expect(tasksFile!.content).not.toContain(
      'Find_many_web_organizations__organization_id__brands__get',
    );
  });

  it('derives response name from operationId when schema has no name', () => {
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
              jsonSchema: {
                type: 'object',
                properties: { id: { type: 'string' } },
                required: ['id'],
              },
            },
            responseStatus: 200,
            tags: ['tasks'],
          },
        ],
      }),
    ];
    const schemas: ParsedSchema[] = [];

    const files = generateTypes(resources, schemas);
    const tasksFile = files.find((f) => f.path === 'types/tasks.ts');
    expect(tasksFile!.content).toContain('export interface GetTaskResponse {');
  });

  it('handles nullable fields', () => {
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
              jsonSchema: {
                type: 'object',
                properties: {
                  deletedAt: { type: ['string', 'null'] },
                },
              },
            },
            responseStatus: 200,
            tags: ['tasks'],
          },
        ],
      }),
    ];
    const schemas: ParsedSchema[] = [];

    const files = generateTypes(resources, schemas);
    const tasksFile = files.find((f) => f.path === 'types/tasks.ts');
    expect(tasksFile!.content).toContain('deletedAt?: string | null');
  });

  it('handles array fields', () => {
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
              jsonSchema: {
                type: 'object',
                properties: {
                  tags: { type: 'array', items: { type: 'string' } },
                },
              },
            },
            responseStatus: 200,
            tags: ['tasks'],
          },
        ],
      }),
    ];
    const schemas: ParsedSchema[] = [];

    const files = generateTypes(resources, schemas);
    const tasksFile = files.find((f) => f.path === 'types/tasks.ts');
    expect(tasksFile!.content).toContain('tags?: string[]');
  });

  it('deduplicates interfaces with the same name', () => {
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
              jsonSchema: {
                type: 'object',
                properties: { id: { type: 'string' } },
                required: ['id'],
              },
            },
            responseStatus: 200,
            tags: ['tasks'],
          },
          {
            operationId: 'listTasks',
            methodName: 'list',
            method: 'GET',
            path: '/tasks',
            pathParams: [],
            queryParams: [],
            response: {
              name: 'Task',
              jsonSchema: {
                type: 'object',
                properties: { id: { type: 'string' } },
                required: ['id'],
              },
            },
            responseStatus: 200,
            tags: ['tasks'],
          },
        ],
      }),
    ];
    const schemas: ParsedSchema[] = [];

    const files = generateTypes(resources, schemas);
    const tasksFile = files.find((f) => f.path === 'types/tasks.ts');
    // Should only have one Task interface, not two
    const matches = tasksFile!.content.match(/export interface Task \{/g);
    expect(matches).toHaveLength(1);
  });
});
