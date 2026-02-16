export function createIndex(columns) {
  return {
    columns: Array.isArray(columns) ? columns : [columns],
  };
}
// ---------------------------------------------------------------------------
// createTable factory
// ---------------------------------------------------------------------------
export function createTable(name, columns, options) {
  return createTableInternal(name, columns, options?.indexes ?? [], false);
}
function createTableInternal(name, columns, indexes, shared) {
  const table = {
    _name: name,
    _columns: columns,
    _indexes: indexes,
    _shared: shared,
    // Derived type properties are phantom -- they exist only at the type level.
    // At runtime they are never accessed; we use `undefined as never` to avoid
    // allocating objects that would never be read.
    get $infer() {
      return undefined;
    },
    get $infer_all() {
      return undefined;
    },
    get $insert() {
      return undefined;
    },
    get $update() {
      return undefined;
    },
    get $not_sensitive() {
      return undefined;
    },
    get $not_hidden() {
      return undefined;
    },
    shared() {
      return createTableInternal(name, columns, indexes, true);
    },
  };
  return table;
}
//# sourceMappingURL=table.js.map
