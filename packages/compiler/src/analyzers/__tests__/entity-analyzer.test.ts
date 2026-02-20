import { Project } from 'ts-morph';
import { describe, it, expect, beforeEach } from 'vitest';
import type { EntityIR } from '../../ir/types';
import { EntityAnalyzer } from '../entity-analyzer';
import type { ResolvedConfig } from '../../config';

describe('EntityAnalyzer', () => {
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
    const analyzer = new EntityAnalyzer(project, config);
    return analyzer.analyze();
  }

  describe('Detection', () => {
    it('detects entity() with named import from @vertz/server', async () => {
      createFile(
        '/entities.ts',
        `
        import { entity } from '@vertz/server';
        import { userModel } from './models';

        export const userEntity = entity('user', {
          model: userModel,
        });
      `,
      );

      const result = await analyze();
      expect(result.entities).toHaveLength(1);
      expect(result.entities[0]?.name).toBe('user');
    });

    it('detects with aliased import', async () => {
      createFile(
        '/entities.ts',
        `
        import { entity as e } from '@vertz/server';
        import { userModel } from './models';

        export const userEntity = e('user', {
          model: userModel,
        });
      `,
      );

      const result = await analyze();
      expect(result.entities).toHaveLength(1);
      expect(result.entities[0]?.name).toBe('user');
    });

    it('detects with namespace import', async () => {
      createFile(
        '/entities.ts',
        `
        import * as server from '@vertz/server';
        import { userModel } from './models';

        export const userEntity = server.entity('user', {
          model: userModel,
        });
      `,
      );

      const result = await analyze();
      expect(result.entities).toHaveLength(1);
      expect(result.entities[0]?.name).toBe('user');
    });

    it('ignores entity() from other packages', async () => {
      createFile(
        '/entities.ts',
        `
        import { entity } from 'other-package';
        import { userModel } from './models';

        export const userEntity = entity('user', {
          model: userModel,
        });
      `,
      );

      const result = await analyze();
      expect(result.entities).toHaveLength(0);
    });

    it('handles multiple entities in one file', async () => {
      createFile(
        '/entities.ts',
        `
        import { entity } from '@vertz/server';
        import { userModel, postModel } from './models';

        export const userEntity = entity('user', {
          model: userModel,
        });

        export const postEntity = entity('post', {
          model: postModel,
        });
      `,
      );

      const result = await analyze();
      expect(result.entities).toHaveLength(2);
      expect(result.entities.map((e) => e.name).sort()).toEqual(['post', 'user']);
    });

    it('handles entities across multiple files', async () => {
      createFile(
        '/user-entity.ts',
        `
        import { entity } from '@vertz/server';
        import { userModel } from './models';

        export const userEntity = entity('user', {
          model: userModel,
        });
      `,
      );

      createFile(
        '/post-entity.ts',
        `
        import { entity } from '@vertz/server';
        import { postModel } from './models';

        export const postEntity = entity('post', {
          model: postModel,
        });
      `,
      );

      const result = await analyze();
      expect(result.entities).toHaveLength(2);
      expect(result.entities.map((e) => e.name).sort()).toEqual(['post', 'user']);
    });

    it('emits ENTITY_UNRESOLVED_IMPORT for unresolvable entity calls', async () => {
      createFile(
        '/entities.ts',
        `
        // No import, calling unknown entity function
        export const userEntity = entity('user', {
          model: userModel,
        });
      `,
      );

      const analyzer = new EntityAnalyzer(project, config);
      await analyzer.analyze();
      const diagnostics = analyzer.getDiagnostics();
      expect(diagnostics.some((d) => d.code === 'ENTITY_UNRESOLVED_IMPORT')).toBe(true);
    });
  });

  describe('Name Extraction', () => {
    it('extracts valid name from string literal', async () => {
      createFile(
        '/entities.ts',
        `
        import { entity } from '@vertz/server';
        import { userModel } from './models';

        export const userEntity = entity('user', {
          model: userModel,
        });
      `,
      );

      const result = await analyze();
      expect(result.entities[0]?.name).toBe('user');
    });

    it('emits ENTITY_NON_LITERAL_NAME for template literals or variables', async () => {
      createFile(
        '/entities.ts',
        `
        import { entity } from '@vertz/server';
        import { userModel } from './models';
        const name = 'user';

        export const userEntity = entity(name, {
          model: userModel,
        });
      `,
      );

      const analyzer = new EntityAnalyzer(project, config);
      await analyzer.analyze();
      const diagnostics = analyzer.getDiagnostics();
      expect(diagnostics.some((d) => d.code === 'ENTITY_NON_LITERAL_NAME')).toBe(true);
    });

    it('emits ENTITY_INVALID_NAME for names not matching pattern', async () => {
      createFile(
        '/entities.ts',
        `
        import { entity } from '@vertz/server';
        import { userModel } from './models';

        export const userEntity = entity('User', {
          model: userModel,
        });
      `,
      );

      const analyzer = new EntityAnalyzer(project, config);
      await analyzer.analyze();
      const diagnostics = analyzer.getDiagnostics();
      expect(diagnostics.some((d) => d.code === 'ENTITY_INVALID_NAME')).toBe(true);
    });

    it('emits ENTITY_DUPLICATE_NAME for duplicate names across files', async () => {
      createFile(
        '/entities1.ts',
        `
        import { entity } from '@vertz/server';
        import { userModel } from './models';

        export const userEntity = entity('user', {
          model: userModel,
        });
      `,
      );

      createFile(
        '/entities2.ts',
        `
        import { entity } from '@vertz/server';
        import { userModel } from './models';

        export const anotherUser = entity('user', {
          model: userModel,
        });
      `,
      );

      const analyzer = new EntityAnalyzer(project, config);
      await analyzer.analyze();
      const diagnostics = analyzer.getDiagnostics();
      expect(diagnostics.some((d) => d.code === 'ENTITY_DUPLICATE_NAME')).toBe(true);
    });
  });

  describe('Model Extraction', () => {
    it('extracts model variable name', async () => {
      createFile(
        '/entities.ts',
        `
        import { entity } from '@vertz/server';
        import { userModel } from './models';

        export const userEntity = entity('user', {
          model: userModel,
        });
      `,
      );

      const result = await analyze();
      expect(result.entities[0]?.modelRef.variableName).toBe('userModel');
    });

    it('extracts model import source when imported', async () => {
      createFile(
        '/entities.ts',
        `
        import { entity } from '@vertz/server';
        import { userModel } from './models';

        export const userEntity = entity('user', {
          model: userModel,
        });
      `,
      );

      const result = await analyze();
      expect(result.entities[0]?.modelRef.importSource).toBe('./models');
    });

    it('falls back to resolved: false for unresolvable model', async () => {
      createFile(
        '/entities.ts',
        `
        import { entity } from '@vertz/server';
        const userModel = { table: {}, schemas: {} };

        export const userEntity = entity('user', {
          model: userModel,
        });
      `,
      );

      const result = await analyze();
      expect(result.entities[0]?.modelRef.schemaRefs.resolved).toBe(false);
    });

    it('emits ENTITY_MISSING_MODEL when model property absent', async () => {
      createFile(
        '/entities.ts',
        `
        import { entity } from '@vertz/server';

        export const userEntity = entity('user', {});
      `,
      );

      const analyzer = new EntityAnalyzer(project, config);
      await analyzer.analyze();
      const diagnostics = analyzer.getDiagnostics();
      expect(diagnostics.some((d) => d.code === 'ENTITY_MISSING_MODEL')).toBe(true);
    });
  });

  describe('Access Extraction', () => {
    it('extracts access rules: true → none, false → false, function → function', async () => {
      createFile(
        '/entities.ts',
        `
        import { entity } from '@vertz/server';
        import { userModel } from './models';

        export const userEntity = entity('user', {
          model: userModel,
          access: {
            list: true,
            get: false,
            create: () => true,
          },
        });
      `,
      );

      const result = await analyze();
      const access = result.entities[0]?.access;
      expect(access?.list).toBe('none');
      expect(access?.get).toBe('false');
      expect(access?.create).toBe('function');
    });

    it('handles missing access (all none)', async () => {
      createFile(
        '/entities.ts',
        `
        import { entity } from '@vertz/server';
        import { userModel } from './models';

        export const userEntity = entity('user', {
          model: userModel,
        });
      `,
      );

      const result = await analyze();
      const access = result.entities[0]?.access;
      expect(access?.list).toBe('none');
      expect(access?.get).toBe('none');
      expect(access?.create).toBe('none');
      expect(access?.update).toBe('none');
      expect(access?.delete).toBe('none');
    });

    it('handles partial access (some ops defined, rest none)', async () => {
      createFile(
        '/entities.ts',
        `
        import { entity } from '@vertz/server';
        import { userModel } from './models';

        export const userEntity = entity('user', {
          model: userModel,
          access: {
            list: true,
            create: false,
          },
        });
      `,
      );

      const result = await analyze();
      const access = result.entities[0]?.access;
      expect(access?.list).toBe('none');
      expect(access?.get).toBe('none');
      expect(access?.create).toBe('false');
    });

    it('extracts custom action access rules', async () => {
      createFile(
        '/entities.ts',
        `
        import { entity } from '@vertz/server';
        import { userModel } from './models';

        export const userEntity = entity('user', {
          model: userModel,
          access: {
            activate: () => true,
          },
        });
      `,
      );

      const result = await analyze();
      const access = result.entities[0]?.access;
      expect(access?.custom.activate).toBe('function');
    });
  });

  describe('Hook Extraction', () => {
    it('extracts before hooks (create, update)', async () => {
      createFile(
        '/entities.ts',
        `
        import { entity } from '@vertz/server';
        import { userModel } from './models';

        export const userEntity = entity('user', {
          model: userModel,
          before: {
            create: () => {},
            update: () => {},
          },
        });
      `,
      );

      const result = await analyze();
      const hooks = result.entities[0]?.hooks;
      expect(hooks?.before).toEqual(expect.arrayContaining(['create', 'update']));
    });

    it('extracts after hooks (create, update, delete)', async () => {
      createFile(
        '/entities.ts',
        `
        import { entity } from '@vertz/server';
        import { userModel } from './models';

        export const userEntity = entity('user', {
          model: userModel,
          after: {
            create: () => {},
            update: () => {},
            delete: () => {},
          },
        });
      `,
      );

      const result = await analyze();
      const hooks = result.entities[0]?.hooks;
      expect(hooks?.after).toEqual(expect.arrayContaining(['create', 'update', 'delete']));
    });

    it('handles missing hooks (empty arrays)', async () => {
      createFile(
        '/entities.ts',
        `
        import { entity } from '@vertz/server';
        import { userModel } from './models';

        export const userEntity = entity('user', {
          model: userModel,
        });
      `,
      );

      const result = await analyze();
      const hooks = result.entities[0]?.hooks;
      expect(hooks?.before).toEqual([]);
      expect(hooks?.after).toEqual([]);
    });
  });

  describe('Action Extraction', () => {
    it('extracts custom actions with input/output schema refs', async () => {
      createFile(
        '/entities.ts',
        `
        import { entity } from '@vertz/server';
        import { userModel } from './models';
        import { activateInput, activateOutput } from './schemas';

        export const userEntity = entity('user', {
          model: userModel,
          actions: {
            activate: {
              input: activateInput,
              output: activateOutput,
            },
          },
        });
      `,
      );

      const result = await analyze();
      const actions = result.entities[0]?.actions;
      expect(actions).toHaveLength(1);
      expect(actions?.[0]?.name).toBe('activate');
    });

    it('emits ENTITY_ACTION_NAME_COLLISION for action named create, update, etc.', async () => {
      createFile(
        '/entities.ts',
        `
        import { entity } from '@vertz/server';
        import { userModel } from './models';

        export const userEntity = entity('user', {
          model: userModel,
          actions: {
            create: {
              input: {},
              output: {},
            },
          },
        });
      `,
      );

      const analyzer = new EntityAnalyzer(project, config);
      await analyzer.analyze();
      const diagnostics = analyzer.getDiagnostics();
      expect(diagnostics.some((d) => d.code === 'ENTITY_ACTION_NAME_COLLISION')).toBe(true);
    });

    it('emits ENTITY_ACTION_MISSING_SCHEMA for actions without input/output', async () => {
      createFile(
        '/entities.ts',
        `
        import { entity } from '@vertz/server';
        import { userModel } from './models';

        export const userEntity = entity('user', {
          model: userModel,
          actions: {
            activate: {
              input: {},
            },
          },
        });
      `,
      );

      const analyzer = new EntityAnalyzer(project, config);
      await analyzer.analyze();
      const diagnostics = analyzer.getDiagnostics();
      expect(diagnostics.some((d) => d.code === 'ENTITY_ACTION_MISSING_SCHEMA')).toBe(true);
    });

    it('handles empty actions object', async () => {
      createFile(
        '/entities.ts',
        `
        import { entity } from '@vertz/server';
        import { userModel } from './models';

        export const userEntity = entity('user', {
          model: userModel,
          actions: {},
        });
      `,
      );

      const result = await analyze();
      expect(result.entities[0]?.actions).toEqual([]);
    });
  });

  describe('Relation Extraction', () => {
    it('extracts true as selection: all', async () => {
      createFile(
        '/entities.ts',
        `
        import { entity } from '@vertz/server';
        import { userModel } from './models';

        export const userEntity = entity('user', {
          model: userModel,
          relations: {
            posts: true,
          },
        });
      `,
      );

      const result = await analyze();
      const relations = result.entities[0]?.relations;
      expect(relations).toHaveLength(1);
      expect(relations?.[0]?.name).toBe('posts');
      expect(relations?.[0]?.selection).toBe('all');
    });

    it('extracts object with field keys as selection: string[]', async () => {
      createFile(
        '/entities.ts',
        `
        import { entity } from '@vertz/server';
        import { userModel } from './models';

        export const userEntity = entity('user', {
          model: userModel,
          relations: {
            posts: {
              title: true,
              content: true,
            },
          },
        });
      `,
      );

      const result = await analyze();
      const relations = result.entities[0]?.relations;
      expect(relations?.[0]?.selection).toEqual(['title', 'content']);
    });

    it('excludes false relations', async () => {
      createFile(
        '/entities.ts',
        `
        import { entity } from '@vertz/server';
        import { userModel } from './models';

        export const userEntity = entity('user', {
          model: userModel,
          relations: {
            posts: true,
            comments: false,
          },
        });
      `,
      );

      const result = await analyze();
      const relations = result.entities[0]?.relations;
      expect(relations).toHaveLength(1);
      expect(relations?.[0]?.name).toBe('posts');
    });

    it('handles empty relations', async () => {
      createFile(
        '/entities.ts',
        `
        import { entity } from '@vertz/server';
        import { userModel } from './models';

        export const userEntity = entity('user', {
          model: userModel,
          relations: {},
        });
      `,
      );

      const result = await analyze();
      expect(result.entities[0]?.relations).toEqual([]);
    });
  });

  describe('Config Edge Cases', () => {
    it('emits ENTITY_CONFIG_NOT_OBJECT when config is a variable reference', async () => {
      createFile(
        '/entities.ts',
        `
        import { entity } from '@vertz/server';
        import { userModel } from './models';
        const config = { model: userModel };

        export const userEntity = entity('user', config);
      `,
      );

      const analyzer = new EntityAnalyzer(project, config);
      await analyzer.analyze();
      const diagnostics = analyzer.getDiagnostics();
      expect(diagnostics.some((d) => d.code === 'ENTITY_CONFIG_NOT_OBJECT')).toBe(true);
    });

    it('handles entity with no optional properties (just name + model)', async () => {
      createFile(
        '/entities.ts',
        `
        import { entity } from '@vertz/server';
        import { userModel } from './models';

        export const userEntity = entity('user', {
          model: userModel,
        });
      `,
      );

      const result = await analyze();
      expect(result.entities).toHaveLength(1);
      expect(result.entities[0]?.name).toBe('user');
    });
  });
});
