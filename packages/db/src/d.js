import { createColumn, createSerialColumn, createTenantColumn } from './schema/column';
import { createManyRelation, createOneRelation } from './schema/relation';
import { createIndex, createTable } from './schema/table';
export const d = {
  uuid: () => createColumn('uuid'),
  text: () => createColumn('text'),
  varchar: (length) => createColumn('varchar', { length }),
  email: () => createColumn('text', { format: 'email' }),
  boolean: () => createColumn('boolean'),
  integer: () => createColumn('integer'),
  bigint: () => createColumn('bigint'),
  decimal: (precision, scale) => createColumn('decimal', { precision, scale }),
  real: () => createColumn('real'),
  doublePrecision: () => createColumn('double precision'),
  serial: () => createSerialColumn(),
  timestamp: () => createColumn('timestamp with time zone'),
  date: () => createColumn('date'),
  time: () => createColumn('time'),
  jsonb: (opts) => createColumn('jsonb', opts?.validator ? { validator: opts.validator } : {}),
  textArray: () => createColumn('text[]'),
  integerArray: () => createColumn('integer[]'),
  enum: (name, valuesOrSchema) => {
    const values =
      !Array.isArray(valuesOrSchema) && typeof valuesOrSchema.values !== 'undefined'
        ? valuesOrSchema.values
        : valuesOrSchema;
    return createColumn('enum', {
      enumName: name,
      enumValues: values,
    });
  },
  tenant: (targetTable) => createTenantColumn(targetTable._name),
  table: (name, columns, options) => createTable(name, columns, options),
  index: (columns) => createIndex(columns),
  ref: {
    one: (target, foreignKey) => createOneRelation(target, foreignKey),
    many: (target, foreignKey) => createManyRelation(target, foreignKey),
  },
  entry: (table, relations = {}) => ({
    table,
    relations,
  }),
};
//# sourceMappingURL=d.js.map
