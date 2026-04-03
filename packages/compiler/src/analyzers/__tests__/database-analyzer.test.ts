import { beforeEach, describe, expect, it } from 'bun:test';
import { Project } from 'ts-morph';
import type { ResolvedConfig } from '../../config';
import { createEmptyAppIR } from '../../ir/builder';
import type { AppIR } from '../../ir/types';
import { CompletenessValidator } from '../../validators/completeness-validator';
import { DatabaseAnalyzer } from '../database-analyzer';

describe('DatabaseAnalyzer', () => {
  let project: Project;
  let config: ResolvedConfig;

  beforeEach(() => {
    project = new Project({ useInMemoryFileSystem: true });
    config = {
      rootDir: '/',
      compiler: {
        outputDir: '.vertz',
        exclude: [],
      },
      forceGenerate: false,
    };
  });

  function createFile(path: string, content: string) {
    return project.createSourceFile(path, content, { overwrite: true });
  }

  function analyze() {
    const analyzer = new DatabaseAnalyzer(project, config);
    return analyzer.analyze();
  }

  describe('Detection', () => {
    it('detects createDb() with named import from @vertz/db', async () => {
      createFile(
        '/worker.ts',
        `
        import { createDb } from '@vertz/db';
        const db = createDb({
          models: { users: usersModel, tasks: tasksModel },
        });
      `,
      );

      const result = await analyze();
      expect(result.databases).toHaveLength(1);
      expect(result.databases[0]?.modelKeys).toEqual(['users', 'tasks']);
      expect(result.databases[0]?.modelValues).toEqual(['usersModel', 'tasksModel']);
    });

    it('detects with aliased import', async () => {
      createFile(
        '/worker.ts',
        `
        import { createDb as makeDb } from '@vertz/db';
        const db = makeDb({
          models: { orders: ordersModel },
        });
      `,
      );

      const result = await analyze();
      expect(result.databases).toHaveLength(1);
      expect(result.databases[0]?.modelKeys).toEqual(['orders']);
    });

    it('detects with namespace import', async () => {
      createFile(
        '/worker.ts',
        `
        import * as db from '@vertz/db';
        const client = db.createDb({
          models: { products: productsModel },
        });
      `,
      );

      const result = await analyze();
      expect(result.databases).toHaveLength(1);
      expect(result.databases[0]?.modelKeys).toEqual(['products']);
    });

    it('ignores createDb from other packages', async () => {
      createFile(
        '/worker.ts',
        `
        import { createDb } from 'some-other-package';
        const db = createDb({
          models: { users: usersModel },
        });
      `,
      );

      const result = await analyze();
      expect(result.databases).toHaveLength(0);
    });

    it('returns empty when no createDb calls exist', async () => {
      createFile(
        '/worker.ts',
        `
        import { entity } from '@vertz/server';
        const userEntity = entity('user', { model: userModel });
      `,
      );

      const result = await analyze();
      expect(result.databases).toHaveLength(0);
    });
  });

  describe('Source location', () => {
    it('records source file, line, and column', async () => {
      createFile(
        '/src/worker.ts',
        `import { createDb } from '@vertz/db';
const db = createDb({
  models: { users: usersModel },
});`,
      );

      const result = await analyze();
      expect(result.databases).toHaveLength(1);
      expect(result.databases[0]?.sourceFile).toBe('/src/worker.ts');
      expect(result.databases[0]?.sourceLine).toBe(2);
    });
  });

  describe('Model extraction patterns', () => {
    it('handles shorthand models property', async () => {
      createFile(
        '/worker.ts',
        `
        import { createDb } from '@vertz/db';
        const models = { users: usersModel, tasks: tasksModel };
        const db = createDb({ models });
      `,
      );

      const result = await analyze();
      expect(result.databases).toHaveLength(1);
      expect(result.databases[0]?.modelKeys).toEqual(['users', 'tasks']);
    });

    it('handles models as a variable reference', async () => {
      createFile(
        '/worker.ts',
        `
        import { createDb } from '@vertz/db';
        const myModels = { users: usersModel, tasks: tasksModel };
        const db = createDb({ models: myModels });
      `,
      );

      const result = await analyze();
      expect(result.databases).toHaveLength(1);
      expect(result.databases[0]?.modelKeys).toEqual(['users', 'tasks']);
    });

    it('detects createDb across multiple files', async () => {
      createFile(
        '/worker1.ts',
        `
        import { createDb } from '@vertz/db';
        const db = createDb({ models: { users: usersModel } });
      `,
      );
      createFile(
        '/worker2.ts',
        `
        import { createDb } from '@vertz/db';
        const db = createDb({ models: { tasks: tasksModel } });
      `,
      );

      const result = await analyze();
      expect(result.databases).toHaveLength(2);
      const allKeys = result.databases.flatMap((d) => d.modelKeys);
      expect(allKeys).toContain('users');
      expect(allKeys).toContain('tasks');
    });

    it('handles empty models object', async () => {
      createFile(
        '/worker.ts',
        `
        import { createDb } from '@vertz/db';
        const db = createDb({ models: {} });
      `,
      );

      const result = await analyze();
      expect(result.databases).toHaveLength(1);
      expect(result.databases[0]?.modelKeys).toEqual([]);
    });
  });

  describe('Edge cases', () => {
    it('skips createDb calls without models property', async () => {
      createFile(
        '/worker.ts',
        `
        import { createDb } from '@vertz/db';
        const db = createDb({
          url: 'postgres://localhost/test',
        });
      `,
      );

      const result = await analyze();
      expect(result.databases).toHaveLength(0);
    });

    it('skips createDb calls without object literal argument', async () => {
      createFile(
        '/worker.ts',
        `
        import { createDb } from '@vertz/db';
        const opts = { models: { users: usersModel } };
        const db = createDb(opts);
      `,
      );

      const result = await analyze();
      expect(result.databases).toHaveLength(0);
    });

    it('emits warning for spread in models object', async () => {
      createFile(
        '/worker.ts',
        `
        import { createDb } from '@vertz/db';
        const baseModels = { users: usersModel };
        const db = createDb({
          models: { ...baseModels, tasks: tasksModel },
        });
      `,
      );

      const analyzer = new DatabaseAnalyzer(project, config);
      const result = await analyzer.analyze();
      const diagnostics = analyzer.getDiagnostics();

      expect(result.databases).toHaveLength(1);
      expect(result.databases[0]?.modelKeys).toEqual(['tasks']);
      expect(diagnostics).toHaveLength(1);
      expect(diagnostics[0]?.severity).toBe('warning');
      expect(diagnostics[0]?.message).toContain('spread');
    });

    it('emits warning for computed property names in models', async () => {
      createFile(
        '/worker.ts',
        `
        import { createDb } from '@vertz/db';
        const tableName = 'users';
        const db = createDb({
          models: { [tableName]: usersModel, tasks: tasksModel },
        });
      `,
      );

      const analyzer = new DatabaseAnalyzer(project, config);
      const result = await analyzer.analyze();
      const diagnostics = analyzer.getDiagnostics();

      expect(result.databases).toHaveLength(1);
      expect(result.databases[0]?.modelKeys).toEqual(['tasks']);
      expect(diagnostics).toHaveLength(1);
      expect(diagnostics[0]?.severity).toBe('warning');
      expect(diagnostics[0]?.message).toContain('computed');
    });
  });

  describe('Cross-validation: entity ↔ database', () => {
    function createIR(overrides: Partial<AppIR>): AppIR {
      return { ...createEmptyAppIR(), ...overrides };
    }

    it('emits ENTITY_MODEL_NOT_REGISTERED when entity model variable is not in any createDb models', async () => {
      const ir = createIR({
        entities: [
          {
            name: 'tasks',
            sourceFile: 'src/entities/tasks.ts',
            sourceLine: 5,
            sourceColumn: 1,
            modelRef: {
              variableName: 'tasksModel',
              schemaRefs: { resolved: false },
            },
            access: {
              list: 'none',
              get: 'none',
              create: 'none',
              update: 'none',
              delete: 'none',
              custom: {},
            },
            hooks: { before: [], after: [] },
            actions: [],
            relations: [],
          },
        ],
        databases: [
          {
            modelKeys: ['users'],
            modelValues: ['usersModel'],
            sourceFile: 'src/worker.ts',
            sourceLine: 12,
            sourceColumn: 1,
          },
        ],
      });

      const validator = new CompletenessValidator();
      const diagnostics = await validator.validate(ir);
      const entityModelDiags = diagnostics.filter((d) => d.code === 'ENTITY_MODEL_NOT_REGISTERED');

      expect(entityModelDiags).toHaveLength(1);
      expect(entityModelDiags[0]?.message).toContain('tasks');
      expect(entityModelDiags[0]?.message).toContain('tasksModel');
      expect(entityModelDiags[0]?.severity).toBe('error');
    });

    it('emits no diagnostic when entity model variable matches a registered model value', async () => {
      const ir = createIR({
        entities: [
          {
            name: 'users',
            sourceFile: 'src/entities/users.ts',
            sourceLine: 5,
            sourceColumn: 1,
            modelRef: {
              variableName: 'usersModel',
              schemaRefs: { resolved: false },
            },
            access: {
              list: 'none',
              get: 'none',
              create: 'none',
              update: 'none',
              delete: 'none',
              custom: {},
            },
            hooks: { before: [], after: [] },
            actions: [],
            relations: [],
          },
        ],
        databases: [
          {
            modelKeys: ['users', 'tasks'],
            modelValues: ['usersModel', 'tasksModel'],
            sourceFile: 'src/worker.ts',
            sourceLine: 12,
            sourceColumn: 1,
          },
        ],
      });

      const validator = new CompletenessValidator();
      const diagnostics = await validator.validate(ir);
      const entityModelDiags = diagnostics.filter((d) => d.code === 'ENTITY_MODEL_NOT_REGISTERED');

      expect(entityModelDiags).toHaveLength(0);
    });

    it('emits no diagnostic when entity name differs from model key but model variable matches', async () => {
      const ir = createIR({
        entities: [
          {
            name: 'issue-labels',
            sourceFile: 'src/entities/issue-labels.ts',
            sourceLine: 5,
            sourceColumn: 1,
            modelRef: {
              variableName: 'issueLabelsModel',
              schemaRefs: { resolved: false },
            },
            access: {
              list: 'none',
              get: 'none',
              create: 'none',
              update: 'none',
              delete: 'none',
              custom: {},
            },
            hooks: { before: [], after: [] },
            actions: [],
            relations: [],
          },
        ],
        databases: [
          {
            modelKeys: ['issueLabels'],
            modelValues: ['issueLabelsModel'],
            sourceFile: 'src/worker.ts',
            sourceLine: 12,
            sourceColumn: 1,
          },
        ],
      });

      const validator = new CompletenessValidator();
      const diagnostics = await validator.validate(ir);
      const entityModelDiags = diagnostics.filter((d) => d.code === 'ENTITY_MODEL_NOT_REGISTERED');

      expect(entityModelDiags).toHaveLength(0);
    });

    it('emits error when createDb has empty models and entities exist', async () => {
      const ir = createIR({
        entities: [
          {
            name: 'tasks',
            sourceFile: 'src/entities/tasks.ts',
            sourceLine: 5,
            sourceColumn: 1,
            modelRef: {
              variableName: 'tasksModel',
              schemaRefs: { resolved: false },
            },
            access: {
              list: 'none',
              get: 'none',
              create: 'none',
              update: 'none',
              delete: 'none',
              custom: {},
            },
            hooks: { before: [], after: [] },
            actions: [],
            relations: [],
          },
        ],
        databases: [
          {
            modelKeys: [],
            modelValues: [],
            sourceFile: 'src/worker.ts',
            sourceLine: 12,
            sourceColumn: 1,
          },
        ],
      });

      const validator = new CompletenessValidator();
      const diagnostics = await validator.validate(ir);
      const entityModelDiags = diagnostics.filter((d) => d.code === 'ENTITY_MODEL_NOT_REGISTERED');

      expect(entityModelDiags).toHaveLength(1);
      expect(entityModelDiags[0]?.message).toContain('tasks');
    });

    it('skips validation when no createDb calls exist', async () => {
      const ir = createIR({
        entities: [
          {
            name: 'tasks',
            sourceFile: 'src/entities/tasks.ts',
            sourceLine: 5,
            sourceColumn: 1,
            modelRef: {
              variableName: 'tasksModel',
              schemaRefs: { resolved: false },
            },
            access: {
              list: 'none',
              get: 'none',
              create: 'none',
              update: 'none',
              delete: 'none',
              custom: {},
            },
            hooks: { before: [], after: [] },
            actions: [],
            relations: [],
          },
        ],
        databases: [],
      });

      const validator = new CompletenessValidator();
      const diagnostics = await validator.validate(ir);
      const entityModelDiags = diagnostics.filter((d) => d.code === 'ENTITY_MODEL_NOT_REGISTERED');

      expect(entityModelDiags).toHaveLength(0);
    });
  });
});
