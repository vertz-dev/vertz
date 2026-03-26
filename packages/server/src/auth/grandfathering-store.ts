/**
 * Grandfathering Store — tracks which resources are grandfathered on old plan versions.
 *
 * When a plan version changes, existing resources keep their old version
 * during a grace period. This store tracks that state.
 */

// ============================================================================
// Types
// ============================================================================

export interface GrandfatheringState {
  resourceType: string;
  resourceId: string;
  planId: string;
  version: number;
  graceEnds: Date | null; // null = indefinite
}

export interface GrandfatheringStore {
  /** Mark a resource as grandfathered on a specific plan version. */
  setGrandfathered(
    resourceType: string,
    resourceId: string,
    planId: string,
    version: number,
    graceEnds: Date | null,
  ): Promise<void>;
  /** Get grandfathering state for a resource on a plan. Returns null if not grandfathered. */
  getGrandfathered(
    resourceType: string,
    resourceId: string,
    planId: string,
  ): Promise<GrandfatheringState | null>;
  /** List all grandfathered resources for a plan. */
  listGrandfathered(planId: string): Promise<GrandfatheringState[]>;
  /** Remove grandfathering state (after migration). */
  removeGrandfathered(resourceType: string, resourceId: string, planId: string): Promise<void>;
  /** Clean up resources. */
  dispose(): void;
}

// ============================================================================
// InMemoryGrandfatheringStore
// ============================================================================

export class InMemoryGrandfatheringStore implements GrandfatheringStore {
  // resourceType:resourceId:planId -> state
  private states = new Map<string, GrandfatheringState>();

  private key(resourceType: string, resourceId: string, planId: string): string {
    return `${resourceType}:${resourceId}:${planId}`;
  }

  async setGrandfathered(
    resourceType: string,
    resourceId: string,
    planId: string,
    version: number,
    graceEnds: Date | null,
  ): Promise<void> {
    this.states.set(this.key(resourceType, resourceId, planId), {
      resourceType,
      resourceId,
      planId,
      version,
      graceEnds,
    });
  }

  async getGrandfathered(
    resourceType: string,
    resourceId: string,
    planId: string,
  ): Promise<GrandfatheringState | null> {
    return this.states.get(this.key(resourceType, resourceId, planId)) ?? null;
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

  async removeGrandfathered(
    resourceType: string,
    resourceId: string,
    planId: string,
  ): Promise<void> {
    this.states.delete(this.key(resourceType, resourceId, planId));
  }

  dispose(): void {
    this.states.clear();
  }
}
