/**
 * Grandfathering Store — tracks which tenants are grandfathered on old plan versions.
 *
 * When a plan version changes, existing tenants keep their old version
 * during a grace period. This store tracks that state.
 */

// ============================================================================
// Types
// ============================================================================

export interface GrandfatheringState {
  tenantId: string;
  planId: string;
  version: number;
  graceEnds: Date | null; // null = indefinite
}

export interface GrandfatheringStore {
  /** Mark a tenant as grandfathered on a specific plan version. */
  setGrandfathered(
    tenantId: string,
    planId: string,
    version: number,
    graceEnds: Date | null,
  ): Promise<void>;
  /** Get grandfathering state for a tenant on a plan. Returns null if not grandfathered. */
  getGrandfathered(tenantId: string, planId: string): Promise<GrandfatheringState | null>;
  /** List all grandfathered tenants for a plan. */
  listGrandfathered(planId: string): Promise<GrandfatheringState[]>;
  /** Remove grandfathering state (after migration). */
  removeGrandfathered(tenantId: string, planId: string): Promise<void>;
  /** Clean up resources. */
  dispose(): void;
}

// ============================================================================
// InMemoryGrandfatheringStore
// ============================================================================

export class InMemoryGrandfatheringStore implements GrandfatheringStore {
  // tenantId:planId -> state
  private states = new Map<string, GrandfatheringState>();

  async setGrandfathered(
    tenantId: string,
    planId: string,
    version: number,
    graceEnds: Date | null,
  ): Promise<void> {
    this.states.set(`${tenantId}:${planId}`, { tenantId, planId, version, graceEnds });
  }

  async getGrandfathered(tenantId: string, planId: string): Promise<GrandfatheringState | null> {
    return this.states.get(`${tenantId}:${planId}`) ?? null;
  }

  async listGrandfathered(planId: string): Promise<GrandfatheringState[]> {
    const result: GrandfatheringState[] = [];
    for (const state of this.states.values()) {
      if (state.planId === planId) {
        result.push(state);
      }
    }
    return result;
  }

  async removeGrandfathered(tenantId: string, planId: string): Promise<void> {
    this.states.delete(`${tenantId}:${planId}`);
  }

  dispose(): void {
    this.states.clear();
  }
}
