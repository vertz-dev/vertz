/**
 * DB-backed SubscriptionStore implementation.
 *
 * Uses auth_plans table for base plan data, auth_overrides table
 * for per-tenant limit overrides (stored as JSON), and auth_plan_addons
 * table for add-on management.
 */

import { sql } from '@vertz/db/sql';
import { type AuthDbClient, assertWrite } from './db-types';
import type { LimitOverride, Subscription, SubscriptionStore } from './subscription-store';

export class DbSubscriptionStore implements SubscriptionStore {
  constructor(private db: AuthDbClient) {}

  async assign(
    tenantId: string,
    planId: string,
    startedAt: Date = new Date(),
    expiresAt: Date | null = null,
  ): Promise<void> {
    await this.db.transaction(async (tx) => {
      const id = crypto.randomUUID();
      const startedAtIso = startedAt.toISOString();
      const expiresAtIso = expiresAt ? expiresAt.toISOString() : null;

      // Upsert plan using INSERT ... ON CONFLICT to minimize non-atomicity window.
      // tenant_id has a UNIQUE constraint so this replaces the existing plan in one statement.
      const upsertResult = await tx.query(
        sql`INSERT INTO auth_plans (id, tenant_id, plan_id, started_at, expires_at)
            VALUES (${id}, ${tenantId}, ${planId}, ${startedAtIso}, ${expiresAtIso})
            ON CONFLICT(tenant_id) DO UPDATE SET plan_id = ${planId}, started_at = ${startedAtIso}, expires_at = ${expiresAtIso}`,
      );
      assertWrite(upsertResult, 'assign/upsert');

      // Reset overrides when plan changes (overrides are plan-specific)
      const overrideResult = await tx.query(
        sql`DELETE FROM auth_overrides WHERE tenant_id = ${tenantId}`,
      );
      assertWrite(overrideResult, 'assign/clearOverrides');
    });
  }

  async get(tenantId: string): Promise<Subscription | null> {
    const result = await this.db.query<{
      tenant_id: string;
      plan_id: string;
      started_at: string;
      expires_at: string | null;
    }>(
      sql`SELECT tenant_id, plan_id, started_at, expires_at FROM auth_plans WHERE tenant_id = ${tenantId}`,
    );

    if (!result.ok) return null;
    const row = result.data.rows[0];
    if (!row) return null;

    // Load overrides from auth_overrides
    const overrides = await this.loadOverrides(tenantId);

    return {
      tenantId: row.tenant_id,
      planId: row.plan_id,
      startedAt: new Date(row.started_at),
      expiresAt: row.expires_at ? new Date(row.expires_at) : null,
      overrides,
    };
  }

  async updateOverrides(tenantId: string, overrides: Record<string, LimitOverride>): Promise<void> {
    // Check if plan exists first (outside transaction — read-only, avoids unnecessary tx for no-op)
    const planResult = await this.db.query<{ tenant_id: string }>(
      sql`SELECT tenant_id FROM auth_plans WHERE tenant_id = ${tenantId}`,
    );
    if (!planResult.ok || planResult.data.rows.length === 0) return;

    await this.db.transaction(async (tx) => {
      // Load existing overrides and merge
      const existing = await this.loadOverrides(tenantId);
      const merged = { ...existing, ...overrides };
      const overridesJson = JSON.stringify(merged);
      const now = new Date().toISOString();

      // Check if override row exists
      const overrideResult = await tx.query<{ tenant_id: string }>(
        sql`SELECT tenant_id FROM auth_overrides WHERE tenant_id = ${tenantId}`,
      );

      if (overrideResult.ok && overrideResult.data.rows.length > 0) {
        const updateResult = await tx.query(
          sql`UPDATE auth_overrides SET overrides = ${overridesJson}, updated_at = ${now} WHERE tenant_id = ${tenantId}`,
        );
        assertWrite(updateResult, 'updateOverrides/update');
      } else {
        const id = crypto.randomUUID();
        const insertResult = await tx.query(
          sql`INSERT INTO auth_overrides (id, tenant_id, overrides, updated_at)
              VALUES (${id}, ${tenantId}, ${overridesJson}, ${now})`,
        );
        assertWrite(insertResult, 'updateOverrides/insert');
      }
    });
  }

  async remove(tenantId: string): Promise<void> {
    await this.db.transaction(async (tx) => {
      const planResult = await tx.query(sql`DELETE FROM auth_plans WHERE tenant_id = ${tenantId}`);
      assertWrite(planResult, 'remove/plans');

      const overrideResult = await tx.query(
        sql`DELETE FROM auth_overrides WHERE tenant_id = ${tenantId}`,
      );
      assertWrite(overrideResult, 'remove/overrides');
    });
  }

  async attachAddOn(tenantId: string, addOnId: string): Promise<void> {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const result = await this.db.query(
      sql`INSERT INTO auth_plan_addons (id, tenant_id, addon_id, quantity, created_at)
          VALUES (${id}, ${tenantId}, ${addOnId}, ${1}, ${now})
          ON CONFLICT(tenant_id, addon_id) DO NOTHING`,
    );
    assertWrite(result, 'attachAddOn');
  }

  async detachAddOn(tenantId: string, addOnId: string): Promise<void> {
    const result = await this.db.query(
      sql`DELETE FROM auth_plan_addons WHERE tenant_id = ${tenantId} AND addon_id = ${addOnId}`,
    );
    assertWrite(result, 'detachAddOn');
  }

  async getAddOns(tenantId: string): Promise<string[]> {
    const result = await this.db.query<{ addon_id: string }>(
      sql`SELECT addon_id FROM auth_plan_addons WHERE tenant_id = ${tenantId}`,
    );

    if (!result.ok) return [];
    return result.data.rows.map((r) => r.addon_id);
  }

  dispose(): void {
    // No cleanup needed
  }

  private async loadOverrides(tenantId: string): Promise<Record<string, LimitOverride>> {
    const result = await this.db.query<{
      overrides: string;
    }>(sql`SELECT overrides FROM auth_overrides WHERE tenant_id = ${tenantId}`);

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
