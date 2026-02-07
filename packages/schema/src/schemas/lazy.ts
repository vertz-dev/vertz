import { Schema } from '../core/schema';
import type { ParseContext } from '../core/parse-context';
import { SchemaType } from '../core/types';
import type { RefTracker } from '../introspection/json-schema';
import type { JSONSchemaObject } from '../introspection/json-schema';

export class LazySchema<T> extends Schema<T> {
  private readonly _getter: () => Schema<T>;
  private _cached: Schema<T> | undefined;

  constructor(getter: () => Schema<T>) {
    super();
    this._getter = getter;
  }

  private _resolve(): Schema<T> {
    if (!this._cached) {
      this._cached = this._getter();
    }
    return this._cached;
  }

  _parse(value: unknown, ctx: ParseContext): T {
    return this._resolve()._runPipeline(value, ctx);
  }

  _schemaType(): SchemaType {
    return SchemaType.Lazy;
  }

  _toJSONSchema(tracker: RefTracker): JSONSchemaObject {
    return this._resolve()._toJSONSchemaWithRefs(tracker);
  }

  _clone(): LazySchema<T> {
    return this._cloneBase(new LazySchema(this._getter));
  }
}
