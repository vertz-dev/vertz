/**
 * Feature Flag Store — per-resource boolean feature flags.
 *
 * Pluggable interface with in-memory default.
 * Used by Layer 1 of access context to gate entitlements on feature flags.
 */

// ============================================================================
// FlagStore Interface
// ============================================================================

export interface FlagStore {
  setFlag(resourceType: string, resourceId: string, flag: string, enabled: boolean): void;
  getFlag(resourceType: string, resourceId: string, flag: string): boolean;
  getFlags(resourceType: string, resourceId: string): Record<string, boolean>;
}

// ============================================================================
// InMemoryFlagStore
// ============================================================================

export class InMemoryFlagStore implements FlagStore {
  private flags = new Map<string, Map<string, boolean>>();

  private key(resourceType: string, resourceId: string): string {
    return `${resourceType}:${resourceId}`;
  }

  setFlag(resourceType: string, resourceId: string, flag: string, enabled: boolean): void {
    const k = this.key(resourceType, resourceId);
    let resourceFlags = this.flags.get(k);
    if (!resourceFlags) {
      resourceFlags = new Map();
      this.flags.set(k, resourceFlags);
    }
    resourceFlags.set(flag, enabled);
  }

  getFlag(resourceType: string, resourceId: string, flag: string): boolean {
    return this.flags.get(this.key(resourceType, resourceId))?.get(flag) ?? false;
  }

  getFlags(resourceType: string, resourceId: string): Record<string, boolean> {
    const resourceFlags = this.flags.get(this.key(resourceType, resourceId));
    if (!resourceFlags) return {};
    const result: Record<string, boolean> = {};
    for (const [key, value] of resourceFlags) {
      result[key] = value;
    }
    return result;
  }
}
