/**
 * RLS policy snapshot types for tracking Row Level Security state across migrations.
 */

export interface RlsPolicy {
  name: string;
  for: 'ALL' | 'SELECT' | 'INSERT' | 'UPDATE' | 'DELETE';
  using: string;
  withCheck?: string;
}

export interface RlsTablePolicies {
  rlsEnabled: boolean;
  policies: RlsPolicy[];
}

export interface RlsSnapshot {
  version: 1;
  tables: Record<string, RlsTablePolicies>;
}

/**
 * Input type for the migration system — produced by codegen, consumed by migrateDev().
 */
export interface RlsPolicyInput {
  tables: Record<
    string,
    {
      enableRls: true;
      policies: RlsPolicy[];
    }
  >;
}
