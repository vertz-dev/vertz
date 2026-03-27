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

  private key(resourceType: string, resourceId: string): string {
    return `${resourceType}:${resourceId}`;
  }

  /**
   * Load all flags from DB into memory. Call once on initialization.
   */
  async loadFlags(): Promise<void> {
    const result = await this.db.query<{
      resource_type: string;
      resource_id: string;
      flag: string;
      enabled: number | boolean;
    }>(sql`SELECT resource_type, resource_id, flag, enabled FROM auth_flags`);

    if (!result.ok) return;
    this.cache.clear();
    for (const row of result.data.rows) {
      const k = this.key(row.resource_type, row.resource_id);
      let resFlags = this.cache.get(k);
      if (!resFlags) {
        resFlags = new Map();
        this.cache.set(k, resFlags);
      }
      resFlags.set(row.flag, row.enabled === 1 || row.enabled === true);
    }
  }

  setFlag(resourceType: string, resourceId: string, flag: string, enabled: boolean): void {
    // Update cache synchronously
    const k = this.key(resourceType, resourceId);
    let resFlags = this.cache.get(k);
    if (!resFlags) {
      resFlags = new Map();
      this.cache.set(k, resFlags);
    }
    resFlags.set(flag, enabled);

    // Persist to DB asynchronously (fire-and-forget with error logging)
    const id = crypto.randomUUID();
    const val = boolVal(this.db, enabled);
    void this.db
      .query(
        sql`INSERT INTO auth_flags (id, resource_type, resource_id, flag, enabled) VALUES (${id}, ${resourceType}, ${resourceId}, ${flag}, ${val})
          ON CONFLICT(resource_type, resource_id, flag) DO UPDATE SET enabled = ${val}`,
      )
      .then((result) => {
        if (!result.ok) {
          console.error('[DbFlagStore] Failed to persist flag:', result.error);
        }
      });
  }

  getFlag(resourceType: string, resourceId: string, flag: string): boolean {
    return this.cache.get(this.key(resourceType, resourceId))?.get(flag) ?? false;
  }

  getFlags(resourceType: string, resourceId: string): Record<string, boolean> {
    const resFlags = this.cache.get(this.key(resourceType, resourceId));
    if (!resFlags) return {};
    const result: Record<string, boolean> = {};
    for (const [key, value] of resFlags) {
      result[key] = value;
    }
    return result;
  }
}
