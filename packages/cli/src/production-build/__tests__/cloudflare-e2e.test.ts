/**
 * Cloudflare E2E Integration Tests
 *
 * Tests the full build → manifest → deploy pipeline integration:
 * - ManifestBuilder produces valid manifest consumed by deploy
 * - WorkerEntryGenerator output is valid JavaScript structure
 * - WranglerConfigGenerator produces valid TOML structure
 * - Deploy module validates manifest correctly
 * - Production constraints integrate with entity analysis
 */

import { describe, expect, it } from '@vertz/test';
import type { EntityAccessIR, EntityActionIR, EntityIR } from '@vertz/compiler';
import { ManifestBuilder } from '../cloudflare/manifest-builder';
import { WorkerEntryGenerator } from '../cloudflare/worker-entry-generator';
import { WranglerConfigGenerator } from '../cloudflare/wrangler-config-generator';
import { validateAccessRules } from '../cloudflare/validate-access-rules';
import {
  type CloudflareDeployOptions,
  deployCloudflare,
  validateManifest,
} from '../../deploy/cloudflare';
import { formatStartupDiagnostics, validateProductionConstraints } from '../production-constraints';

// Simulate a "todo" entity like the entity-todo example
function createTodoEntity(): EntityIR {
  const access: EntityAccessIR = {
    list: 'function',
    get: 'function',
    create: 'function',
    update: 'function',
    delete: 'function',
    custom: { archive: 'function' },
  };

  const archiveAction: EntityActionIR = {
    name: 'archive',
    method: 'POST',
    sourceFile: 'src/entities/todo.ts',
    sourceLine: 45,
    sourceColumn: 2,
  };

  return {
    name: 'todo',
    modelRef: {
      variableName: 'todoModel',
      importSource: '@vertz/db',
      tableName: 'todos',
      schemaRefs: { resolved: true },
      primaryKey: 'id',
    },
    access,
    hooks: { before: ['create', 'update'], after: ['delete'] },
    actions: [archiveAction],
    relations: [],
    tenantScoped: false,
    sourceFile: 'src/entities/todo.ts',
    sourceLine: 10,
    sourceColumn: 0,
  };
}

describe('Feature: Entity-todo E2E deployment pipeline', () => {
  describe('Given the entity-todo example with a Todo entity', () => {
    const todoEntity = createTodoEntity();
    const entities = [todoEntity];

    describe('When building the manifest (ManifestBuilder)', () => {
      const builder = new ManifestBuilder(entities);
      const manifest = builder.build();

      it('produces a valid manifest with version 1 and target cloudflare', () => {
        expect(manifest.version).toBe(1);
        expect(manifest.target).toBe('cloudflare');
      });

      it('includes the todo entity with all CRUD + custom operations', () => {
        expect(manifest.entities).toHaveLength(1);
        expect(manifest.entities[0].name).toBe('todo');
        expect(manifest.entities[0].table).toBe('todos');
        expect(manifest.entities[0].operations).toContain('list');
        expect(manifest.entities[0].operations).toContain('archive');
      });

      it('generates 5 CRUD routes + 1 custom action route', () => {
        expect(manifest.routes).toHaveLength(6);
        expect(manifest.routes).toContainEqual({
          method: 'GET',
          path: '/api/todo',
          entity: 'todo',
          operation: 'list',
        });
        expect(manifest.routes).toContainEqual({
          method: 'POST',
          path: '/api/todo/archive',
          entity: 'todo',
          operation: 'archive',
        });
      });

      it('includes D1 binding', () => {
        expect(manifest.bindings).toContainEqual({
          type: 'd1',
          name: 'DB',
          purpose: 'Primary database',
        });
      });

      it('is consumable by the deploy module (validateManifest)', () => {
        const result = validateManifest(manifest);
        expect(result.ok).toBe(true);
      });
    });

    describe('When generating worker entry (WorkerEntryGenerator)', () => {
      const generator = new WorkerEntryGenerator(entities);
      const code = generator.generate();

      it('generates valid import statements', () => {
        expect(code).toContain("import { createHandler } from '@vertz/cloudflare'");
        expect(code).toContain("import { createServer } from '@vertz/server'");
        expect(code).toContain("import { createDb } from '@vertz/db'");
        expect(code).toContain("import { todo } from '");
      });

      it('generates a createHandler export with lazy init', () => {
        expect(code).toContain('export default createHandler');
        expect(code).toContain('let cachedApp');
        expect(code).toContain('initApp(env)');
        expect(code).toContain('createDb({ models:');
        expect(code).toContain('d1: env.DB');
      });

      it('includes SSR fallback for API-only deployment', () => {
        expect(code).toContain('ssr:');
        expect(code).toContain('404');
      });

      it('passes entities array to createServer', () => {
        expect(code).toContain('entities: [todo]');
      });
    });

    describe('When generating wrangler config (WranglerConfigGenerator)', () => {
      const builder = new ManifestBuilder(entities);
      const manifest = builder.build();
      const generator = new WranglerConfigGenerator(manifest, 'entity-todo');
      const toml = generator.generate();

      it('generates valid TOML with worker name', () => {
        expect(toml).toContain('name = "entity-todo"');
      });

      it('includes D1 database binding', () => {
        expect(toml).toContain('[[d1_databases]]');
        expect(toml).toContain('binding = "DB"');
        expect(toml).toContain('database_name = "entity-todo-db"');
      });

      it('includes compatibility flags', () => {
        expect(toml).toContain('compatibility_flags = ["nodejs_compat_v2"]');
      });
    });

    describe('When validating access rules', () => {
      it('passes validation when all rules are defined', () => {
        const errors = validateAccessRules(entities);
        expect(errors).toHaveLength(0);
      });
    });

    describe('When validating production constraints', () => {
      it('passes production validation', () => {
        const result = validateProductionConstraints(entities);
        expect(result.errors).toHaveLength(0);
        expect(result.warnings).toHaveLength(0);
      });
    });

    describe('When formatting startup diagnostics', () => {
      it('shows 1 entity, 6 routes (5 CRUD + 1 custom)', () => {
        const diagnostics = formatStartupDiagnostics(entities);
        expect(diagnostics).toContain('1');
        expect(diagnostics).toContain('6');
        expect(diagnostics).toContain('todo');
      });
    });

    describe('When running deploy --dry-run', () => {
      it('shows deployment plan with entity and binding info', async () => {
        const builder = new ManifestBuilder(entities);
        const manifest = builder.build();
        const options: CloudflareDeployOptions = {
          projectRoot: '/tmp/test',
          dryRun: true,
          _testManifest: manifest,
        };
        const result = await deployCloudflare(options);
        expect(result.ok).toBe(true);
        if (result.ok) {
          expect(result.value.dryRun).toBe(true);
          expect(result.value.plan).toContain('todo');
          expect(result.value.plan).toContain('D1');
          expect(result.value.plan).toContain('DB');
        }
      });
    });

    describe('When running deploy without prior build', () => {
      it('fails with helpful error message', async () => {
        const options: CloudflareDeployOptions = {
          projectRoot: '/tmp/nonexistent-project-12345',
          dryRun: false,
        };
        const result = await deployCloudflare(options);
        expect(result.ok).toBe(false);
        if (!result.ok) {
          expect(result.error.message).toContain('No deployment manifest found');
          expect(result.error.message).toContain('vertz build --target cloudflare');
        }
      });
    });
  });

  describe('Given an entity with missing access rules', () => {
    it('build-time validation catches missing rules', () => {
      const entity = createTodoEntity();
      entity.access.list = 'none';
      entity.access.create = 'none';

      const buildErrors = validateAccessRules([entity]);
      expect(buildErrors).toHaveLength(2);
      expect(buildErrors[0]).toContain('todo');
      expect(buildErrors[0]).toContain('list');
    });

    it('production constraints also catch missing rules', () => {
      const entity = createTodoEntity();
      entity.access.list = 'none';

      const result = validateProductionConstraints([entity]);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain('list');
    });

    it('--allow-open-access downgrades to warnings', () => {
      const entity = createTodoEntity();
      entity.access.list = 'none';

      const result = validateProductionConstraints([entity], {
        allowOpenAccess: true,
      });
      expect(result.errors).toHaveLength(0);
      expect(result.warnings).toHaveLength(1);
    });
  });
});
