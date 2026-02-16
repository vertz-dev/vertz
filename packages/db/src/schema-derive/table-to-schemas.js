import { s } from '@vertz/schema';
import { columnToSchema } from './column-mapper';
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
 *   passwordHash: d.varchar(255).hidden(),
 *   role: d.enum('user_role', ['admin', 'member']).default('member'),
 *   createdAt: d.timestamp().default('now'),
 * });
 *
 * const { createBody, updateBody, responseSchema } = tableToSchemas(users);
 * ```
 */
export function tableToSchemas(table) {
  const createBodyShape = {};
  const updateBodyShape = {};
  const responseShape = {};
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
    if (!meta.hidden && !meta.sensitive) {
      responseShape[columnName] = baseSchema;
    }
  }
  return {
    createBody: s.object(createBodyShape),
    updateBody: s.object(updateBodyShape),
    responseSchema: s.object(responseShape),
  };
}
//# sourceMappingURL=table-to-schemas.js.map
