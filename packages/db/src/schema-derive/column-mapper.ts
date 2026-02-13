import type { SchemaAny } from '@vertz/schema';
import { s } from '@vertz/schema';
import type { ColumnMetadata } from '../schema/column';

/**
 * Maps a column's SQL type metadata to the corresponding @vertz/schema validator.
 *
 * @throws If the SQL type is not recognized.
 */
export function columnToSchema(meta: ColumnMetadata): SchemaAny {
  let schema: SchemaAny;

  // Check format first — email columns have sqlType 'text' but format 'email'
  if (meta.format === 'email') {
    schema = s.email();
  } else {
    schema = mapSqlType(meta);
  }

  if (meta.nullable) {
    schema = schema.nullable();
  }

  return schema;
}

function mapSqlType(meta: ColumnMetadata): SchemaAny {
  switch (meta.sqlType) {
    case 'uuid':
      return s.uuid();
    case 'text':
      return s.string();
    case 'varchar':
      return meta.length != null ? s.string().max(meta.length) : s.string();
    case 'boolean':
      return s.boolean();
    case 'integer':
      return s.number().int();
    case 'bigint':
      return s.bigint();
    case 'serial':
      return s.number().int();
    case 'real':
    case 'double precision':
      return s.number();
    case 'decimal':
      return s.string();
    case 'timestamp with time zone':
      return s.date();
    case 'date':
      return s.string();
    case 'time':
      return s.string();
    case 'jsonb':
      return s.unknown();
    case 'text[]':
      return s.array(s.string());
    case 'integer[]':
      return s.array(s.number().int());
    case 'enum':
      return mapEnum(meta);
    default:
      throw new TypeError(`Unknown column type: ${meta.sqlType}`);
  }
}

function mapEnum(meta: ColumnMetadata): SchemaAny {
  if (!meta.enumValues || meta.enumValues.length === 0) {
    throw new TypeError('Enum column has no values defined');
  }
  // enumValues is readonly string[] — cast to the tuple form required by s.enum()
  const values = meta.enumValues as [string, ...string[]];
  return s.enum(values);
}
