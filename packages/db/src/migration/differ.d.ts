import type { SchemaSnapshot } from './snapshot';
export type ChangeType =
  | 'table_added'
  | 'table_removed'
  | 'column_added'
  | 'column_removed'
  | 'column_altered'
  | 'column_renamed'
  | 'index_added'
  | 'index_removed'
  | 'enum_added'
  | 'enum_removed'
  | 'enum_altered';
export interface DiffChange {
  type: ChangeType;
  table?: string;
  column?: string;
  oldColumn?: string;
  newColumn?: string;
  oldType?: string;
  newType?: string;
  oldNullable?: boolean;
  newNullable?: boolean;
  oldDefault?: string;
  newDefault?: string;
  enumName?: string;
  addedValues?: string[];
  removedValues?: string[];
  columns?: string[];
  confidence?: number;
}
export interface DiffResult {
  changes: DiffChange[];
}
export declare function computeDiff(before: SchemaSnapshot, after: SchemaSnapshot): DiffResult;
//# sourceMappingURL=differ.d.ts.map
