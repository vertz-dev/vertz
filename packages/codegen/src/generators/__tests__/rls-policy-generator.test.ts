import { describe, expect, it } from '@vertz/test';
import type { CodegenIR } from '../../types';
import { RlsPolicyGenerator } from '../rls-policy-generator';

function createEmptyIR(): CodegenIR {
  return {
    auth: { schemes: [], operations: [] },
    basePath: '/api',
    entities: [],
    modules: [],
    schemas: [],
  };
}

function getPolicyInput(generator: RlsPolicyGenerator, ir: CodegenIR) {
  const files = generator.generate(ir, { outputDir: '.vertz/generated', options: {} });
  const jsonFile = files.find((f) => f.path === 'rls-policies.json');
  expect(jsonFile).toBeDefined();
  return JSON.parse(jsonFile!.content);
}

describe('Feature: RLS policy generation', () => {
  const generator = new RlsPolicyGenerator();

  describe('Given no access or no where clauses and no tenantScoped entities', () => {
    it('Then returns no files when access is undefined', () => {
      const ir = createEmptyIR();
      const files = generator.generate(ir, { outputDir: '.vertz/generated', options: {} });
      expect(files).toEqual([]);
    });

    it('Then returns no files when no where clauses and no tenantScoped entities', () => {
      const ir: CodegenIR = {
        ...createEmptyIR(),
        access: { entities: [], entitlements: ['post:view'], whereClauses: [] },
      };
      const files = generator.generate(ir, { outputDir: '.vertz/generated', options: {} });
      expect(files).toEqual([]);
    });
  });

  describe('Given entity with tenantScoped: true', () => {
    describe('When RLS policies are generated', () => {
      it('Then includes tenant_isolation policy for the table', () => {
        const ir: CodegenIR = {
          ...createEmptyIR(),
          entities: [
            {
              entityName: 'task',
              table: 'tasks',
              tenantScoped: true,
              operations: [],
              actions: [],
            },
          ],
        };
        const input = getPolicyInput(generator, ir);
        expect(input.tables.tasks).toBeDefined();
        expect(input.tables.tasks.enableRls).toBe(true);
        const tenantPolicy = input.tables.tasks.policies.find(
          (p: { name: string }) => p.name === 'tasks_tenant_isolation',
        );
        expect(tenantPolicy).toBeDefined();
        expect(tenantPolicy.using).toContain("current_setting('app.tenant_id')");
        expect(tenantPolicy.for).toBe('ALL');
      });

      it('Then table name comes from entity.table (not inferred from entitlement)', () => {
        const ir: CodegenIR = {
          ...createEmptyIR(),
          entities: [
            {
              entityName: 'task',
              table: 'my_custom_tasks_table',
              tenantScoped: true,
              operations: [],
              actions: [],
            },
          ],
        };
        const input = getPolicyInput(generator, ir);
        expect(input.tables.my_custom_tasks_table).toBeDefined();
        expect(input.tables.my_custom_tasks_table.policies[0].name).toContain(
          'my_custom_tasks_table',
        );
      });
    });
  });

  describe('Given defineAccess with rules.where({ ownerId: rules.user.id })', () => {
    describe('When RLS policies are generated', () => {
      it('Then includes ownership policy with user.id marker', () => {
        const ir: CodegenIR = {
          ...createEmptyIR(),
          entities: [
            {
              entityName: 'task',
              table: 'tasks',
              operations: [],
              actions: [],
            },
          ],
          access: {
            entities: [],
            entitlements: ['task:update'],
            whereClauses: [
              {
                entitlement: 'task:update',
                conditions: [{ kind: 'marker', column: 'ownerId', marker: 'user.id' }],
              },
            ],
          },
        };
        const input = getPolicyInput(generator, ir);
        expect(input.tables.tasks).toBeDefined();
        expect(input.tables.tasks.enableRls).toBe(true);
        const ownerPolicy = input.tables.tasks.policies.find((p: { using: string }) =>
          p.using.includes("current_setting('app.user_id')"),
        );
        expect(ownerPolicy).toBeDefined();
        expect(ownerPolicy.using).toContain('owner_id');
      });
    });
  });

  describe('Given different where rules on list vs update', () => {
    describe('When RLS policies are generated', () => {
      it('Then generates separate per-operation policies (FOR SELECT, FOR UPDATE)', () => {
        const ir: CodegenIR = {
          ...createEmptyIR(),
          entities: [
            {
              entityName: 'task',
              table: 'tasks',
              operations: [],
              actions: [],
            },
          ],
          access: {
            entities: [],
            entitlements: ['task:list', 'task:update'],
            whereClauses: [
              {
                entitlement: 'task:list',
                conditions: [{ kind: 'literal', column: 'archived', value: false }],
              },
              {
                entitlement: 'task:update',
                conditions: [{ kind: 'marker', column: 'ownerId', marker: 'user.id' }],
              },
            ],
          },
        };
        const input = getPolicyInput(generator, ir);
        const policies = input.tables.tasks.policies;
        const selectPolicy = policies.find((p: { for: string }) => p.for === 'SELECT');
        const updatePolicy = policies.find((p: { for: string }) => p.for === 'UPDATE');
        expect(selectPolicy).toBeDefined();
        expect(selectPolicy.using).toContain('"archived" = false');
        expect(updatePolicy).toBeDefined();
        expect(updatePolicy.using).toContain("current_setting('app.user_id')");
      });
    });
  });

  describe('Given tenantScoped entity with explicit where clauses', () => {
    describe('When RLS policies are generated', () => {
      it('Then combines auto tenant isolation with explicit policies', () => {
        const ir: CodegenIR = {
          ...createEmptyIR(),
          entities: [
            {
              entityName: 'task',
              table: 'tasks',
              tenantScoped: true,
              operations: [],
              actions: [],
            },
          ],
          access: {
            entities: [],
            entitlements: ['task:delete'],
            whereClauses: [
              {
                entitlement: 'task:delete',
                conditions: [{ kind: 'marker', column: 'createdBy', marker: 'user.id' }],
              },
            ],
          },
        };
        const input = getPolicyInput(generator, ir);
        const policies = input.tables.tasks.policies;
        // Should have tenant isolation + delete ownership policy
        const tenantPolicy = policies.find(
          (p: { name: string }) => p.name === 'tasks_tenant_isolation',
        );
        const deletePolicy = policies.find((p: { using: string }) =>
          p.using.includes("current_setting('app.user_id')"),
        );
        expect(tenantPolicy).toBeDefined();
        expect(deletePolicy).toBeDefined();
      });
    });
  });

  describe('Given where clause with user.tenantId marker (already covered by auto tenant policy)', () => {
    describe('When RLS policies are generated', () => {
      it('Then deduplicates tenant isolation (no double tenant policy)', () => {
        const ir: CodegenIR = {
          ...createEmptyIR(),
          entities: [
            {
              entityName: 'task',
              table: 'tasks',
              tenantScoped: true,
              operations: [],
              actions: [],
            },
          ],
          access: {
            entities: [],
            entitlements: ['task:list'],
            whereClauses: [
              {
                entitlement: 'task:list',
                conditions: [{ kind: 'marker', column: 'tenantId', marker: 'user.tenantId' }],
              },
            ],
          },
        };
        const input = getPolicyInput(generator, ir);
        const tenantPolicies = input.tables.tasks.policies.filter((p: { using: string }) =>
          p.using.includes("current_setting('app.tenant_id')"),
        );
        // Only one tenant policy, not duplicated
        expect(tenantPolicies).toHaveLength(1);
      });
    });
  });

  describe('Given where clauses with literal conditions', () => {
    describe('When RLS policies are generated', () => {
      it('Then generates policy with literal equality conditions', () => {
        const ir: CodegenIR = {
          ...createEmptyIR(),
          entities: [
            {
              entityName: 'task',
              table: 'tasks',
              operations: [],
              actions: [],
            },
          ],
          access: {
            entities: [],
            entitlements: ['task:list'],
            whereClauses: [
              {
                entitlement: 'task:list',
                conditions: [
                  { kind: 'literal', column: 'archived', value: false },
                  { kind: 'literal', column: 'status', value: 'active' },
                ],
              },
            ],
          },
        };
        const input = getPolicyInput(generator, ir);
        const policy = input.tables.tasks.policies[0];
        expect(policy.using).toContain('"archived" = false');
        expect(policy.using).toContain('"status" = \'active\'');
      });
    });
  });

  describe('Given multiple entitlements with same conditions for same entity', () => {
    describe('When RLS policies are generated', () => {
      it('Then merges into FOR ALL policy', () => {
        const ir: CodegenIR = {
          ...createEmptyIR(),
          entities: [
            {
              entityName: 'task',
              table: 'tasks',
              operations: [],
              actions: [],
            },
          ],
          access: {
            entities: [],
            entitlements: ['task:list', 'task:update', 'task:delete'],
            whereClauses: [
              {
                entitlement: 'task:list',
                conditions: [{ kind: 'marker', column: 'ownerId', marker: 'user.id' }],
              },
              {
                entitlement: 'task:update',
                conditions: [{ kind: 'marker', column: 'ownerId', marker: 'user.id' }],
              },
              {
                entitlement: 'task:delete',
                conditions: [{ kind: 'marker', column: 'ownerId', marker: 'user.id' }],
              },
            ],
          },
        };
        const input = getPolicyInput(generator, ir);
        const policies = input.tables.tasks.policies;
        // Should be merged into one FOR ALL policy, not three separate ones
        const ownerPolicies = policies.filter((p: { using: string }) =>
          p.using.includes("current_setting('app.user_id')"),
        );
        expect(ownerPolicies).toHaveLength(1);
        expect(ownerPolicies[0].for).toBe('ALL');
      });
    });
  });

  describe('Given camelCase column names', () => {
    describe('When RLS policies are generated', () => {
      it('Then converts to snake_case in SQL conditions', () => {
        const ir: CodegenIR = {
          ...createEmptyIR(),
          entities: [
            {
              entityName: 'task',
              table: 'tasks',
              operations: [],
              actions: [],
            },
          ],
          access: {
            entities: [],
            entitlements: ['task:update'],
            whereClauses: [
              {
                entitlement: 'task:update',
                conditions: [{ kind: 'marker', column: 'createdBy', marker: 'user.id' }],
              },
            ],
          },
        };
        const input = getPolicyInput(generator, ir);
        const policy = input.tables.tasks.policies[0];
        expect(policy.using).toContain('created_by');
        expect(policy.using).not.toContain('createdBy');
      });
    });
  });

  describe('Given entitlement with no matching entity in IR', () => {
    describe('When RLS policies are generated', () => {
      it('Then falls back to inferred table name from entitlement', () => {
        const ir: CodegenIR = {
          ...createEmptyIR(),
          access: {
            entities: [],
            entitlements: ['task:update'],
            whereClauses: [
              {
                entitlement: 'task:update',
                conditions: [{ kind: 'marker', column: 'ownerId', marker: 'user.id' }],
              },
            ],
          },
        };
        const input = getPolicyInput(generator, ir);
        // Falls back to inferred table name
        expect(input.tables.tasks).toBeDefined();
      });
    });
  });
});
