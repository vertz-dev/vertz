import { describe, expect, it } from 'bun:test';
import type { CodegenEntityModule, CodegenIR } from '../types';
import { EntitySdkGenerator } from '../generators/entity-sdk-generator';

function createCodegenIR(entities: CodegenEntityModule[]): CodegenIR {
  return {
    basePath: '/api',
    modules: [],
    schemas: [],
    entities,
    auth: { schemes: [], operations: [] },
  };
}

function createEntityWithExpose(
  overrides: Partial<CodegenEntityModule> = {},
): CodegenEntityModule {
  return {
    entityName: 'task',
    operations: [
      {
        kind: 'list',
        method: 'GET',
        path: '/task',
        operationId: 'listTask',
        outputSchema: 'TaskResponse',
        responseFields: [
          { name: 'id', tsType: 'string', optional: false },
          { name: 'title', tsType: 'string', optional: false },
          { name: 'status', tsType: 'string', optional: false },
        ],
      },
      {
        kind: 'get',
        method: 'GET',
        path: '/task/:id',
        operationId: 'getTask',
        outputSchema: 'TaskResponse',
        responseFields: [
          { name: 'id', tsType: 'string', optional: false },
          { name: 'title', tsType: 'string', optional: false },
          { name: 'status', tsType: 'string', optional: false },
        ],
      },
      {
        kind: 'create',
        method: 'POST',
        path: '/task',
        operationId: 'createTask',
        inputSchema: 'CreateTaskInput',
        outputSchema: 'TaskResponse',
        resolvedFields: [
          { name: 'title', tsType: 'string', optional: false },
        ],
      },
      {
        kind: 'update',
        method: 'PATCH',
        path: '/task/:id',
        operationId: 'updateTask',
        inputSchema: 'UpdateTaskInput',
        outputSchema: 'TaskResponse',
        resolvedFields: [
          { name: 'title', tsType: 'string', optional: true },
        ],
      },
      {
        kind: 'delete',
        method: 'DELETE',
        path: '/task/:id',
        operationId: 'deleteTask',
        outputSchema: 'TaskResponse',
      },
    ],
    actions: [],
    exposeSelect: [
      { name: 'id', conditional: false },
      { name: 'title', conditional: false },
      { name: 'status', conditional: false },
    ],
    responseFields: [
      { name: 'id', tsType: 'string', optional: false },
      { name: 'title', tsType: 'string', optional: false },
      { name: 'status', tsType: 'string', optional: false },
    ],
    allowWhere: [{ name: 'status', tsType: 'string' }],
    allowOrderBy: ['createdAt'],
    ...overrides,
  };
}

const generator = new EntitySdkGenerator();

describe('Entity SDK Generator - Query Types', () => {
  describe('entity with expose config', () => {
    it('list method uses TaskListQuery type parameter', () => {
      const entity = createEntityWithExpose();
      const ir = createCodegenIR([entity]);
      const files = generator.generate(ir, { outputDir: '', options: {} });
      const sdkFile = files.find((f) => f.path === 'entities/task.ts');

      expect(sdkFile?.content).toContain('query?: TaskListQuery');
    });

    it('get method uses TaskGetQuery type parameter', () => {
      const entity = createEntityWithExpose();
      const ir = createCodegenIR([entity]);
      const files = generator.generate(ir, { outputDir: '', options: {} });
      const sdkFile = files.find((f) => f.path === 'entities/task.ts');

      expect(sdkFile?.content).toContain('options?: TaskGetQuery');
    });

    it('does not use Record<string, unknown> for exposed entities', () => {
      const entity = createEntityWithExpose();
      const ir = createCodegenIR([entity]);
      const files = generator.generate(ir, { outputDir: '', options: {} });
      const sdkFile = files.find((f) => f.path === 'entities/task.ts');

      expect(sdkFile?.content).not.toContain('Record<string, unknown>');
    });

    it('does not use generic <K extends keyof> for exposed entities', () => {
      const entity = createEntityWithExpose();
      const ir = createCodegenIR([entity]);
      const files = generator.generate(ir, { outputDir: '', options: {} });
      const sdkFile = files.find((f) => f.path === 'entities/task.ts');

      expect(sdkFile?.content).not.toContain('<K extends keyof');
      expect(sdkFile?.content).not.toContain('Pick<');
    });

    it('imports query types from types file', () => {
      const entity = createEntityWithExpose();
      const ir = createCodegenIR([entity]);
      const files = generator.generate(ir, { outputDir: '', options: {} });
      const sdkFile = files.find((f) => f.path === 'entities/task.ts');

      expect(sdkFile?.content).toContain('TaskListQuery');
      expect(sdkFile?.content).toContain('TaskGetQuery');
      expect(sdkFile?.content).toContain("from '../types/task'");
    });

    it('list return type uses ListResponse<TaskResponse> without Pick', () => {
      const entity = createEntityWithExpose();
      const ir = createCodegenIR([entity]);
      const files = generator.generate(ir, { outputDir: '', options: {} });
      const sdkFile = files.find((f) => f.path === 'entities/task.ts');

      expect(sdkFile?.content).toContain('ListResponse<TaskResponse>');
      expect(sdkFile?.content).not.toContain('ListResponse<Pick<');
    });

    it('get return type uses TaskResponse without Pick', () => {
      const entity = createEntityWithExpose();
      const ir = createCodegenIR([entity]);
      const files = generator.generate(ir, { outputDir: '', options: {} });
      const sdkFile = files.find((f) => f.path === 'entities/task.ts');

      // Should have client.get<TaskResponse> not client.get<Pick<TaskResponse, K>>
      expect(sdkFile?.content).toMatch(/client\.get<TaskResponse>\(/);
    });

    it('create/update/delete methods are unchanged', () => {
      const entity = createEntityWithExpose();
      const ir = createCodegenIR([entity]);
      const files = generator.generate(ir, { outputDir: '', options: {} });
      const sdkFile = files.find((f) => f.path === 'entities/task.ts');

      expect(sdkFile?.content).toContain('(body: CreateTaskInput)');
      expect(sdkFile?.content).toContain('(id: string, body: UpdateTaskInput)');
      expect(sdkFile?.content).toContain('(id: string) => createMutationDescriptor(\'DELETE\'');
    });
  });

  describe('entity without expose config (fallback)', () => {
    it('list method uses VertzQLParams fallback', () => {
      const entity = createEntityWithExpose({
        exposeSelect: undefined,
        allowWhere: undefined,
        allowOrderBy: undefined,
        exposeInclude: undefined,
      });
      const ir = createCodegenIR([entity]);
      const files = generator.generate(ir, { outputDir: '', options: {} });
      const sdkFile = files.find((f) => f.path === 'entities/task.ts');

      expect(sdkFile?.content).toContain('query?: VertzQLParams');
    });

    it('get method uses VertzQLParams fallback', () => {
      const entity = createEntityWithExpose({
        exposeSelect: undefined,
        allowWhere: undefined,
        allowOrderBy: undefined,
        exposeInclude: undefined,
      });
      const ir = createCodegenIR([entity]);
      const files = generator.generate(ir, { outputDir: '', options: {} });
      const sdkFile = files.find((f) => f.path === 'entities/task.ts');

      expect(sdkFile?.content).toContain('options?: VertzQLParams');
    });

    it('imports VertzQLParams from @vertz/fetch', () => {
      const entity = createEntityWithExpose({
        exposeSelect: undefined,
        allowWhere: undefined,
        allowOrderBy: undefined,
        exposeInclude: undefined,
      });
      const ir = createCodegenIR([entity]);
      const files = generator.generate(ir, { outputDir: '', options: {} });
      const sdkFile = files.find((f) => f.path === 'entities/task.ts');

      expect(sdkFile?.content).toContain('VertzQLParams');
      expect(sdkFile?.content).toContain("from '@vertz/fetch'");
    });

    it('does not use generic <K extends keyof> for fallback entities', () => {
      const entity = createEntityWithExpose({
        exposeSelect: undefined,
        allowWhere: undefined,
        allowOrderBy: undefined,
        exposeInclude: undefined,
      });
      const ir = createCodegenIR([entity]);
      const files = generator.generate(ir, { outputDir: '', options: {} });
      const sdkFile = files.find((f) => f.path === 'entities/task.ts');

      expect(sdkFile?.content).not.toContain('<K extends keyof');
      expect(sdkFile?.content).not.toContain('Pick<');
    });
  });
});
