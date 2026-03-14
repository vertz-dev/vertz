import { describe, expect, it } from 'bun:test';
import type { CodegenEntityModule, CodegenIR } from '../../types';
import { EntityTypesGenerator } from '../entity-types-generator';

describe('EntityTypesGenerator', () => {
  const generator = new EntityTypesGenerator();

  function createBasicIR(entities: CodegenEntityModule[]): CodegenIR {
    return {
      basePath: '/api',
      modules: [],
      schemas: [],
      entities,
      auth: { schemes: [] },
    };
  }

  it('emits interface for action inputSchema when resolvedInputFields exist', () => {
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
            responseFields: [{ name: 'id', tsType: 'string', optional: false }],
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
            resolvedInputFields: [
              { name: 'reason', tsType: 'string', optional: false },
              { name: 'force', tsType: 'boolean', optional: true },
            ],
            resolvedOutputFields: [{ name: 'activated', tsType: 'boolean', optional: false }],
          },
        ],
      },
    ]);

    const files = generator.generate(ir, { outputDir: '.vertz', options: {} });
    const userFile = files.find((f) => f.path === 'types/user.ts');

    expect(userFile).toBeDefined();
    expect(userFile?.content).toContain('export interface ActivateUserInput');
    expect(userFile?.content).toContain('reason: string');
    expect(userFile?.content).toContain('force?: boolean');
  });

  it('emits interface for action outputSchema when resolvedOutputFields exist', () => {
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
            responseFields: [{ name: 'id', tsType: 'string', optional: false }],
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
            resolvedInputFields: [{ name: 'reason', tsType: 'string', optional: false }],
            resolvedOutputFields: [
              { name: 'activated', tsType: 'boolean', optional: false },
              { name: 'activatedAt', tsType: 'date', optional: false },
            ],
          },
        ],
      },
    ]);

    const files = generator.generate(ir, { outputDir: '.vertz', options: {} });
    const userFile = files.find((f) => f.path === 'types/user.ts');

    expect(userFile?.content).toContain('export interface ActivateUserOutput');
    expect(userFile?.content).toContain('activated: boolean');
    expect(userFile?.content).toContain('activatedAt: string'); // date → string in JSON
  });

  it('includes entity with only action types (no CRUD types) in output', () => {
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
            resolvedInputFields: [{ name: 'reason', tsType: 'string', optional: false }],
          },
        ],
      },
    ]);

    const files = generator.generate(ir, { outputDir: '.vertz', options: {} });
    const userFile = files.find((f) => f.path === 'types/user.ts');

    expect(userFile).toBeDefined();
    expect(userFile?.content).toContain('export interface ActivateUserInput');
  });

  describe('Expose config filtering', () => {
    it('emits conditional fields as T | null', () => {
      const ir = createBasicIR([
        {
          entityName: 'employees',
          operations: [
            {
              kind: 'get',
              method: 'GET',
              path: '/employees/:id',
              operationId: 'getEmployees',
              outputSchema: 'EmployeesResponse',
              responseFields: [
                { name: 'id', tsType: 'string', optional: false },
                { name: 'name', tsType: 'string', optional: false },
                { name: 'salary', tsType: 'number', optional: false },
              ],
            },
          ],
          actions: [],
          exposeSelect: [
            { name: 'id', conditional: false },
            { name: 'name', conditional: false },
            { name: 'salary', conditional: true },
          ],
        },
      ]);

      const files = generator.generate(ir, { outputDir: '.vertz', options: {} });
      const empFile = files.find((f) => f.path === 'types/employees.ts');

      expect(empFile).toBeDefined();
      expect(empFile?.content).toContain('id: string');
      expect(empFile?.content).toContain('name: string');
      expect(empFile?.content).toContain('salary: number | null');
    });

    it('preserves default behavior when no exposeSelect', () => {
      const ir = createBasicIR([
        {
          entityName: 'notes',
          operations: [
            {
              kind: 'get',
              method: 'GET',
              path: '/notes/:id',
              operationId: 'getNotes',
              outputSchema: 'NotesResponse',
              responseFields: [
                { name: 'id', tsType: 'string', optional: false },
                { name: 'title', tsType: 'string', optional: false },
                { name: 'body', tsType: 'string', optional: false },
              ],
            },
          ],
          actions: [],
        },
      ]);

      const files = generator.generate(ir, { outputDir: '.vertz', options: {} });
      const notesFile = files.find((f) => f.path === 'types/notes.ts');

      expect(notesFile).toBeDefined();
      expect(notesFile?.content).toContain('id: string');
      expect(notesFile?.content).toContain('title: string');
      expect(notesFile?.content).toContain('body: string');
      expect(notesFile?.content).not.toContain('| null');
    });

    it('emits relation properties from exposeInclude (one-relation)', () => {
      const ir = createBasicIR([
        {
          entityName: 'tasks',
          operations: [
            {
              kind: 'get',
              method: 'GET',
              path: '/tasks/:id',
              operationId: 'getTasks',
              outputSchema: 'TasksResponse',
              responseFields: [
                { name: 'id', tsType: 'string', optional: false },
                { name: 'title', tsType: 'string', optional: false },
              ],
            },
          ],
          actions: [],
          exposeSelect: [
            { name: 'id', conditional: false },
            { name: 'title', conditional: false },
          ],
          exposeInclude: [
            {
              name: 'assignee',
              entity: 'users',
              type: 'one' as const,
              resolvedFields: [
                { name: 'id', tsType: 'string' as const, optional: false },
                { name: 'name', tsType: 'string' as const, optional: false },
              ],
            },
          ],
        },
      ]);

      const files = generator.generate(ir, { outputDir: '.vertz', options: {} });
      const tasksFile = files.find((f) => f.path === 'types/tasks.ts');

      expect(tasksFile).toBeDefined();
      expect(tasksFile?.content).toContain('assignee?: { id: string; name: string }');
    });

    it('emits relation properties from exposeInclude (many-relation)', () => {
      const ir = createBasicIR([
        {
          entityName: 'tasks',
          operations: [
            {
              kind: 'get',
              method: 'GET',
              path: '/tasks/:id',
              operationId: 'getTasks',
              outputSchema: 'TasksResponse',
              responseFields: [{ name: 'id', tsType: 'string', optional: false }],
            },
          ],
          actions: [],
          exposeInclude: [
            {
              name: 'comments',
              entity: 'comments',
              type: 'many' as const,
              resolvedFields: [
                { name: 'id', tsType: 'string' as const, optional: false },
                { name: 'text', tsType: 'string' as const, optional: false },
              ],
            },
          ],
        },
      ]);

      const files = generator.generate(ir, { outputDir: '.vertz', options: {} });
      const tasksFile = files.find((f) => f.path === 'types/tasks.ts');

      expect(tasksFile).toBeDefined();
      expect(tasksFile?.content).toContain('comments: Array<{ id: string; text: string }>');
    });
  });

  describe('Fields type alias', () => {
    it('emits Fields type alias for entities with response output schema', () => {
      const ir = createBasicIR([
        {
          entityName: 'tasks',
          operations: [
            {
              kind: 'list',
              method: 'GET',
              path: '/tasks',
              operationId: 'listTasks',
              outputSchema: 'TasksResponse',
              responseFields: [
                { name: 'id', tsType: 'string', optional: false },
                { name: 'title', tsType: 'string', optional: false },
                { name: 'status', tsType: 'string', optional: false },
              ],
            },
          ],
          actions: [],
        },
      ]);

      const files = generator.generate(ir, { outputDir: '.vertz', options: {} });
      const tasksFile = files.find((f) => f.path === 'types/tasks.ts');

      expect(tasksFile).toBeDefined();
      expect(tasksFile?.content).toContain('export type TasksFields = keyof TasksResponse;');
    });

    it('does not emit Fields type when no response output schema', () => {
      const ir = createBasicIR([
        {
          entityName: 'tasks',
          operations: [
            {
              kind: 'list',
              method: 'GET',
              path: '/tasks',
              operationId: 'listTasks',
              // No outputSchema
            },
          ],
          actions: [
            {
              name: 'activate',
              method: 'POST',
              operationId: 'activateTasks',
              path: '/tasks/:id/activate',
              hasId: true,
              inputSchema: 'ActivateTasksInput',
              resolvedInputFields: [{ name: 'reason', tsType: 'string', optional: false }],
            },
          ],
        },
      ]);

      const files = generator.generate(ir, { outputDir: '.vertz', options: {} });
      const tasksFile = files.find((f) => f.path === 'types/tasks.ts');

      expect(tasksFile).toBeDefined();
      expect(tasksFile?.content).not.toContain('Fields');
    });

    it('emits only one Fields type even with multiple operations sharing outputSchema', () => {
      const ir = createBasicIR([
        {
          entityName: 'tasks',
          operations: [
            {
              kind: 'list',
              method: 'GET',
              path: '/tasks',
              operationId: 'listTasks',
              outputSchema: 'TasksResponse',
              responseFields: [
                { name: 'id', tsType: 'string', optional: false },
                { name: 'title', tsType: 'string', optional: false },
              ],
            },
            {
              kind: 'get',
              method: 'GET',
              path: '/tasks/:id',
              operationId: 'getTasks',
              outputSchema: 'TasksResponse',
              responseFields: [
                { name: 'id', tsType: 'string', optional: false },
                { name: 'title', tsType: 'string', optional: false },
              ],
            },
          ],
          actions: [],
        },
      ]);

      const files = generator.generate(ir, { outputDir: '.vertz', options: {} });
      const tasksFile = files.find((f) => f.path === 'types/tasks.ts');

      expect(tasksFile).toBeDefined();
      const content = tasksFile?.content ?? '';
      const fieldsCount = (content.match(/export type TasksFields/g) ?? []).length;
      expect(fieldsCount).toBe(1);
    });
  });
});
