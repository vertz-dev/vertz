import { ErrorCode } from '../core/errors';
import { Schema } from '../core/schema';

class PreprocessSchema extends Schema {
  _preprocess;
  _inner;
  constructor(preprocess, inner) {
    super();
    this._preprocess = preprocess;
    this._inner = inner;
  }
  _parse(value, ctx) {
    let processed;
    try {
      processed = this._preprocess(value);
    } catch (e) {
      ctx.addIssue({
        code: ErrorCode.Custom,
        message: e instanceof Error ? e.message : 'Preprocess failed',
      });
      return value;
    }
    return this._inner._runPipeline(processed, ctx);
  }
  _schemaType() {
    return this._inner._schemaType();
  }
  _toJSONSchema(tracker) {
    return this._inner._toJSONSchemaWithRefs(tracker);
  }
  _clone() {
    return this._cloneBase(new PreprocessSchema(this._preprocess, this._inner));
  }
}
export function preprocess(fn, schema) {
  return new PreprocessSchema(fn, schema);
}
//# sourceMappingURL=preprocess.js.map
