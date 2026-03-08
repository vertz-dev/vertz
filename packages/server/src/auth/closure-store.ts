/**
 * InMemoryClosureStore — closure table for resource hierarchy.
 *
 * Stores ancestor/descendant relationships with depth tracking.
 * Self-reference rows (depth 0) are created for every resource.
 * Hierarchy depth is capped at 4 levels.
 */

// ============================================================================
// Types
// ============================================================================

export interface ClosureRow {
  ancestorType: string;
  ancestorId: string;
  descendantType: string;
  descendantId: string;
  depth: number;
}

export interface ClosureEntry {
  type: string;
  id: string;
  depth: number;
}

export interface ParentRef {
  parentType: string;
  parentId: string;
}

export interface ClosureStore {
  addResource(type: string, id: string, parent?: ParentRef): void;
  removeResource(type: string, id: string): void;
  getAncestors(type: string, id: string): ClosureEntry[];
  getDescendants(type: string, id: string): ClosureEntry[];
  hasPath(
    ancestorType: string,
    ancestorId: string,
    descendantType: string,
    descendantId: string,
  ): boolean;
  dispose(): void;
}

const MAX_DEPTH = 4;

// ============================================================================
// InMemoryClosureStore
// ============================================================================

export class InMemoryClosureStore implements ClosureStore {
  private rows: ClosureRow[] = [];

  addResource(type: string, id: string, parent?: ParentRef): void {
    // Self-reference row
    this.rows.push({
      ancestorType: type,
      ancestorId: id,
      descendantType: type,
      descendantId: id,
      depth: 0,
    });

    if (parent) {
      // Get all ancestors of the parent
      const parentAncestors = this.getAncestors(parent.parentType, parent.parentId);

      // Check depth cap: the parent's max depth + 1 (for the new child)
      const maxParentDepth = Math.max(...parentAncestors.map((a) => a.depth), 0);
      if (maxParentDepth + 1 >= MAX_DEPTH) {
        // Remove the self-reference we just added
        this.rows.pop();
        throw new Error('Hierarchy depth exceeds maximum of 4 levels');
      }

      // Insert ancestor paths: each ancestor of parent is an ancestor of the new resource
      for (const ancestor of parentAncestors) {
        this.rows.push({
          ancestorType: ancestor.type,
          ancestorId: ancestor.id,
          descendantType: type,
          descendantId: id,
          depth: ancestor.depth + 1,
        });
      }
    }
  }

  removeResource(type: string, id: string): void {
    // Find all descendants of this resource (including self)
    const descendants = this.getDescendants(type, id);
    const descendantKeys = new Set(descendants.map((d) => `${d.type}:${d.id}`));

    // Remove all rows where any descendant appears as ancestor or descendant
    this.rows = this.rows.filter((row) => {
      const ancestorKey = `${row.ancestorType}:${row.ancestorId}`;
      const descendantKey = `${row.descendantType}:${row.descendantId}`;
      return !descendantKeys.has(ancestorKey) && !descendantKeys.has(descendantKey);
    });
  }

  getAncestors(type: string, id: string): ClosureEntry[] {
    return this.rows
      .filter((row) => row.descendantType === type && row.descendantId === id)
      .map((row) => ({
        type: row.ancestorType,
        id: row.ancestorId,
        depth: row.depth,
      }));
  }

  getDescendants(type: string, id: string): ClosureEntry[] {
    return this.rows
      .filter((row) => row.ancestorType === type && row.ancestorId === id)
      .map((row) => ({
        type: row.descendantType,
        id: row.descendantId,
        depth: row.depth,
      }));
  }

  hasPath(
    ancestorType: string,
    ancestorId: string,
    descendantType: string,
    descendantId: string,
  ): boolean {
    return this.rows.some(
      (row) =>
        row.ancestorType === ancestorType &&
        row.ancestorId === ancestorId &&
        row.descendantType === descendantType &&
        row.descendantId === descendantId,
    );
  }

  dispose(): void {
    this.rows = [];
  }
}
