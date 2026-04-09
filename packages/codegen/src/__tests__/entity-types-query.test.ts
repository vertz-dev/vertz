import { describe, expect, it } from '@vertz/test';
import type { CodegenEntityModule, CodegenIR } from '../types';
import { EntityTypesGenerator } from '../generators/entity-types-generator';

function createCodegenIR(entities: CodegenEntityModule[]): CodegenIR {
  return {
    basePath: '/api',
    modules: [],
    schemas: [],
    entities,
    auth: { schemes: [], operations: [] },
  };
}

function createEntityWithExpose(overrides: Partial<CodegenEntityModule> = {}): CodegenEntityModule {
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
          { name: 'priority', tsType: 'number', optional: false },
          { name: 'createdAt', tsType: 'date', optional: false },
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
          { name: 'priority', tsType: 'number', optional: false },
          { name: 'createdAt', tsType: 'date', optional: false },
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
          { name: 'status', tsType: 'string', optional: true },
        ],
      },
    ],
    actions: [],
    exposeSelect: [
      { name: 'id', conditional: false },
      { name: 'title', conditional: false },
      { name: 'status', conditional: false },
      { name: 'priority', conditional: false },
      { name: 'createdAt', conditional: false },
    ],
    responseFields: [
      { name: 'id', tsType: 'string', optional: false },
      { name: 'title', tsType: 'string', optional: false },
      { name: 'status', tsType: 'string', optional: false },
      { name: 'priority', tsType: 'number', optional: false },
      { name: 'createdAt', tsType: 'date', optional: false },
    ],
    ...overrides,
  };
}

const generator = new EntityTypesGenerator();

describe('Entity Types Generator - Query Types', () => {
  describe('WhereInput', () => {
    it('generates WhereInput with string operators for string fields', () => {
      const entity = createEntityWithExpose({
        allowWhere: [{ name: 'status', tsType: 'string' }],
      });
      const ir = createCodegenIR([entity]);
      const files = generator.generate(ir, { outputDir: '', options: {} });
      const typesFile = files.find((f) => f.path === 'types/task.ts');

      expect(typesFile?.content).toContain('export interface TaskWhereInput {');
      expect(typesFile?.content).toContain(
        'status?: string | { eq?: string; neq?: string; in?: string[]; like?: string; contains?: string }',
      );
    });

    it('generates WhereInput with numeric operators for number fields', () => {
      const entity = createEntityWithExpose({
        allowWhere: [{ name: 'priority', tsType: 'number' }],
      });
      const ir = createCodegenIR([entity]);
      const files = generator.generate(ir, { outputDir: '', options: {} });
      const typesFile = files.find((f) => f.path === 'types/task.ts');

      expect(typesFile?.content).toContain(
        'priority?: number | { eq?: number; neq?: number; gt?: number; lt?: number; gte?: number; lte?: number; in?: number[] }',
      );
    });

    it('generates WhereInput with boolean operators for boolean fields', () => {
      const entity = createEntityWithExpose({
        allowWhere: [{ name: 'isActive', tsType: 'boolean' }],
      });
      const ir = createCodegenIR([entity]);
      const files = generator.generate(ir, { outputDir: '', options: {} });
      const typesFile = files.find((f) => f.path === 'types/task.ts');

      expect(typesFile?.content).toContain('isActive?: boolean | { eq?: boolean; neq?: boolean }');
    });

    it('generates WhereInput with range operators for date fields', () => {
      const entity = createEntityWithExpose({
        allowWhere: [{ name: 'createdAt', tsType: 'date' }],
      });
      const ir = createCodegenIR([entity]);
      const files = generator.generate(ir, { outputDir: '', options: {} });
      const typesFile = files.find((f) => f.path === 'types/task.ts');

      expect(typesFile?.content).toContain(
        'createdAt?: string | { eq?: string; neq?: string; gt?: string; lt?: string; gte?: string; lte?: string; in?: string[] }',
      );
    });

    it('generates WhereInput with basic operators for unknown fields', () => {
      const entity = createEntityWithExpose({
        allowWhere: [{ name: 'metadata', tsType: 'unknown' }],
      });
      const ir = createCodegenIR([entity]);
      const files = generator.generate(ir, { outputDir: '', options: {} });
      const typesFile = files.find((f) => f.path === 'types/task.ts');

      expect(typesFile?.content).toContain(
        'metadata?: unknown | { eq?: unknown; neq?: unknown; in?: unknown[] }',
      );
    });

    it('does not emit WhereInput when allowWhere is undefined', () => {
      const entity = createEntityWithExpose({ allowWhere: undefined });
      const ir = createCodegenIR([entity]);
      const files = generator.generate(ir, { outputDir: '', options: {} });
      const typesFile = files.find((f) => f.path === 'types/task.ts');

      expect(typesFile?.content).not.toContain('WhereInput');
    });
  });

  describe('OrderByInput', () => {
    it('generates OrderByInput with asc/desc for each field', () => {
      const entity = createEntityWithExpose({
        allowOrderBy: ['createdAt', 'priority'],
      });
      const ir = createCodegenIR([entity]);
      const files = generator.generate(ir, { outputDir: '', options: {} });
      const typesFile = files.find((f) => f.path === 'types/task.ts');

      expect(typesFile?.content).toContain('export interface TaskOrderByInput {');
      expect(typesFile?.content).toContain("createdAt?: 'asc' | 'desc'");
      expect(typesFile?.content).toContain("priority?: 'asc' | 'desc'");
    });

    it('does not emit OrderByInput when allowOrderBy is undefined', () => {
      const entity = createEntityWithExpose({ allowOrderBy: undefined });
      const ir = createCodegenIR([entity]);
      const files = generator.generate(ir, { outputDir: '', options: {} });
      const typesFile = files.find((f) => f.path === 'types/task.ts');

      expect(typesFile?.content).not.toContain('OrderByInput');
    });
  });

  describe('WhereInput + OrderByInput combined', () => {
    it('emits only WhereInput when allowWhere exists but no allowOrderBy', () => {
      const entity = createEntityWithExpose({
        allowWhere: [{ name: 'status', tsType: 'string' }],
        allowOrderBy: undefined,
      });
      const ir = createCodegenIR([entity]);
      const files = generator.generate(ir, { outputDir: '', options: {} });
      const typesFile = files.find((f) => f.path === 'types/task.ts');

      expect(typesFile?.content).toContain('TaskWhereInput');
      expect(typesFile?.content).not.toContain('OrderByInput');
    });

    it('emits both when both exist', () => {
      const entity = createEntityWithExpose({
        allowWhere: [
          { name: 'status', tsType: 'string' },
          { name: 'priority', tsType: 'number' },
        ],
        allowOrderBy: ['createdAt', 'priority'],
      });
      const ir = createCodegenIR([entity]);
      const files = generator.generate(ir, { outputDir: '', options: {} });
      const typesFile = files.find((f) => f.path === 'types/task.ts');

      expect(typesFile?.content).toContain('TaskWhereInput');
      expect(typesFile?.content).toContain('TaskOrderByInput');
    });
  });

  describe('IncludeInput', () => {
    it('generates IncludeInput with select for relation with select fields', () => {
      const entity = createEntityWithExpose({
        exposeInclude: [
          {
            name: 'assignee',
            entity: 'user',
            type: 'one',
            select: [
              { name: 'id', conditional: false },
              { name: 'name', conditional: false },
            ],
            resolvedFields: [
              { name: 'id', tsType: 'string', optional: false },
              { name: 'name', tsType: 'string', optional: false },
            ],
          },
        ],
      });
      const ir = createCodegenIR([entity]);
      const files = generator.generate(ir, { outputDir: '', options: {} });
      const typesFile = files.find((f) => f.path === 'types/task.ts');

      expect(typesFile?.content).toContain('export interface TaskIncludeInput {');
      expect(typesFile?.content).toContain(
        'assignee?: true | { select?: { id?: true; name?: true } }',
      );
    });

    it('generates simple true type for relation with no select and no query config', () => {
      const entity = createEntityWithExpose({
        exposeInclude: [
          {
            name: 'category',
            entity: 'category',
            type: 'one',
            resolvedFields: [
              { name: 'id', tsType: 'string', optional: false },
              { name: 'name', tsType: 'string', optional: false },
            ],
          },
        ],
      });
      const ir = createCodegenIR([entity]);
      const files = generator.generate(ir, { outputDir: '', options: {} });
      const typesFile = files.find((f) => f.path === 'types/task.ts');

      expect(typesFile?.content).toContain('export interface TaskIncludeInput {');
      expect(typesFile?.content).toContain('category?: true;');
      expect(typesFile?.content).not.toContain('category?: true |');
    });

    it('generates IncludeInput with full nested query config', () => {
      const entity = createEntityWithExpose({
        exposeInclude: [
          {
            name: 'comments',
            entity: 'comment',
            type: 'many',
            select: [
              { name: 'id', conditional: false },
              { name: 'text', conditional: false },
            ],
            resolvedFields: [
              { name: 'id', tsType: 'string', optional: false },
              { name: 'text', tsType: 'string', optional: false },
              { name: 'createdAt', tsType: 'date', optional: false },
              { name: 'status', tsType: 'string', optional: false },
            ],
          },
        ],
        relationQueryConfig: {
          comments: {
            allowWhere: ['status'],
            allowOrderBy: ['createdAt'],
            maxLimit: 50,
          },
        },
      });
      const ir = createCodegenIR([entity]);
      const files = generator.generate(ir, { outputDir: '', options: {} });
      const typesFile = files.find((f) => f.path === 'types/task.ts');

      expect(typesFile?.content).toContain('export interface TaskIncludeInput {');
      expect(typesFile?.content).toContain('select?: { id?: true; text?: true }');
      expect(typesFile?.content).toContain(
        'status?: string | { eq?: string; neq?: string; in?: string[]; like?: string; contains?: string }',
      );
      expect(typesFile?.content).toContain("createdAt?: 'asc' | 'desc'");
      expect(typesFile?.content).toContain('limit?: number');
    });

    it('does not emit IncludeInput when exposeInclude is undefined', () => {
      const entity = createEntityWithExpose({ exposeInclude: undefined });
      const ir = createCodegenIR([entity]);
      const files = generator.generate(ir, { outputDir: '', options: {} });
      const typesFile = files.find((f) => f.path === 'types/task.ts');

      expect(typesFile?.content).not.toContain('IncludeInput');
    });

    it('skips relation allowWhere field not found in resolvedFields', () => {
      const entity = createEntityWithExpose({
        exposeInclude: [
          {
            name: 'comments',
            entity: 'comment',
            type: 'many',
            select: [{ name: 'id', conditional: false }],
            resolvedFields: [{ name: 'id', tsType: 'string', optional: false }],
          },
        ],
        relationQueryConfig: {
          comments: {
            allowWhere: ['nonExistent'],
          },
        },
      });
      const ir = createCodegenIR([entity]);
      const files = generator.generate(ir, { outputDir: '', options: {} });
      const typesFile = files.find((f) => f.path === 'types/task.ts');

      // Should still emit the relation but without where clause
      expect(typesFile?.content).toContain('TaskIncludeInput');
      expect(typesFile?.content).not.toContain('where?');
    });
  });

  describe('ListQuery and GetQuery', () => {
    it('generates ListQuery with all query options', () => {
      const entity = createEntityWithExpose({
        allowWhere: [{ name: 'status', tsType: 'string' }],
        allowOrderBy: ['createdAt'],
        exposeInclude: [
          {
            name: 'assignee',
            entity: 'user',
            type: 'one',
            resolvedFields: [{ name: 'id', tsType: 'string', optional: false }],
          },
        ],
      });
      const ir = createCodegenIR([entity]);
      const files = generator.generate(ir, { outputDir: '', options: {} });
      const typesFile = files.find((f) => f.path === 'types/task.ts');

      expect(typesFile?.content).toContain('export interface TaskListQuery {');
      expect(typesFile?.content).toContain(
        'select?: { id?: true; title?: true; status?: true; priority?: true; createdAt?: true }',
      );
      expect(typesFile?.content).toContain('where?: TaskWhereInput');
      expect(typesFile?.content).toContain('orderBy?: TaskOrderByInput');
      expect(typesFile?.content).toContain('include?: TaskIncludeInput');
      expect(typesFile?.content).toContain('limit?: number');
      expect(typesFile?.content).toContain('after?: string');
    });

    it('generates GetQuery with only select and include', () => {
      const entity = createEntityWithExpose({
        allowWhere: [{ name: 'status', tsType: 'string' }],
        allowOrderBy: ['createdAt'],
        exposeInclude: [
          {
            name: 'assignee',
            entity: 'user',
            type: 'one',
            resolvedFields: [{ name: 'id', tsType: 'string', optional: false }],
          },
        ],
      });
      const ir = createCodegenIR([entity]);
      const files = generator.generate(ir, { outputDir: '', options: {} });
      const typesFile = files.find((f) => f.path === 'types/task.ts');

      expect(typesFile?.content).toContain('export interface TaskGetQuery {');
      expect(typesFile?.content).toMatch(/TaskGetQuery[\s\S]*select\?/);
      expect(typesFile?.content).toMatch(/TaskGetQuery[\s\S]*include\?: TaskIncludeInput/);
      // GetQuery must NOT have where, orderBy, limit, or after
      const getQueryMatch = typesFile?.content.match(
        /export interface TaskGetQuery \{[\s\S]*?\n\}/,
      );
      const getQueryBlock = getQueryMatch?.[0] ?? '';
      expect(getQueryBlock).not.toContain('where?');
      expect(getQueryBlock).not.toContain('orderBy?');
      expect(getQueryBlock).not.toContain('limit?');
      expect(getQueryBlock).not.toContain('after?');
    });

    it('generates ListQuery without where when no allowWhere', () => {
      const entity = createEntityWithExpose({
        allowWhere: undefined,
        allowOrderBy: ['createdAt'],
      });
      const ir = createCodegenIR([entity]);
      const files = generator.generate(ir, { outputDir: '', options: {} });
      const typesFile = files.find((f) => f.path === 'types/task.ts');

      expect(typesFile?.content).toContain('TaskListQuery');
      // Extract the ListQuery block up to the next "export" or end of file
      const listQueryMatch = typesFile?.content.match(
        /export interface TaskListQuery \{[\s\S]*?\n\}/,
      );
      const listQueryBlock = listQueryMatch?.[0] ?? '';
      expect(listQueryBlock).not.toContain('where?');
      expect(listQueryBlock).toContain('orderBy?');
    });

    it('generates ListQuery without include when no exposeInclude', () => {
      const entity = createEntityWithExpose({
        exposeInclude: undefined,
      });
      const ir = createCodegenIR([entity]);
      const files = generator.generate(ir, { outputDir: '', options: {} });
      const typesFile = files.find((f) => f.path === 'types/task.ts');

      expect(typesFile?.content).toContain('TaskListQuery');
      const listQueryMatch = typesFile?.content.match(
        /export interface TaskListQuery \{[\s\S]*?\n\}/,
      );
      const listQueryBlock = listQueryMatch?.[0] ?? '';
      expect(listQueryBlock).not.toContain('include?');
    });

    it('does not generate query types when entity has no exposeSelect', () => {
      const entity = createEntityWithExpose({
        exposeSelect: undefined,
        allowWhere: undefined,
        allowOrderBy: undefined,
        exposeInclude: undefined,
      });
      const ir = createCodegenIR([entity]);
      const files = generator.generate(ir, { outputDir: '', options: {} });
      const typesFile = files.find((f) => f.path === 'types/task.ts');

      expect(typesFile?.content).not.toContain('ListQuery');
      expect(typesFile?.content).not.toContain('GetQuery');
    });

    it('uses proper PascalCase for hyphenated entity names', () => {
      const entity = createEntityWithExpose({
        entityName: 'task-category',
        allowWhere: [{ name: 'name', tsType: 'string' }],
      });
      // Fix operation schemas to match the new entity name
      entity.operations = entity.operations.map((op) => ({
        ...op,
        outputSchema: op.outputSchema ? 'TaskCategoryResponse' : undefined,
        inputSchema: op.inputSchema ? op.inputSchema.replace('Task', 'TaskCategory') : undefined,
      }));
      const ir = createCodegenIR([entity]);
      const files = generator.generate(ir, { outputDir: '', options: {} });
      const typesFile = files.find((f) => f.path === 'types/task-category.ts');

      expect(typesFile?.content).toContain('export interface TaskCategoryWhereInput {');
      expect(typesFile?.content).toContain('export interface TaskCategoryListQuery {');
      expect(typesFile?.content).toContain('export interface TaskCategoryGetQuery {');
      expect(typesFile?.content).not.toContain('Task-category');
    });

    it('uses inline mapped type for select, not Record', () => {
      const entity = createEntityWithExpose();
      const ir = createCodegenIR([entity]);
      const files = generator.generate(ir, { outputDir: '', options: {} });
      const typesFile = files.find((f) => f.path === 'types/task.ts');

      expect(typesFile?.content).not.toContain('Record<');
      expect(typesFile?.content).toContain(
        'select?: { id?: true; title?: true; status?: true; priority?: true; createdAt?: true }',
      );
    });
  });
});
