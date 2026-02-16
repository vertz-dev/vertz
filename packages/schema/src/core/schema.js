import { RefTracker } from '../introspection/json-schema';
import { ErrorCode, ParseError } from './errors';
import { ParseContext } from './parse-context';
import { SchemaRegistry } from './registry';
export class Schema {
  /** @internal */ _id;
  /** @internal */ _description;
  /** @internal */ _meta;
  /** @internal */ _examples;
  constructor() {
    this._examples = [];
  }
  parse(value) {
    const ctx = new ParseContext();
    const result = this._runPipeline(value, ctx);
    if (ctx.hasIssues()) {
      throw new ParseError(ctx.issues);
    }
    return result;
  }
  safeParse(value) {
    const ctx = new ParseContext();
    try {
      const data = this._runPipeline(value, ctx);
      if (ctx.hasIssues()) {
        return { success: false, error: new ParseError(ctx.issues) };
      }
      return { success: true, data };
    } catch (e) {
      if (e instanceof ParseError) {
        return { success: false, error: e };
      }
      throw e;
    }
  }
  id(name) {
    const clone = this._clone();
    clone._id = name;
    SchemaRegistry.register(name, clone);
    return clone;
  }
  describe(description) {
    const clone = this._clone();
    clone._description = description;
    return clone;
  }
  meta(data) {
    const clone = this._clone();
    clone._meta = { ...(this._meta ?? {}), ...data };
    return clone;
  }
  example(value) {
    const clone = this._clone();
    clone._examples = [...this._examples, value];
    return clone;
  }
  get metadata() {
    return {
      type: this._schemaType(),
      id: this._id,
      description: this._description,
      meta: this._meta,
      examples: this._examples,
    };
  }
  toJSONSchema() {
    const tracker = new RefTracker();
    const schema = this._toJSONSchemaWithRefs(tracker);
    const defs = tracker.getDefs();
    if (Object.keys(defs).length > 0) {
      return { $defs: defs, ...schema };
    }
    return schema;
  }
  _toJSONSchemaWithRefs(tracker) {
    if (this._id && tracker.hasSeen(this._id)) {
      return { $ref: `#/$defs/${this._id}` };
    }
    if (this._id) {
      tracker.markSeen(this._id);
      const jsonSchema = this._applyMetadata(this._toJSONSchema(tracker));
      tracker.addDef(this._id, jsonSchema);
      return { $ref: `#/$defs/${this._id}` };
    }
    return this._applyMetadata(this._toJSONSchema(tracker));
  }
  _applyMetadata(schema) {
    if (this._description) schema.description = this._description;
    if (this._examples.length > 0) schema.examples = this._examples;
    return schema;
  }
  _cloneBase(target) {
    target._id = this._id;
    target._description = this._description;
    target._meta = this._meta ? { ...this._meta } : undefined;
    target._examples = [...this._examples];
    return target;
  }
  optional() {
    return new OptionalSchema(this);
  }
  nullable() {
    return new NullableSchema(this);
  }
  default(defaultValue) {
    return new DefaultSchema(this, defaultValue);
  }
  refine(predicate, params) {
    return new RefinedSchema(this, predicate, params);
  }
  superRefine(refinement) {
    return new SuperRefinedSchema(this, refinement);
  }
  check(refinement) {
    return new SuperRefinedSchema(this, refinement);
  }
  transform(fn) {
    return new TransformSchema(this, fn);
  }
  pipe(schema) {
    return new PipeSchema(this, schema);
  }
  catch(fallback) {
    return new CatchSchema(this, fallback);
  }
  brand() {
    return new BrandedSchema(this);
  }
  readonly() {
    return new ReadonlySchema(this);
  }
  _runPipeline(value, ctx) {
    return this._parse(value, ctx);
  }
}
export class OptionalSchema extends Schema {
  _inner;
  constructor(_inner) {
    super();
    this._inner = _inner;
  }
  _schemaType() {
    return this._inner._schemaType();
  }
  _parse(value, ctx) {
    if (value === undefined) return undefined;
    return this._inner._runPipeline(value, ctx);
  }
  _toJSONSchema(tracker) {
    return this._inner._toJSONSchemaWithRefs(tracker);
  }
  _clone() {
    return this._cloneBase(new OptionalSchema(this._inner));
  }
  unwrap() {
    return this._inner;
  }
}
export class NullableSchema extends Schema {
  _inner;
  constructor(_inner) {
    super();
    this._inner = _inner;
  }
  _schemaType() {
    return this._inner._schemaType();
  }
  _parse(value, ctx) {
    if (value === null) return null;
    return this._inner._runPipeline(value, ctx);
  }
  _toJSONSchema(tracker) {
    const inner = this._inner._toJSONSchemaWithRefs(tracker);
    if (typeof inner.type === 'string') {
      return { ...inner, type: [inner.type, 'null'] };
    }
    return { anyOf: [inner, { type: 'null' }] };
  }
  _clone() {
    return this._cloneBase(new NullableSchema(this._inner));
  }
  unwrap() {
    return this._inner;
  }
}
export class DefaultSchema extends Schema {
  _inner;
  _default;
  constructor(_inner, _default) {
    super();
    this._inner = _inner;
    this._default = _default;
  }
  _schemaType() {
    return this._inner._schemaType();
  }
  _parse(value, ctx) {
    if (value === undefined) {
      return this._inner._runPipeline(this._resolveDefault(), ctx);
    }
    return this._inner._runPipeline(value, ctx);
  }
  _toJSONSchema(tracker) {
    const inner = this._inner._toJSONSchemaWithRefs(tracker);
    return { ...inner, default: this._resolveDefault() };
  }
  _resolveDefault() {
    return typeof this._default === 'function' ? this._default() : this._default;
  }
  _clone() {
    return this._cloneBase(new DefaultSchema(this._inner, this._default));
  }
  unwrap() {
    return this._inner;
  }
}
export class RefinedSchema extends Schema {
  _inner;
  _predicate;
  _message;
  _path;
  constructor(inner, predicate, params) {
    super();
    this._inner = inner;
    this._predicate = predicate;
    const normalized = typeof params === 'string' ? { message: params } : params;
    this._message = normalized?.message ?? 'Custom validation failed';
    this._path = normalized?.path;
  }
  _parse(value, ctx) {
    const result = this._inner._runPipeline(value, ctx);
    if (ctx.hasIssues()) return result;
    if (!this._predicate(result)) {
      ctx.addIssue({
        code: ErrorCode.Custom,
        message: this._message,
        path: this._path,
      });
    }
    return result;
  }
  _schemaType() {
    return this._inner._schemaType();
  }
  _toJSONSchema(tracker) {
    return this._inner._toJSONSchemaWithRefs(tracker);
  }
  _clone() {
    return this._cloneBase(
      new RefinedSchema(this._inner, this._predicate, {
        message: this._message,
        path: this._path,
      }),
    );
  }
}
export class SuperRefinedSchema extends Schema {
  _inner;
  _refinement;
  constructor(inner, refinement) {
    super();
    this._inner = inner;
    this._refinement = refinement;
  }
  _parse(value, ctx) {
    const result = this._inner._runPipeline(value, ctx);
    if (ctx.hasIssues()) return result;
    this._refinement(result, ctx);
    return result;
  }
  _schemaType() {
    return this._inner._schemaType();
  }
  _toJSONSchema(tracker) {
    return this._inner._toJSONSchemaWithRefs(tracker);
  }
  _clone() {
    return this._cloneBase(new SuperRefinedSchema(this._inner, this._refinement));
  }
}
export class TransformSchema extends Schema {
  _inner;
  _transform;
  constructor(inner, transform) {
    super();
    this._inner = inner;
    this._transform = transform;
  }
  _parse(value, ctx) {
    const result = this._inner._runPipeline(value, ctx);
    if (ctx.hasIssues()) return result;
    try {
      return this._transform(result);
    } catch (e) {
      ctx.addIssue({
        code: ErrorCode.Custom,
        message: e instanceof Error ? e.message : 'Transform failed',
      });
      return result;
    }
  }
  _schemaType() {
    return this._inner._schemaType();
  }
  _toJSONSchema(tracker) {
    return this._inner._toJSONSchemaWithRefs(tracker);
  }
  _clone() {
    return this._cloneBase(new TransformSchema(this._inner, this._transform));
  }
}
export class PipeSchema extends Schema {
  _first;
  _second;
  constructor(first, second) {
    super();
    this._first = first;
    this._second = second;
  }
  _parse(value, ctx) {
    const intermediate = this._first._runPipeline(value, ctx);
    if (ctx.hasIssues()) return intermediate;
    return this._second._runPipeline(intermediate, ctx);
  }
  _schemaType() {
    return this._second._schemaType();
  }
  _toJSONSchema(tracker) {
    return this._first._toJSONSchemaWithRefs(tracker);
  }
  _clone() {
    return this._cloneBase(new PipeSchema(this._first, this._second));
  }
}
export class CatchSchema extends Schema {
  _inner;
  _fallback;
  constructor(inner, fallback) {
    super();
    this._inner = inner;
    this._fallback = fallback;
  }
  _parse(value, _ctx) {
    const innerCtx = new ParseContext();
    const result = this._inner._runPipeline(value, innerCtx);
    if (innerCtx.hasIssues()) {
      return this._resolveFallback();
    }
    return result;
  }
  _schemaType() {
    return this._inner._schemaType();
  }
  _toJSONSchema(tracker) {
    return this._inner._toJSONSchemaWithRefs(tracker);
  }
  _resolveFallback() {
    return typeof this._fallback === 'function' ? this._fallback() : this._fallback;
  }
  _clone() {
    return this._cloneBase(new CatchSchema(this._inner, this._fallback));
  }
}
export class BrandedSchema extends Schema {
  _inner;
  constructor(inner) {
    super();
    this._inner = inner;
  }
  _parse(value, ctx) {
    return this._inner._runPipeline(value, ctx);
  }
  _schemaType() {
    return this._inner._schemaType();
  }
  _toJSONSchema(tracker) {
    return this._inner._toJSONSchemaWithRefs(tracker);
  }
  _clone() {
    return this._cloneBase(new BrandedSchema(this._inner));
  }
}
export class ReadonlySchema extends Schema {
  _inner;
  constructor(inner) {
    super();
    this._inner = inner;
  }
  _parse(value, ctx) {
    const result = this._inner._runPipeline(value, ctx);
    if (ctx.hasIssues()) return result;
    if (typeof result === 'object' && result !== null) {
      return Object.freeze(result);
    }
    return result;
  }
  _schemaType() {
    return this._inner._schemaType();
  }
  _toJSONSchema(tracker) {
    return this._inner._toJSONSchemaWithRefs(tracker);
  }
  _clone() {
    return this._cloneBase(new ReadonlySchema(this._inner));
  }
}
//# sourceMappingURL=schema.js.map
