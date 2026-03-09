/**
 * DB-backed PlanStore implementation.
 *
 * Uses auth_plans table for base plan data and auth_overrides table
 * for per-tenant limit overrides (stored as JSON).
 */

import { sql } from '@vertz/db/sql';
import type { AuthDbClient } from './db-types';
import type { LimitOverride, OrgPlan, PlanStore } from './plan-store';

export class DbPlanStore implements PlanStore {
  constructor(private db: AuthDbClient) {}

  async assignPlan(
    orgId: string,
    planId: string,
    startedAt: Date = new Date(),
    expiresAt: Date | null = null,
  ): Promise<void> {
    const id = crypto.randomUUID();
    const startedAtIso = startedAt.toISOString();
    const expiresAtIso = expiresAt ? expiresAt.toISOString() : null;

    // Upsert plan — replace if org already has a plan
    await this.db.query(sql`DELETE FROM auth_plans WHERE tenant_id = ${orgId}`);
    await this.db.query(
      sql`INSERT INTO auth_plans (id, tenant_id, plan_id, started_at, expires_at)
          VALUES (${id}, ${orgId}, ${planId}, ${startedAtIso}, ${expiresAtIso})`,
    );

    // Reset overrides when plan changes (overrides are plan-specific)
    await this.db.query(sql`DELETE FROM auth_overrides WHERE tenant_id = ${orgId}`);
  }

  async getPlan(orgId: string): Promise<OrgPlan | null> {
    const result = await this.db.query<{
      tenant_id: string;
      plan_id: string;
      started_at: string;
      expires_at: string | null;
    }>(
      sql`SELECT tenant_id, plan_id, started_at, expires_at FROM auth_plans WHERE tenant_id = ${orgId}`,
    );

    if (!result.ok) return null;
    const row = result.data.rows[0];
    if (!row) return null;

    // Load overrides from auth_overrides
    const overrides = await this.loadOverrides(orgId);

    return {
      orgId: row.tenant_id,
      planId: row.plan_id,
      startedAt: new Date(row.started_at),
      expiresAt: row.expires_at ? new Date(row.expires_at) : null,
      overrides,
    };
  }

  async updateOverrides(orgId: string, overrides: Record<string, LimitOverride>): Promise<void> {
    // Check if plan exists first
    const planResult = await this.db.query<{ tenant_id: string }>(
      sql`SELECT tenant_id FROM auth_plans WHERE tenant_id = ${orgId}`,
    );
    if (!planResult.ok || planResult.data.rows.length === 0) return;

    // Load existing overrides and merge
    const existing = await this.loadOverrides(orgId);
    const merged = { ...existing, ...overrides };
    const overridesJson = JSON.stringify(merged);
    const now = new Date().toISOString();

    // Check if override row exists
    const overrideResult = await this.db.query<{ tenant_id: string }>(
      sql`SELECT tenant_id FROM auth_overrides WHERE tenant_id = ${orgId}`,
    );

    if (overrideResult.ok && overrideResult.data.rows.length > 0) {
      await this.db.query(
        sql`UPDATE auth_overrides SET overrides = ${overridesJson}, updated_at = ${now} WHERE tenant_id = ${orgId}`,
      );
    } else {
      const id = crypto.randomUUID();
      await this.db.query(
        sql`INSERT INTO auth_overrides (id, tenant_id, overrides, updated_at)
            VALUES (${id}, ${orgId}, ${overridesJson}, ${now})`,
      );
    }
  }

  async removePlan(orgId: string): Promise<void> {
    await this.db.query(sql`DELETE FROM auth_plans WHERE tenant_id = ${orgId}`);
    await this.db.query(sql`DELETE FROM auth_overrides WHERE tenant_id = ${orgId}`);
  }

  dispose(): void {
    // No cleanup needed
  }

  private async loadOverrides(orgId: string): Promise<Record<string, LimitOverride>> {
    const result = await this.db.query<{
      overrides: string;
    }>(sql`SELECT overrides FROM auth_overrides WHERE tenant_id = ${orgId}`);

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
