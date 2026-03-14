import type { ColumnBuilder, ColumnMetadata, TableDef } from '@vertz/db';
import type { EvaluatedExpose } from './expose-evaluator';
import type { EntityRelationsConfig, RelationConfigObject } from './types';

// ---------------------------------------------------------------------------
// VertzQL query param parser
//
// Parses readable URL params into structured query options:
//   where[field]=value          → { where: { field: value } }
//   where[field][op]=value      → { where: { field: { op: value } } }
//   orderBy=field:dir           → { orderBy: { field: dir } }
//   limit=N                     → { limit: N }
//   after=cursor                → { after: cursor }
// ---------------------------------------------------------------------------

/**
 * Extracts allowed field keys from either array format (old) or object format (new expose API).
 * - Array: `['status', 'createdAt']` → `['status', 'createdAt']`
 * - Object: `{ status: true, createdAt: true }` → `['status', 'createdAt']`
 */
function extractAllowKeys(
  allow: readonly string[] | Record<string, unknown> | undefined,
): string[] {
  if (!allow) return [];
  if (Array.isArray(allow)) return allow as string[];
  return Object.keys(allow);
}

/** Maximum allowed cursor length to prevent abuse. */
export const MAX_CURSOR_LENGTH = 512;

/** Maximum allowed limit to prevent DoS via large result sets. */
export const MAX_LIMIT = 1000;

/**
 * Maximum allowed length of the base64-encoded `q` parameter string.
 *
 * Base64 encoding inflates data by ~1.33x, so a 10KB limit on the
 * base64 string corresponds to ~7.5KB of decoded JSON payload.
 */
export const MAX_Q_BASE64_LENGTH = 10_240;

/** Keys allowed in the decoded `q` parameter JSON object. */
const ALLOWED_Q_KEYS = new Set(['select', 'include', 'where', 'orderBy', 'limit', 'offset']);

/** Shape of a single include entry with optional filtering/sorting/pagination. */
export interface VertzQLIncludeEntry {
  select?: Record<string, true>;
  where?: Record<string, unknown>;
  orderBy?: Record<string, 'asc' | 'desc'>;
  limit?: number;
  include?: Record<string, true | VertzQLIncludeEntry>;
}

export interface VertzQLOptions {
  where?: Record<string, unknown>;
  orderBy?: Record<string, 'asc' | 'desc'>;
  limit?: number;
  offset?: number;
  after?: string;
  select?: Record<string, true>;
  include?: Record<string, true | VertzQLIncludeEntry>;
  /** @internal Parse error for the q= param, if any. */
  _qError?: string;
}

/**
 * Parses flat query params (from URL searchParams) into structured VertzQL options.
 *
 * Bracket-notation keys like `where[status]` are parsed into nested objects.
 */
export function parseVertzQL(query: Record<string, string>): VertzQLOptions {
  const result: VertzQLOptions = {};

  for (const [key, value] of Object.entries(query)) {
    // where[field]=value or where[field][op]=value
    const whereMatch = key.match(/^where\[([^\]]+)\](?:\[([^\]]+)\])?$/);
    if (whereMatch) {
      if (!result.where) result.where = {};
      const field = whereMatch[1]!;
      const op = whereMatch[2];
      const existing = result.where[field];
      if (op) {
        // Operator filter — merge with existing operators or promote equality to { eq }
        const base =
          existing && typeof existing === 'object'
            ? (existing as Record<string, unknown>)
            : existing !== undefined
              ? { eq: existing }
              : {};
        result.where[field] = { ...base, [op]: value };
      } else {
        // Equality filter — if operators already exist on this field, merge as { eq: value }
        if (existing && typeof existing === 'object') {
          result.where[field] = { ...(existing as Record<string, unknown>), eq: value };
        } else {
          result.where[field] = value;
        }
      }
      continue;
    }

    // limit=N (clamped to [0, MAX_LIMIT])
    if (key === 'limit') {
      const parsed = Number.parseInt(value, 10);
      if (!Number.isNaN(parsed)) {
        result.limit = Math.max(0, Math.min(parsed, MAX_LIMIT));
      }
      continue;
    }

    // after=cursor (drop oversized cursors)
    if (key === 'after') {
      if (value && value.length <= MAX_CURSOR_LENGTH) {
        result.after = value;
      }
      continue;
    }

    // orderBy=field:dir
    if (key === 'orderBy') {
      const [field, dir] = value.split(':');
      if (field) {
        if (!result.orderBy) result.orderBy = {};
        result.orderBy[field] = dir === 'desc' ? 'desc' : 'asc';
      }
      continue;
    }

    // q= param (base64url-encoded structural query)
    if (key === 'q') {
      try {
        // URL-decode first, then convert base64url to standard base64
        const urlDecoded = decodeURIComponent(value);

        // Reject oversized payloads before attempting decode
        if (urlDecoded.length > MAX_Q_BASE64_LENGTH) {
          result._qError = 'q= parameter exceeds maximum allowed size';
          continue;
        }

        const b64 = urlDecoded.replace(/-/g, '+').replace(/_/g, '/');
        const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4);
        const decoded = JSON.parse(atob(padded)) as Record<string, unknown>;

        // Strip unknown keys — only allow expected structural query keys
        for (const k of Object.keys(decoded)) {
          if (!ALLOWED_Q_KEYS.has(k)) {
            delete decoded[k];
          }
        }

        if (decoded.select && typeof decoded.select === 'object') {
          result.select = decoded.select as Record<string, true>;
        }
        if (decoded.include && typeof decoded.include === 'object') {
          result.include = decoded.include as Record<string, true | VertzQLIncludeEntry>;
        }
        if (decoded.where && typeof decoded.where === 'object') {
          result.where = { ...result.where, ...(decoded.where as Record<string, unknown>) };
        }
        if (decoded.orderBy && typeof decoded.orderBy === 'object') {
          result.orderBy = {
            ...result.orderBy,
            ...(decoded.orderBy as Record<string, 'asc' | 'desc'>),
          };
        }
        if (decoded.limit !== undefined) {
          const parsed = typeof decoded.limit === 'number' ? decoded.limit : Number(decoded.limit);
          if (!Number.isNaN(parsed)) {
            result.limit = Math.max(0, Math.min(parsed, MAX_LIMIT));
          }
        }
        if (decoded.offset !== undefined) {
          const parsed =
            typeof decoded.offset === 'number' ? decoded.offset : Number(decoded.offset);
          if (!Number.isNaN(parsed)) {
            result.offset = Math.max(0, parsed);
          }
        }
      } catch {
        result._qError = 'Invalid q= parameter: not valid base64 or JSON';
      }
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

export interface ValidationOk {
  ok: true;
}

export interface ValidationError {
  ok: false;
  error: string;
}

export type ValidationResult = ValidationOk | ValidationError;

/**
 * Resolves hidden column names from a table definition.
 */
function getHiddenColumns(table: TableDef): Set<string> {
  const hidden = new Set<string>();
  for (const key of Object.keys(table._columns)) {
    const col = table._columns[key] as ColumnBuilder<unknown, ColumnMetadata> | undefined;
    if (col?._meta._annotations.hidden) {
      hidden.add(key);
    }
  }
  return hidden;
}

/**
 * Validates parsed VertzQL options against the entity's table schema and relations config.
 *
 * Rejects:
 * - Hidden fields in `where` filters
 * - Hidden fields in `orderBy`
 * - Hidden fields in `select`
 * - Includes for relations not exposed in entity config
 * - Over-wide field selections on includes beyond entity config restrictions
 */
/**
 * Entity-level expose config for validation.
 * Subset of ExposeConfig relevant to VertzQL validation.
 */
export interface ExposeValidationConfig {
  readonly select?: Record<string, unknown>;
  readonly allowWhere?: Record<string, unknown>;
  readonly allowOrderBy?: Record<string, unknown>;
}

export function validateVertzQL(
  options: VertzQLOptions,
  table: TableDef,
  relationsConfig?: EntityRelationsConfig,
  exposeConfig?: ExposeValidationConfig,
  evaluatedExpose?: EvaluatedExpose,
): ValidationResult {
  // Surface q= parse errors
  if (options._qError) {
    return { ok: false, error: options._qError };
  }

  const hiddenColumns = getHiddenColumns(table);

  // Validate where fields
  if (options.where) {
    // When evaluated expose is available, use the evaluated set;
    // otherwise fall back to static key extraction from exposeConfig
    const allowWhereSet = evaluatedExpose ? evaluatedExpose.allowedWhereFields : null;
    const allowWhereKeys =
      !evaluatedExpose && exposeConfig ? extractAllowKeys(exposeConfig.allowWhere) : null;

    for (const field of Object.keys(options.where)) {
      if (hiddenColumns.has(field)) {
        return { ok: false, error: `Field "${field}" is not filterable` };
      }
      // Evaluated expose check (descriptor-aware)
      if (allowWhereSet !== null && !allowWhereSet.has(field)) {
        return { ok: false, error: `Field "${field}" is not filterable` };
      }
      // Static entity-level allowWhere check (no descriptors evaluated)
      if (allowWhereKeys !== null && !allowWhereKeys.includes(field)) {
        return { ok: false, error: `Field "${field}" is not filterable` };
      }
    }
  }

  // Validate orderBy fields
  if (options.orderBy) {
    const allowOrderBySet = evaluatedExpose ? evaluatedExpose.allowedOrderByFields : null;
    const allowOrderByKeys =
      !evaluatedExpose && exposeConfig ? extractAllowKeys(exposeConfig.allowOrderBy) : null;

    for (const field of Object.keys(options.orderBy)) {
      if (hiddenColumns.has(field)) {
        return { ok: false, error: `Field "${field}" is not sortable` };
      }
      // Evaluated expose check (descriptor-aware)
      if (allowOrderBySet !== null && !allowOrderBySet.has(field)) {
        return { ok: false, error: `Field "${field}" is not sortable` };
      }
      // Static entity-level allowOrderBy check
      if (allowOrderByKeys !== null && !allowOrderByKeys.includes(field)) {
        return { ok: false, error: `Field "${field}" is not sortable` };
      }
    }
  }

  // Validate select fields
  if (options.select) {
    const exposeSelectKeys = exposeConfig ? extractAllowKeys(exposeConfig.select) : null;
    for (const field of Object.keys(options.select)) {
      if (hiddenColumns.has(field)) {
        return { ok: false, error: `Field "${field}" is not selectable` };
      }
      // Entity-level select check
      if (
        exposeSelectKeys !== null &&
        exposeSelectKeys.length > 0 &&
        !exposeSelectKeys.includes(field)
      ) {
        return { ok: false, error: `Field "${field}" is not selectable` };
      }
    }
  }

  // Validate include against entity relations config
  if (options.include && relationsConfig) {
    const includeResult = validateInclude(options.include, relationsConfig, '');
    if (!includeResult.ok) return includeResult;
  }

  return { ok: true };
}

/**
 * Recursively validates include entries against entity relations config.
 * Checks allowWhere, allowOrderBy, maxLimit, and select field restrictions.
 */
function validateInclude(
  include: Record<string, true | VertzQLIncludeEntry>,
  relationsConfig: EntityRelationsConfig,
  pathPrefix: string,
): ValidationResult {
  for (const [relation, requested] of Object.entries(include)) {
    const entityConfig = relationsConfig[relation];
    const relationPath = pathPrefix ? `${pathPrefix}.${relation}` : relation;

    // Relation not in config or explicitly false → rejected
    if (entityConfig === undefined || entityConfig === false) {
      return { ok: false, error: `Relation "${relationPath}" is not exposed` };
    }

    // If requested is just `true`, no further validation needed
    if (requested === true) continue;

    const configObj: RelationConfigObject | undefined =
      typeof entityConfig === 'object' ? entityConfig : undefined;

    // Validate where fields against allowWhere
    if (requested.where) {
      const allowWhereKeys = extractAllowKeys(configObj?.allowWhere);
      if (!configObj || allowWhereKeys.length === 0) {
        return {
          ok: false,
          error:
            `Filtering is not enabled on relation '${relationPath}'. ` +
            "Add 'allowWhere' to the entity relations config.",
        };
      }
      const allowedSet = new Set(allowWhereKeys);
      for (const field of Object.keys(requested.where)) {
        if (!allowedSet.has(field)) {
          return {
            ok: false,
            error:
              `Field '${field}' is not filterable on relation '${relationPath}'. ` +
              `Allowed: ${allowWhereKeys.join(', ')}`,
          };
        }
      }
    }

    // Validate orderBy fields against allowOrderBy
    if (requested.orderBy) {
      const allowOrderByKeys = extractAllowKeys(configObj?.allowOrderBy);
      if (!configObj || allowOrderByKeys.length === 0) {
        return {
          ok: false,
          error:
            `Sorting is not enabled on relation '${relationPath}'. ` +
            "Add 'allowOrderBy' to the entity relations config.",
        };
      }
      const allowedSet = new Set(allowOrderByKeys);
      for (const [field, dir] of Object.entries(requested.orderBy)) {
        if (!allowedSet.has(field)) {
          return {
            ok: false,
            error:
              `Field '${field}' is not sortable on relation '${relationPath}'. ` +
              `Allowed: ${allowOrderByKeys.join(', ')}`,
          };
        }
        if (dir !== 'asc' && dir !== 'desc') {
          return {
            ok: false,
            error: `Invalid orderBy direction '${String(dir)}' for field '${field}' on relation '${relationPath}'. Must be 'asc' or 'desc'.`,
          };
        }
      }
    }

    // Validate and clamp limit
    if (requested.limit !== undefined) {
      if (typeof requested.limit !== 'number' || !Number.isFinite(requested.limit)) {
        return {
          ok: false,
          error: `Invalid limit on relation '${relationPath}': must be a finite number`,
        };
      }
      if (requested.limit < 0) {
        requested.limit = 0;
      }
      if (configObj?.maxLimit !== undefined && requested.limit > configObj.maxLimit) {
        requested.limit = configObj.maxLimit;
      }
    }

    // Validate select fields against config select
    if (requested.select && configObj?.select) {
      for (const field of Object.keys(requested.select)) {
        if (!(field in configObj.select)) {
          return {
            ok: false,
            error: `Field "${field}" is not exposed on relation "${relationPath}"`,
          };
        }
      }
    }

    // Recurse into nested includes
    if (requested.include) {
      // For nested includes, we need the nested relation's config.
      // If parent config is `true` or doesn't have nested relation info,
      // we can't validate nested includes — reject them.
      // The nested config would come from the target entity's relations config,
      // which we don't have here. For now, nested includes on `true` configs
      // are rejected since we can't validate them.
      if (entityConfig === true) {
        return {
          ok: false,
          error:
            `Nested includes are not supported on relation '${relationPath}' ` +
            'without a structured relations config.',
        };
      }
      // Nested includes require the target entity's relations config,
      // which is not available in the current validation context.
      // This will be fully wired in Phase 3 when the route handler
      // passes the full entity registry. For now, pass through.
    }
  }

  return { ok: true };
}
