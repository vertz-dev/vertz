import type { RlsSnapshot } from './rls-snapshot';

export type RlsDiffChangeType =
  | 'rls_enabled'
  | 'rls_disabled'
  | 'policy_added'
  | 'policy_removed'
  | 'policy_changed';

export interface RlsDiffChange {
  type: RlsDiffChangeType;
  table: string;
  policy?: {
    name: string;
    for: string;
    using: string;
    withCheck?: string;
  };
  oldPolicy?: {
    name: string;
    for: string;
    using: string;
    withCheck?: string;
  };
}

export function diffRlsPolicies(before: RlsSnapshot, after: RlsSnapshot): RlsDiffChange[] {
  const changes: RlsDiffChange[] = [];

  // Tables in after but not in before (or RLS newly enabled)
  for (const [tableName, afterTable] of Object.entries(after.tables)) {
    const beforeTable = before.tables[tableName];
    const wasEnabled = beforeTable?.rlsEnabled ?? false;

    if (!wasEnabled && afterTable.rlsEnabled) {
      changes.push({ type: 'rls_enabled', table: tableName });
    } else if (wasEnabled && !afterTable.rlsEnabled) {
      // RLS explicitly disabled while table entry still exists
      for (const policy of beforeTable?.policies ?? []) {
        changes.push({
          type: 'policy_removed',
          table: tableName,
          policy: {
            name: policy.name,
            for: policy.for,
            using: policy.using,
            withCheck: policy.withCheck,
          },
        });
      }
      changes.push({ type: 'rls_disabled', table: tableName });
      continue; // Skip policy diffing — all policies removed
    }

    const beforePolicies = beforeTable?.policies ?? [];
    const beforeByName = new Map(beforePolicies.map((p) => [p.name, p]));
    const afterByName = new Map(afterTable.policies.map((p) => [p.name, p]));

    // Policies added
    for (const [name, policy] of afterByName) {
      if (!beforeByName.has(name)) {
        changes.push({
          type: 'policy_added',
          table: tableName,
          policy: {
            name: policy.name,
            for: policy.for,
            using: policy.using,
            withCheck: policy.withCheck,
          },
        });
      }
    }

    // Policies removed
    for (const [name, policy] of beforeByName) {
      if (!afterByName.has(name)) {
        changes.push({
          type: 'policy_removed',
          table: tableName,
          policy: {
            name: policy.name,
            for: policy.for,
            using: policy.using,
            withCheck: policy.withCheck,
          },
        });
      }
    }

    // Policies changed (same name, different content)
    for (const [name, afterPolicy] of afterByName) {
      const beforePolicy = beforeByName.get(name);
      if (!beforePolicy) continue;

      if (
        beforePolicy.for !== afterPolicy.for ||
        beforePolicy.using !== afterPolicy.using ||
        beforePolicy.withCheck !== afterPolicy.withCheck
      ) {
        changes.push({
          type: 'policy_changed',
          table: tableName,
          policy: {
            name: afterPolicy.name,
            for: afterPolicy.for,
            using: afterPolicy.using,
            withCheck: afterPolicy.withCheck,
          },
          oldPolicy: {
            name: beforePolicy.name,
            for: beforePolicy.for,
            using: beforePolicy.using,
            withCheck: beforePolicy.withCheck,
          },
        });
      }
    }
  }

  // Tables in before but not in after (RLS disabled, policies removed)
  for (const [tableName, beforeTable] of Object.entries(before.tables)) {
    if (after.tables[tableName]) continue;

    if (beforeTable.rlsEnabled) {
      // Remove all policies first
      for (const policy of beforeTable.policies) {
        changes.push({
          type: 'policy_removed',
          table: tableName,
          policy: {
            name: policy.name,
            for: policy.for,
            using: policy.using,
            withCheck: policy.withCheck,
          },
        });
      }
      changes.push({ type: 'rls_disabled', table: tableName });
    }
  }

  return changes;
}
