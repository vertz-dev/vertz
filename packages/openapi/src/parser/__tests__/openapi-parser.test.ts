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
      securitySchemes: [],
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
        name: 'UpdateTaskInput',
        jsonSchema: {
          type: 'object',
          properties: {
            title: { type: 'string' },
          },
        },
      },
      response: {
        name: 'Task',
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

  it('parses bearer security scheme from components.securitySchemes', () => {
    const spec = {
      openapi: '3.1.0',
      info: { title: 'Test', version: '1.0.0' },
      paths: {},
      components: {
        securitySchemes: {
          BearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
        },
      },
    };

    const result = parseOpenAPI(spec);
    expect(result.securitySchemes).toEqual([
      { type: 'bearer', name: 'BearerAuth', description: undefined },
    ]);
  });

  it('parses apiKey security scheme', () => {
    const spec = {
      openapi: '3.1.0',
      info: { title: 'Test', version: '1.0.0' },
      paths: {},
      components: {
        securitySchemes: {
          ApiKey: {
            type: 'apiKey',
            in: 'header',
            name: 'X-API-Key',
            description: 'API key for access',
          },
        },
      },
    };

    const result = parseOpenAPI(spec);
    expect(result.securitySchemes).toEqual([
      {
        type: 'apiKey',
        name: 'ApiKey',
        in: 'header',
        paramName: 'X-API-Key',
        description: 'API key for access',
      },
    ]);
  });

  it('parses basic auth security scheme', () => {
    const spec = {
      openapi: '3.1.0',
      info: { title: 'Test', version: '1.0.0' },
      paths: {},
      components: {
        securitySchemes: {
          BasicAuth: { type: 'http', scheme: 'basic' },
        },
      },
    };

    const result = parseOpenAPI(spec);
    expect(result.securitySchemes).toEqual([
      { type: 'basic', name: 'BasicAuth', description: undefined },
    ]);
  });

  it('parses oauth2 security scheme with flows', () => {
    const spec = {
      openapi: '3.1.0',
      info: { title: 'Test', version: '1.0.0' },
      paths: {},
      components: {
        securitySchemes: {
          OAuth2: {
            type: 'oauth2',
            flows: {
              authorizationCode: {
                authorizationUrl: '/oauth/authorize',
                tokenUrl: '/oauth/token',
                scopes: { 'read:tasks': 'Read tasks', 'write:tasks': 'Write tasks' },
              },
            },
          },
        },
      },
    };

    const result = parseOpenAPI(spec);
    expect(result.securitySchemes).toEqual([
      {
        type: 'oauth2',
        name: 'OAuth2',
        flows: {
          authorizationCode: {
            authorizationUrl: '/oauth/authorize',
            tokenUrl: '/oauth/token',
            scopes: { 'read:tasks': 'Read tasks', 'write:tasks': 'Write tasks' },
          },
        },
        description: undefined,
      },
    ]);
  });

  it('parses multiple security schemes', () => {
    const spec = {
      openapi: '3.1.0',
      info: { title: 'Test', version: '1.0.0' },
      paths: {},
      components: {
        securitySchemes: {
          BearerAuth: { type: 'http', scheme: 'bearer' },
          ApiKey: { type: 'apiKey', in: 'query', name: 'api_key' },
        },
      },
    };

    const result = parseOpenAPI(spec);
    expect(result.securitySchemes).toHaveLength(2);
    expect(result.securitySchemes[0]!.name).toBe('BearerAuth');
    expect(result.securitySchemes[1]!.name).toBe('ApiKey');
  });

  it('returns empty securitySchemes when spec has none', () => {
    const spec = {
      openapi: '3.1.0',
      info: { title: 'Test', version: '1.0.0' },
      paths: {},
    };

    expect(parseOpenAPI(spec).securitySchemes).toEqual([]);
  });

  it('parses global security requirements', () => {
    const spec = {
      openapi: '3.1.0',
      info: { title: 'Test', version: '1.0.0' },
      paths: {
        '/tasks': {
          get: {
            operationId: 'listTasks',
            responses: {
              '200': { content: { 'application/json': { schema: { type: 'object' } } } },
            },
          },
        },
      },
      security: [{ BearerAuth: [] }],
      components: {
        securitySchemes: {
          BearerAuth: { type: 'http', scheme: 'bearer' },
        },
      },
    };

    const result = parseOpenAPI(spec);
    expect(result.operations[0]!.security).toEqual({ required: true, schemes: ['BearerAuth'] });
  });

  it('operation-level security overrides global security', () => {
    const spec = {
      openapi: '3.1.0',
      info: { title: 'Test', version: '1.0.0' },
      paths: {
        '/public': {
          get: {
            operationId: 'getPublic',
            security: [],
            responses: {
              '200': { content: { 'application/json': { schema: { type: 'object' } } } },
            },
          },
        },
        '/private': {
          get: {
            operationId: 'getPrivate',
            security: [{ ApiKey: [] }],
            responses: {
              '200': { content: { 'application/json': { schema: { type: 'object' } } } },
            },
          },
        },
      },
      security: [{ BearerAuth: [] }],
      components: {
        securitySchemes: {
          BearerAuth: { type: 'http', scheme: 'bearer' },
          ApiKey: { type: 'apiKey', in: 'header', name: 'X-API-Key' },
        },
      },
    };

    const result = parseOpenAPI(spec);
    const publicOp = result.operations.find((op) => op.operationId === 'getPublic');
    const privateOp = result.operations.find((op) => op.operationId === 'getPrivate');
    expect(publicOp!.security).toEqual({ required: false, schemes: [] });
    expect(privateOp!.security).toEqual({ required: true, schemes: ['ApiKey'] });
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

  it('detects text/event-stream response and sets streamingFormat: sse', () => {
    const spec = {
      openapi: '3.1.0',
      info: { title: 'Test', version: '1.0.0' },
      paths: {
        '/tasks/{taskId}/events': {
          get: {
            operationId: 'streamTaskEvents',
            parameters: [{ name: 'taskId', in: 'path', required: true, schema: { type: 'string' } }],
            responses: {
              '200': {
                description: 'Stream of task events',
                content: {
                  'text/event-stream': {
                    schema: { $ref: '#/components/schemas/TaskEvent' },
                  },
                },
              },
            },
          },
        },
      },
      components: {
        schemas: {
          TaskEvent: {
            type: 'object',
            properties: { type: { type: 'string' }, payload: { type: 'object' } },
          },
        },
      },
    };

    const result = parseOpenAPI(spec);
    expect(result.operations[0]!.streamingFormat).toBe('sse');
    expect(result.operations[0]!.response).toEqual({
      name: 'TaskEvent',
      jsonSchema: {
        type: 'object',
        properties: { type: { type: 'string' }, payload: { type: 'object' } },
      },
    });
  });

  it('detects application/x-ndjson response and sets streamingFormat: ndjson', () => {
    const spec = {
      openapi: '3.1.0',
      info: { title: 'Test', version: '1.0.0' },
      paths: {
        '/logs/stream': {
          get: {
            operationId: 'streamLogs',
            responses: {
              '200': {
                content: {
                  'application/x-ndjson': {
                    schema: { $ref: '#/components/schemas/LogEntry' },
                  },
                },
              },
            },
          },
        },
      },
      components: {
        schemas: {
          LogEntry: { type: 'object', properties: { message: { type: 'string' } } },
        },
      },
    };

    const result = parseOpenAPI(spec);
    expect(result.operations[0]!.streamingFormat).toBe('ndjson');
    expect(result.operations[0]!.response!.name).toBe('LogEntry');
  });

  it('does not set streamingFormat for application/json-only responses', () => {
    const spec = {
      openapi: '3.1.0',
      info: { title: 'Test', version: '1.0.0' },
      paths: {
        '/tasks': {
          get: {
            operationId: 'listTasks',
            responses: {
              '200': {
                content: {
                  'application/json': {
                    schema: { type: 'array', items: { type: 'string' } },
                  },
                },
              },
            },
          },
        },
      },
    };

    const result = parseOpenAPI(spec);
    expect(result.operations[0]!.streamingFormat).toBeUndefined();
  });

  it('handles text/event-stream with no schema', () => {
    const spec = {
      openapi: '3.1.0',
      info: { title: 'Test', version: '1.0.0' },
      paths: {
        '/events': {
          get: {
            operationId: 'streamEvents',
            responses: {
              '200': {
                content: {
                  'text/event-stream': {},
                },
              },
            },
          },
        },
      },
    };

    const result = parseOpenAPI(spec);
    expect(result.operations[0]!.streamingFormat).toBe('sse');
    expect(result.operations[0]!.response).toBeUndefined();
  });

  it('handles dual content type (JSON + SSE) with separate schemas', () => {
    const spec = {
      openapi: '3.1.0',
      info: { title: 'Test', version: '1.0.0' },
      paths: {
        '/tasks': {
          get: {
            operationId: 'listTasks',
            responses: {
              '200': {
                content: {
                  'application/json': {
                    schema: { $ref: '#/components/schemas/TaskList' },
                  },
                  'text/event-stream': {
                    schema: { $ref: '#/components/schemas/TaskEvent' },
                  },
                },
              },
            },
          },
        },
      },
      components: {
        schemas: {
          TaskList: { type: 'object', properties: { items: { type: 'array' } } },
          TaskEvent: { type: 'object', properties: { type: { type: 'string' } } },
        },
      },
    };

    const result = parseOpenAPI(spec);
    const op = result.operations[0]!;
    expect(op.streamingFormat).toBe('sse');
    // response holds the streaming schema
    expect(op.response!.name).toBe('TaskEvent');
    // jsonResponse holds the JSON schema
    expect(op.jsonResponse!.name).toBe('TaskList');
  });
});
