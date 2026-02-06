import { Schema } from '../core/schema';
import { ParseContext } from '../core/parse-context';
import { ErrorCode } from '../core/errors';
import type { SchemaType } from '../core/types';
import type { RefTracker, JSONSchemaObject } from '../introspection/json-schema';

class PreprocessSchema<O> extends Schema<O> {
  private readonly _preprocess: (value: unknown) => unknown;
  private readonly _inner: Schema<O>;

  constructor(preprocess: (value: unknown) => unknown, inner: Schema<O>) {
    super();
    this._preprocess = preprocess;
    this._inner = inner;
  }

  _parse(value: unknown, ctx: ParseContext): O {
    let processed: unknown;
    try {
      processed = this._preprocess(value);
    } catch (e) {
      ctx.addIssue({
        code: ErrorCode.Custom,
        message: e instanceof Error ? e.message : 'Preprocess failed',
      });
      return value as O;
    }
    return this._inner._runPipeline(processed, ctx);
  }

  _schemaType(): SchemaType {
    return this._inner._schemaType();
  }

  _toJSONSchema(tracker: RefTracker): JSONSchemaObject {
    return this._inner._toJSONSchemaWithRefs(tracker);
  }

  _clone(): PreprocessSchema<O> {
    return this._cloneBase(new PreprocessSchema(this._preprocess, this._inner));
  }
}

export function preprocess<O>(fn: (value: unknown) => unknown, schema: Schema<O>): Schema<O> {
  return new PreprocessSchema(fn, schema);
}
