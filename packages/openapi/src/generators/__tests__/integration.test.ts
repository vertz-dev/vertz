import { describe, expect, it } from 'bun:test';
import { groupOperations } from '../../adapter/resource-grouper';
import { parseOpenAPI } from '../../parser/openapi-parser';
import type { ParsedSpec } from '../../parser/types';
import { generateAll } from '../index';

/**
 * A realistic OpenAPI 3.0 spec for integration testing.
 */
const TASK_API_SPEC = {
  openapi: '3.0.3',
  info: { title: 'Task API', version: '1.0.0' },
  paths: {
    '/tasks': {
      get: {
        operationId: 'listTasks',
        tags: ['tasks'],
        parameters: [
          {
            name: 'status',
            in: 'query',
            required: false,
            schema: { type: 'string', enum: ['active', 'completed'] },
          },
          {
            name: 'limit',
            in: 'query',
            required: false,
            schema: { type: 'integer' },
          },
        ],
        responses: {
          '200': {
            description: 'List of tasks',
            content: {
              'application/json': {
                schema: {
                  type: 'array',
                  items: { $ref: '#/components/schemas/Task' },
                },
              },
            },
          },
        },
      },
      post: {
        operationId: 'createTask',
        tags: ['tasks'],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/CreateTaskInput' },
            },
          },
        },
        responses: {
          '201': {
            description: 'Created task',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/Task' },
              },
            },
          },
        },
      },
    },
    '/tasks/{taskId}': {
      get: {
        operationId: 'getTask',
        tags: ['tasks'],
        parameters: [
          { name: 'taskId', in: 'path', required: true, schema: { type: 'string' } },
        ],
        responses: {
          '200': {
            description: 'A task',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/Task' },
              },
            },
          },
        },
      },
      put: {
        operationId: 'updateTask',
        tags: ['tasks'],
        parameters: [
          { name: 'taskId', in: 'path', required: true, schema: { type: 'string' } },
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/UpdateTaskInput' },
            },
          },
        },
        responses: {
          '200': {
            description: 'Updated task',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/Task' },
              },
            },
          },
        },
      },
      delete: {
        operationId: 'deleteTask',
        tags: ['tasks'],
        parameters: [
          { name: 'taskId', in: 'path', required: true, schema: { type: 'string' } },
        ],
        responses: {
          '204': { description: 'Deleted' },
        },
      },
    },
  },
  components: {
    schemas: {
      Task: {
        type: 'object',
        required: ['id', 'title', 'status', 'createdAt'],
        properties: {
          id: { type: 'string', format: 'uuid' },
          title: { type: 'string' },
          description: { type: 'string' },
          status: { type: 'string', enum: ['active', 'completed'] },
          tags: { type: 'array', items: { type: 'string' } },
          createdAt: { type: 'string', format: 'date-time' },
          deletedAt: { type: ['string', 'null'], format: 'date-time' },
        },
      },
      CreateTaskInput: {
        type: 'object',
        required: ['title'],
        properties: {
          title: { type: 'string', minLength: 1, maxLength: 200 },
          description: { type: 'string' },
          tags: { type: 'array', items: { type: 'string' } },
        },
      },
      UpdateTaskInput: {
        type: 'object',
        properties: {
          title: { type: 'string', minLength: 1, maxLength: 200 },
          description: { type: 'string' },
          status: { type: 'string', enum: ['active', 'completed'] },
          tags: { type: 'array', items: { type: 'string' } },
        },
      },
    },
  },
};

describe('generateAll — integration', () => {
  function parseAndGenerate(options?: { schemas?: boolean; baseURL?: string }) {
    const parsed = parseOpenAPI(TASK_API_SPEC as Record<string, unknown>);
    const resources = groupOperations(parsed.operations, 'tag');
    const spec: ParsedSpec = {
      version: parsed.version,
      info: {
        title: (TASK_API_SPEC.info as { title: string }).title,
        version: (TASK_API_SPEC.info as { version: string }).version,
      },
      resources,
      schemas: parsed.schemas,
    };
    return generateAll(spec, options);
  }

  it('produces all expected files (types, resources, client, README)', () => {
    const files = parseAndGenerate();
    const paths = files.map((f) => f.path).sort();

    expect(paths).toContain('client.ts');
    expect(paths).toContain('types/tasks.ts');
    expect(paths).toContain('types/index.ts');
    expect(paths).toContain('resources/tasks.ts');
    expect(paths).toContain('resources/index.ts');
    expect(paths).toContain('README.md');
  });

  it('does NOT produce schemas/ when schemas option is false (default)', () => {
    const files = parseAndGenerate();
    const schemaPaths = files.filter((f) => f.path.startsWith('schemas/'));
    expect(schemaPaths).toHaveLength(0);
  });

  it('produces schemas/ when schemas option is true', () => {
    const files = parseAndGenerate({ schemas: true });
    const schemaPaths = files.filter((f) => f.path.startsWith('schemas/'));
    expect(schemaPaths.length).toBeGreaterThan(0);
    expect(schemaPaths.map((f) => f.path)).toContain('schemas/tasks.ts');
    expect(schemaPaths.map((f) => f.path)).toContain('schemas/index.ts');
  });

  it('generates README.md with usage and resource info', () => {
    const files = parseAndGenerate();
    const readme = files.find((f) => f.path === 'README.md');
    expect(readme).toBeDefined();
    expect(readme!.content).toContain('createClient');
    expect(readme!.content).toContain('tasks');
    expect(readme!.content).toContain('committing');
  });

  it('has no @vertz/* imports in generated code', () => {
    const files = parseAndGenerate({ schemas: true });
    for (const file of files) {
      // Check for @vertz/ in import statements, not in comments
      const importLines = file.content
        .split('\n')
        .filter((line) => line.trimStart().startsWith('import '));
      for (const line of importLines) {
        expect(line).not.toContain('@vertz/');
      }
    }
  });

  it('types file contains correct Task interface', () => {
    const files = parseAndGenerate();
    const typesFile = files.find((f) => f.path === 'types/tasks.ts');
    expect(typesFile!.content).toContain('export interface Task {');
    expect(typesFile!.content).toContain('id: string;');
    expect(typesFile!.content).toContain('title: string;');
    expect(typesFile!.content).toContain("status: 'active' | 'completed';");
    expect(typesFile!.content).toContain('tags?: string[];');
    expect(typesFile!.content).toContain('deletedAt?: string | null;');
  });

  it('types file contains input interfaces', () => {
    const files = parseAndGenerate();
    const typesFile = files.find((f) => f.path === 'types/tasks.ts');
    expect(typesFile!.content).toContain('export interface CreateTaskInput {');
    expect(typesFile!.content).toContain('export interface UpdateTaskInput {');
  });

  it('types file contains query interface', () => {
    const files = parseAndGenerate();
    const typesFile = files.find((f) => f.path === 'types/tasks.ts');
    expect(typesFile!.content).toContain('export interface ListTasksQuery {');
  });

  it('resources file has all CRUD methods', () => {
    const files = parseAndGenerate();
    const resourceFile = files.find((f) => f.path === 'resources/tasks.ts');
    expect(resourceFile!.content).toContain('list(');
    expect(resourceFile!.content).toContain('get(');
    expect(resourceFile!.content).toContain('create(');
    expect(resourceFile!.content).toContain('update(');
    expect(resourceFile!.content).toContain('delete(');
  });

  it('client file composes tasks resource', () => {
    const files = parseAndGenerate();
    const clientFile = files.find((f) => f.path === 'client.ts');
    expect(clientFile!.content).toContain('tasks: createTasksResource(client)');
  });

  it('passes baseURL config through to client generator', () => {
    const files = parseAndGenerate({ baseURL: '/api/v1' });
    const clientFile = files.find((f) => f.path === 'client.ts');
    expect(clientFile!.content).toContain("options.baseURL ?? '/api/v1'");
  });
});
