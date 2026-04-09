/**
 * Production Constraint Enforcement Tests
 *
 * Tests for validating production constraints at server startup time:
 * - Access rule validation (hard error for missing rules)
 * - --allow-open-access escape hatch
 * - Startup diagnostics logging
 */

import { describe, expect, it } from '@vertz/test';
import type { EntityAccessIR, EntityIR } from '@vertz/compiler';
import { formatStartupDiagnostics, validateProductionConstraints } from '../production-constraints';

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

describe('Feature: Production mode constraints', () => {
  describe('validateProductionConstraints', () => {
    describe('Given an app where all entities have access rules defined', () => {
      describe('When validating for production', () => {
        it('returns no errors', () => {
          const entities = [createTestEntity()];
          const result = validateProductionConstraints(entities);
          expect(result.errors).toHaveLength(0);
        });
      });
    });

    describe('Given an entity with missing access rules (none)', () => {
      describe('When validating for production', () => {
        it('returns errors listing the missing operations', () => {
          const entities = [
            createTestEntity({
              access: {
                list: 'none',
                get: 'function',
                create: 'none',
                update: 'function',
                delete: 'function',
                custom: {},
              },
            }),
          ];
          const result = validateProductionConstraints(entities);
          expect(result.errors.length).toBeGreaterThan(0);
          expect(result.errors[0]).toContain('todo');
          expect(result.errors[0]).toContain('list');
        });
      });
    });

    describe('Given an entity with explicitly denied access (false)', () => {
      describe('When validating for production', () => {
        it('treats false as a valid rule', () => {
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
          const result = validateProductionConstraints(entities);
          expect(result.errors).toHaveLength(0);
        });
      });
    });

    describe('Given allowOpenAccess is true', () => {
      describe('When entities have missing access rules', () => {
        it('returns warnings instead of errors', () => {
          const entities = [
            createTestEntity({
              access: {
                list: 'none',
                get: 'function',
                create: 'none',
                update: 'function',
                delete: 'function',
                custom: {},
              },
            }),
          ];
          const result = validateProductionConstraints(entities, {
            allowOpenAccess: true,
          });
          expect(result.errors).toHaveLength(0);
          expect(result.warnings.length).toBeGreaterThan(0);
          expect(result.warnings[0]).toContain('todo');
        });
      });
    });

    describe('Given multiple entities with various access issues', () => {
      describe('When validating for production', () => {
        it('returns errors for all entities with missing rules', () => {
          const entities = [
            createTestEntity({
              name: 'todo',
              access: {
                list: 'none',
                get: 'function',
                create: 'function',
                update: 'function',
                delete: 'function',
                custom: {},
              },
            }),
            createTestEntity({
              name: 'user',
              access: {
                list: 'function',
                get: 'function',
                create: 'none',
                update: 'none',
                delete: 'none',
                custom: {},
              },
            }),
          ];
          const result = validateProductionConstraints(entities);
          expect(result.errors.length).toBe(4); // 1 from todo + 3 from user
        });
      });
    });
  });

  describe('formatStartupDiagnostics', () => {
    describe('Given entities with various configurations', () => {
      describe('When formatting diagnostics', () => {
        it('includes entity count', () => {
          const entities = [createTestEntity()];
          const diagnostics = formatStartupDiagnostics(entities);
          expect(diagnostics).toContain('1');
        });

        it('includes entity names', () => {
          const entities = [createTestEntity({ name: 'todo' }), createTestEntity({ name: 'user' })];
          const diagnostics = formatStartupDiagnostics(entities);
          expect(diagnostics).toContain('todo');
          expect(diagnostics).toContain('user');
        });

        it('includes tenant scoping info', () => {
          const entities = [createTestEntity({ tenantScoped: true })];
          const diagnostics = formatStartupDiagnostics(entities);
          expect(diagnostics).toContain('tenant');
        });

        it('includes route count', () => {
          const entities = [createTestEntity()];
          const diagnostics = formatStartupDiagnostics(entities);
          // 5 CRUD routes
          expect(diagnostics).toContain('5');
        });
      });
    });
  });
});
