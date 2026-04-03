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
  it('generates component schema interfaces in types/components.ts', () => {
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
    // Component schemas go to types/components.ts
    const componentsFile = files.find((f) => f.path === 'types/components.ts');
    expect(componentsFile).toBeDefined();
    expect(componentsFile!.content).toContain('export interface Task {');
    expect(componentsFile!.content).toContain('  id: string;');
    expect(componentsFile!.content).toContain('  title: string;');
    // Per-resource file imports instead of re-declaring
    const tasksFile = files.find((f) => f.path === 'types/tasks.ts');
    expect(tasksFile).toBeDefined();
    expect(tasksFile!.content).not.toContain('export interface Task {');
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
            pathParams: [{ name: 'organization_id', required: true, schema: { type: 'string' } }],
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

  it('generates types/components.ts with interfaces for all component schemas', () => {
    const resources: ParsedResource[] = [makeResource()];
    const schemas: ParsedSchema[] = [
      {
        name: 'TreeNode',
        jsonSchema: {
          type: 'object',
          properties: {
            value: { type: 'string' },
            child: { $circular: 'TreeNode' },
          },
          required: ['value'],
        },
      },
    ];

    const files = generateTypes(resources, schemas);
    const componentsFile = files.find((f) => f.path === 'types/components.ts');
    expect(componentsFile).toBeDefined();
    expect(componentsFile!.content).toContain('export interface TreeNode {');
    expect(componentsFile!.content).toContain('  value: string;');
    expect(componentsFile!.content).toContain('  child?: TreeNode;');
  });

  it('includes components in the barrel export', () => {
    const resources: ParsedResource[] = [makeResource()];
    const schemas: ParsedSchema[] = [
      {
        name: 'Category',
        jsonSchema: { type: 'object', properties: { name: { type: 'string' } } },
      },
    ];

    const files = generateTypes(resources, schemas);
    const indexFile = files.find((f) => f.path === 'types/index.ts');
    expect(indexFile!.content).toContain("export * from './components';");
  });

  it('does not re-declare component schema interfaces in per-resource files', () => {
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
        ],
      }),
    ];
    const schemas: ParsedSchema[] = [
      {
        name: 'Task',
        jsonSchema: {
          type: 'object',
          properties: { id: { type: 'string' } },
          required: ['id'],
        },
      },
    ];

    const files = generateTypes(resources, schemas);
    const tasksFile = files.find((f) => f.path === 'types/tasks.ts');
    // Task interface should NOT be in the per-resource file — it's in components.ts
    expect(tasksFile!.content).not.toContain('export interface Task {');
    // But it must exist in components.ts
    const componentsFile = files.find((f) => f.path === 'types/components.ts');
    expect(componentsFile!.content).toContain('export interface Task {');
  });

  it('imports component types referenced via $circular in per-resource files', () => {
    const resources: ParsedResource[] = [
      makeResource({
        operations: [
          {
            operationId: 'loadMetrics',
            methodName: 'loadMetrics',
            method: 'POST',
            path: '/metrics/load',
            pathParams: [],
            queryParams: [],
            requestBody: {
              jsonSchema: {
                type: 'object',
                properties: {
                  filters: {
                    type: 'array',
                    items: {
                      oneOf: [
                        {
                          type: 'object',
                          properties: { member: { type: 'string' } },
                        },
                        { $circular: 'CubeLogicalAndFilter' },
                      ],
                    },
                  },
                },
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
        name: 'CubeLogicalAndFilter',
        jsonSchema: {
          type: 'object',
          properties: {
            and: {
              type: 'array',
              items: { $circular: 'CubeLogicalAndFilter' },
            },
          },
        },
      },
    ];

    const files = generateTypes(resources, schemas);
    const tasksFile = files.find((f) => f.path === 'types/tasks.ts');
    expect(tasksFile!.content).toContain(
      "import type { CubeLogicalAndFilter } from './components';",
    );
  });

  it('generates mutual-recursive component schemas', () => {
    const resources: ParsedResource[] = [makeResource()];
    const schemas: ParsedSchema[] = [
      {
        name: 'CubeLogicalAndFilter',
        jsonSchema: {
          type: 'object',
          properties: {
            and: {
              type: 'array',
              items: {
                oneOf: [
                  { $circular: 'CubeLogicalAndFilter' },
                  { $circular: 'CubeLogicalOrFilter' },
                ],
              },
            },
          },
        },
      },
      {
        name: 'CubeLogicalOrFilter',
        jsonSchema: {
          type: 'object',
          properties: {
            or: {
              type: 'array',
              items: {
                oneOf: [
                  { $circular: 'CubeLogicalAndFilter' },
                  { $circular: 'CubeLogicalOrFilter' },
                ],
              },
            },
          },
        },
      },
    ];

    const files = generateTypes(resources, schemas);
    const componentsFile = files.find((f) => f.path === 'types/components.ts');
    expect(componentsFile!.content).toContain('export interface CubeLogicalAndFilter {');
    expect(componentsFile!.content).toContain('export interface CubeLogicalOrFilter {');
    // Self and mutual references should appear as type names
    expect(componentsFile!.content).toContain('CubeLogicalAndFilter');
    expect(componentsFile!.content).toContain('CubeLogicalOrFilter');
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
          {
            operationId:
              're_evaluate_observations_internal_brands_brand_id_re_evaluate_observations_post',
            methodName: 'reEvaluateObservations',
            typePrefix: 'ReEvaluateObservations',
            method: 'POST',
            path: '/internal/brands/{brandId}/re-evaluate-observations',
            pathParams: [{ name: 'brandId', required: true, schema: { type: 'string' } }],
            queryParams: [],
            requestBody: {
              jsonSchema: { type: 'object', properties: { force: { type: 'boolean' } } },
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
    // Short typePrefix-based names
    expect(tasksFile!.content).toContain('export interface ListBrandCompetitorsResponse {');
    expect(tasksFile!.content).toContain('export interface ListBrandCompetitorsQuery {');
    expect(tasksFile!.content).toContain('export interface ReEvaluateObservationsInput {');
    // Should NOT contain the long operationId-based names
    expect(tasksFile!.content).not.toContain('WebBrandIdCompetitorsGet');
    expect(tasksFile!.content).not.toContain('InternalBrandsBrandId');
  });
});
