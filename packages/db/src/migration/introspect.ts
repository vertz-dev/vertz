import type { MigrationQueryFn } from './runner';
import type { ColumnSnapshot, ForeignKeySnapshot, IndexSnapshot, SchemaSnapshot } from './snapshot';

const SQLITE_EXCLUDED_TABLES = new Set(['sqlite_sequence', '_vertz_migrations']);

export function validateIdentifier(name: string): string {
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name)) {
    throw new Error(`Invalid SQL identifier: "${name}"`);
  }
  return name;
}

function mapSqliteType(rawType: string): string {
  const upper = rawType.toUpperCase();
  if (upper === 'TEXT') return 'text';
  if (upper === 'INTEGER' || upper === 'INT') return 'integer';
  if (upper === 'REAL') return 'float';
  if (upper === 'BLOB') return 'blob';
  return rawType.toLowerCase();
}

export async function introspectSqlite(queryFn: MigrationQueryFn): Promise<SchemaSnapshot> {
  const snapshot: SchemaSnapshot = {
    version: 1,
    tables: {},
    enums: {},
  };

  const { rows: tableRows } = await queryFn(
    "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'",
    [],
  );

  for (const row of tableRows) {
    const tableName = row.name as string;
    if (SQLITE_EXCLUDED_TABLES.has(tableName)) continue;

    const columns: Record<string, ColumnSnapshot> = {};

    const { rows: colRows } = await queryFn(
      `PRAGMA table_info("${validateIdentifier(tableName)}")`,
      [],
    );

    for (const col of colRows) {
      const colName = col.name as string;
      const colSnap: ColumnSnapshot = {
        type: mapSqliteType(col.type as string),
        nullable: (col.notnull as number) === 0 && (col.pk as number) === 0,
        primary: (col.pk as number) > 0,
        unique: false,
      };

      if (col.dflt_value != null) {
        colSnap.default = String(col.dflt_value);
      }

      columns[colName] = colSnap;
    }

    // Detect indexes and unique constraints via index_list
    const indexes: IndexSnapshot[] = [];

    // Pre-fetch partial index WHERE clauses from sqlite_master
    const { rows: indexSqlRows } = await queryFn(
      `SELECT name, sql FROM sqlite_master WHERE type = 'index' AND tbl_name = ?`,
      [tableName],
    );
    const indexSqlMap = new Map<string, string>();
    for (const row of indexSqlRows) {
      if (row.name && row.sql) {
        indexSqlMap.set(row.name as string, row.sql as string);
      }
    }

    const { rows: indexRows } = await queryFn(
      `PRAGMA index_list("${validateIdentifier(tableName)}")`,
      [],
    );
    for (const idx of indexRows) {
      const idxName = idx.name as string;
      const isUnique = (idx.unique as number) === 1;
      const origin = idx.origin as string; // 'c' = CREATE INDEX, 'u' = UNIQUE constraint

      const { rows: idxInfoRows } = await queryFn(
        `PRAGMA index_info("${validateIdentifier(idxName)}")`,
        [],
      );
      const idxColumns = idxInfoRows.map((r) => r.name as string);

      // For unique constraints on single columns, mark the column as unique
      if (isUnique && idxColumns.length === 1 && origin === 'u') {
        const colName = idxColumns[0];
        if (colName && columns[colName]) {
          columns[colName].unique = true;
        }
      }

      // Only include explicitly created indexes (origin 'c'), not auto-created ones
      if (origin === 'c') {
        const snap: IndexSnapshot = {
          columns: idxColumns,
          name: idxName,
          unique: isUnique,
        };

        // Extract WHERE clause from CREATE INDEX SQL
        const createSql = indexSqlMap.get(idxName);
        if (createSql) {
          const whereMatch = createSql.match(/\bWHERE\s+(.+)$/i);
          if (whereMatch?.[1]) {
            snap.where = whereMatch[1];
          }
        }

        indexes.push(snap);
      }
    }

    // Detect foreign keys
    const foreignKeys: ForeignKeySnapshot[] = [];
    const { rows: fkRows } = await queryFn(
      `PRAGMA foreign_key_list("${validateIdentifier(tableName)}")`,
      [],
    );
    for (const fk of fkRows) {
      foreignKeys.push({
        column: fk.from as string,
        targetTable: fk.table as string,
        targetColumn: fk.to as string,
      });
    }

    snapshot.tables[tableName] = {
      columns,
      indexes,
      foreignKeys,
      _metadata: {},
    };
  }

  return snapshot;
}

const PG_EXCLUDED_TABLES = new Set(['_vertz_migrations']);

export async function introspectPostgres(queryFn: MigrationQueryFn): Promise<SchemaSnapshot> {
  const snapshot: SchemaSnapshot = {
    version: 1,
    tables: {},
    enums: {},
  };

  const { rows: tableRows } = await queryFn(
    "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE'",
    [],
  );

  // Collect primary key columns per table
  const { rows: pkRows } = await queryFn(
    `SELECT kcu.table_name, kcu.column_name
     FROM information_schema.table_constraints tc
     JOIN information_schema.key_column_usage kcu
       ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
     WHERE tc.constraint_type = 'PRIMARY KEY' AND tc.table_schema = 'public'`,
    [],
  );
  const pkMap = new Map<string, Set<string>>();
  for (const pk of pkRows) {
    const tbl = pk.table_name as string;
    if (!pkMap.has(tbl)) pkMap.set(tbl, new Set());
    pkMap.get(tbl)?.add(pk.column_name as string);
  }

  // Collect unique constraints (single-column only) per table
  const { rows: uniqueRows } = await queryFn(
    `SELECT tc.table_name, kcu.column_name, tc.constraint_name
     FROM information_schema.table_constraints tc
     JOIN information_schema.key_column_usage kcu
       ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
     WHERE tc.constraint_type = 'UNIQUE' AND tc.table_schema = 'public'`,
    [],
  );
  // Group by constraint name to identify single-column unique constraints
  const uniqueConstraintCols = new Map<string, { table: string; columns: string[] }>();
  for (const u of uniqueRows) {
    const cName = u.constraint_name as string;
    if (!uniqueConstraintCols.has(cName)) {
      uniqueConstraintCols.set(cName, { table: u.table_name as string, columns: [] });
    }
    uniqueConstraintCols.get(cName)?.columns.push(u.column_name as string);
  }
  const uniqueColMap = new Map<string, Set<string>>();
  for (const [, val] of uniqueConstraintCols) {
    if (val.columns.length === 1) {
      if (!uniqueColMap.has(val.table)) uniqueColMap.set(val.table, new Set());
      uniqueColMap.get(val.table)?.add(val.columns[0] as string);
    }
  }

  for (const row of tableRows) {
    const tableName = row.table_name as string;
    if (PG_EXCLUDED_TABLES.has(tableName)) continue;

    const columns: Record<string, ColumnSnapshot> = {};
    const pkCols = pkMap.get(tableName) ?? new Set<string>();
    const uniqueCols = uniqueColMap.get(tableName) ?? new Set<string>();

    // Introspect columns
    const { rows: colRows } = await queryFn(
      `SELECT column_name, data_type, is_nullable, column_default,
              udt_name, character_maximum_length, numeric_precision, numeric_scale
       FROM information_schema.columns
       WHERE table_name = $1 AND table_schema = 'public'
       ORDER BY ordinal_position`,
      [tableName],
    );

    for (const col of colRows) {
      const colName = col.column_name as string;
      const isPrimary = pkCols.has(colName);
      const isUnique = uniqueCols.has(colName);
      const colSnap: ColumnSnapshot = {
        type: col.data_type as string,
        nullable: (col.is_nullable as string) === 'YES',
        primary: isPrimary,
        unique: isUnique,
      };

      if (col.column_default != null) {
        colSnap.default = String(col.column_default);
      }

      const udtName = col.udt_name as string | null;
      if (udtName) {
        colSnap.udtName = udtName;
      }

      const charMaxLength = col.character_maximum_length as number | null;
      if (charMaxLength != null) {
        colSnap.length = charMaxLength;
      }

      const numPrecision = col.numeric_precision as number | null;
      const numScale = col.numeric_scale as number | null;
      if (numPrecision != null) {
        colSnap.precision = numPrecision;
      }
      if (numScale != null) {
        colSnap.scale = numScale;
      }

      columns[colName] = colSnap;
    }

    // Introspect foreign keys
    const foreignKeys: ForeignKeySnapshot[] = [];
    const { rows: fkRows } = await queryFn(
      `SELECT
         kcu.column_name,
         ccu.table_name AS target_table,
         ccu.column_name AS target_column
       FROM information_schema.table_constraints tc
       JOIN information_schema.key_column_usage kcu
         ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
       JOIN information_schema.constraint_column_usage ccu
         ON tc.constraint_name = ccu.constraint_name AND tc.table_schema = ccu.table_schema
       WHERE tc.constraint_type = 'FOREIGN KEY'
         AND tc.table_name = $1
         AND tc.table_schema = 'public'`,
      [tableName],
    );
    for (const fk of fkRows) {
      foreignKeys.push({
        column: fk.column_name as string,
        targetTable: fk.target_table as string,
        targetColumn: fk.target_column as string,
      });
    }

    // Introspect indexes — only user-created ones, not constraint-backed
    const indexes: IndexSnapshot[] = [];
    const { rows: idxRows } = await queryFn(
      `SELECT i.relname AS index_name,
              array_agg(a.attname ORDER BY k.n) AS columns,
              ix.indisunique AS is_unique,
              am.amname AS access_method,
              pg_get_expr(ix.indpred, ix.indrelid) AS predicate
       FROM pg_index ix
       JOIN pg_class i ON i.oid = ix.indexrelid
       JOIN pg_class t ON t.oid = ix.indrelid
       JOIN pg_namespace ns ON ns.oid = t.relnamespace
       JOIN pg_am am ON am.oid = i.relam
       JOIN LATERAL unnest(ix.indkey) WITH ORDINALITY AS k(attnum, n) ON true
       JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = k.attnum
       WHERE t.relname = $1
         AND ns.nspname = 'public'
         AND NOT ix.indisprimary
         AND NOT ix.indisunique
       GROUP BY i.relname, ix.indisunique, am.amname, ix.indpred, ix.indrelid`,
      [tableName],
    );
    for (const idx of idxRows) {
      const snap: IndexSnapshot = {
        columns: idx.columns as string[],
        name: idx.index_name as string,
        unique: idx.is_unique as boolean,
      };
      const accessMethod = idx.access_method as string;
      if (accessMethod && accessMethod !== 'btree') {
        snap.type = accessMethod as IndexSnapshot['type'];
      }
      const predicate = idx.predicate as string | null;
      if (predicate) {
        snap.where = predicate;
      }
      indexes.push(snap);
    }

    snapshot.tables[tableName] = {
      columns,
      indexes,
      foreignKeys,
      _metadata: {},
    };
  }

  // Introspect enum types
  const { rows: enumRows } = await queryFn(
    `SELECT t.typname AS enum_name, e.enumlabel AS enum_value
     FROM pg_type t
     JOIN pg_enum e ON t.oid = e.enumtypid
     JOIN pg_catalog.pg_namespace n ON n.oid = t.typnamespace
     WHERE n.nspname = 'public'
     ORDER BY t.typname, e.enumsortorder`,
    [],
  );
  for (const row of enumRows) {
    const enumName = row.enum_name as string;
    const enumValue = row.enum_value as string;
    if (!snapshot.enums[enumName]) {
      snapshot.enums[enumName] = [];
    }
    snapshot.enums[enumName].push(enumValue);
  }

  return snapshot;
}
