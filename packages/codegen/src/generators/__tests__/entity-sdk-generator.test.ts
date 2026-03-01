import { describe, expect, it } from 'bun:test';
import type { CodegenEntityModule, CodegenIR } from '../../types';
import { EntitySdkGenerator } from '../entity-sdk-generator';

describe('EntitySdkGenerator', () => {
  const generator = new EntitySdkGenerator();

  function createBasicIR(entities: CodegenEntityModule[]): CodegenIR {
    return {
      basePath: '/api',
      modules: [],
      schemas: [],
      entities,
      auth: { schemes: [] },
    };
  }

  it('generates typed SDK for entity with all CRUD operations', () => {
    const ir = createBasicIR([
      {
        entityName: 'user',
        operations: [
          {
            kind: 'list',
            method: 'GET',
            path: '/user',
            operationId: 'listUser',
            outputSchema: 'UserResponse',
          },
          {
            kind: 'get',
            method: 'GET',
            path: '/user/:id',
            operationId: 'getUser',
            outputSchema: 'UserResponse',
          },
          {
            kind: 'create',
            method: 'POST',
            path: '/user',
            operationId: 'createUser',
            inputSchema: 'CreateUserInput',
            outputSchema: 'UserResponse',
          },
          {
            kind: 'update',
            method: 'PATCH',
            path: '/user/:id',
            operationId: 'updateUser',
            inputSchema: 'UpdateUserInput',
            outputSchema: 'UserResponse',
          },
          {
            kind: 'delete',
            method: 'DELETE',
            path: '/user/:id',
            operationId: 'deleteUser',
            outputSchema: 'UserResponse',
          },
        ],
        actions: [],
      },
    ]);

    const files = generator.generate(ir, { outputDir: '.vertz', options: {} });
    const userFile = files.find((f) => f.path === 'entities/user.ts');

    expect(userFile).toBeDefined();
    expect(userFile?.content).toContain('export function createUserSdk');
    expect(userFile?.content).toContain('list:');
    expect(userFile?.content).toContain('get:');
    expect(userFile?.content).toContain('create:');
    expect(userFile?.content).toContain('update:');
    expect(userFile?.content).toContain('delete:');
    expect(userFile?.content).toContain('createDescriptor');
  });

  it('generates SDK with custom actions', () => {
    const ir = createBasicIR([
      {
        entityName: 'user',
        operations: [
          {
            kind: 'get',
            method: 'GET',
            path: '/user/:id',
            operationId: 'getUser',
            outputSchema: 'UserResponse',
          },
        ],
        actions: [
          {
            name: 'activate',
            method: 'POST',
            operationId: 'activateUser',
            path: '/user/:id/activate',
            hasId: true,
            inputSchema: 'ActivateUserInput',
            outputSchema: 'ActivateUserOutput',
          },
        ],
      },
    ]);

    const files = generator.generate(ir, { outputDir: '.vertz', options: {} });
    const userFile = files.find((f) => f.path === 'entities/user.ts');

    expect(userFile?.content).toContain('activate:');
    expect(userFile?.content).toContain('Object.assign');
    expect(userFile?.content).toContain('createDescriptor');
    expect(userFile?.content).toContain("method: 'POST' as const");
  });

  it('generates GET collection-level action SDK method', () => {
    const ir = createBasicIR([
      {
        entityName: 'todo',
        operations: [],
        actions: [
          {
            name: 'stats',
            method: 'GET',
            operationId: 'statsTodo',
            path: '/todo/stats',
            hasId: false,
            outputSchema: 'StatsTodoOutput',
          },
        ],
      },
    ]);

    const files = generator.generate(ir, { outputDir: '.vertz', options: {} });
    const todoFile = files.find((f) => f.path === 'entities/todo.ts');

    expect(todoFile?.content).toContain('stats:');
    expect(todoFile?.content).toContain('client.get<StatsTodoOutput>');
    expect(todoFile?.content).not.toContain('id: string');
    expect(todoFile?.content).toContain("method: 'GET' as const");
  });

  it('generates DELETE record-level action SDK method', () => {
    const ir = createBasicIR([
      {
        entityName: 'user',
        operations: [],
        actions: [
          {
            name: 'deactivate',
            method: 'DELETE',
            operationId: 'deactivateUser',
            path: '/user/:id/deactivate',
            hasId: true,
            outputSchema: 'DeactivateUserOutput',
          },
        ],
      },
    ]);

    const files = generator.generate(ir, { outputDir: '.vertz', options: {} });
    const userFile = files.find((f) => f.path === 'entities/user.ts');

    expect(userFile?.content).toContain('deactivate:');
    expect(userFile?.content).toContain('client.delete<DeactivateUserOutput>');
    expect(userFile?.content).toContain('id: string');
    expect(userFile?.content).toContain("method: 'DELETE' as const");
  });

  it('generates list method with ListResponse<T> instead of T[]', () => {
    const ir = createBasicIR([
      {
        entityName: 'user',
        operations: [
          {
            kind: 'list',
            method: 'GET',
            path: '/user',
            operationId: 'listUser',
            outputSchema: 'UserResponse',
          },
        ],
        actions: [],
      },
    ]);

    const files = generator.generate(ir, { outputDir: '.vertz', options: {} });
    const userFile = files.find((f) => f.path === 'entities/user.ts');

    expect(userFile?.content).toContain('client.get<ListResponse<UserResponse>>');
    expect(userFile?.content).not.toContain('client.get<UserResponse[]>');
    expect(userFile?.content).toContain(
      "import { type FetchClient, type ListResponse, createDescriptor } from '@vertz/fetch'",
    );
  });

  it('generates SDK with unknown types when schemas unresolved', () => {
    const ir = createBasicIR([
      {
        entityName: 'user',
        operations: [
          {
            kind: 'list',
            method: 'GET',
            path: '/user',
            operationId: 'listUser',
            // No schema refs
          },
          {
            kind: 'create',
            method: 'POST',
            path: '/user',
            operationId: 'createUser',
            // No schema refs
          },
        ],
        actions: [],
      },
    ]);

    const files = generator.generate(ir, { outputDir: '.vertz', options: {} });
    const userFile = files.find((f) => f.path === 'entities/user.ts');

    expect(userFile?.content).toContain('client.get<ListResponse<unknown>>');
    expect(userFile?.content).toContain('(body: unknown)');
  });

  it('generates index file re-exporting all entity SDKs', () => {
    const ir = createBasicIR([
      {
        entityName: 'user',
        operations: [],
        actions: [],
      },
      {
        entityName: 'post',
        operations: [],
        actions: [],
      },
    ]);

    const files = generator.generate(ir, { outputDir: '.vertz', options: {} });
    const indexFile = files.find((f) => f.path === 'entities/index.ts');

    expect(indexFile).toBeDefined();
    expect(indexFile?.content).toContain("export { createUserSdk } from './user'");
    expect(indexFile?.content).toContain("export { createPostSdk } from './post'");
  });

  it('handles entity with some CRUD disabled', () => {
    const ir = createBasicIR([
      {
        entityName: 'user',
        operations: [
          {
            kind: 'list',
            method: 'GET',
            path: '/user',
            operationId: 'listUser',
            outputSchema: 'UserResponse',
          },
          {
            kind: 'get',
            method: 'GET',
            path: '/user/:id',
            operationId: 'getUser',
            outputSchema: 'UserResponse',
          },
        ],
        actions: [],
      },
    ]);

    const files = generator.generate(ir, { outputDir: '.vertz', options: {} });
    const userFile = files.find((f) => f.path === 'entities/user.ts');

    expect(userFile?.content).toContain('list:');
    expect(userFile?.content).toContain('get:');
    expect(userFile?.content).not.toContain('create:');
  });

  it('handles entity with only custom actions (no CRUD)', () => {
    const ir = createBasicIR([
      {
        entityName: 'user',
        operations: [],
        actions: [
          {
            name: 'activate',
            method: 'POST',
            operationId: 'activateUser',
            path: '/user/:id/activate',
            hasId: true,
            inputSchema: 'ActivateUserInput',
            outputSchema: 'ActivateUserOutput',
          },
        ],
      },
    ]);

    const files = generator.generate(ir, { outputDir: '.vertz', options: {} });
    const userFile = files.find((f) => f.path === 'entities/user.ts');

    expect(userFile?.content).toContain('activate:');
    expect(userFile?.content).not.toContain('list:');
  });

  it('returns empty array when no entities', () => {
    const ir = createBasicIR([]);

    const files = generator.generate(ir, { outputDir: '.vertz', options: {} });

    expect(files).toEqual([]);
  });

  describe('.meta embedding', () => {
    it('uses Object.assign with .meta for create method when resolvedFields exist', () => {
      const ir = createBasicIR([
        {
          entityName: 'todos',
          operations: [
            {
              kind: 'create',
              method: 'POST',
              path: '/todos',
              operationId: 'createTodos',
              inputSchema: 'CreateTodosInput',
              outputSchema: 'TodosResponse',
              resolvedFields: [{ name: 'title', tsType: 'string', optional: false }],
            },
          ],
          actions: [],
        },
      ]);

      const files = generator.generate(ir, { outputDir: '.vertz', options: {} });
      const todosFile = files.find((f) => f.path === 'entities/todos.ts');

      expect(todosFile?.content).toContain('Object.assign');
      expect(todosFile?.content).toContain("method: 'POST' as const");
      expect(todosFile?.content).toContain('meta: { bodySchema: createTodosInputSchema }');
    });

    it('imports schema from ../schemas/ when meta is embedded', () => {
      const ir = createBasicIR([
        {
          entityName: 'todos',
          operations: [
            {
              kind: 'create',
              method: 'POST',
              path: '/todos',
              operationId: 'createTodos',
              inputSchema: 'CreateTodosInput',
              outputSchema: 'TodosResponse',
              resolvedFields: [{ name: 'title', tsType: 'string', optional: false }],
            },
          ],
          actions: [],
        },
      ]);

      const files = generator.generate(ir, { outputDir: '.vertz', options: {} });
      const todosFile = files.find((f) => f.path === 'entities/todos.ts');

      expect(todosFile?.content).toContain(
        "import { createTodosInputSchema } from '../schemas/todos'",
      );
    });

    it('does not embed .meta on list, get, delete methods', () => {
      const ir = createBasicIR([
        {
          entityName: 'todos',
          operations: [
            {
              kind: 'list',
              method: 'GET',
              path: '/todos',
              operationId: 'listTodos',
              outputSchema: 'TodosResponse',
            },
            {
              kind: 'get',
              method: 'GET',
              path: '/todos/:id',
              operationId: 'getTodos',
              outputSchema: 'TodosResponse',
            },
            {
              kind: 'delete',
              method: 'DELETE',
              path: '/todos/:id',
              operationId: 'deleteTodos',
              outputSchema: 'TodosResponse',
            },
          ],
          actions: [],
        },
      ]);

      const files = generator.generate(ir, { outputDir: '.vertz', options: {} });
      const todosFile = files.find((f) => f.path === 'entities/todos.ts');

      expect(todosFile?.content).toContain('Object.assign');
      expect(todosFile?.content).not.toContain('meta:');
    });

    it('does not embed .meta on update method', () => {
      const ir = createBasicIR([
        {
          entityName: 'todos',
          operations: [
            {
              kind: 'update',
              method: 'PATCH',
              path: '/todos/:id',
              operationId: 'updateTodos',
              inputSchema: 'UpdateTodosInput',
              outputSchema: 'TodosResponse',
              resolvedFields: [{ name: 'title', tsType: 'string', optional: true }],
            },
          ],
          actions: [],
        },
      ]);

      const files = generator.generate(ir, { outputDir: '.vertz', options: {} });
      const todosFile = files.find((f) => f.path === 'entities/todos.ts');

      // Update uses Object.assign for url/method but NOT .meta
      expect(todosFile?.content).toContain('Object.assign');
      expect(todosFile?.content).not.toContain('meta:');
    });

    it('uses Object.assign without .meta when no resolvedFields', () => {
      const ir = createBasicIR([
        {
          entityName: 'user',
          operations: [
            {
              kind: 'create',
              method: 'POST',
              path: '/user',
              operationId: 'createUser',
              inputSchema: 'CreateUserInput',
              outputSchema: 'UserResponse',
              // No resolvedFields
            },
          ],
          actions: [],
        },
      ]);

      const files = generator.generate(ir, { outputDir: '.vertz', options: {} });
      const userFile = files.find((f) => f.path === 'entities/user.ts');

      expect(userFile?.content).toContain('Object.assign');
      expect(userFile?.content).toContain('create:');
      expect(userFile?.content).toContain("url: '/user'");
      expect(userFile?.content).toContain("method: 'POST' as const");
      expect(userFile?.content).not.toContain('meta:');
    });
  });

  it('includes createDescriptor import in generated output', () => {
    const ir = createBasicIR([
      {
        entityName: 'user',
        operations: [
          {
            kind: 'get',
            method: 'GET',
            path: '/user/:id',
            operationId: 'getUser',
            outputSchema: 'UserResponse',
          },
        ],
        actions: [],
      },
    ]);

    const files = generator.generate(ir, { outputDir: '.vertz', options: {} });
    const userFile = files.find((f) => f.path === 'entities/user.ts');

    expect(userFile?.content).toContain(
      "import { type FetchClient, createDescriptor } from '@vertz/fetch'",
    );
  });

  it('all operations have .url and .method metadata', () => {
    const ir = createBasicIR([
      {
        entityName: 'task',
        operations: [
          {
            kind: 'list',
            method: 'GET',
            path: '/tasks',
            operationId: 'listTask',
            outputSchema: 'TaskResponse',
          },
          {
            kind: 'get',
            method: 'GET',
            path: '/tasks/:id',
            operationId: 'getTask',
            outputSchema: 'TaskResponse',
          },
          {
            kind: 'create',
            method: 'POST',
            path: '/tasks',
            operationId: 'createTask',
            inputSchema: 'CreateTaskInput',
            outputSchema: 'TaskResponse',
          },
          {
            kind: 'update',
            method: 'PATCH',
            path: '/tasks/:id',
            operationId: 'updateTask',
            inputSchema: 'UpdateTaskInput',
            outputSchema: 'TaskResponse',
          },
          {
            kind: 'delete',
            method: 'DELETE',
            path: '/tasks/:id',
            operationId: 'deleteTask',
            outputSchema: 'TaskResponse',
          },
        ],
        actions: [],
      },
    ]);

    const files = generator.generate(ir, { outputDir: '.vertz', options: {} });
    const taskFile = files.find((f) => f.path === 'entities/task.ts');

    // list
    expect(taskFile?.content).toContain("url: '/tasks', method: 'GET' as const");
    // get
    expect(taskFile?.content).toContain("url: '/tasks/:id', method: 'GET' as const");
    // create
    expect(taskFile?.content).toContain("url: '/tasks', method: 'POST' as const");
    // update
    expect(taskFile?.content).toContain("url: '/tasks/:id', method: 'PATCH' as const");
    // delete
    expect(taskFile?.content).toContain("url: '/tasks/:id', method: 'DELETE' as const");
  });
});
