import type { JSONSchemaObject } from '../introspection/json-schema';
import { RefTracker } from '../introspection/json-schema';
import { err, ok, type Result } from '../result';
import { ErrorCode, ParseError } from './errors';
import type { RefinementContext } from './parse-context';
import { ParseContext } from './parse-context';
import { SchemaRegistry } from './registry';
import type { SchemaMetadata, SchemaType } from './types';

// biome-ignore lint/suspicious/noExplicitAny: Schema is invariant; any is required for type-level bounds
export type SchemaAny = Schema<any, any>;

/** Apply Readonly only to object types; leave primitives and `any` unchanged. */
export type ReadonlyOutput<O> = 0 extends 1 & O ? O : O extends object ? Readonly<O> : O;

// biome-ignore lint/suspicious/noExplicitAny: inner schema with erased output type for wrapper schemas
type InnerSchema<I = unknown> = Schema<any, I>;

// biome-ignore lint/suspicious/noExplicitAny: transform accepts inner schema's erased output
type InnerTransformFn<O> = (value: any) => O;

export abstract class Schema<O, I = O> {
  /** @internal */ declare readonly _output: O;
  /** @internal */ declare readonly _input: I;
  /** @internal */ _id: string | undefined;
  /** @internal */ _description: string | undefined;
  /** @internal */ _meta: Record<string, unknown> | undefined;
  /** @internal */ _examples: unknown[];

  constructor() {
    this._examples = [];
  }

  /** Validate and return the parsed value. Return value is discarded when `ctx` has issues. */
  abstract _parse(value: unknown, ctx: ParseContext): O;
  abstract _schemaType(): SchemaType;
  abstract _toJSONSchema(tracker: RefTracker): JSONSchemaObject;
  abstract _clone(): Schema<O, I>;

  parse(value: unknown): Result<O, ParseError> {
    const ctx = new ParseContext();
    const result = this._runPipeline(value, ctx);
    if (ctx.hasIssues()) {
      return err(new ParseError(ctx.issues));
    }
    return ok(result);
  }

  safeParse(value: unknown): Result<O, ParseError> {
    const ctx = new ParseContext();
    try {
      const data = this._runPipeline(value, ctx);
      if (ctx.hasIssues()) {
        return err(new ParseError(ctx.issues));
      }
      return ok(data);
    } catch (e) {
      if (e instanceof ParseError) {
        return err(e);
      }
      throw e;
    }
  }

  id(name: string): this {
    const clone = this._clone();
    clone._id = name;
    SchemaRegistry.register(name, clone);
    return clone as this;
  }

  describe(description: string): this {
    const clone = this._clone();
    clone._description = description;
    return clone as this;
  }

  meta(data: Record<string, unknown>): this {
    const clone = this._clone();
    clone._meta = { ...(this._meta ?? {}), ...data };
    return clone as this;
  }

  example(value: I): this {
    const clone = this._clone();
    clone._examples = [...this._examples, value];
    return clone as this;
  }

  get metadata(): SchemaMetadata {
    return {
      type: this._schemaType(),
      id: this._id,
      description: this._description,
      meta: this._meta,
      examples: this._examples,
    };
  }

  toJSONSchema(): JSONSchemaObject {
    const tracker = new RefTracker();
    const schema = this._toJSONSchemaWithRefs(tracker);
    const defs = tracker.getDefs();
    if (Object.keys(defs).length > 0) {
      return { $defs: defs, ...schema };
    }
    return schema;
  }

  _toJSONSchemaWithRefs(tracker: RefTracker): JSONSchemaObject {
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

  private _applyMetadata(schema: JSONSchemaObject): JSONSchemaObject {
    if (this._description) schema.description = this._description;
    if (this._examples.length > 0) schema.examples = this._examples;
    return schema;
  }

  protected _cloneBase<
    T extends {
      _id: string | undefined;
      _description: string | undefined;
      _meta: Record<string, unknown> | undefined;
      _examples: unknown[];
    },
  >(target: T): T {
    target._id = this._id;
    target._description = this._description;
    target._meta = this._meta ? { ...this._meta } : undefined;
    target._examples = [...this._examples];
    return target;
  }

  optional(): OptionalSchema<O, I> {
    return new OptionalSchema(this);
  }

  nullable(): NullableSchema<O, I> {
    return new NullableSchema(this);
  }

  default(defaultValue: I | (() => I)): DefaultSchema<O, I> {
    return new DefaultSchema(this, defaultValue);
  }

  refine(
    predicate: (value: O) => boolean,
    params?: string | { message?: string; path?: (string | number)[] },
  ): RefinedSchema<O, I> {
    return new RefinedSchema(this, predicate, params);
  }

  superRefine(refinement: (value: O, ctx: RefinementContext) => void): SuperRefinedSchema<O, I> {
    return new SuperRefinedSchema(this, refinement);
  }

  check(refinement: (value: O, ctx: RefinementContext) => void): SuperRefinedSchema<O, I> {
    return new SuperRefinedSchema(this, refinement);
  }

  transform<NewO>(fn: (value: O) => NewO): TransformSchema<NewO, I> {
    return new TransformSchema(this, fn);
  }

  pipe<NewO>(schema: Schema<NewO>): PipeSchema<NewO, I> {
    return new PipeSchema(this, schema);
  }

  catch(fallback: O | (() => O)): CatchSchema<O, I> {
    return new CatchSchema(this, fallback);
  }

  brand<B extends string | symbol>(): BrandedSchema<O & { readonly __brand: B }, I> {
    return new BrandedSchema(this);
  }

  readonly(): ReadonlySchema<ReadonlyOutput<O>, I> {
    return new ReadonlySchema(this) as ReadonlySchema<ReadonlyOutput<O>, I>;
  }

  _runPipeline(value: unknown, ctx: ParseContext): O {
    return this._parse(value, ctx);
  }
}

export class OptionalSchema<O, I> extends Schema<O | undefined, I | undefined> {
  constructor(private readonly _inner: Schema<O, I>) {
    super();
  }

  _schemaType(): SchemaType {
    return this._inner._schemaType();
  }

  _parse(value: unknown, ctx: ParseContext): O | undefined {
    if (value === undefined) return undefined;
    return this._inner._runPipeline(value, ctx);
  }

  _toJSONSchema(tracker: RefTracker): JSONSchemaObject {
    return this._inner._toJSONSchemaWithRefs(tracker);
  }

  _clone(): OptionalSchema<O, I> {
    return this._cloneBase(new OptionalSchema(this._inner));
  }

  unwrap(): Schema<O, I> {
    return this._inner;
  }
}

export class NullableSchema<O, I> extends Schema<O | null, I | null> {
  constructor(private readonly _inner: Schema<O, I>) {
    super();
  }

  _schemaType(): SchemaType {
    return this._inner._schemaType();
  }

  _parse(value: unknown, ctx: ParseContext): O | null {
    if (value === null) return null;
    return this._inner._runPipeline(value, ctx);
  }

  _toJSONSchema(tracker: RefTracker): JSONSchemaObject {
    const inner = this._inner._toJSONSchemaWithRefs(tracker);
    if (typeof inner.type === 'string') {
      return { ...inner, type: [inner.type, 'null'] };
    }
    return { anyOf: [inner, { type: 'null' }] };
  }

  _clone(): NullableSchema<O, I> {
    return this._cloneBase(new NullableSchema(this._inner));
  }

  unwrap(): Schema<O, I> {
    return this._inner;
  }
}

export class DefaultSchema<O, I> extends Schema<O, I | undefined> {
  constructor(
    private readonly _inner: Schema<O, I>,
    private readonly _default: I | (() => I),
  ) {
    super();
  }

  _schemaType(): SchemaType {
    return this._inner._schemaType();
  }

  _parse(value: unknown, ctx: ParseContext): O {
    if (value === undefined) {
      return this._inner._runPipeline(this._resolveDefault(), ctx);
    }
    return this._inner._runPipeline(value, ctx);
  }

  _toJSONSchema(tracker: RefTracker): JSONSchemaObject {
    const inner = this._inner._toJSONSchemaWithRefs(tracker);
    return { ...inner, default: this._resolveDefault() };
  }

  private _resolveDefault(): I {
    return typeof this._default === 'function' ? (this._default as () => I)() : this._default;
  }

  _clone(): DefaultSchema<O, I> {
    return this._cloneBase(new DefaultSchema(this._inner, this._default));
  }

  unwrap(): Schema<O, I> {
    return this._inner;
  }
}

export class RefinedSchema<O, I = O> extends Schema<O, I> {
  private readonly _inner: Schema<O, I>;
  private readonly _predicate: (value: O) => boolean;
  private readonly _message: string;
  private readonly _path: (string | number)[] | undefined;

  constructor(
    inner: Schema<O, I>,
    predicate: (value: O) => boolean,
    params?: string | { message?: string; path?: (string | number)[] },
  ) {
    super();
    this._inner = inner;
    this._predicate = predicate;
    const normalized = typeof params === 'string' ? { message: params } : params;
    this._message = normalized?.message ?? 'Custom validation failed';
    this._path = normalized?.path;
  }

  _parse(value: unknown, ctx: ParseContext): O {
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

  _schemaType(): SchemaType {
    return this._inner._schemaType();
  }

  _toJSONSchema(tracker: RefTracker): JSONSchemaObject {
    return this._inner._toJSONSchemaWithRefs(tracker);
  }

  _clone(): RefinedSchema<O, I> {
    return this._cloneBase(
      new RefinedSchema(this._inner, this._predicate, {
        message: this._message,
        path: this._path,
      }),
    );
  }
}

export class SuperRefinedSchema<O, I = O> extends Schema<O, I> {
  private readonly _inner: Schema<O, I>;
  private readonly _refinement: (value: O, ctx: RefinementContext) => void;

  constructor(inner: Schema<O, I>, refinement: (value: O, ctx: RefinementContext) => void) {
    super();
    this._inner = inner;
    this._refinement = refinement;
  }

  _parse(value: unknown, ctx: ParseContext): O {
    const result = this._inner._runPipeline(value, ctx);
    if (ctx.hasIssues()) return result;
    this._refinement(result, ctx);
    return result;
  }

  _schemaType(): SchemaType {
    return this._inner._schemaType();
  }

  _toJSONSchema(tracker: RefTracker): JSONSchemaObject {
    return this._inner._toJSONSchemaWithRefs(tracker);
  }

  _clone(): SuperRefinedSchema<O, I> {
    return this._cloneBase(new SuperRefinedSchema(this._inner, this._refinement));
  }
}

export class TransformSchema<O, I = unknown> extends Schema<O, I> {
  private readonly _inner: InnerSchema<I>;
  private readonly _transform: InnerTransformFn<O>;

  constructor(inner: InnerSchema<I>, transform: InnerTransformFn<O>) {
    super();
    this._inner = inner;
    this._transform = transform;
  }

  _parse(value: unknown, ctx: ParseContext): O {
    const result = this._inner._runPipeline(value, ctx);
    if (ctx.hasIssues()) return result as O;
    try {
      return this._transform(result);
    } catch (e) {
      ctx.addIssue({
        code: ErrorCode.Custom,
        message: e instanceof Error ? e.message : 'Transform failed',
      });
      return result as O;
    }
  }

  _schemaType(): SchemaType {
    return this._inner._schemaType();
  }

  _toJSONSchema(tracker: RefTracker): JSONSchemaObject {
    return this._inner._toJSONSchemaWithRefs(tracker);
  }

  _clone(): TransformSchema<O, I> {
    return this._cloneBase(new TransformSchema(this._inner, this._transform));
  }
}

export class PipeSchema<O, I = unknown> extends Schema<O, I> {
  private readonly _first: InnerSchema<I>;
  private readonly _second: Schema<O>;

  constructor(first: InnerSchema<I>, second: Schema<O>) {
    super();
    this._first = first;
    this._second = second;
  }

  _parse(value: unknown, ctx: ParseContext): O {
    const intermediate = this._first._runPipeline(value, ctx);
    if (ctx.hasIssues()) return intermediate as O;
    return this._second._runPipeline(intermediate, ctx);
  }

  _schemaType(): SchemaType {
    return this._second._schemaType();
  }

  _toJSONSchema(tracker: RefTracker): JSONSchemaObject {
    return this._first._toJSONSchemaWithRefs(tracker);
  }

  _clone(): PipeSchema<O, I> {
    return this._cloneBase(new PipeSchema(this._first, this._second));
  }
}

export class CatchSchema<O, I = O> extends Schema<O, I> {
  private readonly _inner: Schema<O, I>;
  private readonly _fallback: O | (() => O);

  constructor(inner: Schema<O, I>, fallback: O | (() => O)) {
    super();
    this._inner = inner;
    this._fallback = fallback;
  }

  _parse(value: unknown, _ctx: ParseContext): O {
    const innerCtx = new ParseContext();
    const result = this._inner._runPipeline(value, innerCtx);
    if (innerCtx.hasIssues()) {
      return this._resolveFallback();
    }
    return result;
  }

  _schemaType(): SchemaType {
    return this._inner._schemaType();
  }

  _toJSONSchema(tracker: RefTracker): JSONSchemaObject {
    return this._inner._toJSONSchemaWithRefs(tracker);
  }

  private _resolveFallback(): O {
    return typeof this._fallback === 'function' ? (this._fallback as () => O)() : this._fallback;
  }

  _clone(): CatchSchema<O, I> {
    return this._cloneBase(new CatchSchema(this._inner, this._fallback));
  }
}

export class BrandedSchema<O, I = unknown> extends Schema<O, I> {
  private readonly _inner: InnerSchema<I>;

  constructor(inner: InnerSchema<I>) {
    super();
    this._inner = inner;
  }

  _parse(value: unknown, ctx: ParseContext): O {
    return this._inner._runPipeline(value, ctx) as O;
  }

  _schemaType(): SchemaType {
    return this._inner._schemaType();
  }

  _toJSONSchema(tracker: RefTracker): JSONSchemaObject {
    return this._inner._toJSONSchemaWithRefs(tracker);
  }

  _clone(): BrandedSchema<O, I> {
    return this._cloneBase(new BrandedSchema(this._inner));
  }
}

export class ReadonlySchema<O, I = unknown> extends Schema<O, I> {
  private readonly _inner: InnerSchema<I>;

  constructor(inner: InnerSchema<I>) {
    super();
    this._inner = inner;
  }

  _parse(value: unknown, ctx: ParseContext): O {
    const result = this._inner._runPipeline(value, ctx);
    if (ctx.hasIssues()) return result as O;
    if (typeof result === 'object' && result !== null) {
      return Object.freeze(result) as O;
    }
    return result as O;
  }

  _schemaType(): SchemaType {
    return this._inner._schemaType();
  }

  _toJSONSchema(tracker: RefTracker): JSONSchemaObject {
    return this._inner._toJSONSchemaWithRefs(tracker);
  }

  _clone(): ReadonlySchema<O, I> {
    return this._cloneBase(new ReadonlySchema(this._inner));
  }
}
