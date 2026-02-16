function cloneWith(source, metaOverrides) {
  return createColumnWithMeta({ ...source._meta, ...metaOverrides });
}
function createColumnWithMeta(meta) {
  const col = {
    _meta: meta,
    primary() {
      return cloneWith(this, { primary: true, hasDefault: true });
    },
    unique() {
      return cloneWith(this, { unique: true });
    },
    nullable() {
      return cloneWith(this, { nullable: true });
    },
    default(value) {
      return cloneWith(this, { hasDefault: true, defaultValue: value });
    },
    sensitive() {
      return cloneWith(this, { sensitive: true });
    },
    hidden() {
      return cloneWith(this, { hidden: true });
    },
    check(sql) {
      return cloneWith(this, { check: sql });
    },
    references(table, column) {
      return cloneWith(this, {
        references: { table, column: column ?? 'id' },
      });
    },
  };
  return col;
}
function defaultMeta(sqlType) {
  return {
    sqlType,
    primary: false,
    unique: false,
    nullable: false,
    hasDefault: false,
    sensitive: false,
    hidden: false,
    isTenant: false,
    references: null,
    check: null,
  };
}
export function createColumn(sqlType, extra) {
  return createColumnWithMeta({
    ...defaultMeta(sqlType),
    ...extra,
  });
}
export function createSerialColumn() {
  return createColumnWithMeta({
    sqlType: 'serial',
    primary: false,
    unique: false,
    nullable: false,
    hasDefault: true,
    sensitive: false,
    hidden: false,
    isTenant: false,
    references: null,
    check: null,
  });
}
export function createTenantColumn(targetTableName) {
  return createColumnWithMeta({
    sqlType: 'uuid',
    primary: false,
    unique: false,
    nullable: false,
    hasDefault: false,
    sensitive: false,
    hidden: false,
    isTenant: true,
    references: { table: targetTableName, column: 'id' },
    check: null,
  });
}
//# sourceMappingURL=column.js.map
