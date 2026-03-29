/**
 * Plan Manager — runtime API for plan versioning, grandfathering, and migration.
 *
 * Provides `initialize()`, `migrate()`, `schedule()`, `resolve()`, `grandfathered()`.
 * Emits events: plan:version_created, plan:grace_approaching, plan:grace_expiring, plan:migrated.
 */

import type { PlanDef } from './define-access';
import type { GrandfatheringState, GrandfatheringStore } from './grandfathering-store';
import { computePlanHash } from './plan-hash';
import type { PlanSnapshot, PlanVersionStore } from './plan-version-store';
import type { SubscriptionStore } from './subscription-store';

// ============================================================================
// Types
// ============================================================================

export type PlanEventType =
  | 'plan:version_created'
  | 'plan:grace_approaching'
  | 'plan:grace_expiring'
  | 'plan:migrated';

export interface PlanEvent {
  type: PlanEventType;
  planId: string;
  resourceType?: string;
  resourceId?: string;
  version?: number;
  previousVersion?: number;
  currentVersion?: number;
  graceEnds?: Date | null;
  timestamp: Date;
}

export type PlanEventHandler = (event: PlanEvent) => void;

export interface TenantPlanState {
  planId: string;
  version: number;
  currentVersion: number;
  grandfathered: boolean;
  graceEnds: Date | null;
  snapshot: PlanSnapshot;
}

export interface MigrateOpts {
  resource?: { type: string; id: string };
}

export interface ScheduleOpts {
  at: Date | string;
}

export interface PlanManagerConfig {
  plans: Record<string, PlanDef>;
  versionStore: PlanVersionStore;
  grandfatheringStore: GrandfatheringStore;
  subscriptionStore: SubscriptionStore;
  clock?: () => Date;
}

export interface PlanManager {
  /** Hash plan configs, compare with stored, create new versions if different. Idempotent. */
  initialize(): Promise<void>;
  /** Migrate resources past grace period (or specific resource immediately). */
  migrate(planId: string, opts?: MigrateOpts): Promise<void>;
  /** Schedule future migration date for all grandfathered resources. */
  schedule(planId: string, opts: ScheduleOpts): Promise<void>;
  /** Return resource's plan state (planId, version, grandfathered, snapshot). */
  resolve(resourceType: string, resourceId: string): Promise<TenantPlanState | null>;
  /** List all grandfathered resources for a plan. */
  grandfathered(planId: string): Promise<GrandfatheringState[]>;
  /** Check all grandfathered resources and emit grace_approaching / grace_expiring events. */
  checkGraceEvents(): Promise<void>;
  /** Register an event handler. */
  on(handler: PlanEventHandler): void;
  /** Remove an event handler. */
  off(handler: PlanEventHandler): void;
}

// ============================================================================
// Grace period computation
// ============================================================================

const GRACE_DURATION_MS: Record<string, number> = {
  '1m': 30 * 24 * 60 * 60 * 1000,
  '3m': 90 * 24 * 60 * 60 * 1000,
  '6m': 180 * 24 * 60 * 60 * 1000,
  '12m': 365 * 24 * 60 * 60 * 1000,
};

function resolveGraceEnd(planDef: PlanDef, now: Date): Date | null {
  const grace = planDef.grandfathering?.grace;

  if (grace === 'indefinite') return null;

  if (grace && GRACE_DURATION_MS[grace]) {
    return new Date(now.getTime() + GRACE_DURATION_MS[grace]);
  }

  // Default: 1 billing cycle
  const interval = planDef.price?.interval;
  if (interval === 'year') {
    return new Date(now.getTime() + GRACE_DURATION_MS['3m']);
  }
  // monthly, quarterly, or no price => 1 month
  return new Date(now.getTime() + GRACE_DURATION_MS['1m']);
}

// ============================================================================
// createPlanManager()
// ============================================================================

export function createPlanManager(config: PlanManagerConfig): PlanManager {
  const { plans, versionStore, grandfatheringStore, subscriptionStore } = config;
  const clock = config.clock ?? (() => new Date());
  const handlers: PlanEventHandler[] = [];

  function emit(event: PlanEvent): void {
    for (const handler of handlers) {
      handler(event);
    }
  }

  function extractSnapshot(planDef: PlanDef): PlanSnapshot {
    return {
      features: planDef.features ? [...planDef.features] : [],
      limits: planDef.limits ? { ...planDef.limits } : {},
      price: planDef.price ? { ...planDef.price } : null,
    };
  }

  async function initialize(): Promise<void> {
    const now = clock();

    for (const [planId, planDef] of Object.entries(plans)) {
      // Skip add-ons — they don't have independent versions
      if (planDef.addOn) continue;

      const snapshot = extractSnapshot(planDef);
      const hash = await computePlanHash(snapshot);
      const currentHash = await versionStore.getCurrentHash(planId);

      if (currentHash === hash) continue; // No change

      const version = await versionStore.createVersion(planId, hash, snapshot);
      const currentVersion = version;

      emit({
        type: 'plan:version_created',
        planId,
        version,
        currentVersion,
        timestamp: now,
      });

      // If this is version > 1, grandfather existing resources
      if (version > 1) {
        const resources = await listResourcesOnPlan(planId);
        const graceEnds = resolveGraceEnd(planDef, now);

        for (const resource of resources) {
          const tenantVersion = await versionStore.getTenantVersion(
            resource.resourceType,
            resource.resourceId,
            planId,
          );
          // Only grandfather if resource is on an older version
          if (tenantVersion !== null && tenantVersion < version) {
            await grandfatheringStore.setGrandfathered(
              resource.resourceType,
              resource.resourceId,
              planId,
              tenantVersion,
              graceEnds,
            );
          }
        }
      }
    }
  }

  async function listResourcesOnPlan(
    planId: string,
  ): Promise<Array<{ resourceType: string; resourceId: string }>> {
    if (subscriptionStore.listByPlan) {
      return subscriptionStore.listByPlan(planId);
    }
    return [];
  }

  async function migrate(planId: string, opts?: MigrateOpts): Promise<void> {
    const now = clock();
    const currentVersion = await versionStore.getCurrentVersion(planId);
    if (currentVersion === null) return;

    if (opts?.resource) {
      // Immediate migration for specific resource
      await migrateResource(opts.resource.type, opts.resource.id, planId, currentVersion, now);
      return;
    }

    // Migrate all resources past grace period
    const grandfatheredList = await grandfatheringStore.listGrandfathered(planId);
    for (const state of grandfatheredList) {
      if (state.graceEnds === null) continue; // indefinite — skip
      if (state.graceEnds.getTime() <= now.getTime()) {
        await migrateResource(state.resourceType, state.resourceId, planId, currentVersion, now);
      }
    }
  }

  async function migrateResource(
    resourceType: string,
    resourceId: string,
    planId: string,
    targetVersion: number,
    now: Date,
  ): Promise<void> {
    const previousVersion = await versionStore.getTenantVersion(resourceType, resourceId, planId);

    // Check for downgrade warning
    if (previousVersion !== null) {
      const prevInfo = await versionStore.getVersion(planId, previousVersion);
      const targetInfo = await versionStore.getVersion(planId, targetVersion);
      if (prevInfo && targetInfo) {
        const prevFeatures = new Set(prevInfo.snapshot.features);
        const targetFeatures = new Set(targetInfo.snapshot.features);
        // Check if any features were removed
        for (const f of prevFeatures) {
          if (!targetFeatures.has(f)) {
            // Warning: new version has fewer features (logged, not blocking)
            break;
          }
        }
      }
    }

    await versionStore.setTenantVersion(resourceType, resourceId, planId, targetVersion);
    await grandfatheringStore.removeGrandfathered(resourceType, resourceId, planId);

    emit({
      type: 'plan:migrated',
      planId,
      resourceType,
      resourceId,
      version: targetVersion,
      previousVersion: previousVersion ?? undefined,
      timestamp: now,
    });
  }

  async function schedule(planId: string, opts: ScheduleOpts): Promise<void> {
    const at = typeof opts.at === 'string' ? new Date(opts.at) : opts.at;
    const grandfatheredList = await grandfatheringStore.listGrandfathered(planId);

    for (const state of grandfatheredList) {
      await grandfatheringStore.setGrandfathered(
        state.resourceType,
        state.resourceId,
        planId,
        state.version,
        at,
      );
    }
  }

  async function resolve(
    resourceType: string,
    resourceId: string,
  ): Promise<TenantPlanState | null> {
    // Get resource's assigned plan
    const subscription = await subscriptionStore.get(resourceType, resourceId);
    if (!subscription) return null;

    const planId = subscription.planId;
    const currentVersion = await versionStore.getCurrentVersion(planId);
    if (currentVersion === null) return null;

    const tenantVersion = await versionStore.getTenantVersion(resourceType, resourceId, planId);
    const effectiveVersion = tenantVersion ?? currentVersion;

    const grandfatheringState = await grandfatheringStore.getGrandfathered(
      resourceType,
      resourceId,
      planId,
    );

    const versionInfo = await versionStore.getVersion(planId, effectiveVersion);
    if (!versionInfo) return null;

    return {
      planId,
      version: effectiveVersion,
      currentVersion,
      grandfathered: grandfatheringState !== null,
      graceEnds: grandfatheringState?.graceEnds ?? null,
      snapshot: versionInfo.snapshot,
    };
  }

  async function grandfatheredFn(planId: string): Promise<GrandfatheringState[]> {
    return grandfatheringStore.listGrandfathered(planId);
  }

  const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
  const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

  async function checkGraceEvents(): Promise<void> {
    const now = clock();

    for (const planId of Object.keys(plans)) {
      const grandfatheredList = await grandfatheringStore.listGrandfathered(planId);
      for (const state of grandfatheredList) {
        if (state.graceEnds === null) continue; // indefinite — no events

        const timeUntilGraceEnd = state.graceEnds.getTime() - now.getTime();

        if (timeUntilGraceEnd <= SEVEN_DAYS_MS && timeUntilGraceEnd > 0) {
          emit({
            type: 'plan:grace_expiring',
            planId,
            resourceType: state.resourceType,
            resourceId: state.resourceId,
            version: state.version,
            graceEnds: state.graceEnds,
            timestamp: now,
          });
        } else if (timeUntilGraceEnd <= THIRTY_DAYS_MS && timeUntilGraceEnd > SEVEN_DAYS_MS) {
          emit({
            type: 'plan:grace_approaching',
            planId,
            resourceType: state.resourceType,
            resourceId: state.resourceId,
            version: state.version,
            graceEnds: state.graceEnds,
            timestamp: now,
          });
        }
      }
    }
  }

  function on(handler: PlanEventHandler): void {
    handlers.push(handler);
  }

  function off(handler: PlanEventHandler): void {
    const idx = handlers.indexOf(handler);
    if (idx >= 0) handlers.splice(idx, 1);
  }

  return {
    initialize,
    migrate,
    schedule,
    resolve,
    grandfathered: grandfatheredFn,
    checkGraceEvents,
    on,
    off,
  };
}
