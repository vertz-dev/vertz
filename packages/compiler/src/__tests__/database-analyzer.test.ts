import { describe, expect, it } from 'bun:test';
import { Project } from 'ts-morph';
import { DatabaseAnalyzer } from '../analyzers/database-analyzer';
import { resolveConfig } from '../config';

function createProject(files: Record<string, string>) {
  const project = new Project({
    useInMemoryFileSystem: true,
    compilerOptions: { strict: true },
  });
  for (const [path, content] of Object.entries(files)) {
    project.createSourceFile(path, content);
  }
  return project;
}

describe('DatabaseAnalyzer', () => {
  it('returns empty databases when no createDb calls exist', async () => {
    const project = createProject({
      'src/app.ts': 'export const x = 1;',
    });
    const analyzer = new DatabaseAnalyzer(project, resolveConfig());
    const result = await analyzer.analyze();
    expect(result.databases).toEqual([]);
  });

  it('extracts model keys from inline object', async () => {
    const project = createProject({
      'src/db.ts': `
        import { createDb } from '@vertz/db';
        const usersModel = {};
        const db = createDb({
          models: {
            users: usersModel,
          },
        });
      `,
    });
    const analyzer = new DatabaseAnalyzer(project, resolveConfig());
    const result = await analyzer.analyze();
    expect(result.databases.length).toBe(1);
    expect(result.databases[0]?.modelKeys).toContain('users');
    expect(result.databases[0]?.modelValues).toContain('usersModel');
  });

  it('resolves models from a variable reference', async () => {
    const project = createProject({
      'src/db.ts': `
        import { createDb } from '@vertz/db';
        const tasksModel = {};
        const models = { tasks: tasksModel };
        const db = createDb({ models: models });
      `,
    });
    const analyzer = new DatabaseAnalyzer(project, resolveConfig());
    const result = await analyzer.analyze();
    expect(result.databases.length).toBe(1);
    expect(result.databases[0]?.modelKeys).toContain('tasks');
    expect(result.databases[0]?.modelValues).toContain('tasksModel');
  });

  it('extracts shorthand property assignments', async () => {
    const project = createProject({
      'src/db.ts': `
        import { createDb } from '@vertz/db';
        const users = {};
        const orders = {};
        const db = createDb({
          models: { users, orders },
        });
      `,
    });
    const analyzer = new DatabaseAnalyzer(project, resolveConfig());
    const result = await analyzer.analyze();
    expect(result.databases.length).toBe(1);
    expect(result.databases[0]?.modelKeys).toEqual(['users', 'orders']);
    expect(result.databases[0]?.modelValues).toEqual(['users', 'orders']);
  });

  it('emits warning for spread assignments in models', async () => {
    const project = createProject({
      'src/db.ts': `
        import { createDb } from '@vertz/db';
        const otherModels = {};
        const db = createDb({
          models: { ...otherModels },
        });
      `,
    });
    const analyzer = new DatabaseAnalyzer(project, resolveConfig());
    await analyzer.analyze();
    const diagnostics = analyzer.getDiagnostics();
    expect(diagnostics.length).toBe(1);
    expect(diagnostics[0]?.code).toBe('ENTITY_MODEL_NOT_REGISTERED');
    expect(diagnostics[0]?.message).toContain('spread assignment');
  });

  it('emits warning for computed property names in models', async () => {
    const project = createProject({
      'src/db.ts': `
        import { createDb } from '@vertz/db';
        const key = 'users';
        const model = {};
        const db = createDb({
          models: { [key]: model },
        });
      `,
    });
    const analyzer = new DatabaseAnalyzer(project, resolveConfig());
    await analyzer.analyze();
    const diagnostics = analyzer.getDiagnostics();
    expect(diagnostics.length).toBe(1);
    expect(diagnostics[0]?.code).toBe('ENTITY_MODEL_NOT_REGISTERED');
    expect(diagnostics[0]?.message).toContain('computed property name');
  });

  it('handles namespace import: db.createDb()', async () => {
    const project = createProject({
      'src/db.ts': `
        import * as db from '@vertz/db';
        const usersModel = {};
        const myDb = db.createDb({
          models: { users: usersModel },
        });
      `,
    });
    const analyzer = new DatabaseAnalyzer(project, resolveConfig());
    const result = await analyzer.analyze();
    expect(result.databases.length).toBe(1);
    expect(result.databases[0]?.modelKeys).toContain('users');
  });

  it('ignores non-identifier models value that is not resolvable', async () => {
    const project = createProject({
      'src/db.ts': `
        import { createDb } from '@vertz/db';
        const db = createDb({
          models: getModels(),
        });
        function getModels() { return {}; }
      `,
    });
    const analyzer = new DatabaseAnalyzer(project, resolveConfig());
    const result = await analyzer.analyze();
    // models is a CallExpression, not resolvable to ObjectLiteral
    expect(result.databases).toEqual([]);
  });
});
