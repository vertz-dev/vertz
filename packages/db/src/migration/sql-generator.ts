import { camelToSnake } from '../sql/casing';
import type { Dialect } from '../dialect';
import { defaultPostgresDialect } from '../dialect';
import type { DiffChange } from './differ';
import type { ColumnSnapshot, TableSnapshot } from './snapshot';

/**
 * Context needed by the SQL generator to produce full DDL.
 */
export interface SqlGeneratorContext {
  tables?: Record<string, TableSnapshot>;
  enums?: Record<string, string[]>;
}

/**
 * Escape a string value for use in a SQL single-quoted literal.
 * Doubles internal single quotes to prevent SQL injection.
 */
function escapeSqlString(value: string): string {
  return value.replace(/'/g, "''");
}

/**
 * Detect if a column type is an enum type (starts with underscore prefix in snapshot or is in enums).
 */
function isEnumType(col: ColumnSnapshot, enums?: Record<string, string[]>): boolean {
  const typeLower = col.type.toLowerCase();
  // Check if the type name matches any enum name (case-insensitive)
  if (enums) {
    for (const enumName of Object.keys(enums)) {
      if (typeLower === enumName.toLowerCase() || typeLower === enumName) {
        return true;
      }
    }
  }
  return false;
}

/**
 * Get enum values for a column type.
 */
function getEnumValues(col: ColumnSnapshot, enums?: Record<string, string[]>): string[] | undefined {
  if (!enums) return undefined;
  for (const [enumName, values] of Object.entries(enums)) {
    if (col.type.toLowerCase() === enumName.toLowerCase() || col.type === enumName) {
      return values;
    }
  }
  return undefined;
}

/**
 * Generate the SQL column definition string for a column.
 */
function columnDef(
  name: string,
  col: ColumnSnapshot,
  dialect: Dialect,
  enums?: Record<string, string[]>,
): string {
  const snakeName = camelToSnake(name);
  const isEnum = isEnumType(col, enums);
  
  // Map the column type using dialect
  let sqlType: string;
  let checkConstraint: string | undefined;
  
  if (isEnum && dialect.name === 'sqlite') {
    // SQLite: use TEXT with CHECK constraint for enums
    sqlType = dialect.mapColumnType('text');
    const enumValues = getEnumValues(col, enums);
    if (enumValues && enumValues.length > 0) {
      const escapedValues = enumValues.map((v) => `'${escapeSqlString(v)}'`).join(', ');
      checkConstraint = `CHECK("${snakeName}" IN (${escapedValues}))`;
    }
  } else {
    // Use dialect's type mapping
    // For backward compatibility: 
    // - PostgresDialect with lowercase types preserves them as-is
    // - SQLiteDialect always applies mapping (uuid->TEXT, boolean->INTEGER, etc.)
    // - Uppercase types are normalized and mapped via dialect
    if (dialect.name === 'postgres' && col.type === col.type.toLowerCase()) {
      // PostgresDialect with lowercase type - preserve as-is for backward compatibility
      sqlType = col.type;
    } else {
      // Apply dialect mapping:
      // - For SQLite: maps all types (UUID->TEXT, BOOLEAN->INTEGER, etc.)
      // - For Postgres with uppercase types: normalize and map
      const normalizedType = normalizeColumnType(col.type);
      sqlType = dialect.mapColumnType(normalizedType);
    }
  }

  const parts: string[] = [`"${snakeName}" ${sqlType}`];

  // Add CHECK constraint for SQLite enums
  if (checkConstraint) {
    parts.push(checkConstraint);
  }

  if (!col.nullable) {
    parts.push('NOT NULL');
  }

  if (col.unique) {
    parts.push('UNIQUE');
  }

  if (col.default !== undefined) {
    parts.push(`DEFAULT ${col.default}`);
  }

  return parts.join(' ');
}

/**
 * Normalize column type to generic vertz type for dialect mapping.
 * E.g., 'UUID' -> 'uuid', 'TIMESTAMPTZ' -> 'timestamp'
 */
function normalizeColumnType(type: string): string {
  const typeUpper = type.toUpperCase();
  const typeMap: Record<string, string> = {
    UUID: 'uuid',
    TEXT: 'text',
    INTEGER: 'integer',
    SERIAL: 'serial',
    BOOLEAN: 'boolean',
    TIMESTAMPTZ: 'timestamp',
    TIMESTAMP: 'timestamp',
    'DOUBLE PRECISION': 'float',
    JSONB: 'json',
    JSON: 'json',
    NUMERIC: 'decimal',
    REAL: 'float',
    VARCHAR: 'varchar',
  };
  return typeMap[typeUpper] || type.toLowerCase();
}

/**
 * Generate migration SQL from a set of diff changes.
 */
export function generateMigrationSql(
  changes: DiffChange[],
  ctx?: SqlGeneratorContext,
  dialect: Dialect = defaultPostgresDialect,
): string {
  const statements: string[] = [];
  const tables = ctx?.tables;
  const enums = ctx?.enums;

  for (const change of changes) {
    switch (change.type) {
      case 'enum_added': {
        if (!change.enumName) break;
        // For Postgres: emit CREATE TYPE; SQLite uses CHECK constraints
        if (dialect.name === 'postgres') {
          const values = enums?.[change.enumName];
          if (!values || values.length === 0) break;
          const enumSnakeName = camelToSnake(change.enumName);
          const valuesStr = values.map((v) => `'${escapeSqlString(v)}'`).join(', ');
          statements.push(`CREATE TYPE "${enumSnakeName}" AS ENUM (${valuesStr});`);
        }
        break;
      }

      case 'table_added': {
        if (!change.table) break;
        const table = tables?.[change.table];
        if (!table) break;
        const tableName = camelToSnake(change.table);
        const cols: string[] = [];
        const primaryKeys: string[] = [];

        // First, emit CREATE TYPE for Postgres enum columns
        if (dialect.name === 'postgres' && enums) {
          for (const [, col] of Object.entries(table.columns)) {
            if (isEnumType(col, enums)) {
              const enumValues = getEnumValues(col, enums);
              if (enumValues && enumValues.length > 0) {
                // Check if we already emitted this enum type
                const enumSnakeName = camelToSnake(col.type);
                const alreadyEmitted = statements.some(
                  (s) => s.includes(`CREATE TYPE "${enumSnakeName}"`),
                );
                if (!alreadyEmitted) {
                  const valuesStr = enumValues.map((v) => `'${escapeSqlString(v)}'`).join(', ');
                  statements.push(`CREATE TYPE "${enumSnakeName}" AS ENUM (${valuesStr});`);
                }
              }
            }
          }
        }

        for (const [colName, col] of Object.entries(table.columns)) {
          cols.push(`  ${columnDef(colName, col, dialect, enums)}`);
          if (col.primary) {
            primaryKeys.push(`"${camelToSnake(colName)}"`);
          }
        }

        if (primaryKeys.length > 0) {
          cols.push(`  PRIMARY KEY (${primaryKeys.join(', ')})`);
        }

        for (const fk of table.foreignKeys) {
          const fkCol = camelToSnake(fk.column);
          const fkTarget = camelToSnake(fk.targetTable);
          const fkTargetCol = camelToSnake(fk.targetColumn);
          cols.push(`  FOREIGN KEY ("${fkCol}") REFERENCES "${fkTarget}" ("${fkTargetCol}")`);
        }

        statements.push(`CREATE TABLE "${tableName}" (\n${cols.join(',\n')}\n);`);

        for (const idx of table.indexes) {
          const idxCols = idx.columns.map((c) => `"${camelToSnake(c)}"`).join(', ');
          const idxName = `idx_${tableName}_${idx.columns.map((c) => camelToSnake(c)).join('_')}`;
          statements.push(`CREATE INDEX "${idxName}" ON "${tableName}" (${idxCols});`);
        }
        break;
      }

      case 'table_removed': {
        if (!change.table) break;
        statements.push(`DROP TABLE "${camelToSnake(change.table)}";`);
        break;
      }

      case 'column_added': {
        if (!change.table || !change.column) break;
        const col = tables?.[change.table]?.columns[change.column];
        if (!col) break;
        statements.push(
          `ALTER TABLE "${camelToSnake(change.table)}" ADD COLUMN ${columnDef(change.column, col, dialect, enums)};`,
        );
        break;
      }

      case 'column_removed': {
        if (!change.table || !change.column) break;
        statements.push(
          `ALTER TABLE "${camelToSnake(change.table)}" DROP COLUMN "${camelToSnake(change.column)}";`,
        );
        break;
      }

      case 'column_altered': {
        if (!change.table || !change.column) break;
        const snakeTable = camelToSnake(change.table);
        const snakeCol = camelToSnake(change.column);

        if (change.newType !== undefined) {
          statements.push(
            `ALTER TABLE "${snakeTable}" ALTER COLUMN "${snakeCol}" TYPE ${change.newType};`,
          );
        }

        if (change.newNullable !== undefined) {
          if (change.newNullable) {
            statements.push(
              `ALTER TABLE "${snakeTable}" ALTER COLUMN "${snakeCol}" DROP NOT NULL;`,
            );
          } else {
            statements.push(`ALTER TABLE "${snakeTable}" ALTER COLUMN "${snakeCol}" SET NOT NULL;`);
          }
        }

        if (change.newDefault !== undefined) {
          if (change.newDefault) {
            statements.push(
              `ALTER TABLE "${snakeTable}" ALTER COLUMN "${snakeCol}" SET DEFAULT ${change.newDefault};`,
            );
          } else {
            statements.push(`ALTER TABLE "${snakeTable}" ALTER COLUMN "${snakeCol}" DROP DEFAULT;`);
          }
        }
        break;
      }

      case 'column_renamed': {
        if (!change.table || !change.oldColumn || !change.newColumn) break;
        statements.push(
          `ALTER TABLE "${camelToSnake(change.table)}" RENAME COLUMN "${camelToSnake(change.oldColumn)}" TO "${camelToSnake(change.newColumn)}";`,
        );
        break;
      }

      case 'index_added': {
        if (!change.table || !change.columns) break;
        const snakeTable = camelToSnake(change.table);
        const idxCols = change.columns.map((c) => `"${camelToSnake(c)}"`).join(', ');
        const idxName = `idx_${snakeTable}_${change.columns.map((c) => camelToSnake(c)).join('_')}`;
        statements.push(`CREATE INDEX "${idxName}" ON "${snakeTable}" (${idxCols});`);
        break;
      }

      case 'index_removed': {
        if (!change.table || !change.columns) break;
        const snakeTable = camelToSnake(change.table);
        const idxName = `idx_${snakeTable}_${change.columns.map((c) => camelToSnake(c)).join('_')}`;
        statements.push(`DROP INDEX "${idxName}";`);
        break;
      }

      case 'enum_removed': {
        if (!change.enumName) break;
        // Postgres: DROP TYPE; SQLite: nothing (type is not created)
        if (dialect.name === 'postgres') {
          statements.push(`DROP TYPE "${camelToSnake(change.enumName)}";`);
        }
        break;
      }

      case 'enum_altered': {
        if (!change.enumName || !change.addedValues) break;
        // Postgres: ALTER TYPE ADD VALUE; SQLite: not applicable
        if (dialect.name === 'postgres') {
          const enumSnakeName = camelToSnake(change.enumName);
          for (const val of change.addedValues) {
            statements.push(`ALTER TYPE "${enumSnakeName}" ADD VALUE '${escapeSqlString(val)}';`);
          }
        }
        break;
      }
    }
  }

  return statements.join('\n\n');
}

/**
 * Generate rollback SQL from a set of diff changes.
 * Reverses the operation of each change.
 */
export function generateRollbackSql(
  changes: DiffChange[],
  ctx?: SqlGeneratorContext,
  dialect: Dialect = defaultPostgresDialect,
): string {
  const reverseChanges: DiffChange[] = changes
    .slice()
    .reverse()
    .map((change) => {
      switch (change.type) {
        case 'table_added':
          return { ...change, type: 'table_removed' as const };
        case 'table_removed':
          return { ...change, type: 'table_added' as const };
        case 'column_added':
          return { ...change, type: 'column_removed' as const };
        case 'column_removed':
          return { ...change, type: 'column_added' as const };
        case 'column_altered':
          return {
            ...change,
            oldType: change.newType,
            newType: change.oldType,
            oldNullable: change.newNullable,
            newNullable: change.oldNullable,
            oldDefault: change.newDefault,
            newDefault: change.oldDefault,
          };
        case 'column_renamed':
          return {
            ...change,
            oldColumn: change.newColumn,
            newColumn: change.oldColumn,
          };
        case 'index_added':
          return { ...change, type: 'index_removed' as const };
        case 'index_removed':
          return { ...change, type: 'index_added' as const };
        case 'enum_added':
          return { ...change, type: 'enum_removed' as const };
        case 'enum_removed':
          return { ...change, type: 'enum_added' as const };
        case 'enum_altered':
          return {
            ...change,
            addedValues: change.removedValues,
            removedValues: change.addedValues,
          };
        default:
          return change;
      }
    });

  return generateMigrationSql(reverseChanges, ctx, dialect);
}
