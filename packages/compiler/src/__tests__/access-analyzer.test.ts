import { describe, expect, it } from 'bun:test';
import { Project } from 'ts-morph';
import { AccessAnalyzer } from '../analyzers/access-analyzer';
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

describe('AccessAnalyzer', () => {
  it('returns undefined when no defineAccess call exists', async () => {
    const project = createProject({
      'src/app.ts': 'export const x = 1;',
    });
    const analyzer = new AccessAnalyzer(project, resolveConfig());
    const result = await analyzer.analyze();
    expect(result.access).toBeUndefined();
  });

  it('emits warning for non-literal role values', async () => {
    const project = createProject({
      'src/access.ts': `
        import { defineAccess } from '@vertz/server';
        const ADMIN = 'admin';
        defineAccess({
          entities: {
            tasks: {
              roles: [ADMIN, 'editor'],
            },
          },
        });
      `,
    });
    const analyzer = new AccessAnalyzer(project, resolveConfig());
    const result = await analyzer.analyze();
    expect(result.access).toBeDefined();
    // ADMIN is an Identifier, not a StringLiteral
    const diagnostics = analyzer.getDiagnostics();
    expect(diagnostics.some((d) => d.code === 'ACCESS_NON_LITERAL_ROLE')).toBe(true);
    // 'editor' should be extracted, ADMIN should not
    const taskEntity = result.access?.entities.find((e) => e.name === 'tasks');
    expect(taskEntity?.roles).toContain('editor');
  });

  it('extracts boolean where conditions', async () => {
    const project = createProject({
      'src/access.ts': `
        import { defineAccess } from '@vertz/server';
        defineAccess({
          entitlements: {
            'task:view': (r: any) => r.where({ isPublic: true, isArchived: false }),
          },
        });
      `,
    });
    const analyzer = new AccessAnalyzer(project, resolveConfig());
    const result = await analyzer.analyze();
    expect(result.access).toBeDefined();
    const clause = result.access?.whereClauses.find((c) => c.entitlement === 'task:view');
    expect(clause).toBeDefined();
    const isPublic = clause?.conditions.find((c) => c.column === 'isPublic');
    expect(isPublic?.kind).toBe('literal');
    expect((isPublic as any)?.value).toBe(true);
    const isArchived = clause?.conditions.find((c) => c.column === 'isArchived');
    expect(isArchived?.kind).toBe('literal');
    expect((isArchived as any)?.value).toBe(false);
  });

  it('extracts numeric where conditions', async () => {
    const project = createProject({
      'src/access.ts': `
        import { defineAccess } from '@vertz/server';
        defineAccess({
          entitlements: {
            'task:view': (r: any) => r.where({ priority: 1 }),
          },
        });
      `,
    });
    const analyzer = new AccessAnalyzer(project, resolveConfig());
    const result = await analyzer.analyze();
    const clause = result.access?.whereClauses.find((c) => c.entitlement === 'task:view');
    const priority = clause?.conditions.find((c) => c.column === 'priority');
    expect(priority?.kind).toBe('literal');
    expect((priority as any)?.value).toBe(1);
  });

  it('emits warning for non-translatable where conditions', async () => {
    const project = createProject({
      'src/access.ts': `
        import { defineAccess } from '@vertz/server';
        const dynamicValue = 'test';
        defineAccess({
          entitlements: {
            'task:view': (r: any) => r.where({ status: dynamicValue }),
          },
        });
      `,
    });
    const analyzer = new AccessAnalyzer(project, resolveConfig());
    await analyzer.analyze();
    const diagnostics = analyzer.getDiagnostics();
    expect(diagnostics.some((d) => d.code === 'ACCESS_WHERE_NOT_TRANSLATABLE')).toBe(true);
  });

  it('extracts marker conditions (user.id and user.tenantId)', async () => {
    const project = createProject({
      'src/access.ts': `
        import { defineAccess } from '@vertz/server';
        defineAccess({
          entitlements: {
            'task:edit': (r: any) => r.where({ createdBy: r.user.id }),
            'task:view': (r: any) => r.where({ tenantId: r.user.tenantId }),
          },
        });
      `,
    });
    const analyzer = new AccessAnalyzer(project, resolveConfig());
    const result = await analyzer.analyze();
    const editClause = result.access?.whereClauses.find((c) => c.entitlement === 'task:edit');
    expect(editClause?.conditions[0]?.kind).toBe('marker');
    expect((editClause?.conditions[0] as any)?.marker).toBe('user.id');

    const viewClause = result.access?.whereClauses.find((c) => c.entitlement === 'task:view');
    expect(viewClause?.conditions[0]?.kind).toBe('marker');
    expect((viewClause?.conditions[0] as any)?.marker).toBe('user.tenantId');
  });

  it('emits error for multiple defineAccess calls', async () => {
    const project = createProject({
      'src/access1.ts': `
        import { defineAccess } from '@vertz/server';
        defineAccess({ entities: {} });
      `,
      'src/access2.ts': `
        import { defineAccess } from '@vertz/server';
        defineAccess({ entities: {} });
      `,
    });
    const analyzer = new AccessAnalyzer(project, resolveConfig());
    await analyzer.analyze();
    const diagnostics = analyzer.getDiagnostics();
    expect(diagnostics.some((d) => d.code === 'ACCESS_MULTIPLE_DEFINITIONS')).toBe(true);
  });

  it('emits warning for spread in entitlements', async () => {
    const project = createProject({
      'src/access.ts': `
        import { defineAccess } from '@vertz/server';
        const extraEntitlements = {};
        defineAccess({
          entitlements: {
            'task:edit': (r: any) => r.authenticated(),
            ...extraEntitlements,
          },
        });
      `,
    });
    const analyzer = new AccessAnalyzer(project, resolveConfig());
    await analyzer.analyze();
    const diagnostics = analyzer.getDiagnostics();
    expect(diagnostics.some((d) => d.code === 'ACCESS_NON_LITERAL_KEY')).toBe(true);
  });

  it('emits warning for duplicate entitlements', async () => {
    const project = createProject({
      'src/access.ts': `
        import { defineAccess } from '@vertz/server';
        defineAccess({
          entitlements: {
            'task:edit': (r: any) => r.authenticated(),
            'task:edit': (r: any) => r.authenticated(),
          },
        });
      `,
    });
    const analyzer = new AccessAnalyzer(project, resolveConfig());
    await analyzer.analyze();
    const diagnostics = analyzer.getDiagnostics();
    expect(diagnostics.some((d) => d.code === 'ACCESS_DUPLICATE_ENTITLEMENT')).toBe(true);
  });

  it('handles namespace import: server.defineAccess()', async () => {
    const project = createProject({
      'src/access.ts': `
        import * as server from '@vertz/server';
        server.defineAccess({
          entitlements: {
            'task:view': (r: any) => r.authenticated(),
          },
        });
      `,
    });
    const analyzer = new AccessAnalyzer(project, resolveConfig());
    const result = await analyzer.analyze();
    expect(result.access).toBeDefined();
    expect(result.access?.entitlements).toContain('task:view');
  });
});
