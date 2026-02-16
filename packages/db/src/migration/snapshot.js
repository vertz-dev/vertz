export function createSnapshot(tables) {
  const snapshot = {
    version: 1,
    tables: {},
    enums: {},
  };
  for (const table of tables) {
    const columns = {};
    const foreignKeys = [];
    const indexes = [];
    for (const [colName, col] of Object.entries(table._columns)) {
      const meta = col._meta;
      const colSnap = {
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
//# sourceMappingURL=snapshot.js.map
