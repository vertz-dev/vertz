/**
 * DB-backed FlagStore implementation.
 *
 * Maintains an in-memory cache for synchronous reads (matching FlagStore interface).
 * Writes are persisted to auth_flags table via fire-and-forget.
 * Use loadFlags() to hydrate the cache from DB on startup.
 */

import { sql } from '@vertz/db/sql';
import { type AuthDbClient, boolVal } from './db-types';
import type { FlagStore } from './flag-store';

export class DbFlagStore implements FlagStore {
  private cache = new Map<string, Map<string, boolean>>();

  constructor(private db: AuthDbClient) {}

  /**
   * Load all flags from DB into memory. Call once on initialization.
   */
  async loadFlags(): Promise<void> {
    const result = await this.db.query<{
      tenant_id: string;
      flag: string;
      enabled: number | boolean;
    }>(sql`SELECT tenant_id, flag, enabled FROM auth_flags`);

    if (!result.ok) return;
    this.cache.clear();
    for (const row of result.data.rows) {
      let orgFlags = this.cache.get(row.tenant_id);
      if (!orgFlags) {
        orgFlags = new Map();
        this.cache.set(row.tenant_id, orgFlags);
      }
      orgFlags.set(row.flag, row.enabled === 1 || row.enabled === true);
    }
  }

  setFlag(orgId: string, flag: string, enabled: boolean): void {
    // Update cache synchronously
    let orgFlags = this.cache.get(orgId);
    if (!orgFlags) {
      orgFlags = new Map();
      this.cache.set(orgId, orgFlags);
    }
    orgFlags.set(flag, enabled);

    // Persist to DB asynchronously (fire-and-forget with error logging)
    const id = crypto.randomUUID();
    const val = boolVal(this.db, enabled);
    void this.db
      .query(
        sql`INSERT INTO auth_flags (id, tenant_id, flag, enabled) VALUES (${id}, ${orgId}, ${flag}, ${val})
          ON CONFLICT(tenant_id, flag) DO UPDATE SET enabled = ${val}`,
      )
      .then((result) => {
        if (!result.ok) {
          console.error('[DbFlagStore] Failed to persist flag:', result.error);
        }
      });
  }

  getFlag(orgId: string, flag: string): boolean {
    return this.cache.get(orgId)?.get(flag) ?? false;
  }

  getFlags(orgId: string): Record<string, boolean> {
    const orgFlags = this.cache.get(orgId);
    if (!orgFlags) return {};
    const result: Record<string, boolean> = {};
    for (const [key, value] of orgFlags) {
      result[key] = value;
    }
    return result;
  }
}
