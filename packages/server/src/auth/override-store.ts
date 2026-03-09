/**
 * OverrideStore — per-tenant feature and limit overrides.
 *
 * Overrides sit on top of plan + add-ons. They are runtime,
 * per-tenant adjustments applied by the business (admin/sales).
 */

import type { AccessDefinition } from './define-access';

// ============================================================================
// Types
// ============================================================================

/** Limit override: add (additive) or max (hard cap) */
export interface LimitOverrideDef {
  add?: number;
  max?: number;
}

/** Per-tenant overrides */
export interface TenantOverrides {
  features?: string[];
  limits?: Record<string, LimitOverrideDef>;
}

export interface OverrideStore {
  set(tenantId: string, overrides: TenantOverrides): Promise<void>;
  remove(tenantId: string, keys: { features?: string[]; limits?: string[] }): Promise<void>;
  get(tenantId: string): Promise<TenantOverrides | null>;
  dispose(): void;
}

// ============================================================================
// InMemoryOverrideStore
// ============================================================================

export class InMemoryOverrideStore implements OverrideStore {
  private overrides = new Map<string, TenantOverrides>();

  async set(tenantId: string, overrides: TenantOverrides): Promise<void> {
    const existing = this.overrides.get(tenantId) ?? {};

    if (overrides.features) {
      const featureSet = new Set(existing.features ?? []);
      for (const f of overrides.features) {
        featureSet.add(f);
      }
      existing.features = [...featureSet];
    }

    if (overrides.limits) {
      existing.limits = { ...existing.limits, ...overrides.limits };
    }

    this.overrides.set(tenantId, existing);
  }

  async remove(tenantId: string, keys: { features?: string[]; limits?: string[] }): Promise<void> {
    const existing = this.overrides.get(tenantId);
    if (!existing) return;

    if (keys.features && existing.features) {
      const removeSet = new Set(keys.features);
      existing.features = existing.features.filter((f) => !removeSet.has(f));
      if (existing.features.length === 0) {
        delete existing.features;
      }
    }

    if (keys.limits && existing.limits) {
      for (const key of keys.limits) {
        delete existing.limits[key];
      }
      if (Object.keys(existing.limits).length === 0) {
        delete existing.limits;
      }
    }

    // Clean up empty records
    if (!existing.features && !existing.limits) {
      this.overrides.delete(tenantId);
    }
  }

  async get(tenantId: string): Promise<TenantOverrides | null> {
    return this.overrides.get(tenantId) ?? null;
  }

  dispose(): void {
    this.overrides.clear();
  }
}

// ============================================================================
// Validation
// ============================================================================

/**
 * Validate tenant overrides against the access definition.
 * Throws on invalid limit keys, invalid feature names, or invalid max values.
 */
export function validateOverrides(accessDef: AccessDefinition, overrides: TenantOverrides): void {
  // Collect all limit keys from all plans
  const allLimitKeys = new Set<string>();
  if (accessDef.plans) {
    for (const planDef of Object.values(accessDef.plans)) {
      if (planDef.limits) {
        for (const key of Object.keys(planDef.limits)) {
          allLimitKeys.add(key);
        }
      }
    }
  }

  // Validate limit overrides
  if (overrides.limits) {
    for (const [key, limitDef] of Object.entries(overrides.limits)) {
      if (!allLimitKeys.has(key)) {
        throw new Error(`Override limit key '${key}' is not defined in any plan`);
      }

      // max must be -1, 0, or positive integer — no other negative values
      if (limitDef.max !== undefined) {
        if (limitDef.max < -1) {
          throw new Error(
            `Override limit '${key}' max must be -1 (unlimited), 0 (disabled), or a positive integer, got ${limitDef.max}`,
          );
        }
      }

      // add must be a finite integer (negative allowed for reductions, but not NaN/Infinity/fractional)
      if (limitDef.add !== undefined) {
        if (!Number.isFinite(limitDef.add)) {
          throw new Error(
            `Override limit '${key}' add must be a finite integer, got ${limitDef.add}`,
          );
        }
        if (!Number.isInteger(limitDef.add)) {
          throw new Error(`Override limit '${key}' add must be an integer, got ${limitDef.add}`);
        }
      }
    }
  }

  // Validate feature overrides — must reference defined entitlements
  if (overrides.features) {
    for (const feature of overrides.features) {
      if (!accessDef.entitlements[feature]) {
        throw new Error(`Override feature '${feature}' is not a defined entitlement`);
      }
    }
  }
}
