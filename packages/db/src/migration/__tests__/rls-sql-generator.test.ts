import { describe, expect, it } from '@vertz/test';
import type { RlsDiffChange } from '../rls-differ';
import { generateRlsMigrationSql } from '../rls-sql-generator';

describe('Feature: RLS SQL generation', () => {
  describe('Given RLS diff changes', () => {
    describe('When generateRlsMigrationSql() is called', () => {
      it('Then generates ALTER TABLE ... ENABLE ROW LEVEL SECURITY for new tables', () => {
        const changes: RlsDiffChange[] = [{ type: 'rls_enabled', table: 'tasks' }];

        const sql = generateRlsMigrationSql(changes);
        expect(sql).toContain('ALTER TABLE "tasks" ENABLE ROW LEVEL SECURITY;');
      });

      it('Then generates CREATE POLICY with correct USING clause', () => {
        const changes: RlsDiffChange[] = [
          {
            type: 'policy_added',
            table: 'tasks',
            policy: {
              name: 'tasks_tenant_isolation',
              for: 'ALL',
              using: "tenant_id = current_setting('app.tenant_id')::UUID",
            },
          },
        ];

        const sql = generateRlsMigrationSql(changes);
        expect(sql).toContain('CREATE POLICY "tasks_tenant_isolation" ON "tasks" FOR ALL');
        expect(sql).toContain("USING (tenant_id = current_setting('app.tenant_id')::UUID);");
      });

      it('Then generates DROP POLICY for removed policies', () => {
        const changes: RlsDiffChange[] = [
          {
            type: 'policy_removed',
            table: 'tasks',
            policy: {
              name: 'tasks_tenant_isolation',
              for: 'ALL',
              using: "tenant_id = current_setting('app.tenant_id')::UUID",
            },
          },
        ];

        const sql = generateRlsMigrationSql(changes);
        expect(sql).toContain('DROP POLICY "tasks_tenant_isolation" ON "tasks";');
      });

      it('Then generates ALTER TABLE ... DISABLE ROW LEVEL SECURITY when all policies removed', () => {
        const changes: RlsDiffChange[] = [{ type: 'rls_disabled', table: 'tasks' }];

        const sql = generateRlsMigrationSql(changes);
        expect(sql).toContain('ALTER TABLE "tasks" DISABLE ROW LEVEL SECURITY;');
      });

      it('Then generates DROP + CREATE for changed policies', () => {
        const changes: RlsDiffChange[] = [
          {
            type: 'policy_changed',
            table: 'tasks',
            policy: {
              name: 'tasks_tenant_isolation',
              for: 'ALL',
              using: "tenant_id = current_setting('app.tenant_id')::UUID AND active = true",
            },
            oldPolicy: {
              name: 'tasks_tenant_isolation',
              for: 'ALL',
              using: "tenant_id = current_setting('app.tenant_id')::UUID",
            },
          },
        ];

        const sql = generateRlsMigrationSql(changes);
        expect(sql).toContain('DROP POLICY "tasks_tenant_isolation" ON "tasks";');
        expect(sql).toContain('CREATE POLICY "tasks_tenant_isolation" ON "tasks" FOR ALL');
        expect(sql).toContain('AND active = true');
        // DROP must come before CREATE
        const dropIdx = sql.indexOf('DROP POLICY');
        const createIdx = sql.indexOf('CREATE POLICY');
        expect(dropIdx).toBeLessThan(createIdx);
      });

      it('Then generates CREATE POLICY with WITH CHECK when provided', () => {
        const changes: RlsDiffChange[] = [
          {
            type: 'policy_added',
            table: 'tasks',
            policy: {
              name: 'tasks_insert_check',
              for: 'INSERT',
              using: "tenant_id = current_setting('app.tenant_id')::UUID",
              withCheck: "tenant_id = current_setting('app.tenant_id')::UUID",
            },
          },
        ];

        const sql = generateRlsMigrationSql(changes);
        expect(sql).toContain('FOR INSERT');
        expect(sql).toContain('WITH CHECK');
      });

      it('Then returns empty string when no changes', () => {
        const sql = generateRlsMigrationSql([]);
        expect(sql).toBe('');
      });
    });
  });
});
