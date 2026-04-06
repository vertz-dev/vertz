import type { ModelDef } from '../schema/model';
import type { RelationDef } from '../schema/relation';
import type { ColumnRecord, IndexType, TableDef } from '../schema/table';

export interface ColumnSnapshot {
  type: string;
  nullable: boolean;
  primary: boolean;
  unique: boolean;
  default?: string;
  annotations?: string[];
  /** Postgres udt_name — resolves enum type names and array element types. */
  udtName?: string;
  /** character_maximum_length for varchar columns. */
  length?: number;
  /** numeric_precision for decimal/numeric columns. */
  precision?: number;
  /** numeric_scale for decimal/numeric columns. */
  scale?: number;
  /** Vector dimension count for pgvector columns. */
  dimensions?: number;
}

export interface IndexSnapshot {
  columns: string[];
  name?: string;
  unique?: boolean;
  type?: IndexType;
  where?: string;
  opclass?: string;
  m?: number;
  efConstruction?: number;
  lists?: number;
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
  /** RLS policy state — optional for backward compatibility with old snapshots. */
  rls?: import('./rls-snapshot').RlsSnapshot;
}

function isModelDef(v: unknown): v is ModelDef {
  return (
    v !== null &&
    typeof v === 'object' &&
    'table' in v &&
    'relations' in v &&
    typeof (v as Record<string, unknown>).table === 'object'
  );
}

function resolveTable(entry: TableDef<ColumnRecord> | ModelDef): TableDef<ColumnRecord> {
  return isModelDef(entry) ? entry.table : entry;
}

function resolveRelations(entry: TableDef<ColumnRecord> | ModelDef): Record<string, RelationDef> {
  return isModelDef(entry) ? entry.relations : {};
}

function findPkColumns(table: TableDef<ColumnRecord>): string[] {
  const pkCols: string[] = [];
  for (const [colName, col] of Object.entries(table._columns)) {
    if (col._meta.primary) pkCols.push(colName);
  }
  return pkCols;
}

function deriveForeignKeys(
  table: TableDef<ColumnRecord>,
  relations: Record<string, RelationDef>,
): ForeignKeySnapshot[] {
  const foreignKeys: ForeignKeySnapshot[] = [];

  for (const [relName, rel] of Object.entries(relations)) {
    // Only d.ref.one() produces FK constraints on this table.
    // d.ref.many() means the FK lives on the target table, not here.
    if (rel._type !== 'one') continue;
    if (!rel._foreignKey) continue;

    if (!(rel._foreignKey in table._columns)) {
      throw new Error(
        `Relation "${relName}" on table "${table._name}" references column "${rel._foreignKey}" which does not exist`,
      );
    }

    const targetTable = rel._target();
    const targetPkCols = findPkColumns(targetTable);
    if (targetPkCols.length === 0) {
      throw new Error(
        `Target table "${targetTable._name}" referenced by relation "${relName}" on table "${table._name}" has no primary key column`,
      );
    }
    const targetColumn = targetPkCols[0];

    foreignKeys.push({
      column: rel._foreignKey,
      targetTable: targetTable._name,
      targetColumn,
    });
  }

  return foreignKeys;
}

export function createSnapshot(entries: (TableDef<ColumnRecord> | ModelDef)[]): SchemaSnapshot {
  const snapshot: SchemaSnapshot = {
    version: 1,
    tables: {},
    enums: {},
  };

  for (const entry of entries) {
    const table = resolveTable(entry);
    const relations = resolveRelations(entry);
    const columns: Record<string, ColumnSnapshot> = {};
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
        colSnap.default = rawDefault === 'now' ? 'now()' : rawDefault;
      }

      const annotationNames = meta._annotations ? Object.keys(meta._annotations) : [];
      if (annotationNames.length > 0) {
        colSnap.annotations = annotationNames;
      }

      if (meta.dimensions != null) {
        colSnap.dimensions = meta.dimensions;
      }

      columns[colName] = colSnap;

      if (meta.enumName && meta.enumValues) {
        snapshot.enums[meta.enumName] = [...meta.enumValues];
      }
    }

    for (const idx of table._indexes) {
      const snap: IndexSnapshot = { columns: [...idx.columns] };
      if (idx.name) snap.name = idx.name;
      if (idx.unique) snap.unique = idx.unique;
      if (idx.type) snap.type = idx.type;
      if (idx.where) snap.where = idx.where;
      if (idx.opclass) snap.opclass = idx.opclass;
      if (idx.m != null) snap.m = idx.m;
      if (idx.efConstruction != null) snap.efConstruction = idx.efConstruction;
      if (idx.lists != null) snap.lists = idx.lists;
      indexes.push(snap);
    }

    const foreignKeys = deriveForeignKeys(table, relations);

    snapshot.tables[table._name] = {
      columns,
      indexes,
      foreignKeys,
      _metadata: {},
    };
  }

  return snapshot;
}
