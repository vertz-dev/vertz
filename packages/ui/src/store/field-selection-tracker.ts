/**
 * Dev-mode field selection tracker for the entity store.
 *
 * Tracks which fields were part of each query's `select` set per entity.
 * Creates Proxy wrappers that warn when non-selected fields are accessed.
 * Zero overhead in production — the tracker is never instantiated.
 */

interface SelectInfo {
  /** Union of all fields selected across all queries for this entity */
  fields: Set<string>;
  /** Query sources that have registered select sets (for diagnostics) */
  querySources: Set<string>;
  /** If true, at least one query fetched all fields — no warnings */
  fullFetch: boolean;
}

export type FieldMissCallback = (
  type: string,
  id: string,
  field: string,
  querySource: string,
) => void;

export interface FieldSelectionTrackerOptions {
  onMiss?: FieldMissCallback;
}

/**
 * Tracks field selection metadata per entity for dev-mode access warnings.
 */
export class FieldSelectionTracker {
  private _selectInfo = new Map<string, SelectInfo>();
  /** Dedup: tracks which field warnings have already been emitted */
  private _warned = new Set<string>();
  private _onMiss: FieldMissCallback | undefined;

  constructor(options?: FieldSelectionTrackerOptions) {
    this._onMiss = options?.onMiss;
  }

  /**
   * Register that a query with field selection fetched this entity.
   * Fields are unioned across all queries.
   */
  registerSelect(type: string, id: string, fields: string[], querySource: string): void {
    const key = `${type}:${id}`;
    let info = this._selectInfo.get(key);

    if (!info) {
      info = { fields: new Set(), querySources: new Set(), fullFetch: false };
      this._selectInfo.set(key, info);
    }

    for (const field of fields) {
      info.fields.add(field);
    }
    info.querySources.add(querySource);
  }

  /**
   * Register that a query without field selection fetched this entity.
   * Disables warnings for this entity (full fetch = all fields known).
   */
  registerFullFetch(type: string, id: string): void {
    const key = `${type}:${id}`;
    let info = this._selectInfo.get(key);

    if (!info) {
      info = { fields: new Set(), querySources: new Set(), fullFetch: true };
      this._selectInfo.set(key, info);
    } else {
      info.fullFetch = true;
    }
  }

  /**
   * Check if a field access should trigger a warning.
   */
  shouldWarn(type: string, id: string, field: string): boolean {
    const key = `${type}:${id}`;
    const info = this._selectInfo.get(key);

    if (!info || info.fullFetch) return false;

    return !info.fields.has(field);
  }

  /**
   * Remove tracking data for an entity (called when entity is removed/evicted).
   */
  removeEntity(type: string, id: string): void {
    const key = `${type}:${id}`;
    this._selectInfo.delete(key);
    // Clean up warned entries for this entity
    const prefix = `${key}:`;
    for (const warnKey of this._warned) {
      if (warnKey.startsWith(prefix)) {
        this._warned.delete(warnKey);
      }
    }
  }

  /**
   * Wrap an entity object in a dev-mode Proxy that warns on non-selected field access.
   * Returns the original object if no select tracking exists for this entity.
   * Each unique (type, id, field) combination warns only once.
   */
  createDevProxy<T extends Record<string, unknown>>(entity: T, type: string, id: string): T {
    const key = `${type}:${id}`;
    const info = this._selectInfo.get(key);

    if (!info || info.fullFetch) return entity;

    const tracker = this;
    return new Proxy(entity, {
      get(target, prop, receiver) {
        if (
          typeof prop === 'string' &&
          !INTERNAL_PROPS.has(prop) &&
          tracker.shouldWarn(type, id, prop)
        ) {
          const warnKey = `${key}:${prop}`;
          if (!tracker._warned.has(warnKey)) {
            tracker._warned.add(warnKey);
            const sources = [...info.querySources].join(', ');
            const selectedFields = [...info.fields].sort().join(', ');
            console.warn(
              `[vertz] Field "${prop}" was accessed on ${type}#${id} ` +
                'but was not in the select set.\n' +
                `        Query: "${sources}"\n` +
                `        Selected: ${selectedFields}\n` +
                `        Fix: use {entity.${prop}} in JSX, ` +
                'or add // @vertz-select-all above the query.',
            );
            tracker._onMiss?.(type, id, prop, sources);
          }
        }
        return Reflect.get(target, prop, receiver);
      },
    });
  }

  /**
   * Clear all tracking data.
   */
  clear(): void {
    this._selectInfo.clear();
    this._warned.clear();
  }
}

/**
 * Properties that should never trigger warnings.
 * These are JS/framework internals, not entity fields.
 * Symbol props are already filtered by the typeof === 'string' check.
 */
const INTERNAL_PROPS = new Set([
  'then',
  'toJSON',
  'toString',
  'valueOf',
  'constructor',
  '$$typeof',
  '__proto__',
]);
