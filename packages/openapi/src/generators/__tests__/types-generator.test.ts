import { describe, expect, it } from '@vertz/test';
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

  it('derives input name from methodName when schema has no name', () => {
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
    expect(tasksFile!.content).toContain('export interface CreateInput {');
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
    expect(tasksFile!.content).toContain('export interface ListQuery {');
    expect(tasksFile!.content).toContain('  status?: string;');
    expect(tasksFile!.content).toContain('  limit?: number;');
    expect(tasksFile!.content).toContain('  page: number;');
  });

  it('query interfaces do not include index signature (#2217)', () => {
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
    // Index signature is no longer needed — @vertz/fetch accepts typed interfaces
    // via the QueryParams type alias (object) instead of Record<string, unknown>
    expect(tasksFile!.content).not.toContain('[key: string]: unknown;');
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

  it('uses methodName-based fallback for type names instead of verbose operationId (#2415)', () => {
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
    // Should use the clean methodName-based prefix, not the verbose operationId
    expect(tasksFile!.content).toContain('export interface ListResponse {');
    expect(tasksFile!.content).not.toContain('WebOrganizations');
    expect(tasksFile!.content).not.toContain('OrganizationId');
  });

  it('derives response name from methodName when schema has no name', () => {
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
    expect(tasksFile!.content).toContain('export interface GetResponse {');
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

  it('generates *Event type for streaming operations instead of *Response (#2426)', () => {
    const resources: ParsedResource[] = [
      makeResource({
        operations: [
          {
            operationId: 'streamBrandDraft',
            methodName: 'streamBrandDraft',
            method: 'POST',
            path: '/brands/draft-brand',
            pathParams: [],
            queryParams: [],
            requestBody: {
              jsonSchema: { type: 'object', properties: { prompt: { type: 'string' } } },
            },
            response: {
              jsonSchema: { type: 'object', properties: { chunk: { type: 'string' } } },
            },
            responseStatus: 200,
            tags: ['brands'],
            streamingFormat: 'sse',
          },
        ],
      }),
    ];
    const schemas: ParsedSchema[] = [];

    const files = generateTypes(resources, schemas);
    const tasksFile = files.find((f) => f.path === 'types/tasks.ts');
    // Streaming operations should use *Event suffix to match resource-generator imports
    expect(tasksFile!.content).toContain('export interface StreamBrandDraftEvent {');
    expect(tasksFile!.content).not.toContain('StreamBrandDraftResponse');
  });

  it('generates *Event type for streaming ops with named schema (#2426)', () => {
    const resources: ParsedResource[] = [
      makeResource({
        operations: [
          {
            operationId: 'streamEvents',
            methodName: 'streamEvents',
            method: 'GET',
            path: '/tasks/events',
            pathParams: [],
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
    const schemas: ParsedSchema[] = [];

    const files = generateTypes(resources, schemas);
    const tasksFile = files.find((f) => f.path === 'types/tasks.ts');
    // Named streaming schemas should use the schema name directly
    expect(tasksFile!.content).toContain('export interface TaskEvent {');
  });

  it('generates union type alias for oneOf streaming event schemas (#2426)', () => {
    const resources: ParsedResource[] = [
      makeResource({
        operations: [
          {
            operationId: 'streamDraft',
            methodName: 'streamDraft',
            method: 'POST',
            path: '/onboard/draft-brand',
            pathParams: [],
            queryParams: [],
            requestBody: {
              jsonSchema: { type: 'object', properties: { prompt: { type: 'string' } } },
            },
            response: {
              jsonSchema: {
                oneOf: [
                  {
                    type: 'object',
                    properties: {
                      step: { type: 'string', enum: ['brand_details'] },
                      data: { type: 'object', properties: { name: { type: 'string' } } },
                    },
                    required: ['step', 'data'],
                  },
                  {
                    type: 'object',
                    properties: {
                      step: { type: 'string', enum: ['topics'] },
                      data: { type: 'array', items: { type: 'string' } },
                    },
                    required: ['step', 'data'],
                  },
                ],
              },
            },
            responseStatus: 200,
            tags: ['tasks'],
            streamingFormat: 'sse',
          },
        ],
      }),
    ];
    const schemas: ParsedSchema[] = [];

    const files = generateTypes(resources, schemas);
    const tasksFile = files.find((f) => f.path === 'types/tasks.ts');
    // oneOf schemas should generate a type alias (union), not an empty interface
    expect(tasksFile!.content).toContain('export type StreamDraftEvent =');
    expect(tasksFile!.content).not.toContain('export interface StreamDraftEvent {}');
    // Should contain the union members
    expect(tasksFile!.content).toContain("step: 'brand_details'");
    expect(tasksFile!.content).toContain('data: string[]');
  });

  it('generates union type alias for oneOf component schemas (#2426)', () => {
    const resources: ParsedResource[] = [makeResource()];
    const schemas: ParsedSchema[] = [
      {
        name: 'DraftEvent',
        jsonSchema: {
          oneOf: [
            {
              type: 'object',
              properties: {
                step: { type: 'string', enum: ['brand_details'] },
                data: { type: 'object', properties: { name: { type: 'string' } } },
              },
              required: ['step', 'data'],
            },
            {
              type: 'object',
              properties: {
                step: { type: 'string', enum: ['topics'] },
                data: { type: 'array', items: { type: 'string' } },
              },
              required: ['step', 'data'],
            },
          ],
        },
      },
    ];

    const files = generateTypes(resources, schemas);
    const componentsFile = files.find((f) => f.path === 'types/components.ts');
    expect(componentsFile!.content).toContain('export type DraftEvent =');
    expect(componentsFile!.content).not.toContain('export interface DraftEvent {}');
  });

  it('oneOf members with nullable properties preserve correct semantics (#2426)', () => {
    const resources: ParsedResource[] = [
      makeResource({
        operations: [
          {
            operationId: 'streamProgress',
            methodName: 'streamProgress',
            method: 'GET',
            path: '/progress',
            pathParams: [],
            queryParams: [],
            response: {
              jsonSchema: {
                oneOf: [
                  {
                    type: 'object',
                    properties: {
                      step: { type: 'string', enum: ['init'] },
                      value: { type: ['string', 'null'] },
                    },
                    required: ['step', 'value'],
                  },
                  {
                    type: 'object',
                    properties: {
                      step: { type: 'string', enum: ['done'] },
                      count: { type: 'number' },
                    },
                    required: ['step', 'count'],
                  },
                ],
              },
            },
            responseStatus: 200,
            tags: ['tasks'],
            streamingFormat: 'sse',
          },
        ],
      }),
    ];
    const schemas: ParsedSchema[] = [];

    const files = generateTypes(resources, schemas);
    const tasksFile = files.find((f) => f.path === 'types/tasks.ts');
    // Each union member must stay intact — nullable `string | null` must not be split
    expect(tasksFile!.content).toContain('value: string | null');
    expect(tasksFile!.content).toContain("step: 'done'");
    expect(tasksFile!.content).toContain('count: number');
  });

  it('single-member oneOf generates type alias without leading pipe (#2426)', () => {
    const resources: ParsedResource[] = [makeResource()];
    const schemas: ParsedSchema[] = [
      {
        name: 'SingleVariant',
        jsonSchema: {
          oneOf: [{ type: 'object', properties: { id: { type: 'string' } }, required: ['id'] }],
        },
      },
    ];

    const files = generateTypes(resources, schemas);
    const componentsFile = files.find((f) => f.path === 'types/components.ts');
    expect(componentsFile!.content).toContain('export type SingleVariant = { id: string };\n');
    expect(componentsFile!.content).not.toContain('|');
  });

  it('generates union type alias for anyOf schemas (#2426)', () => {
    const resources: ParsedResource[] = [makeResource()];
    const schemas: ParsedSchema[] = [
      {
        name: 'NullableString',
        jsonSchema: {
          anyOf: [{ type: 'string' }, { type: 'null' }],
        },
      },
    ];

    const files = generateTypes(resources, schemas);
    const componentsFile = files.find((f) => f.path === 'types/components.ts');
    expect(componentsFile!.content).toContain('export type NullableString =');
    expect(componentsFile!.content).not.toContain('export interface NullableString {}');
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
