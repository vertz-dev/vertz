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
  setFlag(orgId: string, flag: string, enabled: boolean): void;
  getFlag(orgId: string, flag: string): boolean;
  getFlags(orgId: string): Record<string, boolean>;
}

// ============================================================================
// InMemoryFlagStore
// ============================================================================

export class InMemoryFlagStore implements FlagStore {
  private flags = new Map<string, Map<string, boolean>>();

  setFlag(orgId: string, flag: string, enabled: boolean): void {
    let orgFlags = this.flags.get(orgId);
    if (!orgFlags) {
      orgFlags = new Map();
      this.flags.set(orgId, orgFlags);
    }
    orgFlags.set(flag, enabled);
  }

  getFlag(orgId: string, flag: string): boolean {
    return this.flags.get(orgId)?.get(flag) ?? false;
  }

  getFlags(orgId: string): Record<string, boolean> {
    const orgFlags = this.flags.get(orgId);
    if (!orgFlags) return {};
    const result: Record<string, boolean> = {};
    for (const [key, value] of orgFlags) {
      result[key] = value;
    }
    return result;
  }
}
