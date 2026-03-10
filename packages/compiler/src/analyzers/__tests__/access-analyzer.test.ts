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
      entryFile: 'index.ts',
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

  function getDiagnostics() {
    const analyzer = new AccessAnalyzer(project, config);
    analyzer.analyze();
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
      expect(result.access!.entitlements).toEqual(['workspace:invite']);
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
      expect(result.access!.entitlements).toEqual(['project:view']);
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
      expect(result.access!.entitlements).toEqual(['project:view']);
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
      expect(result.access!.entitlements).toEqual([
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
      expect(result.access!.entities).toEqual([
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
      expect(result.access!.entitlements).toEqual(['c:d']);
      // Should warn about the spread
      expect(diagnostics.some((d) => d.code === 'ACCESS_NON_LITERAL_KEY')).toBe(true);
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
