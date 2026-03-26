/**
 * DB-backed SubscriptionStore implementation.
 *
 * Uses auth_plans table for base plan data, auth_overrides table
 * for per-resource limit overrides (stored as JSON), and auth_plan_addons
 * table for add-on management.
 */

import { sql } from '@vertz/db/sql';
import { type AuthDbClient, assertWrite } from './db-types';
import type { LimitOverride, Subscription, SubscriptionStore } from './subscription-store';

export class DbSubscriptionStore implements SubscriptionStore {
  constructor(private db: AuthDbClient) {}

  async assign(
    resourceType: string,
    resourceId: string,
    planId: string,
    startedAt: Date = new Date(),
    expiresAt: Date | null = null,
  ): Promise<void> {
    await this.db.transaction(async (tx) => {
      const id = crypto.randomUUID();
      const startedAtIso = startedAt.toISOString();
      const expiresAtIso = expiresAt ? expiresAt.toISOString() : null;

      // Upsert plan using INSERT ... ON CONFLICT to minimize non-atomicity window.
      // (resource_type, resource_id) has a UNIQUE constraint so this replaces the existing plan.
      const upsertResult = await tx.query(
        sql`INSERT INTO auth_plans (id, resource_type, resource_id, plan_id, started_at, expires_at)
            VALUES (${id}, ${resourceType}, ${resourceId}, ${planId}, ${startedAtIso}, ${expiresAtIso})
            ON CONFLICT(resource_type, resource_id) DO UPDATE SET plan_id = ${planId}, started_at = ${startedAtIso}, expires_at = ${expiresAtIso}`,
      );
      assertWrite(upsertResult, 'assign/upsert');

      // Reset overrides when plan changes (overrides are plan-specific)
      const overrideResult = await tx.query(
        sql`DELETE FROM auth_overrides WHERE resource_type = ${resourceType} AND resource_id = ${resourceId}`,
      );
      assertWrite(overrideResult, 'assign/clearOverrides');
    });
  }

  async get(resourceType: string, resourceId: string): Promise<Subscription | null> {
    const result = await this.db.query<{
      resource_type: string;
      resource_id: string;
      plan_id: string;
      started_at: string;
      expires_at: string | null;
    }>(
      sql`SELECT resource_type, resource_id, plan_id, started_at, expires_at FROM auth_plans WHERE resource_type = ${resourceType} AND resource_id = ${resourceId}`,
    );

    if (!result.ok) return null;
    const row = result.data.rows[0];
    if (!row) return null;

    // Load overrides from auth_overrides
    const overrides = await this.loadOverrides(resourceType, resourceId);

    return {
      resourceType: row.resource_type,
      resourceId: row.resource_id,
      planId: row.plan_id,
      startedAt: new Date(row.started_at),
      expiresAt: row.expires_at ? new Date(row.expires_at) : null,
      overrides,
    };
  }

  async updateOverrides(
    resourceType: string,
    resourceId: string,
    overrides: Record<string, LimitOverride>,
  ): Promise<void> {
    // Check if plan exists first (outside transaction — read-only, avoids unnecessary tx for no-op)
    const planResult = await this.db.query<{ resource_type: string }>(
      sql`SELECT resource_type FROM auth_plans WHERE resource_type = ${resourceType} AND resource_id = ${resourceId}`,
    );
    if (!planResult.ok || planResult.data.rows.length === 0) return;

    await this.db.transaction(async (tx) => {
      // Load existing overrides and merge
      const existing = await this.loadOverrides(resourceType, resourceId);
      const merged = { ...existing, ...overrides };
      const overridesJson = JSON.stringify(merged);
      const now = new Date().toISOString();

      // Check if override row exists
      const overrideResult = await tx.query<{ resource_type: string }>(
        sql`SELECT resource_type FROM auth_overrides WHERE resource_type = ${resourceType} AND resource_id = ${resourceId}`,
      );

      if (overrideResult.ok && overrideResult.data.rows.length > 0) {
        const updateResult = await tx.query(
          sql`UPDATE auth_overrides SET overrides = ${overridesJson}, updated_at = ${now} WHERE resource_type = ${resourceType} AND resource_id = ${resourceId}`,
        );
        assertWrite(updateResult, 'updateOverrides/update');
      } else {
        const id = crypto.randomUUID();
        const insertResult = await tx.query(
          sql`INSERT INTO auth_overrides (id, resource_type, resource_id, overrides, updated_at)
              VALUES (${id}, ${resourceType}, ${resourceId}, ${overridesJson}, ${now})`,
        );
        assertWrite(insertResult, 'updateOverrides/insert');
      }
    });
  }

  async remove(resourceType: string, resourceId: string): Promise<void> {
    await this.db.transaction(async (tx) => {
      const planResult = await tx.query(
        sql`DELETE FROM auth_plans WHERE resource_type = ${resourceType} AND resource_id = ${resourceId}`,
      );
      assertWrite(planResult, 'remove/plans');

      const overrideResult = await tx.query(
        sql`DELETE FROM auth_overrides WHERE resource_type = ${resourceType} AND resource_id = ${resourceId}`,
      );
      assertWrite(overrideResult, 'remove/overrides');
    });
  }

  async attachAddOn(resourceType: string, resourceId: string, addOnId: string): Promise<void> {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const result = await this.db.query(
      sql`INSERT INTO auth_plan_addons (id, resource_type, resource_id, addon_id, quantity, created_at)
          VALUES (${id}, ${resourceType}, ${resourceId}, ${addOnId}, ${1}, ${now})
          ON CONFLICT(resource_type, resource_id, addon_id) DO NOTHING`,
    );
    assertWrite(result, 'attachAddOn');
  }

  async detachAddOn(resourceType: string, resourceId: string, addOnId: string): Promise<void> {
    const result = await this.db.query(
      sql`DELETE FROM auth_plan_addons WHERE resource_type = ${resourceType} AND resource_id = ${resourceId} AND addon_id = ${addOnId}`,
    );
    assertWrite(result, 'detachAddOn');
  }

  async getAddOns(resourceType: string, resourceId: string): Promise<string[]> {
    const result = await this.db.query<{ addon_id: string }>(
      sql`SELECT addon_id FROM auth_plan_addons WHERE resource_type = ${resourceType} AND resource_id = ${resourceId}`,
    );

    if (!result.ok) return [];
    return result.data.rows.map((r) => r.addon_id);
  }

  dispose(): void {
    // No cleanup needed
  }

  private async loadOverrides(
    resourceType: string,
    resourceId: string,
  ): Promise<Record<string, LimitOverride>> {
    const result = await this.db.query<{
      overrides: string;
    }>(
      sql`SELECT overrides FROM auth_overrides WHERE resource_type = ${resourceType} AND resource_id = ${resourceId}`,
    );

    if (!result.ok || result.data.rows.length === 0) return {};

    try {
      const overridesStr = result.data.rows[0]?.overrides;
      if (!overridesStr) return {};
      return JSON.parse(overridesStr) as Record<string, LimitOverride>;
    } catch {
      return {};
    }
  }
}
