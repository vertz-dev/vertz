/**
 * Feature Flag Store — per-tenant boolean feature flags.
 *
 * Pluggable interface with in-memory default.
 * Used by Layer 1 of access context to gate entitlements on feature flags.
 */

// ============================================================================
// FlagStore Interface
// ============================================================================

export interface FlagStore {
  setFlag(tenantId: string, flag: string, enabled: boolean): void;
  getFlag(tenantId: string, flag: string): boolean;
  getFlags(tenantId: string): Record<string, boolean>;
}

// ============================================================================
// InMemoryFlagStore
// ============================================================================

export class InMemoryFlagStore implements FlagStore {
  private flags = new Map<string, Map<string, boolean>>();

  setFlag(tenantId: string, flag: string, enabled: boolean): void {
    let tenantFlags = this.flags.get(tenantId);
    if (!tenantFlags) {
      tenantFlags = new Map();
      this.flags.set(tenantId, tenantFlags);
    }
    tenantFlags.set(flag, enabled);
  }

  getFlag(tenantId: string, flag: string): boolean {
    return this.flags.get(tenantId)?.get(flag) ?? false;
  }

  getFlags(tenantId: string): Record<string, boolean> {
    const tenantFlags = this.flags.get(tenantId);
    if (!tenantFlags) return {};
    const result: Record<string, boolean> = {};
    for (const [key, value] of tenantFlags) {
      result[key] = value;
    }
    return result;
  }
}
