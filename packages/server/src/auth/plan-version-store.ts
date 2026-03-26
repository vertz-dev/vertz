/**
 * Plan Version Store — tracks versioned snapshots of plan configurations.
 *
 * When a plan's config changes (hash differs), a new version is created
 * with a snapshot of the plan's features, limits, and price at that point.
 */

// ============================================================================
// Types
// ============================================================================

export interface PlanSnapshot {
  features: readonly string[] | string[];
  limits: Record<string, unknown>;
  price: { amount: number; interval: string } | null;
}

export interface PlanVersionInfo {
  planId: string;
  version: number;
  hash: string;
  snapshot: PlanSnapshot;
  createdAt: Date;
}

export interface PlanVersionStore {
  /** Create a new version for a plan. Returns the version number. */
  createVersion(planId: string, hash: string, snapshot: PlanSnapshot): Promise<number>;
  /** Get the current (latest) version number for a plan. Returns null if no versions exist. */
  getCurrentVersion(planId: string): Promise<number | null>;
  /** Get a specific version's info. Returns null if not found. */
  getVersion(planId: string, version: number): Promise<PlanVersionInfo | null>;
  /** Get the version number a resource is on for a given plan. Returns null if not set. */
  getTenantVersion(
    resourceType: string,
    resourceId: string,
    planId: string,
  ): Promise<number | null>;
  /** Set the version number a resource is on for a given plan. */
  setTenantVersion(
    resourceType: string,
    resourceId: string,
    planId: string,
    version: number,
  ): Promise<void>;
  /** Get the hash of the current (latest) version for a plan. Returns null if no versions. */
  getCurrentHash(planId: string): Promise<string | null>;
  /** Clean up resources. */
  dispose(): void;
}

// ============================================================================
// InMemoryPlanVersionStore
// ============================================================================

export class InMemoryPlanVersionStore implements PlanVersionStore {
  // planId -> version[]
  private versions = new Map<string, PlanVersionInfo[]>();
  // resourceType:resourceId:planId -> version
  private tenantVersions = new Map<string, number>();

  async createVersion(planId: string, hash: string, snapshot: PlanSnapshot): Promise<number> {
    const planVersions = this.versions.get(planId) ?? [];
    const version = planVersions.length + 1;
    const info: PlanVersionInfo = {
      planId,
      version,
      hash,
      snapshot,
      createdAt: new Date(),
    };
    planVersions.push(info);
    this.versions.set(planId, planVersions);
    return version;
  }

  async getCurrentVersion(planId: string): Promise<number | null> {
    const planVersions = this.versions.get(planId);
    if (!planVersions || planVersions.length === 0) return null;
    return planVersions.length;
  }

  async getVersion(planId: string, version: number): Promise<PlanVersionInfo | null> {
    const planVersions = this.versions.get(planId);
    if (!planVersions) return null;
    return planVersions[version - 1] ?? null;
  }

  async getTenantVersion(
    resourceType: string,
    resourceId: string,
    planId: string,
  ): Promise<number | null> {
    return this.tenantVersions.get(`${resourceType}:${resourceId}:${planId}`) ?? null;
  }

  async setTenantVersion(
    resourceType: string,
    resourceId: string,
    planId: string,
    version: number,
  ): Promise<void> {
    this.tenantVersions.set(`${resourceType}:${resourceId}:${planId}`, version);
  }

  async getCurrentHash(planId: string): Promise<string | null> {
    const planVersions = this.versions.get(planId);
    if (!planVersions || planVersions.length === 0) return null;
    return planVersions[planVersions.length - 1].hash;
  }

  dispose(): void {
    this.versions.clear();
    this.tenantVersions.clear();
  }
}
