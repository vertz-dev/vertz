import { camelToSnake } from '../sql/casing';
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
 * Generate the SQL column definition string for a column.
 */
function columnDef(name: string, col: ColumnSnapshot): string {
  const snakeName = camelToSnake(name);
  const parts: string[] = [`"${snakeName}" ${col.type}`];

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
 * Generate migration SQL from a set of diff changes.
 */
export function generateMigrationSql(changes: DiffChange[], ctx?: SqlGeneratorContext): string {
  const statements: string[] = [];
  const tables = ctx?.tables;
  const enums = ctx?.enums;

  for (const change of changes) {
    switch (change.type) {
      case 'table_added': {
        if (!change.table) break;
        const table = tables?.[change.table];
        if (!table) break;
        const tableName = camelToSnake(change.table);
        const cols: string[] = [];
        const primaryKeys: string[] = [];

        for (const [colName, col] of Object.entries(table.columns)) {
          cols.push(`  ${columnDef(colName, col)}`);
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
          const idxName = `idx_${tableName}_${idx.columns.map(camelToSnake).join('_')}`;
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
          `ALTER TABLE "${camelToSnake(change.table)}" ADD COLUMN ${columnDef(change.column, col)};`,
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
        const idxName = `idx_${snakeTable}_${change.columns.map(camelToSnake).join('_')}`;
        statements.push(`CREATE INDEX "${idxName}" ON "${snakeTable}" (${idxCols});`);
        break;
      }

      case 'index_removed': {
        if (!change.table || !change.columns) break;
        const snakeTable = camelToSnake(change.table);
        const idxName = `idx_${snakeTable}_${change.columns.map(camelToSnake).join('_')}`;
        statements.push(`DROP INDEX "${idxName}";`);
        break;
      }

      case 'enum_added': {
        if (!change.enumName) break;
        const values = enums?.[change.enumName];
        if (!values || values.length === 0) break;
        const enumSnakeName = camelToSnake(change.enumName);
        const valuesStr = values.map((v) => `'${escapeSqlString(v)}'`).join(', ');
        statements.push(`CREATE TYPE "${enumSnakeName}" AS ENUM (${valuesStr});`);
        break;
      }

      case 'enum_removed': {
        if (!change.enumName) break;
        statements.push(`DROP TYPE "${camelToSnake(change.enumName)}";`);
        break;
      }

      case 'enum_altered': {
        if (!change.enumName || !change.addedValues) break;
        const enumSnakeName = camelToSnake(change.enumName);
        for (const val of change.addedValues) {
          statements.push(`ALTER TYPE "${enumSnakeName}" ADD VALUE '${escapeSqlString(val)}';`);
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
export function generateRollbackSql(changes: DiffChange[], ctx?: SqlGeneratorContext): string {
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

  return generateMigrationSql(reverseChanges, ctx);
}
