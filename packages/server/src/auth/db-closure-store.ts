/**
 * DB-backed ClosureStore implementation.
 *
 * Stores ancestor/descendant relationships in auth_closure table.
 * UNIQUE constraint handles idempotent addResource.
 */

import { sql } from '@vertz/db/sql';
import type { ClosureEntry, ClosureStore, ParentRef } from './closure-store';
import type { AuthDbClient } from './db-types';

const MAX_DEPTH = 4;

export class DbClosureStore implements ClosureStore {
  constructor(private db: AuthDbClient) {}

  async addResource(type: string, id: string, parent?: ParentRef): Promise<void> {
    // Self-reference row (idempotent via UNIQUE constraint)
    const selfId = crypto.randomUUID();
    await this.db.query(
      sql`INSERT OR IGNORE INTO auth_closure (id, ancestor_type, ancestor_id, descendant_type, descendant_id, depth)
          VALUES (${selfId}, ${type}, ${id}, ${type}, ${id}, ${0})`,
    );

    if (parent) {
      const parentAncestors = await this.getAncestors(parent.parentType, parent.parentId);
      const maxParentDepth = Math.max(...parentAncestors.map((a) => a.depth), 0);

      if (maxParentDepth + 1 >= MAX_DEPTH) {
        throw new Error('Hierarchy depth exceeds maximum of 4 levels');
      }

      for (const ancestor of parentAncestors) {
        const rowId = crypto.randomUUID();
        await this.db.query(
          sql`INSERT OR IGNORE INTO auth_closure (id, ancestor_type, ancestor_id, descendant_type, descendant_id, depth)
              VALUES (${rowId}, ${ancestor.type}, ${ancestor.id}, ${type}, ${id}, ${ancestor.depth + 1})`,
        );
      }
    }
  }

  async removeResource(type: string, id: string): Promise<void> {
    // Find all descendants (including self)
    const descendants = await this.getDescendants(type, id);

    for (const desc of descendants) {
      // Remove all rows where this descendant appears
      await this.db.query(
        sql`DELETE FROM auth_closure WHERE (descendant_type = ${desc.type} AND descendant_id = ${desc.id}) OR (ancestor_type = ${desc.type} AND ancestor_id = ${desc.id})`,
      );
    }
  }

  async getAncestors(type: string, id: string): Promise<ClosureEntry[]> {
    const result = await this.db.query<{
      ancestor_type: string;
      ancestor_id: string;
      depth: number;
    }>(
      sql`SELECT ancestor_type, ancestor_id, depth FROM auth_closure WHERE descendant_type = ${type} AND descendant_id = ${id}`,
    );

    if (!result.ok) return [];
    return result.data.rows.map((r) => ({
      type: r.ancestor_type,
      id: r.ancestor_id,
      depth: r.depth,
    }));
  }

  async getDescendants(type: string, id: string): Promise<ClosureEntry[]> {
    const result = await this.db.query<{
      descendant_type: string;
      descendant_id: string;
      depth: number;
    }>(
      sql`SELECT descendant_type, descendant_id, depth FROM auth_closure WHERE ancestor_type = ${type} AND ancestor_id = ${id}`,
    );

    if (!result.ok) return [];
    return result.data.rows.map((r) => ({
      type: r.descendant_type,
      id: r.descendant_id,
      depth: r.depth,
    }));
  }

  async hasPath(
    ancestorType: string,
    ancestorId: string,
    descendantType: string,
    descendantId: string,
  ): Promise<boolean> {
    const result = await this.db.query<{ cnt: number }>(
      sql`SELECT COUNT(*) as cnt FROM auth_closure WHERE ancestor_type = ${ancestorType} AND ancestor_id = ${ancestorId} AND descendant_type = ${descendantType} AND descendant_id = ${descendantId}`,
    );

    if (!result.ok) return false;
    return (result.data.rows[0]?.cnt ?? 0) > 0;
  }

  dispose(): void {
    // No cleanup needed
  }
}
