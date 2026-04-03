import { beforeEach, describe, expect, it } from 'bun:test';
import { Project } from 'ts-morph';
import type { ResolvedConfig } from '../../config';
import { AccessAnalyzer } from '../access-analyzer';

describe('AccessAnalyzer', () => {
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
    const analyzer = new AccessAnalyzer(project, config);
    return analyzer.analyze();
  }

  async function getDiagnostics() {
    const analyzer = new AccessAnalyzer(project, config);
    await analyzer.analyze();
    return analyzer.getDiagnostics();
  }

  describe('Detection', () => {
    it('detects defineAccess() with named import from @vertz/server', async () => {
      createFile(
        '/access.ts',
        `
        import { defineAccess } from '@vertz/server';

        export const access = defineAccess({
          entities: {
            workspace: { roles: ['admin', 'member'] },
          },
          entitlements: {
            'workspace:invite': { roles: ['admin'] },
          },
        });
      `,
      );

      const result = await analyze();
      expect(result.access).toBeDefined();
      expect(result.access?.entitlements).toEqual(['workspace:invite']);
    });

    it('ignores defineAccess() from other packages', async () => {
      createFile(
        '/access.ts',
        `
        import { defineAccess } from 'other-package';

        export const access = defineAccess({
          entities: {},
          entitlements: { 'a:b': { roles: ['admin'] } },
        });
      `,
      );

      const result = await analyze();
      expect(result.access).toBeUndefined();
    });

    it('detects with aliased import', async () => {
      createFile(
        '/access.ts',
        `
        import { defineAccess as da } from '@vertz/server';

        export const access = da({
          entities: {
            project: { roles: ['manager'] },
          },
          entitlements: {
            'project:view': { roles: ['manager'] },
          },
        });
      `,
      );

      const result = await analyze();
      expect(result.access).toBeDefined();
      expect(result.access?.entitlements).toEqual(['project:view']);
    });

    it('detects with namespace import', async () => {
      createFile(
        '/access.ts',
        `
        import * as server from '@vertz/server';

        export const access = server.defineAccess({
          entities: {
            project: { roles: ['manager'] },
          },
          entitlements: {
            'project:view': { roles: ['manager'] },
          },
        });
      `,
      );

      const result = await analyze();
      expect(result.access).toBeDefined();
      expect(result.access?.entitlements).toEqual(['project:view']);
    });
  });

  describe('Entitlement extraction', () => {
    it('extracts all entitlement keys as string literals', async () => {
      createFile(
        '/access.ts',
        `
        import { defineAccess } from '@vertz/server';

        export const access = defineAccess({
          entities: {
            workspace: { roles: ['admin'] },
            project: { roles: ['manager', 'viewer'] },
          },
          entitlements: {
            'project:view': { roles: ['viewer', 'manager'] },
            'project:edit': { roles: ['manager'] },
            'workspace:invite': { roles: ['admin'] },
          },
        });
      `,
      );

      const result = await analyze();
      expect(result.access?.entitlements).toEqual([
        'project:view',
        'project:edit',
        'workspace:invite',
      ]);
    });
  });

  describe('Entity extraction', () => {
    it('extracts entity names with their roles', async () => {
      createFile(
        '/access.ts',
        `
        import { defineAccess } from '@vertz/server';

        export const access = defineAccess({
          entities: {
            workspace: { roles: ['admin', 'member'] },
            project: { roles: ['manager', 'contributor', 'viewer'] },
          },
          entitlements: {},
        });
      `,
      );

      const result = await analyze();
      expect(result.access?.entities).toEqual([
        { name: 'workspace', roles: ['admin', 'member'] },
        { name: 'project', roles: ['manager', 'contributor', 'viewer'] },
      ]);
    });
  });

  describe('Diagnostics', () => {
    it('emits error for multiple defineAccess() calls', async () => {
      createFile(
        '/access1.ts',
        `
        import { defineAccess } from '@vertz/server';
        export const a = defineAccess({ entities: {}, entitlements: {} });
      `,
      );
      createFile(
        '/access2.ts',
        `
        import { defineAccess } from '@vertz/server';
        export const b = defineAccess({ entities: {}, entitlements: {} });
      `,
      );

      const diagnostics = await getDiagnostics();
      expect(diagnostics.some((d) => d.code === 'ACCESS_MULTIPLE_DEFINITIONS')).toBe(true);
    });

    it('emits warning for non-literal entitlement keys (spread)', async () => {
      createFile(
        '/access.ts',
        `
        import { defineAccess } from '@vertz/server';
        const extra = { 'a:b': { roles: ['admin'] } };
        export const access = defineAccess({
          entities: {},
          entitlements: { ...extra, 'c:d': { roles: ['admin'] } },
        });
      `,
      );

      const result = await analyze();
      const diagnostics = await getDiagnostics();
      // Should still extract the literal key
      expect(result.access?.entitlements).toEqual(['c:d']);
      // Should warn about the spread
      expect(diagnostics.some((d) => d.code === 'ACCESS_NON_LITERAL_KEY')).toBe(true);
    });
  });

  describe('Entitlement edge cases', () => {
    it('emits warning for duplicate entitlement keys', async () => {
      createFile(
        '/access.ts',
        `
        import { defineAccess } from '@vertz/server';
        export const access = defineAccess({
          entities: {},
          entitlements: {
            'workspace:invite': { roles: ['admin'] },
            'workspace:invite': { roles: ['member'] },
          },
        });
      `,
      );

      const result = await analyze();
      const diagnostics = await getDiagnostics();
      // Only first occurrence kept
      expect(result.access?.entitlements).toEqual(['workspace:invite']);
      expect(diagnostics.some((d) => d.code === 'ACCESS_DUPLICATE_ENTITLEMENT')).toBe(true);
    });

    it('handles method-declaration-style entitlement keys', async () => {
      createFile(
        '/access.ts',
        `
        import { defineAccess } from '@vertz/server';
        export const access = defineAccess({
          entities: {},
          entitlements: {
            'workspace:view'(ctx: any) { return ctx.role === 'admin'; },
          },
        });
      `,
      );

      const result = await analyze();
      expect(result.access?.entitlements).toEqual(['workspace:view']);
    });

    it('handles callback-form entitlement values', async () => {
      createFile(
        '/access.ts',
        `
        import { defineAccess } from '@vertz/server';
        export const access = defineAccess({
          entities: {},
          entitlements: {
            'workspace:invite': (ctx: any) => ctx.role === 'admin',
          },
        });
      `,
      );

      const result = await analyze();
      expect(result.access?.entitlements).toEqual(['workspace:invite']);
    });
  });

  describe('Entity edge cases', () => {
    it('handles entity with no roles property', async () => {
      createFile(
        '/access.ts',
        `
        import { defineAccess } from '@vertz/server';
        export const access = defineAccess({
          entities: {
            workspace: { parent: null },
          },
          entitlements: {
            'workspace:view': { roles: ['admin'] },
          },
        });
      `,
      );

      const result = await analyze();
      expect(result.access?.entities).toEqual([{ name: 'workspace', roles: [] }]);
    });
  });

  describe('Where-clause extraction', () => {
    it('returns empty whereClauses when no where() calls exist', async () => {
      createFile(
        '/access.ts',
        `
        import { defineAccess } from '@vertz/server';
        export const access = defineAccess({
          entities: {},
          entitlements: {
            'post:view': { roles: ['viewer'] },
          },
        });
      `,
      );

      const result = await analyze();
      expect(result.access?.whereClauses).toEqual([]);
    });

    it('extracts r.where({ createdBy: r.user.id }) from callback entitlement', async () => {
      createFile(
        '/access.ts',
        `
        import { defineAccess } from '@vertz/server';
        export const access = defineAccess({
          entities: {
            task: { roles: ['assignee'] },
          },
          entitlements: {
            'task:delete': (r) => ({
              roles: ['assignee'],
              rules: [r.where({ createdBy: r.user.id })],
            }),
          },
        });
      `,
      );

      const result = await analyze();
      expect(result.access?.whereClauses).toEqual([
        {
          entitlement: 'task:delete',
          conditions: [{ kind: 'marker', column: 'createdBy', marker: 'user.id' }],
        },
      ]);
    });

    it('extracts r.user.tenantId marker', async () => {
      createFile(
        '/access.ts',
        `
        import { defineAccess } from '@vertz/server';
        export const access = defineAccess({
          entities: {},
          entitlements: {
            'org:view': (r) => ({
              roles: ['member'],
              rules: [r.where({ orgId: r.user.tenantId })],
            }),
          },
        });
      `,
      );

      const result = await analyze();
      expect(result.access?.whereClauses).toEqual([
        {
          entitlement: 'org:view',
          conditions: [{ kind: 'marker', column: 'orgId', marker: 'user.tenantId' }],
        },
      ]);
    });

    it('extracts literal boolean and string conditions', async () => {
      createFile(
        '/access.ts',
        `
        import { defineAccess } from '@vertz/server';
        export const access = defineAccess({
          entities: {},
          entitlements: {
            'task:view': (r) => ({
              roles: ['viewer'],
              rules: [r.where({ archived: false, status: 'active' })],
            }),
          },
        });
      `,
      );

      const result = await analyze();
      expect(result.access?.whereClauses).toEqual([
        {
          entitlement: 'task:view',
          conditions: [
            { kind: 'literal', column: 'archived', value: false },
            { kind: 'literal', column: 'status', value: 'active' },
          ],
        },
      ]);
    });

    it('extracts where() from object-form entitlement with rules array', async () => {
      createFile(
        '/access.ts',
        `
        import { defineAccess, rules } from '@vertz/server';
        export const access = defineAccess({
          entities: {},
          entitlements: {
            'task:edit': {
              roles: ['assignee'],
              rules: [rules.where({ createdBy: rules.user.id })],
            },
          },
        });
      `,
      );

      const result = await analyze();
      expect(result.access?.whereClauses).toEqual([
        {
          entitlement: 'task:edit',
          conditions: [{ kind: 'marker', column: 'createdBy', marker: 'user.id' }],
        },
      ]);
    });

    it('emits warning for non-translatable where conditions', async () => {
      createFile(
        '/access.ts',
        `
        import { defineAccess } from '@vertz/server';
        const dynamicVal = 'something';
        export const access = defineAccess({
          entities: {},
          entitlements: {
            'task:delete': (r) => ({
              roles: ['admin'],
              rules: [r.where({ status: dynamicVal })],
            }),
          },
        });
      `,
      );

      const diagnostics = await getDiagnostics();
      expect(diagnostics.some((d) => d.code === 'ACCESS_WHERE_NOT_TRANSLATABLE')).toBe(true);
    });

    it('extracts numeric literal conditions', async () => {
      createFile(
        '/access.ts',
        `
        import { defineAccess } from '@vertz/server';
        export const access = defineAccess({
          entities: {},
          entitlements: {
            'task:view': (r) => ({
              roles: ['viewer'],
              rules: [r.where({ priority: 1 })],
            }),
          },
        });
      `,
      );

      const result = await analyze();
      expect(result.access?.whereClauses).toEqual([
        {
          entitlement: 'task:view',
          conditions: [{ kind: 'literal', column: 'priority', value: 1 }],
        },
      ]);
    });

    it('merges conditions from multiple where() calls in same entitlement', async () => {
      createFile(
        '/access.ts',
        `
        import { defineAccess } from '@vertz/server';
        export const access = defineAccess({
          entities: {},
          entitlements: {
            'task:edit': (r) => ({
              roles: ['assignee'],
              rules: [r.where({ createdBy: r.user.id }), r.where({ archived: false })],
            }),
          },
        });
      `,
      );

      const result = await analyze();
      expect(result.access?.whereClauses).toHaveLength(1);
      expect(result.access?.whereClauses[0].entitlement).toBe('task:edit');
      expect(result.access?.whereClauses[0].conditions).toHaveLength(2);
    });

    it('extracts multiple where clauses from different entitlements', async () => {
      createFile(
        '/access.ts',
        `
        import { defineAccess } from '@vertz/server';
        export const access = defineAccess({
          entities: {},
          entitlements: {
            'task:edit': (r) => ({
              roles: ['assignee'],
              rules: [r.where({ createdBy: r.user.id })],
            }),
            'task:view': (r) => ({
              roles: ['viewer'],
              rules: [r.where({ archived: false })],
            }),
          },
        });
      `,
      );

      const result = await analyze();
      expect(result.access?.whereClauses).toHaveLength(2);
      expect(result.access?.whereClauses[0].entitlement).toBe('task:edit');
      expect(result.access?.whereClauses[1].entitlement).toBe('task:view');
    });
  });

  describe('No access definition', () => {
    it('returns undefined access when no defineAccess() exists', async () => {
      createFile(
        '/app.ts',
        `
        import { entity } from '@vertz/server';
        export const e = entity('tasks', { model: {} as any });
      `,
      );

      const result = await analyze();
      expect(result.access).toBeUndefined();
    });
  });
});
