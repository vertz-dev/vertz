/**
 * Serialized format for EntityStore - used for SSR transfer and hydration.
 */
export interface SerializedStore {
  /** Entity data keyed by type → id → entity */
  entities: Record<string, Record<string, unknown>>;
  
  /** Query result indices (optional) */
  queries?: Record<string, { ids: string[]; nextCursor?: string | null }>;
}

/**
 * Options for EntityStore constructor.
 */
export interface EntityStoreOptions {
  /** Initial data to hydrate from (SSR). */
  initialData?: SerializedStore;
}
