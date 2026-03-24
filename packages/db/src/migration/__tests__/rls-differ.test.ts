import { describe, expect, it } from 'bun:test';
import { diffRlsPolicies } from '../rls-differ';
import type { RlsSnapshot } from '../rls-snapshot';

describe('Feature: RLS policy diffing', () => {
  describe('Given no previous RLS snapshot and a current snapshot with tenant policy', () => {
    describe('When diffRlsPolicies() is called', () => {
      it('Then returns rls_enabled change for the table', () => {
        const previous: RlsSnapshot = { version: 1, tables: {} };
        const current: RlsSnapshot = {
          version: 1,
          tables: {
            tasks: {
              rlsEnabled: true,
              policies: [
                {
                  name: 'tasks_tenant_isolation',
                  for: 'ALL',
                  using: "tenant_id = current_setting('app.tenant_id')::UUID",
                },
              ],
            },
          },
        };

        const changes = diffRlsPolicies(previous, current);
        const rlsEnabledChange = changes.find(
          (c) => c.type === 'rls_enabled' && c.table === 'tasks',
        );
        expect(rlsEnabledChange).toBeDefined();
      });

      it('Then returns policy_added change with correct policy definition', () => {
        const previous: RlsSnapshot = { version: 1, tables: {} };
        const current: RlsSnapshot = {
          version: 1,
          tables: {
            tasks: {
              rlsEnabled: true,
              policies: [
                {
                  name: 'tasks_tenant_isolation',
                  for: 'ALL',
                  using: "tenant_id = current_setting('app.tenant_id')::UUID",
                },
              ],
            },
          },
        };

        const changes = diffRlsPolicies(previous, current);
        const policyAdded = changes.find((c) => c.type === 'policy_added' && c.table === 'tasks');
        expect(policyAdded).toBeDefined();
        expect(policyAdded?.policy).toEqual({
          name: 'tasks_tenant_isolation',
          for: 'ALL',
          using: "tenant_id = current_setting('app.tenant_id')::UUID",
        });
      });
    });
  });

  describe('Given previous and current snapshots with same policies', () => {
    describe('When diffRlsPolicies() is called', () => {
      it('Then returns empty changes array', () => {
        const snapshot: RlsSnapshot = {
          version: 1,
          tables: {
            tasks: {
              rlsEnabled: true,
              policies: [
                {
                  name: 'tasks_tenant_isolation',
                  for: 'ALL',
                  using: "tenant_id = current_setting('app.tenant_id')::UUID",
                },
              ],
            },
          },
        };

        const changes = diffRlsPolicies(snapshot, snapshot);
        expect(changes).toEqual([]);
      });
    });
  });

  describe('Given previous snapshot with policy removed in current', () => {
    describe('When diffRlsPolicies() is called', () => {
      it('Then returns policy_removed change', () => {
        const previous: RlsSnapshot = {
          version: 1,
          tables: {
            tasks: {
              rlsEnabled: true,
              policies: [
                {
                  name: 'tasks_tenant_isolation',
                  for: 'ALL',
                  using: "tenant_id = current_setting('app.tenant_id')::UUID",
                },
              ],
            },
          },
        };
        const current: RlsSnapshot = {
          version: 1,
          tables: {
            tasks: {
              rlsEnabled: true,
              policies: [],
            },
          },
        };

        const changes = diffRlsPolicies(previous, current);
        const removed = changes.find((c) => c.type === 'policy_removed');
        expect(removed).toBeDefined();
        expect(removed?.table).toBe('tasks');
        expect(removed?.policy?.name).toBe('tasks_tenant_isolation');
      });
    });
  });

  describe('Given policy with changed USING clause', () => {
    describe('When diffRlsPolicies() is called', () => {
      it('Then returns policy_changed change (drop + create)', () => {
        const previous: RlsSnapshot = {
          version: 1,
          tables: {
            tasks: {
              rlsEnabled: true,
              policies: [
                {
                  name: 'tasks_tenant_isolation',
                  for: 'ALL',
                  using: "tenant_id = current_setting('app.tenant_id')::UUID",
                },
              ],
            },
          },
        };
        const current: RlsSnapshot = {
          version: 1,
          tables: {
            tasks: {
              rlsEnabled: true,
              policies: [
                {
                  name: 'tasks_tenant_isolation',
                  for: 'ALL',
                  using: "tenant_id = current_setting('app.tenant_id')::UUID AND active = true",
                },
              ],
            },
          },
        };

        const changes = diffRlsPolicies(previous, current);
        const changed = changes.find((c) => c.type === 'policy_changed');
        expect(changed).toBeDefined();
        expect(changed?.table).toBe('tasks');
        expect(changed?.policy?.using).toContain('AND active = true');
        expect(changed?.oldPolicy?.using).not.toContain('AND active = true');
      });
    });
  });

  describe('Given policy with changed withCheck clause', () => {
    describe('When diffRlsPolicies() is called', () => {
      it('Then returns policy_changed change', () => {
        const previous: RlsSnapshot = {
          version: 1,
          tables: {
            tasks: {
              rlsEnabled: true,
              policies: [
                {
                  name: 'tasks_insert_policy',
                  for: 'INSERT',
                  using: 'true',
                  withCheck: "tenant_id = current_setting('app.tenant_id')::UUID",
                },
              ],
            },
          },
        };
        const current: RlsSnapshot = {
          version: 1,
          tables: {
            tasks: {
              rlsEnabled: true,
              policies: [
                {
                  name: 'tasks_insert_policy',
                  for: 'INSERT',
                  using: 'true',
                  withCheck: "tenant_id = current_setting('app.tenant_id')::UUID AND active = true",
                },
              ],
            },
          },
        };

        const changes = diffRlsPolicies(previous, current);
        const changed = changes.find((c) => c.type === 'policy_changed');
        expect(changed).toBeDefined();
        expect(changed?.policy?.withCheck).toContain('AND active = true');
      });
    });
  });

  describe('Given policy with changed FOR clause', () => {
    describe('When diffRlsPolicies() is called', () => {
      it('Then returns policy_changed change', () => {
        const previous: RlsSnapshot = {
          version: 1,
          tables: {
            tasks: {
              rlsEnabled: true,
              policies: [
                {
                  name: 'tasks_policy',
                  for: 'SELECT',
                  using: "tenant_id = current_setting('app.tenant_id')::UUID",
                },
              ],
            },
          },
        };
        const current: RlsSnapshot = {
          version: 1,
          tables: {
            tasks: {
              rlsEnabled: true,
              policies: [
                {
                  name: 'tasks_policy',
                  for: 'ALL',
                  using: "tenant_id = current_setting('app.tenant_id')::UUID",
                },
              ],
            },
          },
        };

        const changes = diffRlsPolicies(previous, current);
        const changed = changes.find((c) => c.type === 'policy_changed');
        expect(changed).toBeDefined();
        expect(changed?.policy?.for).toBe('ALL');
        expect(changed?.oldPolicy?.for).toBe('SELECT');
      });
    });
  });

  describe('Given RLS disabled in current (table entry present with rlsEnabled: false)', () => {
    describe('When diffRlsPolicies() is called', () => {
      it('Then returns policy_removed changes followed by rls_disabled', () => {
        const previous: RlsSnapshot = {
          version: 1,
          tables: {
            tasks: {
              rlsEnabled: true,
              policies: [
                {
                  name: 'tasks_tenant_isolation',
                  for: 'ALL',
                  using: "tenant_id = current_setting('app.tenant_id')::UUID",
                },
                {
                  name: 'tasks_owner_policy',
                  for: 'UPDATE',
                  using: "created_by = current_setting('app.user_id')::UUID",
                  withCheck: "created_by = current_setting('app.user_id')::UUID",
                },
              ],
            },
          },
        };
        const current: RlsSnapshot = {
          version: 1,
          tables: {
            tasks: {
              rlsEnabled: false,
              policies: [],
            },
          },
        };

        const changes = diffRlsPolicies(previous, current);

        const removedPolicies = changes.filter(
          (c) => c.type === 'policy_removed' && c.table === 'tasks',
        );
        expect(removedPolicies).toHaveLength(2);
        expect(removedPolicies[0]?.policy?.name).toBe('tasks_tenant_isolation');
        expect(removedPolicies[1]?.policy?.name).toBe('tasks_owner_policy');
        expect(removedPolicies[1]?.policy?.withCheck).toBe(
          "created_by = current_setting('app.user_id')::UUID",
        );

        const disabled = changes.find((c) => c.type === 'rls_disabled' && c.table === 'tasks');
        expect(disabled).toBeDefined();

        // rls_disabled should come after policy_removed
        const disabledIdx = disabled ? changes.indexOf(disabled) : -1;
        const lastRemovedIdx = removedPolicies[1] ? changes.indexOf(removedPolicies[1]) : -1;
        expect(disabledIdx).toBeGreaterThan(lastRemovedIdx);
      });
    });
  });

  describe('Given RLS disabled in current (all policies removed, table entry removed)', () => {
    describe('When diffRlsPolicies() is called', () => {
      it('Then returns rls_disabled change', () => {
        const previous: RlsSnapshot = {
          version: 1,
          tables: {
            tasks: {
              rlsEnabled: true,
              policies: [
                {
                  name: 'tasks_tenant_isolation',
                  for: 'ALL',
                  using: "tenant_id = current_setting('app.tenant_id')::UUID",
                },
              ],
            },
          },
        };
        const current: RlsSnapshot = { version: 1, tables: {} };

        const changes = diffRlsPolicies(previous, current);
        const disabled = changes.find((c) => c.type === 'rls_disabled' && c.table === 'tasks');
        expect(disabled).toBeDefined();
        const removed = changes.find((c) => c.type === 'policy_removed' && c.table === 'tasks');
        expect(removed).toBeDefined();
      });
    });
  });
});
