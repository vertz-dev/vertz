import type { RlsDiffChange } from './rls-differ';

/**
 * Generates migration SQL from RLS diff changes.
 *
 * Ordering: ENABLE RLS → DROP old policies → CREATE new policies → DISABLE RLS
 * This ensures clean transitions when policies change.
 */
export function generateRlsMigrationSql(changes: RlsDiffChange[]): string {
  if (changes.length === 0) return '';

  const lines: string[] = [];

  // 1. ENABLE RLS for new tables
  for (const change of changes) {
    if (change.type === 'rls_enabled') {
      lines.push(`ALTER TABLE "${change.table}" ENABLE ROW LEVEL SECURITY;`);
    }
  }

  // 2. DROP removed and old (changed) policies
  for (const change of changes) {
    if (change.type === 'policy_removed' && change.policy) {
      lines.push(`DROP POLICY "${change.policy.name}" ON "${change.table}";`);
    }
    if (change.type === 'policy_changed' && change.oldPolicy) {
      lines.push(`DROP POLICY "${change.oldPolicy.name}" ON "${change.table}";`);
    }
  }

  // 3. CREATE added and new (changed) policies
  for (const change of changes) {
    if ((change.type === 'policy_added' || change.type === 'policy_changed') && change.policy) {
      let stmt = `CREATE POLICY "${change.policy.name}" ON "${change.table}" FOR ${change.policy.for}`;
      stmt += `\n  USING (${change.policy.using})`;
      if (change.policy.withCheck) {
        stmt += `\n  WITH CHECK (${change.policy.withCheck})`;
      }
      stmt += ';';
      lines.push(stmt);
    }
  }

  // 4. DISABLE RLS for tables that lost all policies
  for (const change of changes) {
    if (change.type === 'rls_disabled') {
      lines.push(`ALTER TABLE "${change.table}" DISABLE ROW LEVEL SECURITY;`);
    }
  }

  return lines.join('\n\n');
}
