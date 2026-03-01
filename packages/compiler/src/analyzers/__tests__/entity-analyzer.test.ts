import { beforeEach, describe, expect, it } from 'bun:test';
import { Project } from 'ts-morph';
import type { ResolvedConfig } from '../../config';
import type { EntityIR } from '../../ir/types';
import { EntityAnalyzer } from '../entity-analyzer';

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
    it('extracts custom actions with body/response schema refs', async () => {
      createFile(
        '/entities.ts',
        `
        import { entity } from '@vertz/server';
        import { userModel } from './models';
        import { activateBody, activateResponse } from './schemas';

        export const userEntity = entity('user', {
          model: userModel,
          actions: {
            activate: {
              body: activateBody,
              response: activateResponse,
            },
          },
        });
      `,
      );

      const result = await analyze();
      const actions = result.entities[0]?.actions;
      expect(actions).toHaveLength(1);
      expect(actions?.[0]?.name).toBe('activate');
      expect(actions?.[0]?.body).toBeDefined();
      expect(actions?.[0]?.response).toBeDefined();
      expect(actions?.[0]?.method).toBe('POST');
    });

    it('defaults method to POST when omitted', async () => {
      createFile(
        '/entities.ts',
        `
        import { entity } from '@vertz/server';
        import { userModel } from './models';
        import { activateBody, activateResponse } from './schemas';

        export const userEntity = entity('user', {
          model: userModel,
          actions: {
            activate: {
              body: activateBody,
              response: activateResponse,
            },
          },
        });
      `,
      );

      const result = await analyze();
      const action = result.entities[0]?.actions[0];
      expect(action?.method).toBe('POST');
      expect(action?.path).toBeUndefined();
    });

    it('extracts explicit method from action', async () => {
      createFile(
        '/entities.ts',
        `
        import { entity } from '@vertz/server';
        import { userModel } from './models';
        import { statsResponse } from './schemas';

        export const userEntity = entity('user', {
          model: userModel,
          actions: {
            stats: {
              method: 'GET',
              response: statsResponse,
            },
          },
        });
      `,
      );

      const result = await analyze();
      const action = result.entities[0]?.actions[0];
      expect(action?.method).toBe('GET');
    });

    it('emits diagnostic for invalid method', async () => {
      createFile(
        '/entities.ts',
        `
        import { entity } from '@vertz/server';
        import { userModel } from './models';
        import { body, response } from './schemas';

        export const userEntity = entity('user', {
          model: userModel,
          actions: {
            activate: {
              method: 'INVALID',
              body: body,
              response: response,
            },
          },
        });
      `,
      );

      const analyzer = new EntityAnalyzer(project, config);
      await analyzer.analyze();
      const diagnostics = analyzer.getDiagnostics();
      expect(diagnostics.some((d) => d.code === 'ENTITY_ACTION_INVALID_METHOD')).toBe(true);
    });

    it('extracts path from action', async () => {
      createFile(
        '/entities.ts',
        `
        import { entity } from '@vertz/server';
        import { userModel } from './models';
        import { statsResponse } from './schemas';

        export const userEntity = entity('user', {
          model: userModel,
          actions: {
            stats: {
              method: 'GET',
              path: 'stats',
              response: statsResponse,
            },
          },
        });
      `,
      );

      const result = await analyze();
      const action = result.entities[0]?.actions[0];
      expect(action?.path).toBe('stats');
    });

    it('extracts query schema ref from action', async () => {
      createFile(
        '/entities.ts',
        `
        import { entity } from '@vertz/server';
        import { userModel } from './models';
        import { statsQuery, statsResponse } from './schemas';

        export const userEntity = entity('user', {
          model: userModel,
          actions: {
            stats: {
              method: 'GET',
              path: 'stats',
              query: statsQuery,
              response: statsResponse,
            },
          },
        });
      `,
      );

      const result = await analyze();
      const action = result.entities[0]?.actions[0];
      expect(action?.query).toBeDefined();
      expect(action?.query?.kind).toBe('named');
    });

    it('extracts params and headers schema refs from action', async () => {
      createFile(
        '/entities.ts',
        `
        import { entity } from '@vertz/server';
        import { userModel } from './models';
        import { actionParams, actionHeaders, actionBody, actionResponse } from './schemas';

        export const userEntity = entity('user', {
          model: userModel,
          actions: {
            transfer: {
              method: 'POST',
              path: ':id/transfer',
              params: actionParams,
              headers: actionHeaders,
              body: actionBody,
              response: actionResponse,
            },
          },
        });
      `,
      );

      const result = await analyze();
      const action = result.entities[0]?.actions[0];
      expect(action?.params).toBeDefined();
      expect(action?.params?.kind).toBe('named');
      expect(action?.headers).toBeDefined();
      expect(action?.headers?.kind).toBe('named');
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
              body: {},
              response: {},
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

    it('emits ENTITY_ACTION_MISSING_SCHEMA for actions without body and response', async () => {
      createFile(
        '/entities.ts',
        `
        import { entity } from '@vertz/server';
        import { userModel } from './models';

        export const userEntity = entity('user', {
          model: userModel,
          actions: {
            activate: {
              handler: () => {},
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

  describe('Resolved Fields', () => {
    it('extracts resolvedFields from createInput schema type', async () => {
      createFile(
        '/models.ts',
        `
        export interface SchemaLike<T> { parse(data: unknown): { ok: true; data: T } | { ok: false; error: Error }; }
        export interface TodoModel {
          schemas: {
            response: SchemaLike<{ id: string; title: string; completed: boolean; createdAt: Date; updatedAt: Date }>;
            createInput: SchemaLike<{ title: string; completed?: boolean }>;
            updateInput: SchemaLike<{ title?: string; completed?: boolean }>;
          };
        }
        export const todoModel: TodoModel = {} as TodoModel;
      `,
      );

      createFile(
        '/entities.ts',
        `
        import { entity } from '@vertz/server';
        import { todoModel } from './models';

        export const todoEntity = entity('todos', { model: todoModel });
      `,
      );

      const result = await analyze();
      expect(result.entities).toHaveLength(1);

      const createInput = result.entities[0]?.modelRef.schemaRefs.createInput;
      expect(createInput).toBeDefined();
      expect(createInput?.kind).toBe('inline');
      if (createInput?.kind === 'inline') {
        expect(createInput.resolvedFields).toBeDefined();
        expect(createInput.resolvedFields).toEqual(
          expect.arrayContaining([
            { name: 'title', tsType: 'string', optional: false },
            { name: 'completed', tsType: 'boolean', optional: true },
          ]),
        );
      }
    });

    it('marks all updateInput fields as optional', async () => {
      createFile(
        '/models.ts',
        `
        export interface SchemaLike<T> { parse(data: unknown): { ok: true; data: T } | { ok: false; error: Error }; }
        export interface TodoModel {
          schemas: {
            response: SchemaLike<{ id: string; title: string }>;
            createInput: SchemaLike<{ title: string }>;
            updateInput: SchemaLike<{ title?: string }>;
          };
        }
        export const todoModel: TodoModel = {} as TodoModel;
      `,
      );

      createFile(
        '/entities.ts',
        `
        import { entity } from '@vertz/server';
        import { todoModel } from './models';

        export const todoEntity = entity('todos', { model: todoModel });
      `,
      );

      const result = await analyze();
      const updateInput = result.entities[0]?.modelRef.schemaRefs.updateInput;
      expect(updateInput?.kind).toBe('inline');
      if (updateInput?.kind === 'inline') {
        expect(updateInput.resolvedFields).toBeDefined();
        const titleField = updateInput.resolvedFields?.find((f) => f.name === 'title');
        expect(titleField?.optional).toBe(true);
      }
    });

    it('extracts auto-generated fields from response schema', async () => {
      createFile(
        '/models.ts',
        `
        export interface SchemaLike<T> { parse(data: unknown): { ok: true; data: T } | { ok: false; error: Error }; }
        export interface TodoModel {
          schemas: {
            response: SchemaLike<{ id: string; title: string; createdAt: Date; updatedAt: Date }>;
            createInput: SchemaLike<{ title: string }>;
            updateInput: SchemaLike<{ title?: string }>;
          };
        }
        export const todoModel: TodoModel = {} as TodoModel;
      `,
      );

      createFile(
        '/entities.ts',
        `
        import { entity } from '@vertz/server';
        import { todoModel } from './models';

        export const todoEntity = entity('todos', { model: todoModel });
      `,
      );

      const result = await analyze();
      const response = result.entities[0]?.modelRef.schemaRefs.response;
      expect(response?.kind).toBe('inline');
      if (response?.kind === 'inline') {
        expect(response.resolvedFields).toBeDefined();
        expect(response.resolvedFields).toEqual(
          expect.arrayContaining([
            { name: 'id', tsType: 'string', optional: false },
            { name: 'createdAt', tsType: 'date', optional: false },
            { name: 'updatedAt', tsType: 'date', optional: false },
          ]),
        );
      }
    });

    it('returns resolvedFields undefined when type cannot be resolved', async () => {
      createFile(
        '/entities.ts',
        `
        import { entity } from '@vertz/server';
        import { unknownModel } from './unknown';

        export const todoEntity = entity('todos', { model: unknownModel });
      `,
      );

      const result = await analyze();
      const entity = result.entities[0];
      // When schemas can't be resolved, the whole schemaRefs.resolved is false
      expect(entity?.modelRef.schemaRefs.resolved).toBe(false);
    });

    it('generates proper JSON Schema from resolvedFields (not __typeText)', async () => {
      createFile(
        '/models.ts',
        `
        export interface SchemaLike<T> { parse(data: unknown): { ok: true; data: T } | { ok: false; error: Error }; }
        export interface TodoModel {
          schemas: {
            response: SchemaLike<{ id: string; title: string; completed: boolean; createdAt: Date }>;
            createInput: SchemaLike<{ title: string; completed?: boolean }>;
            updateInput: SchemaLike<{ title?: string; completed?: boolean }>;
          };
        }
        export const todoModel: TodoModel = {} as TodoModel;
      `,
      );

      createFile(
        '/entities.ts',
        `
        import { entity } from '@vertz/server';
        import { todoModel } from './models';

        export const todoEntity = entity('todos', { model: todoModel });
      `,
      );

      const result = await analyze();
      const createInput = result.entities[0]?.modelRef.schemaRefs.createInput;

      // jsonSchema should be proper JSON Schema, not contain __typeText
      expect(createInput?.kind).toBe('inline');
      if (createInput?.kind === 'inline' && createInput.jsonSchema) {
        expect(createInput.jsonSchema).not.toHaveProperty('__typeText');
        expect(createInput.jsonSchema).toHaveProperty('type', 'object');
        expect(createInput.jsonSchema).toHaveProperty('properties');
        expect(createInput.jsonSchema.properties).toEqual({
          title: { type: 'string' },
          completed: { type: 'boolean' },
        });
        expect(createInput.jsonSchema.required).toEqual(['title']);
      }
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
