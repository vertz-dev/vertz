export class RefTracker {
  _seen = new Set();
  _defs = {};
  hasSeen(id) {
    return this._seen.has(id);
  }
  markSeen(id) {
    this._seen.add(id);
  }
  addDef(id, schema) {
    this._defs[id] = schema;
  }
  getDefs() {
    return { ...this._defs };
  }
}
export function toJSONSchema(schema) {
  return schema.toJSONSchema();
}
//# sourceMappingURL=json-schema.js.map
