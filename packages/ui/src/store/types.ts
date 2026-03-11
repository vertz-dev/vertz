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
 * Options for mergeWithSelect — metadata about field selection.
 */
export interface MergeSelectOptions {
  /** Fields that were part of the query's select set */
  fields: string[];
  /** Query source identifier for diagnostics (e.g., 'GET:/users') */
  querySource: string;
}

/**
 * Options for EntityStore constructor.
 */
export interface EntityStoreOptions {
  /** Initial data to hydrate from (SSR). */
  initialData?: SerializedStore;
  /** Enable dev-mode field selection tracking (zero overhead when false). */
  devMode?: boolean;
}
