import { describe, expect, it } from 'bun:test';
import { Project } from 'ts-morph';
import { EntityAnalyzer } from '../analyzers/entity-analyzer';
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

describe('EntityAnalyzer', () => {
  it('returns empty entities when no entity calls exist', async () => {
    const project = createProject({
      'src/app.ts': 'export const x = 1;',
    });
    const analyzer = new EntityAnalyzer(project, resolveConfig());
    const result = await analyzer.analyze();
    expect(result.entities).toEqual([]);
  });

  it('emits error when entity() has fewer than 2 arguments', async () => {
    const project = createProject({
      'src/entities.ts': `
        import { entity } from '@vertz/server';
        entity('tasks');
      `,
    });
    const analyzer = new EntityAnalyzer(project, resolveConfig());
    await analyzer.analyze();
    const diagnostics = analyzer.getDiagnostics();
    expect(diagnostics.some((d) => d.code === 'ENTITY_MISSING_ARGS')).toBe(true);
  });

  it('emits error when entity name is not a string literal', async () => {
    const project = createProject({
      'src/entities.ts': `
        import { entity } from '@vertz/server';
        const name = 'tasks';
        entity(name, {});
      `,
    });
    const analyzer = new EntityAnalyzer(project, resolveConfig());
    await analyzer.analyze();
    const diagnostics = analyzer.getDiagnostics();
    expect(diagnostics.some((d) => d.code === 'ENTITY_NON_LITERAL_NAME')).toBe(true);
  });

  it('emits error when entity name does not match pattern', async () => {
    const project = createProject({
      'src/entities.ts': `
        import { entity } from '@vertz/server';
        entity('MyTasks', {});
      `,
    });
    const analyzer = new EntityAnalyzer(project, resolveConfig());
    await analyzer.analyze();
    const diagnostics = analyzer.getDiagnostics();
    expect(diagnostics.some((d) => d.code === 'ENTITY_INVALID_NAME')).toBe(true);
  });

  it('emits warning when config is not an object literal', async () => {
    const project = createProject({
      'src/entities.ts': `
        import { entity } from '@vertz/server';
        const config = {};
        entity('tasks', config);
      `,
    });
    const analyzer = new EntityAnalyzer(project, resolveConfig());
    await analyzer.analyze();
    const diagnostics = analyzer.getDiagnostics();
    expect(diagnostics.some((d) => d.code === 'ENTITY_CONFIG_NOT_OBJECT')).toBe(true);
  });

  it('emits error when entity config has no model property', async () => {
    const project = createProject({
      'src/entities.ts': `
        import { entity } from '@vertz/server';
        entity('tasks', { access: {} });
      `,
    });
    const analyzer = new EntityAnalyzer(project, resolveConfig());
    await analyzer.analyze();
    const diagnostics = analyzer.getDiagnostics();
    expect(diagnostics.some((d) => d.code === 'ENTITY_MISSING_MODEL')).toBe(true);
  });

  it('extracts a basic entity with model reference', async () => {
    const project = createProject({
      'src/entities.ts': `
        import { entity } from '@vertz/server';
        const tasksModel = {};
        entity('tasks', { model: tasksModel });
      `,
    });
    const analyzer = new EntityAnalyzer(project, resolveConfig());
    const result = await analyzer.analyze();
    expect(result.entities.length).toBe(1);
    expect(result.entities[0]?.name).toBe('tasks');
    expect(result.entities[0]?.modelRef.variableName).toBe('tasksModel');
  });

  it('emits error for duplicate entity names', async () => {
    const project = createProject({
      'src/entities1.ts': `
        import { entity } from '@vertz/server';
        const model1 = {};
        entity('tasks', { model: model1 });
      `,
      'src/entities2.ts': `
        import { entity } from '@vertz/server';
        const model2 = {};
        entity('tasks', { model: model2 });
      `,
    });
    const analyzer = new EntityAnalyzer(project, resolveConfig());
    await analyzer.analyze();
    const diagnostics = analyzer.getDiagnostics();
    expect(diagnostics.some((d) => d.code === 'ENTITY_DUPLICATE_NAME')).toBe(true);
  });

  it('extracts access rules correctly', async () => {
    const project = createProject({
      'src/entities.ts': `
        import { entity } from '@vertz/server';
        const model = {};
        entity('tasks', {
          model: model,
          access: {
            list: true,
            get: false,
            create: (ctx: any) => ctx.authenticated(),
          },
        });
      `,
    });
    const analyzer = new EntityAnalyzer(project, resolveConfig());
    const result = await analyzer.analyze();
    expect(result.entities[0]?.access.list).toBe('none');
    expect(result.entities[0]?.access.get).toBe('false');
    expect(result.entities[0]?.access.create).toBe('function');
  });

  it('records custom access operations', async () => {
    const project = createProject({
      'src/entities.ts': `
        import { entity } from '@vertz/server';
        const model = {};
        entity('tasks', {
          model: model,
          access: {
            archive: (ctx: any) => ctx.authenticated(),
          },
          actions: {
            archive: {
              body: {},
            },
          },
        });
      `,
    });
    const analyzer = new EntityAnalyzer(project, resolveConfig());
    const result = await analyzer.analyze();
    expect(result.entities[0]?.access.custom).toHaveProperty('archive');
    expect(result.entities[0]?.access.custom.archive).toBe('function');
  });

  it('emits warning for unknown custom access ops', async () => {
    const project = createProject({
      'src/entities.ts': `
        import { entity } from '@vertz/server';
        const model = {};
        entity('tasks', {
          model: model,
          access: {
            nonexistent: (ctx: any) => ctx.authenticated(),
          },
        });
      `,
    });
    const analyzer = new EntityAnalyzer(project, resolveConfig());
    await analyzer.analyze();
    const diagnostics = analyzer.getDiagnostics();
    expect(diagnostics.some((d) => d.code === 'ENTITY_UNKNOWN_ACCESS_OP')).toBe(true);
  });

  it('emits error for action names that collide with CRUD ops', async () => {
    const project = createProject({
      'src/entities.ts': `
        import { entity } from '@vertz/server';
        const model = {};
        entity('tasks', {
          model: model,
          actions: {
            list: { body: {} },
          },
        });
      `,
    });
    const analyzer = new EntityAnalyzer(project, resolveConfig());
    await analyzer.analyze();
    const diagnostics = analyzer.getDiagnostics();
    expect(diagnostics.some((d) => d.code === 'ENTITY_ACTION_NAME_COLLISION')).toBe(true);
  });

  it('extracts hooks with before and after', async () => {
    const project = createProject({
      'src/entities.ts': `
        import { entity } from '@vertz/server';
        const model = {};
        entity('tasks', {
          model: model,
          before: { create: (ctx: any) => {}, update: (ctx: any) => {} },
          after: { delete: (ctx: any) => {} },
        });
      `,
    });
    const analyzer = new EntityAnalyzer(project, resolveConfig());
    const result = await analyzer.analyze();
    expect(result.entities[0]?.hooks.before).toEqual(['create', 'update']);
    expect(result.entities[0]?.hooks.after).toEqual(['delete']);
  });

  it('emits warning for entity() call not from @vertz/server', async () => {
    const project = createProject({
      'src/entities.ts': `
        function entity(name: string, config: any) {}
        entity('tasks', { model: {} });
      `,
    });
    const analyzer = new EntityAnalyzer(project, resolveConfig());
    await analyzer.analyze();
    const diagnostics = analyzer.getDiagnostics();
    expect(diagnostics.some((d) => d.code === 'ENTITY_UNRESOLVED_IMPORT')).toBe(true);
  });

  it('handles namespace import: server.entity()', async () => {
    const project = createProject({
      'src/entities.ts': `
        import * as server from '@vertz/server';
        const model = {};
        server.entity('tasks', { model: model });
      `,
    });
    const analyzer = new EntityAnalyzer(project, resolveConfig());
    const result = await analyzer.analyze();
    expect(result.entities.length).toBe(1);
    expect(result.entities[0]?.name).toBe('tasks');
  });

  it('extracts tenantScoped and table config', async () => {
    const project = createProject({
      'src/entities.ts': `
        import { entity } from '@vertz/server';
        const model = {};
        entity('tasks', {
          model: model,
          tenantScoped: false,
          table: 'custom_tasks',
        });
      `,
    });
    const analyzer = new EntityAnalyzer(project, resolveConfig());
    const result = await analyzer.analyze();
    expect(result.entities[0]?.tenantScoped).toBe(false);
    expect(result.entities[0]?.table).toBe('custom_tasks');
  });

  it('extracts expose config with select and include', async () => {
    const project = createProject({
      'src/entities.ts': `
        import { entity } from '@vertz/server';
        const model = {};
        entity('tasks', {
          model: model,
          expose: {
            select: {
              id: true,
              title: true,
            },
            include: {
              author: true,
            },
          },
        });
      `,
    });
    const analyzer = new EntityAnalyzer(project, resolveConfig());
    const result = await analyzer.analyze();
    expect(result.entities[0]?.expose).toBeDefined();
    expect(result.entities[0]?.expose?.select.length).toBe(2);
    expect(result.entities[0]?.expose?.include?.length).toBe(1);
    expect(result.entities[0]?.expose?.include?.[0]?.name).toBe('author');
  });

  it('emits warning for empty expose.select', async () => {
    const project = createProject({
      'src/entities.ts': `
        import { entity } from '@vertz/server';
        const model = {};
        entity('tasks', {
          model: model,
          expose: {
            select: {},
          },
        });
      `,
    });
    const analyzer = new EntityAnalyzer(project, resolveConfig());
    await analyzer.analyze();
    const diagnostics = analyzer.getDiagnostics();
    expect(diagnostics.some((d) => d.code === 'ENTITY_EXPOSE_EMPTY_SELECT')).toBe(true);
  });

  it('extracts expose.include with object config (select)', async () => {
    const project = createProject({
      'src/entities.ts': `
        import { entity } from '@vertz/server';
        const model = {};
        entity('tasks', {
          model: model,
          expose: {
            select: {
              id: true,
            },
            include: {
              author: {
                select: {
                  name: true,
                  email: true,
                },
              },
            },
          },
        });
      `,
    });
    const analyzer = new EntityAnalyzer(project, resolveConfig());
    const result = await analyzer.analyze();
    const authorInclude = result.entities[0]?.expose?.include?.[0];
    expect(authorInclude?.name).toBe('author');
    expect(authorInclude?.select?.length).toBe(2);
  });

  it('extracts expose.include with false filter (excluded)', async () => {
    const project = createProject({
      'src/entities.ts': `
        import { entity } from '@vertz/server';
        const model = {};
        entity('tasks', {
          model: model,
          expose: {
            select: { id: true },
            include: {
              author: true,
              comments: false,
            },
          },
        });
      `,
    });
    const analyzer = new EntityAnalyzer(project, resolveConfig());
    const result = await analyzer.analyze();
    const include = result.entities[0]?.expose?.include;
    expect(include?.length).toBe(1);
    expect(include?.[0]?.name).toBe('author');
  });

  it('extracts action with custom method', async () => {
    const project = createProject({
      'src/entities.ts': `
        import { entity } from '@vertz/server';
        const model = {};
        entity('tasks', {
          model: model,
          actions: {
            archive: {
              method: 'PUT',
              body: {},
            },
          },
        });
      `,
    });
    const analyzer = new EntityAnalyzer(project, resolveConfig());
    const result = await analyzer.analyze();
    expect(result.entities[0]?.actions[0]?.method).toBe('PUT');
  });

  it('emits error for action with invalid method', async () => {
    const project = createProject({
      'src/entities.ts': `
        import { entity } from '@vertz/server';
        const model = {};
        entity('tasks', {
          model: model,
          actions: {
            archive: {
              method: 'INVALID',
              body: {},
            },
          },
        });
      `,
    });
    const analyzer = new EntityAnalyzer(project, resolveConfig());
    await analyzer.analyze();
    const diagnostics = analyzer.getDiagnostics();
    expect(diagnostics.some((d) => d.code === 'ENTITY_ACTION_INVALID_METHOD')).toBe(true);
  });

  it('emits warning for action missing body and response', async () => {
    const project = createProject({
      'src/entities.ts': `
        import { entity } from '@vertz/server';
        const model = {};
        entity('tasks', {
          model: model,
          actions: {
            archive: {},
          },
        });
      `,
    });
    const analyzer = new EntityAnalyzer(project, resolveConfig());
    await analyzer.analyze();
    const diagnostics = analyzer.getDiagnostics();
    expect(diagnostics.some((d) => d.code === 'ENTITY_ACTION_MISSING_SCHEMA')).toBe(true);
  });

  it('extracts relations with boolean true', async () => {
    const project = createProject({
      'src/entities.ts': `
        import { entity } from '@vertz/server';
        const model = {};
        entity('tasks', {
          model: model,
          relations: {
            author: true,
            comments: false,
          },
        });
      `,
    });
    const analyzer = new EntityAnalyzer(project, resolveConfig());
    const result = await analyzer.analyze();
    // false is filtered out
    expect(result.entities[0]?.relations.length).toBe(1);
    expect(result.entities[0]?.relations[0]?.name).toBe('author');
    expect(result.entities[0]?.relations[0]?.selection).toBe('all');
  });

  it('extracts relations with object config', async () => {
    const project = createProject({
      'src/entities.ts': `
        import { entity } from '@vertz/server';
        const model = {};
        entity('tasks', {
          model: model,
          relations: {
            author: {
              select: { name: true, email: true },
              allowWhere: ['name'],
              allowOrderBy: ['name'],
              maxLimit: 50,
            },
          },
        });
      `,
    });
    const analyzer = new EntityAnalyzer(project, resolveConfig());
    const result = await analyzer.analyze();
    const rel = result.entities[0]?.relations[0];
    expect(rel?.name).toBe('author');
    expect(rel?.selection).toEqual(['name', 'email']);
    expect(rel?.allowWhere).toEqual(['name']);
    expect(rel?.allowOrderBy).toEqual(['name']);
    expect(rel?.maxLimit).toBe(50);
  });

  it('emits warning for expose.select with spread', async () => {
    const project = createProject({
      'src/entities.ts': `
        import { entity } from '@vertz/server';
        const model = {};
        const extraFields = {};
        entity('tasks', {
          model: model,
          expose: {
            select: {
              id: true,
              ...extraFields,
            },
          },
        });
      `,
    });
    const analyzer = new EntityAnalyzer(project, resolveConfig());
    await analyzer.analyze();
    const diagnostics = analyzer.getDiagnostics();
    expect(diagnostics.some((d) => d.code === 'ENTITY_EXPOSE_NON_LITERAL')).toBe(true);
  });
});
