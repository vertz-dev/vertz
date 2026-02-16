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
export declare function createSnapshot(tables: TableDef<ColumnRecord>[]): SchemaSnapshot;
//# sourceMappingURL=snapshot.d.ts.map
