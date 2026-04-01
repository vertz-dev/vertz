import { describe, expect, it } from 'bun:test';
import { parseOpenAPI } from '../openapi-parser';

describe('parseOpenAPI', () => {
  it('parses a minimal valid 3.1 spec', () => {
    const spec = {
      openapi: '3.1.0',
      info: {
        title: 'Tasks API',
        version: '1.0.0',
      },
      paths: {
        '/tasks': {
          get: {
            operationId: 'list_tasks_tasks__get',
            responses: {
              '200': {
                description: 'OK',
                content: {
                  'application/json': {
                    schema: {
                      type: 'array',
                      items: {
                        type: 'string',
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    };

    expect(parseOpenAPI(spec)).toEqual({
      version: '3.1',
      operations: [
        {
          operationId: 'list_tasks_tasks__get',
          methodName: 'list',
          method: 'GET',
          path: '/tasks',
          pathParams: [],
          queryParams: [],
          response: {
            jsonSchema: {
              type: 'array',
              items: {
                type: 'string',
              },
            },
          },
          responseStatus: 200,
          tags: [],
        },
      ],
      schemas: [],
    });
  });

  it('parses a minimal valid 3.0 spec and normalizes nullable schemas', () => {
    const spec = {
      openapi: '3.0.3',
      info: {
        title: 'Tasks API',
        version: '1.0.0',
      },
      paths: {
        '/tasks': {
          post: {
            operationId: 'create_task',
            requestBody: {
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      title: { type: 'string', nullable: true },
                    },
                  },
                },
              },
            },
            responses: {
              '201': {
                description: 'Created',
                content: {
                  'application/json': {
                    schema: {
                      type: 'object',
                      properties: {
                        id: { type: 'string' },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    };

    const parsed = parseOpenAPI(spec);

    expect(parsed.version).toBe('3.0');
    expect(parsed.operations[0]?.requestBody).toEqual({
      jsonSchema: {
        type: 'object',
        properties: {
          title: {
            type: ['string', 'null'],
          },
        },
      },
    });
  });

  it('extracts path params, query params, request body, and the lowest 2xx response schema', () => {
    const spec = {
      openapi: '3.1.0',
      info: {
        title: 'Tasks API',
        version: '1.0.0',
      },
      paths: {
        '/tasks/{taskId}': {
          parameters: [
            {
              name: 'taskId',
              in: 'path',
              required: true,
              schema: { type: 'string' },
            },
          ],
          patch: {
            operationId: 'update_task',
            parameters: [
              {
                name: 'expand',
                in: 'query',
                required: false,
                schema: { type: 'boolean' },
              },
            ],
            requestBody: {
              content: {
                'application/json': {
                  schema: {
                    $ref: '#/components/schemas/UpdateTaskInput',
                  },
                },
              },
            },
            responses: {
              '202': {
                description: 'Accepted',
                content: {
                  'application/json': {
                    schema: {
                      type: 'string',
                    },
                  },
                },
              },
              '200': {
                description: 'OK',
                content: {
                  'application/json': {
                    schema: {
                      $ref: '#/components/schemas/Task',
                    },
                  },
                },
              },
            },
          },
        },
      },
      components: {
        schemas: {
          Task: {
            type: 'object',
            properties: {
              id: { type: 'string' },
            },
            required: ['id'],
          },
          UpdateTaskInput: {
            type: 'object',
            properties: {
              title: { type: 'string' },
            },
          },
        },
      },
    };

    expect(parseOpenAPI(spec).operations[0]).toEqual({
      operationId: 'update_task',
      methodName: 'update',
      method: 'PATCH',
      path: '/tasks/{taskId}',
      pathParams: [
        {
          name: 'taskId',
          required: true,
          schema: { type: 'string' },
        },
      ],
      queryParams: [
        {
          name: 'expand',
          required: false,
          schema: { type: 'boolean' },
        },
      ],
      requestBody: {
        jsonSchema: {
          type: 'object',
          properties: {
            title: { type: 'string' },
          },
        },
      },
      response: {
        jsonSchema: {
          type: 'object',
          properties: {
            id: { type: 'string' },
          },
          required: ['id'],
        },
      },
      responseStatus: 200,
      tags: [],
    });
  });

  it('detects 204 no content responses', () => {
    const spec = {
      openapi: '3.1.0',
      info: {
        title: 'Tasks API',
        version: '1.0.0',
      },
      paths: {
        '/tasks/{taskId}': {
          delete: {
            operationId: 'delete_task',
            responses: {
              '204': {
                description: 'No Content',
              },
            },
          },
        },
      },
    };

    expect(parseOpenAPI(spec).operations[0]).toMatchObject({
      methodName: 'delete',
      responseStatus: 204,
      response: undefined,
    });
  });

  it('collects named component schemas', () => {
    const spec = {
      openapi: '3.1.0',
      info: {
        title: 'Tasks API',
        version: '1.0.0',
      },
      paths: {},
      components: {
        schemas: {
          Task: {
            type: 'object',
            properties: {
              id: { type: 'string' },
            },
          },
          TaskList: {
            type: 'array',
            items: {
              $ref: '#/components/schemas/Task',
            },
          },
        },
      },
    };

    expect(parseOpenAPI(spec).schemas).toEqual([
      {
        name: 'Task',
        jsonSchema: {
          type: 'object',
          properties: {
            id: { type: 'string' },
          },
        },
      },
      {
        name: 'TaskList',
        jsonSchema: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string' },
            },
          },
        },
      },
    ]);
  });

  it('throws descriptive errors for missing required top-level fields and unsupported versions', () => {
    expect(() => parseOpenAPI({})).toThrow('OpenAPI spec is missing required field: openapi');
    expect(() =>
      parseOpenAPI({
        openapi: '3.1.0',
      }),
    ).toThrow('OpenAPI spec is missing required field: info');
    expect(() =>
      parseOpenAPI({
        openapi: '3.1.0',
        info: {
          title: 'Tasks API',
          version: '1.0.0',
        },
      }),
    ).toThrow('OpenAPI spec is missing required field: paths');
    expect(() =>
      parseOpenAPI({
        openapi: '2.0',
        info: {
          title: 'Tasks API',
          version: '1.0.0',
        },
        paths: {},
      }),
    ).toThrow('Unsupported OpenAPI version: 2.0');
  });
});
