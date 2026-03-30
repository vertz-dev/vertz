/**
 * Cloudflare Build Pipeline Tests
 *
 * Tests for building Vertz apps targeting Cloudflare Workers:
 * - ManifestBuilder: EntityIR[] → DeploymentManifest
 * - WorkerEntryGenerator: generates worker fetch handler code
 * - WranglerConfigGenerator: generates wrangler.toml
 * - Access rule validation at build time
 */

import { describe, expect, it } from 'bun:test';
import type { EntityAccessIR, EntityIR } from '@vertz/compiler';
import { ManifestBuilder } from '../cloudflare/manifest-builder';
import type { DeploymentManifest } from '../cloudflare/types';
import { WorkerEntryGenerator } from '../cloudflare/worker-entry-generator';
import { WranglerConfigGenerator } from '../cloudflare/wrangler-config-generator';
import { validateAccessRules } from '../cloudflare/validate-access-rules';

function createTestEntity(overrides: Partial<EntityIR> = {}): EntityIR {
  const defaultAccess: EntityAccessIR = {
    list: 'function',
    get: 'function',
    create: 'function',
    update: 'function',
    delete: 'function',
    custom: {},
  };

  return {
    name: 'todo',
    modelRef: {
      variableName: 'todoModel',
      importSource: '@vertz/db',
      tableName: 'todos',
      schemaRefs: { resolved: false },
      primaryKey: 'id',
    },
    access: defaultAccess,
    hooks: { before: [], after: [] },
    actions: [],
    relations: [],
    sourceFile: 'src/entities.ts',
    sourceLine: 1,
    sourceColumn: 0,
    ...overrides,
  };
}

describe('Feature: Cloudflare build pipeline', () => {
  describe('ManifestBuilder', () => {
    describe('Given a single entity with all access rules defined', () => {
      describe('When building the manifest', () => {
        it('returns a DeploymentManifest with version 1 and target cloudflare', () => {
          const entities = [createTestEntity()];
          const builder = new ManifestBuilder(entities);
          const manifest = builder.build();

          expect(manifest.version).toBe(1);
          expect(manifest.target).toBe('cloudflare');
          expect(typeof manifest.generatedAt).toBe('string');
        });

        it('includes the entity with correct name, table, and operations', () => {
          const entities = [createTestEntity()];
          const builder = new ManifestBuilder(entities);
          const manifest = builder.build();

          expect(manifest.entities).toHaveLength(1);
          expect(manifest.entities[0].name).toBe('todo');
          expect(manifest.entities[0].table).toBe('todos');
          expect(manifest.entities[0].operations).toEqual([
            'list',
            'get',
            'create',
            'update',
            'delete',
          ]);
        });

        it('includes access rules serialized as descriptor types', () => {
          const entities = [createTestEntity()];
          const builder = new ManifestBuilder(entities);
          const manifest = builder.build();

          const entry = manifest.entities[0];
          expect(entry.accessRules.list).toEqual({ type: 'function' });
          expect(entry.accessRules.get).toEqual({ type: 'function' });
        });

        it('includes tenantScoped flag', () => {
          const entities = [createTestEntity({ tenantScoped: true })];
          const builder = new ManifestBuilder(entities);
          const manifest = builder.build();

          expect(manifest.entities[0].tenantScoped).toBe(true);
        });

        it('defaults tenantScoped to false', () => {
          const entities = [createTestEntity()];
          const builder = new ManifestBuilder(entities);
          const manifest = builder.build();

          expect(manifest.entities[0].tenantScoped).toBe(false);
        });
      });
    });

    describe('Given multiple entities', () => {
      describe('When building the manifest', () => {
        it('includes all entities in the manifest', () => {
          const entities = [
            createTestEntity({
              name: 'todo',
              modelRef: {
                variableName: 'todoModel',
                tableName: 'todos',
                schemaRefs: { resolved: false },
              },
            }),
            createTestEntity({
              name: 'user',
              modelRef: {
                variableName: 'userModel',
                tableName: 'users',
                schemaRefs: { resolved: false },
              },
            }),
          ];
          const builder = new ManifestBuilder(entities);
          const manifest = builder.build();

          expect(manifest.entities).toHaveLength(2);
          expect(manifest.entities[0].name).toBe('todo');
          expect(manifest.entities[1].name).toBe('user');
        });
      });
    });

    describe('Given an entity with custom actions', () => {
      describe('When building the manifest', () => {
        it('includes custom action names in operations', () => {
          const entities = [
            createTestEntity({
              actions: [
                {
                  name: 'archive',
                  method: 'POST',
                  sourceFile: 'src/entities.ts',
                  sourceLine: 1,
                  sourceColumn: 0,
                },
              ],
              access: {
                list: 'function',
                get: 'function',
                create: 'function',
                update: 'function',
                delete: 'function',
                custom: { archive: 'function' },
              },
            }),
          ];
          const builder = new ManifestBuilder(entities);
          const manifest = builder.build();

          expect(manifest.entities[0].operations).toContain('archive');
        });
      });
    });

    describe('Given entities', () => {
      describe('When building routes', () => {
        it('generates CRUD routes for each entity', () => {
          const entities = [createTestEntity()];
          const builder = new ManifestBuilder(entities);
          const manifest = builder.build();

          expect(manifest.routes).toContainEqual({
            method: 'GET',
            path: '/api/todo',
            entity: 'todo',
            operation: 'list',
          });
          expect(manifest.routes).toContainEqual({
            method: 'GET',
            path: '/api/todo/:id',
            entity: 'todo',
            operation: 'get',
          });
          expect(manifest.routes).toContainEqual({
            method: 'POST',
            path: '/api/todo',
            entity: 'todo',
            operation: 'create',
          });
          expect(manifest.routes).toContainEqual({
            method: 'PATCH',
            path: '/api/todo/:id',
            entity: 'todo',
            operation: 'update',
          });
          expect(manifest.routes).toContainEqual({
            method: 'DELETE',
            path: '/api/todo/:id',
            entity: 'todo',
            operation: 'delete',
          });
        });
      });
    });

    describe('Given an entity with custom actions', () => {
      describe('When building routes', () => {
        it('generates routes for custom actions', () => {
          const entities = [
            createTestEntity({
              actions: [
                {
                  name: 'archive',
                  method: 'POST',
                  sourceFile: 'src/entities.ts',
                  sourceLine: 1,
                  sourceColumn: 0,
                },
                {
                  name: 'export',
                  method: 'GET',
                  path: 'export-csv',
                  sourceFile: 'src/entities.ts',
                  sourceLine: 2,
                  sourceColumn: 0,
                },
              ],
            }),
          ];
          const builder = new ManifestBuilder(entities);
          const manifest = builder.build();

          expect(manifest.routes).toContainEqual({
            method: 'POST',
            path: '/api/todo/archive',
            entity: 'todo',
            operation: 'archive',
          });
          expect(manifest.routes).toContainEqual({
            method: 'GET',
            path: '/api/todo/export-csv',
            entity: 'todo',
            operation: 'export',
          });
        });
      });
    });

    describe('Given entities with D1 database requirement', () => {
      describe('When building bindings', () => {
        it('includes a D1 binding', () => {
          const entities = [createTestEntity()];
          const builder = new ManifestBuilder(entities);
          const manifest = builder.build();

          expect(manifest.bindings).toContainEqual({
            type: 'd1',
            name: 'DB',
            purpose: 'Primary database',
          });
        });
      });
    });
  });

  describe('WorkerEntryGenerator', () => {
    describe('Given entities with source locations', () => {
      describe('When generating worker entry code', () => {
        it('imports createHandler from @vertz/cloudflare', () => {
          const entities = [createTestEntity({ sourceFile: 'src/entities.ts' })];
          const generator = new WorkerEntryGenerator(entities);
          const code = generator.generate();

          expect(code).toContain("from '@vertz/cloudflare'");
          expect(code).toContain('createHandler');
        });

        it('imports createServer from @vertz/server', () => {
          const entities = [createTestEntity({ sourceFile: 'src/entities.ts' })];
          const generator = new WorkerEntryGenerator(entities);
          const code = generator.generate();

          expect(code).toContain("from '@vertz/server'");
          expect(code).toContain('createServer');
        });

        it('imports createDb from @vertz/db', () => {
          const entities = [createTestEntity({ sourceFile: 'src/entities.ts' })];
          const generator = new WorkerEntryGenerator(entities);
          const code = generator.generate();

          expect(code).toContain("from '@vertz/db'");
          expect(code).toContain('createDb');
        });

        it('imports entity variables from their source files', () => {
          const entities = [createTestEntity({ name: 'todo', sourceFile: 'src/entities.ts' })];
          const generator = new WorkerEntryGenerator(entities);
          const code = generator.generate();

          expect(code).toContain("from '../../../src/entities'");
        });

        it('initializes app once per isolate with lazy init pattern', () => {
          const entities = [createTestEntity()];
          const generator = new WorkerEntryGenerator(entities);
          const code = generator.generate();

          expect(code).toContain('let cachedApp');
          expect(code).toContain('createServer');
        });

        it('exports default using createHandler', () => {
          const entities = [createTestEntity()];
          const generator = new WorkerEntryGenerator(entities);
          const code = generator.generate();

          expect(code).toContain('export default createHandler');
        });

        it('includes ssr fallback for API-only workers', () => {
          const entities = [createTestEntity()];
          const generator = new WorkerEntryGenerator(entities);
          const code = generator.generate();

          expect(code).toContain('ssr:');
          expect(code).toContain('Not Found');
          expect(code).toContain('404');
        });

        it('converts kebab-case entity names to camelCase variable names', () => {
          const entities = [createTestEntity({ name: 'todo-item', sourceFile: 'src/entities.ts' })];
          const generator = new WorkerEntryGenerator(entities);
          const code = generator.generate();

          expect(code).toContain('import { todoItem }');
          expect(code).toContain('entities: [todoItem]');
        });
      });
    });

    describe('Given entities from multiple source files', () => {
      describe('When generating imports', () => {
        it('groups imports by source file', () => {
          const entities = [
            createTestEntity({ name: 'todo', sourceFile: 'src/todo.ts' }),
            createTestEntity({ name: 'user', sourceFile: 'src/user.ts' }),
          ];
          const generator = new WorkerEntryGenerator(entities);
          const code = generator.generate();

          expect(code).toContain("from '../../../src/todo'");
          expect(code).toContain("from '../../../src/user'");
        });
      });
    });

    describe('Given a server entry path', () => {
      describe('When generating worker entry with server entry wrapper', () => {
        it('imports the server module and wraps with createHandler', () => {
          const entities = [createTestEntity()];
          const generator = new WorkerEntryGenerator(entities, '.vertz/build/worker', {
            serverEntry: 'src/api/server.ts',
          });
          const code = generator.generate();

          expect(code).toContain("import app from '../../../src/api/server'");
          expect(code).toContain('export default createHandler(app)');
          expect(code).not.toContain('createServer');
          expect(code).not.toContain('createDb');
        });
      });
    });

    describe('Given standalone mode with model imports', () => {
      describe('When generating worker entry', () => {
        it('imports models from their source and passes to createDb', () => {
          const entities = [
            createTestEntity({
              modelRef: {
                variableName: 'todosModel',
                importSource: 'src/schema.ts',
                tableName: 'todos',
                schemaRefs: { resolved: true },
                primaryKey: 'id',
              },
            }),
          ];
          const generator = new WorkerEntryGenerator(entities);
          const code = generator.generate();

          expect(code).toContain("import { todosModel } from '../../../src/schema'");
          expect(code).toContain('models: { todos: todosModel }');
        });
      });
    });
  });

  describe('WranglerConfigGenerator', () => {
    describe('Given a deployment manifest', () => {
      describe('When generating wrangler.toml', () => {
        it('includes worker name', () => {
          const manifest = new ManifestBuilder([createTestEntity()]).build();
          const generator = new WranglerConfigGenerator(manifest, 'my-app');
          const toml = generator.generate();

          expect(toml).toContain('name = "my-app"');
        });

        it('includes main entry point', () => {
          const manifest = new ManifestBuilder([createTestEntity()]).build();
          const generator = new WranglerConfigGenerator(manifest, 'my-app');
          const toml = generator.generate();

          expect(toml).toContain('main = "index.js"');
        });

        it('includes compatibility date and flags', () => {
          const manifest = new ManifestBuilder([createTestEntity()]).build();
          const generator = new WranglerConfigGenerator(manifest, 'my-app');
          const toml = generator.generate();

          expect(toml).toContain('compatibility_date');
          expect(toml).toContain('nodejs_compat_v2');
        });

        it('includes D1 database binding when manifest has D1 bindings', () => {
          const manifest = new ManifestBuilder([createTestEntity()]).build();
          const generator = new WranglerConfigGenerator(manifest, 'my-app');
          const toml = generator.generate();

          expect(toml).toContain('[[d1_databases]]');
          expect(toml).toContain('binding = "DB"');
          expect(toml).toContain('database_name');
        });
      });
    });

    describe('Given a worker name with special characters', () => {
      describe('When generating wrangler.toml', () => {
        it('sanitizes the worker name to lowercase alphanumeric with hyphens', () => {
          const manifest = new ManifestBuilder([createTestEntity()]).build();
          const generator = new WranglerConfigGenerator(manifest, '@scope/My App_Name');
          const toml = generator.generate();

          expect(toml).toContain('name = "scope-my-app-name"');
        });
      });
    });

    describe('Given a manifest with client assets', () => {
      describe('When generating wrangler.toml', () => {
        it('includes assets configuration', () => {
          const manifest = new ManifestBuilder([createTestEntity()]).build();
          manifest.assets = { hasClient: true, clientDir: 'dist/client' };
          const generator = new WranglerConfigGenerator(manifest, 'my-app');
          const toml = generator.generate();

          expect(toml).toContain('[assets]');
          expect(toml).toContain('dist/client');
        });
      });
    });
  });

  describe('validateAccessRules', () => {
    describe('Given entities where all operations have access rules', () => {
      describe('When validating', () => {
        it('returns no errors', () => {
          const entities = [createTestEntity()];
          const errors = validateAccessRules(entities);

          expect(errors).toHaveLength(0);
        });
      });
    });

    describe('Given an entity with a missing access rule (none)', () => {
      describe('When validating', () => {
        it('returns an error for the missing operation', () => {
          const entities = [
            createTestEntity({
              access: {
                list: 'none',
                get: 'function',
                create: 'function',
                update: 'function',
                delete: 'function',
                custom: {},
              },
            }),
          ];
          const errors = validateAccessRules(entities);

          expect(errors).toHaveLength(1);
          expect(errors[0]).toContain('todo');
          expect(errors[0]).toContain('list');
        });
      });
    });

    describe('Given an entity with multiple missing rules', () => {
      describe('When validating', () => {
        it('returns errors for all missing operations', () => {
          const entities = [
            createTestEntity({
              access: {
                list: 'none',
                get: 'none',
                create: 'function',
                update: 'function',
                delete: 'none',
                custom: {},
              },
            }),
          ];
          const errors = validateAccessRules(entities);

          expect(errors).toHaveLength(3);
        });
      });
    });

    describe('Given an entity with access: false (explicitly denied)', () => {
      describe('When validating', () => {
        it('treats false as a valid rule (explicitly denied access)', () => {
          const entities = [
            createTestEntity({
              access: {
                list: 'false',
                get: 'false',
                create: 'false',
                update: 'false',
                delete: 'false',
                custom: {},
              },
            }),
          ];
          const errors = validateAccessRules(entities);

          expect(errors).toHaveLength(0);
        });
      });
    });
  });
});
