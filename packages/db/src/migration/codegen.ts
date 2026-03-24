import type { ColumnSnapshot, ForeignKeySnapshot, SchemaSnapshot, TableSnapshot } from './snapshot';

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface GeneratedFile {
  path: string;
  content: string;
}

export interface CodegenOptions {
  dialect: 'postgres' | 'sqlite';
  mode: 'single-file' | 'per-table';
}

export function generateSchemaCode(
  snapshot: SchemaSnapshot,
  options: CodegenOptions,
): GeneratedFile[] {
  const ordered = topologicalSort(snapshot.tables);

  if (options.mode === 'per-table') {
    return generatePerTableFiles(snapshot, ordered);
  }
  return [generateSingleFile(snapshot, ordered)];
}

// ---------------------------------------------------------------------------
// Single-file mode
// ---------------------------------------------------------------------------

function generateSingleFile(snapshot: SchemaSnapshot, ordered: string[]): GeneratedFile {
  const lines: string[] = ["import { d } from '@vertz/db';", ''];

  for (const tableName of ordered) {
    const table = snapshot.tables[tableName];
    if (!table) continue;

    lines.push(`// ---------- ${tableName} ----------`);
    if (table._metadata._circularFk) {
      // Find which tables form the cycle
      const circularTargets = table.foreignKeys
        .filter(
          (fk) =>
            fk.targetTable !== tableName && snapshot.tables[fk.targetTable]?._metadata._circularFk,
        )
        .map((fk) => fk.targetTable);
      if (circularTargets.length > 0) {
        lines.push(`// Note: circular FK reference with ${circularTargets.join(', ')}`);
      }
    }
    lines.push('');
    lines.push(...generateTableCode(tableName, table, snapshot, ordered));
    lines.push('');
  }

  return { path: 'schema.ts', content: lines.join('\n') };
}

// ---------------------------------------------------------------------------
// Per-table mode
// ---------------------------------------------------------------------------

function generatePerTableFiles(snapshot: SchemaSnapshot, ordered: string[]): GeneratedFile[] {
  const files: GeneratedFile[] = [];
  const exportMap: Map<string, string[]> = new Map(); // fileName → exported names

  for (const tableName of ordered) {
    const table = snapshot.tables[tableName];
    if (!table) continue;

    const varBase = toCamelCase(tableName);
    const tableVar = `${varBase}Table`;
    const fileName = toCamelCase(tableName);

    const lines: string[] = ["import { d } from '@vertz/db';"];

    // Import FK target tables from their respective files
    const fkTargets = new Set<string>();
    for (const fk of table.foreignKeys) {
      if (fk.targetTable !== tableName) {
        fkTargets.add(fk.targetTable);
      }
    }
    for (const target of fkTargets) {
      const targetVar = `${toCamelCase(target)}Table`;
      const targetFile = toCamelCase(target);
      lines.push(`import { ${targetVar} } from './${targetFile}';`);
    }

    lines.push('');
    lines.push(...generateTableCode(tableName, table, snapshot, ordered));

    const exports: string[] = [tableVar];
    if (table.foreignKeys.length > 0) {
      exports.push(`${varBase}Model`);
    }
    exportMap.set(fileName, exports);

    files.push({ path: `${fileName}.ts`, content: lines.join('\n') + '\n' });
  }

  // Barrel index.ts
  const indexLines: string[] = [];
  for (const tableName of ordered) {
    const fileName = toCamelCase(tableName);
    const exports = exportMap.get(fileName);
    if (exports) {
      indexLines.push(`export { ${exports.join(', ')} } from './${fileName}';`);
    }
  }
  files.push({ path: 'index.ts', content: indexLines.join('\n') + '\n' });

  return files;
}

// ---------------------------------------------------------------------------
// Table code generation
// ---------------------------------------------------------------------------

function generateTableCode(
  tableName: string,
  table: TableSnapshot,
  snapshot: SchemaSnapshot,
  ordered: string[],
): string[] {
  const varBase = toCamelCase(tableName);
  const tableVar = `${varBase}Table`;
  const lines: string[] = [];

  const pkCols = Object.entries(table.columns)
    .filter(([, col]) => col.primary)
    .map(([name]) => name);
  const isCompositePK = pkCols.length > 1;

  lines.push(`export const ${tableVar} = d.table('${tableName}', {`);

  for (const [colName, col] of Object.entries(table.columns)) {
    const camelName = toCamelCase(colName);
    const { code, comment } = generateColumnCode(col, isCompositePK, snapshot);
    const commentStr = comment ? ` ${comment}` : '';
    lines.push(`  ${camelName}: ${code},${commentStr}`);
  }

  // Check if we need options (indexes or composite PK)
  const hasIndexes = table.indexes.length > 0;
  if (isCompositePK || hasIndexes) {
    lines.push('}, {');
    if (isCompositePK) {
      const camelPKs = pkCols.map((c) => `'${toCamelCase(c)}'`);
      lines.push(`  primaryKey: [${camelPKs.join(', ')}],`);
    }
    if (hasIndexes) {
      lines.push('  indexes: [');
      for (const idx of table.indexes) {
        lines.push(`    ${generateIndexCode(idx)},`);
      }
      lines.push('  ],');
    }
    lines.push('});');
  } else {
    lines.push('});');
  }

  // Generate model with relations if table has FKs
  if (table.foreignKeys.length > 0) {
    const modelVar = `${varBase}Model`;
    const relations = inferRelations(table.foreignKeys, snapshot.tables, ordered, tableName);
    lines.push('');
    lines.push(`export const ${modelVar} = d.model(${tableVar}, {`);
    for (const rel of relations) {
      const targetTableVar = `${toCamelCase(rel.targetTable)}Table`;
      lines.push(`  ${rel.name}: d.ref.one(() => ${targetTableVar}, '${rel.fkCamel}'),`);
    }
    lines.push('});');
  }

  return lines;
}

// ---------------------------------------------------------------------------
// Column code generation
// ---------------------------------------------------------------------------

interface ColumnCode {
  code: string;
  comment: string;
}

function generateColumnCode(
  col: ColumnSnapshot,
  isCompositePK: boolean,
  snapshot: SchemaSnapshot,
): ColumnCode {
  let comment = '';
  const builder = mapColumnType(col, snapshot);

  // Check for lossy mappings
  if (col.type === 'json') {
    comment = '// Source: json';
  } else if (col.type === 'smallint') {
    comment = '// Source: smallint';
  } else if (col.type === 'bigint' && col.default?.startsWith('nextval(')) {
    comment = '// Source: bigserial';
  } else if (builder.isBlob) {
    comment = '// TODO: blob type';
  } else if (builder.fallback) {
    comment = `// TODO: unmapped type "${col.type}"`;
  }

  let chain = builder.code;

  // Primary key (skip for composite PKs — handled at table level)
  if (col.primary && !isCompositePK) {
    chain += '.primary()';
  }

  // Unique
  if (col.unique) {
    chain += '.unique()';
  }

  // Nullable
  if (col.nullable) {
    chain += '.nullable()';
  }

  // Default
  if (col.default && !builder.skipDefault) {
    const defaultCode = formatDefault(col.default, col.type);
    if (defaultCode) {
      chain += `.default(${defaultCode})`;
    }
  }

  return { code: chain, comment };
}

interface BuilderResult {
  code: string;
  fallback?: boolean;
  skipDefault?: boolean;
  isBlob?: boolean;
}

function mapColumnType(col: ColumnSnapshot, snapshot: SchemaSnapshot): BuilderResult {
  const type = col.type;

  // Serial detection (integer + nextval default)
  if (
    (type === 'integer' || type === 'INT' || type === 'integer') &&
    col.default?.startsWith('nextval(')
  ) {
    return { code: 'd.serial()', skipDefault: true };
  }

  switch (type) {
    case 'uuid':
      return { code: 'd.uuid()' };
    case 'text':
      return { code: 'd.text()' };
    case 'character varying':
      return col.length ? { code: `d.varchar(${col.length})` } : { code: 'd.text()' };
    case 'boolean':
      return { code: 'd.boolean()' };
    case 'integer':
    case 'INT':
      return { code: 'd.integer()' };
    case 'smallint':
      return { code: 'd.integer()' };
    case 'bigint':
      return { code: 'd.bigint()' };
    case 'numeric':
      if (col.precision != null && col.scale != null) {
        return { code: `d.decimal(${col.precision}, ${col.scale})` };
      }
      return { code: 'd.decimal(10, 2)' }; // safe fallback
    case 'real':
    case 'float': // SQLite mapped type
      return { code: 'd.real()' };
    case 'double precision':
      return { code: 'd.doublePrecision()' };
    case 'timestamp with time zone':
    case 'timestamp without time zone':
      return { code: 'd.timestamp()' };
    case 'date':
      return { code: 'd.date()' };
    case 'time without time zone':
    case 'time':
      return { code: 'd.time()' };
    case 'jsonb':
      return { code: 'd.jsonb()' };
    case 'json':
      return { code: 'd.jsonb()' };
    case 'ARRAY':
      return mapArrayType(col);
    case 'USER-DEFINED':
      return mapEnumType(col, snapshot);
    case 'blob':
      return { code: 'd.text()', isBlob: true };
    default:
      return { code: 'd.text()', fallback: true };
  }
}

function mapArrayType(col: ColumnSnapshot): BuilderResult {
  if (col.udtName === '_text') return { code: 'd.textArray()' };
  if (col.udtName === '_int4') return { code: 'd.integerArray()' };
  return { code: 'd.textArray()', fallback: true };
}

function mapEnumType(col: ColumnSnapshot, snapshot: SchemaSnapshot): BuilderResult {
  const enumName = col.udtName;
  if (enumName && snapshot.enums[enumName]) {
    const values = snapshot.enums[enumName].map((v) => `'${v}'`).join(', ');
    return { code: `d.enum('${enumName}', [${values}])`, skipDefault: true };
  }
  return { code: 'd.text()', fallback: true };
}

function formatDefault(defaultValue: string, colType: string): string | null {
  // Timestamp defaults
  if (defaultValue === 'now()' || defaultValue.toUpperCase() === 'CURRENT_TIMESTAMP') {
    return "'now'";
  }

  // Skip nextval — handled at builder level
  if (defaultValue.startsWith('nextval(')) {
    return null;
  }

  // Boolean defaults
  if (defaultValue === 'true') return 'true';
  if (defaultValue === 'false') return 'false';

  // Enum defaults like 'pending'::status — skip (handled by enum builder)
  if (colType === 'USER-DEFINED') return null;

  // Numeric defaults
  if (/^-?\d+(\.\d+)?$/.test(defaultValue)) {
    return defaultValue;
  }

  // String defaults (quoted)
  const stringMatch = defaultValue.match(/^'([^']*)'(::.*)?$/);
  if (stringMatch?.[1] != null) {
    return `'${stringMatch[1]}'`;
  }

  // Skip complex expressions (function calls, casts, etc.)
  return null;
}

// ---------------------------------------------------------------------------
// Index code generation
// ---------------------------------------------------------------------------

function generateIndexCode(idx: {
  columns: string[];
  name?: string;
  unique?: boolean;
  type?: string;
  where?: string;
}): string {
  const cols =
    idx.columns.length === 1
      ? `'${idx.columns[0]}'`
      : `[${idx.columns.map((c) => `'${c}'`).join(', ')}]`;

  const opts: string[] = [];
  if (idx.name) opts.push(`name: '${idx.name}'`);
  if (idx.unique) opts.push('unique: true');
  if (idx.type && idx.type !== 'btree') opts.push(`type: '${idx.type}'`);
  if (idx.where) opts.push(`where: '${idx.where}'`);

  if (opts.length === 0) return `d.index(${cols})`;
  return `d.index(${cols}, { ${opts.join(', ')} })`;
}

// ---------------------------------------------------------------------------
// Relation inference
// ---------------------------------------------------------------------------

interface InferredRelation {
  name: string;
  fkCamel: string;
  targetTable: string;
}

function inferRelations(
  foreignKeys: ForeignKeySnapshot[],
  _tables: Record<string, TableSnapshot>,
  _ordered: string[],
  _selfTable: string,
): InferredRelation[] {
  const relations: InferredRelation[] = [];
  const usedNames = new Set<string>();

  for (const fk of foreignKeys) {
    const fkCamel = toCamelCase(fk.column);
    let name = stripFkSuffix(fkCamel);

    // Collision detection
    if (usedNames.has(name)) {
      name = `${toCamelCase(fk.targetTable)}By${capitalize(fkCamel)}`;
    }
    usedNames.add(name);

    relations.push({ name, fkCamel, targetTable: fk.targetTable });
  }

  return relations;
}

function stripFkSuffix(name: string): string {
  if (name.endsWith('Id') && name.length > 2) {
    return name.slice(0, -2);
  }
  if (name.endsWith('Fk') && name.length > 2) {
    return name.slice(0, -2);
  }
  return name;
}

// ---------------------------------------------------------------------------
// Topological sort with cycle detection
// ---------------------------------------------------------------------------

function topologicalSort(tables: Record<string, TableSnapshot>): string[] {
  const allTables = Object.keys(tables);
  const inDegree = new Map<string, number>();
  const deps = new Map<string, Set<string>>(); // table → set of tables it depends on
  const reverseDeps = new Map<string, Set<string>>(); // table → set of tables that depend on it

  for (const name of allTables) {
    inDegree.set(name, 0);
    deps.set(name, new Set());
    reverseDeps.set(name, new Set());
  }

  for (const [name, table] of Object.entries(tables)) {
    for (const fk of table.foreignKeys) {
      // Skip self-references — they don't create ordering constraints
      if (fk.targetTable === name) continue;
      // Only count dependencies on tables that exist in the snapshot
      if (!tables[fk.targetTable]) continue;

      if (!deps.get(name)?.has(fk.targetTable)) {
        deps.get(name)?.add(fk.targetTable);
        reverseDeps.get(fk.targetTable)?.add(name);
        inDegree.set(name, (inDegree.get(name) ?? 0) + 1);
      }
    }
  }

  // Kahn's algorithm
  const queue: string[] = [];
  for (const [name, degree] of inDegree) {
    if (degree === 0) queue.push(name);
  }

  const result: string[] = [];

  while (queue.length > 0) {
    const current = queue.shift()!;
    result.push(current);

    for (const dependent of reverseDeps.get(current) ?? []) {
      const newDegree = (inDegree.get(dependent) ?? 1) - 1;
      inDegree.set(dependent, newDegree);
      if (newDegree === 0) {
        queue.push(dependent);
      }
    }
  }

  // Handle cycles: any remaining tables not in result
  const remaining = allTables.filter((t) => !result.includes(t));
  if (remaining.length > 0) {
    // Mark these tables as having circular references
    for (const name of remaining) {
      const table = tables[name];
      if (table) {
        table._metadata._circularFk = true;
      }
    }
    result.push(...remaining);
  }

  return result;
}

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

function toCamelCase(str: string): string {
  return str.replace(/_([a-z0-9])/g, (_, c: string) => c.toUpperCase());
}

function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}
