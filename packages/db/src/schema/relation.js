// ---------------------------------------------------------------------------
// Factory: createOneRelation
// ---------------------------------------------------------------------------
export function createOneRelation(target, foreignKey) {
  return {
    _type: 'one',
    _target: target,
    _foreignKey: foreignKey,
    _through: null,
  };
}
// ---------------------------------------------------------------------------
// Factory: createManyRelation
// ---------------------------------------------------------------------------
export function createManyRelation(target, foreignKey) {
  return {
    _type: 'many',
    _target: target,
    _foreignKey: foreignKey ?? null,
    _through: null,
    through(joinTable, thisKey, thatKey) {
      return {
        _type: 'many',
        _target: target,
        _foreignKey: null,
        _through: {
          table: joinTable,
          thisKey,
          thatKey,
        },
      };
    },
  };
}
//# sourceMappingURL=relation.js.map
