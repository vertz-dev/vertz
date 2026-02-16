import { Schema } from '../core/schema';
import { SchemaType } from '../core/types';
export class LazySchema extends Schema {
  _getter;
  _cached;
  constructor(getter) {
    super();
    this._getter = getter;
  }
  _resolve() {
    if (!this._cached) {
      this._cached = this._getter();
    }
    return this._cached;
  }
  _parse(value, ctx) {
    return this._resolve()._runPipeline(value, ctx);
  }
  _schemaType() {
    return SchemaType.Lazy;
  }
  _toJSONSchema(tracker) {
    return this._resolve()._toJSONSchemaWithRefs(tracker);
  }
  _clone() {
    return this._cloneBase(new LazySchema(this._getter));
  }
}
//# sourceMappingURL=lazy.js.map
