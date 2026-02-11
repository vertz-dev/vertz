import type { ColumnRecord, TableDef } from '../schema/table';

export interface ColumnSnapshot {
  type: string;
  nullable: boolean;
  primary: boolean;
  unique: boolean;
  default?: string;
  sensitive?: boolean;
  hidden?: boolean;
}

export interface IndexSnapshot {
  columns: string[];
}

export interface ForeignKeySnapshot {
  column: string;
  targetTable: string;
  targetColumn: string;
}

export interface TableSnapshot {
  columns: Record<string, ColumnSnapshot>;
  indexes: IndexSnapshot[];
  foreignKeys: ForeignKeySnapshot[];
  _metadata: Record<string, unknown>;
}

export interface SchemaSnapshot {
  version: 1;
  tables: Record<string, TableSnapshot>;
  enums: Record<string, string[]>;
}

export function createSnapshot(tables: TableDef<ColumnRecord>[]): SchemaSnapshot {
  const snapshot: SchemaSnapshot = {
    version: 1,
    tables: {},
    enums: {},
  };

  for (const table of tables) {
    const columns: Record<string, ColumnSnapshot> = {};
    const foreignKeys: ForeignKeySnapshot[] = [];
    const indexes: IndexSnapshot[] = [];

    for (const [colName, col] of Object.entries(table._columns)) {
      const meta = col._meta;
      const colSnap: ColumnSnapshot = {
        type: meta.sqlType,
        nullable: meta.nullable,
        primary: meta.primary,
        unique: meta.unique,
      };

      if (meta.hasDefault && meta.defaultValue !== undefined) {
        const rawDefault = String(meta.defaultValue);
        // Convert special default markers to SQL expressions
        colSnap.default = rawDefault === 'now' ? 'now()' : rawDefault;
      }

      if (meta.sensitive) {
        colSnap.sensitive = true;
      }

      if (meta.hidden) {
        colSnap.hidden = true;
      }

      columns[colName] = colSnap;

      if (meta.references) {
        foreignKeys.push({
          column: colName,
          targetTable: meta.references.table,
          targetColumn: meta.references.column,
        });
      }

      if (meta.enumName && meta.enumValues) {
        snapshot.enums[meta.enumName] = [...meta.enumValues];
      }
    }

    for (const idx of table._indexes) {
      indexes.push({ columns: [...idx.columns] });
    }

    snapshot.tables[table._name] = {
      columns,
      indexes,
      foreignKeys,
      _metadata: {},
    };
  }

  return snapshot;
}
