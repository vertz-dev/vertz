/**
 * QueryResultIndex tracks ordered arrays of entity IDs for list queries.
 * Used to maintain list query results and invalidate on entity removal.
 */
export class QueryResultIndex {
  private _indices = new Map<string, string[]>();

  /**
   * Set the result IDs for a query key.
   */
  set(queryKey: string, ids: string[]): void {
    this._indices.set(queryKey, ids);
  }

  /**
   * Get the result IDs for a query key.
   */
  get(queryKey: string): string[] | undefined {
    return this._indices.get(queryKey);
  }

  /**
   * Remove an entity ID from all indices (called after entity delete).
   */
  removeEntity(entityId: string): void {
    for (const [queryKey, ids] of this._indices.entries()) {
      const filtered = ids.filter(id => id !== entityId);
      if (filtered.length !== ids.length) {
        this._indices.set(queryKey, filtered);
      }
    }
  }

  /**
   * Clear a specific query's index (for revalidation).
   */
  clear(queryKey: string): void {
    this._indices.delete(queryKey);
  }

  /**
   * Get all query keys (for serialization).
   */
  keys(): string[] {
    return Array.from(this._indices.keys());
  }
}
