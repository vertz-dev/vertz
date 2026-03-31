import type { ObjectSchema, SchemaAny } from '@vertz/schema';
import { s } from '@vertz/schema';
import type { ColumnRecord, TableDef } from '../schema/table';
import { columnToSchema } from './column-mapper';

/**
 * Result of `tableToSchemas()` — five object schemas derived from a table definition.
 */
export interface DerivedSchemas {
  /** Excludes primary keys and columns with defaults. For POST bodies. */
  readonly createBody: ObjectSchema;
  /** All non-PK columns, all optional. For PATCH/PUT bodies. */
  readonly updateBody: ObjectSchema;
  /** Excludes hidden and sensitive columns. For API responses. */
  readonly responseSchema: ObjectSchema;
  /**
   * Strict API create input schema. Excludes primary, readOnly, hidden columns.
   * Columns with defaults are optional. Rejects unknown keys.
   */
  readonly apiCreateBody: ObjectSchema;
  /**
   * Strict API update input schema. Excludes primary, readOnly, hidden columns.
   * All fields optional. Rejects unknown keys.
   */
  readonly apiUpdateBody: ObjectSchema;
}

/**
 * Converts a `d.table()` definition into `@vertz/schema` validation schemas.
 *
 * - `createBody` — excludes primary keys and columns with defaults.
 *   Client shouldn't send auto-generated fields.
 * - `updateBody` — all non-PK columns, all optional. For partial updates.
 * - `responseSchema` — excludes hidden and sensitive columns.
 *   Hidden/sensitive fields never leave the server.
 *
 * @example
 * ```typescript
 * import { tableToSchemas } from '@vertz/db/schema-derive';
 *
 * const users = d.table('users', {
 *   id: d.uuid().primary(),
 *   name: d.text(),
 *   email: d.email().unique(),
 *   passwordHash: d.varchar(255).is('hidden'),
 *   role: d.enum('user_role', ['admin', 'member']).default('member'),
 *   createdAt: d.timestamp().default('now'),
 * });
 *
 * const { createBody, updateBody, responseSchema } = tableToSchemas(users);
 * ```
 */
export function tableToSchemas<TColumns extends ColumnRecord>(
  table: TableDef<TColumns>,
): DerivedSchemas {
  const createBodyShape: Record<string, SchemaAny> = {};
  const updateBodyShape: Record<string, SchemaAny> = {};
  const responseShape: Record<string, SchemaAny> = {};
  const apiCreateShape: Record<string, SchemaAny> = {};
  const apiUpdateShape: Record<string, SchemaAny> = {};

  for (const [columnName, columnBuilder] of Object.entries(table._columns)) {
    const meta = columnBuilder._meta;
    const baseSchema = columnToSchema(meta);

    // createBody: exclude primary keys and columns with defaults
    if (!meta.primary && !meta.hasDefault) {
      createBodyShape[columnName] = baseSchema;
    }

    // updateBody: all non-PK columns, all optional
    if (!meta.primary) {
      updateBodyShape[columnName] = baseSchema.optional();
    }

    // responseSchema: exclude hidden and sensitive columns
    if (!meta._annotations.hidden && !meta._annotations.sensitive) {
      responseShape[columnName] = baseSchema;
    }

    // API input schemas: exclude primary, readOnly (subsumes autoUpdate), hidden
    const excludeFromInput = meta.primary || meta.isReadOnly || meta._annotations.hidden;
    if (!excludeFromInput) {
      // Create: columns with defaults or nullable are optional
      const isOptional = meta.hasDefault || meta.nullable;
      apiCreateShape[columnName] = isOptional ? baseSchema.optional() : baseSchema;

      // Update: all fields optional (PATCH semantics)
      apiUpdateShape[columnName] = baseSchema.optional();
    }
  }

  return {
    createBody: s.object(createBodyShape),
    updateBody: s.object(updateBodyShape),
    responseSchema: s.object(responseShape),
    apiCreateBody: s.object(apiCreateShape).strict(),
    apiUpdateBody: s.object(apiUpdateShape).strict(),
  };
}
