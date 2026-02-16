import type { JSONSchemaObject } from '../introspection/json-schema';
import { RefTracker } from '../introspection/json-schema';
import type { RefinementContext } from './parse-context';
import { ParseContext } from './parse-context';
import type { SafeParseResult, SchemaMetadata, SchemaType } from './types';
export type SchemaAny = Schema<any, any>;
/** Apply Readonly only to object types; leave primitives and `any` unchanged. */
export type ReadonlyOutput<O> = 0 extends 1 & O ? O : O extends object ? Readonly<O> : O;
type InnerSchema<I = unknown> = Schema<any, I>;
type InnerTransformFn<O> = (value: any) => O;
export declare abstract class Schema<O, I = O> {
  /** @internal */ readonly _output: O;
  /** @internal */ readonly _input: I;
  /** @internal */ _id: string | undefined;
  /** @internal */ _description: string | undefined;
  /** @internal */ _meta: Record<string, unknown> | undefined;
  /** @internal */ _examples: unknown[];
  constructor();
  /** Validate and return the parsed value. Return value is discarded when `ctx` has issues. */
  abstract _parse(value: unknown, ctx: ParseContext): O;
  abstract _schemaType(): SchemaType;
  abstract _toJSONSchema(tracker: RefTracker): JSONSchemaObject;
  abstract _clone(): Schema<O, I>;
  parse(value: unknown): O;
  safeParse(value: unknown): SafeParseResult<O>;
  id(name: string): this;
  describe(description: string): this;
  meta(data: Record<string, unknown>): this;
  example(value: I): this;
  get metadata(): SchemaMetadata;
  toJSONSchema(): JSONSchemaObject;
  _toJSONSchemaWithRefs(tracker: RefTracker): JSONSchemaObject;
  private _applyMetadata;
  protected _cloneBase<
    T extends {
      _id: string | undefined;
      _description: string | undefined;
      _meta: Record<string, unknown> | undefined;
      _examples: unknown[];
    },
  >(target: T): T;
  optional(): OptionalSchema<O, I>;
  nullable(): NullableSchema<O, I>;
  default(defaultValue: I | (() => I)): DefaultSchema<O, I>;
  refine(
    predicate: (value: O) => boolean,
    params?:
      | string
      | {
          message?: string;
          path?: (string | number)[];
        },
  ): RefinedSchema<O, I>;
  superRefine(refinement: (value: O, ctx: RefinementContext) => void): SuperRefinedSchema<O, I>;
  check(refinement: (value: O, ctx: RefinementContext) => void): SuperRefinedSchema<O, I>;
  transform<NewO>(fn: (value: O) => NewO): TransformSchema<NewO, I>;
  pipe<NewO>(schema: Schema<NewO>): PipeSchema<NewO, I>;
  catch(fallback: O | (() => O)): CatchSchema<O, I>;
  brand<B extends string | symbol>(): BrandedSchema<
    O & {
      readonly __brand: B;
    },
    I
  >;
  readonly(): ReadonlySchema<ReadonlyOutput<O>, I>;
  _runPipeline(value: unknown, ctx: ParseContext): O;
}
export declare class OptionalSchema<O, I> extends Schema<O | undefined, I | undefined> {
  private readonly _inner;
  constructor(_inner: Schema<O, I>);
  _schemaType(): SchemaType;
  _parse(value: unknown, ctx: ParseContext): O | undefined;
  _toJSONSchema(tracker: RefTracker): JSONSchemaObject;
  _clone(): OptionalSchema<O, I>;
  unwrap(): Schema<O, I>;
}
export declare class NullableSchema<O, I> extends Schema<O | null, I | null> {
  private readonly _inner;
  constructor(_inner: Schema<O, I>);
  _schemaType(): SchemaType;
  _parse(value: unknown, ctx: ParseContext): O | null;
  _toJSONSchema(tracker: RefTracker): JSONSchemaObject;
  _clone(): NullableSchema<O, I>;
  unwrap(): Schema<O, I>;
}
export declare class DefaultSchema<O, I> extends Schema<O, I | undefined> {
  private readonly _inner;
  private readonly _default;
  constructor(_inner: Schema<O, I>, _default: I | (() => I));
  _schemaType(): SchemaType;
  _parse(value: unknown, ctx: ParseContext): O;
  _toJSONSchema(tracker: RefTracker): JSONSchemaObject;
  private _resolveDefault;
  _clone(): DefaultSchema<O, I>;
  unwrap(): Schema<O, I>;
}
export declare class RefinedSchema<O, I = O> extends Schema<O, I> {
  private readonly _inner;
  private readonly _predicate;
  private readonly _message;
  private readonly _path;
  constructor(
    inner: Schema<O, I>,
    predicate: (value: O) => boolean,
    params?:
      | string
      | {
          message?: string;
          path?: (string | number)[];
        },
  );
  _parse(value: unknown, ctx: ParseContext): O;
  _schemaType(): SchemaType;
  _toJSONSchema(tracker: RefTracker): JSONSchemaObject;
  _clone(): RefinedSchema<O, I>;
}
export declare class SuperRefinedSchema<O, I = O> extends Schema<O, I> {
  private readonly _inner;
  private readonly _refinement;
  constructor(inner: Schema<O, I>, refinement: (value: O, ctx: RefinementContext) => void);
  _parse(value: unknown, ctx: ParseContext): O;
  _schemaType(): SchemaType;
  _toJSONSchema(tracker: RefTracker): JSONSchemaObject;
  _clone(): SuperRefinedSchema<O, I>;
}
export declare class TransformSchema<O, I = unknown> extends Schema<O, I> {
  private readonly _inner;
  private readonly _transform;
  constructor(inner: InnerSchema<I>, transform: InnerTransformFn<O>);
  _parse(value: unknown, ctx: ParseContext): O;
  _schemaType(): SchemaType;
  _toJSONSchema(tracker: RefTracker): JSONSchemaObject;
  _clone(): TransformSchema<O, I>;
}
export declare class PipeSchema<O, I = unknown> extends Schema<O, I> {
  private readonly _first;
  private readonly _second;
  constructor(first: InnerSchema<I>, second: Schema<O>);
  _parse(value: unknown, ctx: ParseContext): O;
  _schemaType(): SchemaType;
  _toJSONSchema(tracker: RefTracker): JSONSchemaObject;
  _clone(): PipeSchema<O, I>;
}
export declare class CatchSchema<O, I = O> extends Schema<O, I> {
  private readonly _inner;
  private readonly _fallback;
  constructor(inner: Schema<O, I>, fallback: O | (() => O));
  _parse(value: unknown, _ctx: ParseContext): O;
  _schemaType(): SchemaType;
  _toJSONSchema(tracker: RefTracker): JSONSchemaObject;
  private _resolveFallback;
  _clone(): CatchSchema<O, I>;
}
export declare class BrandedSchema<O, I = unknown> extends Schema<O, I> {
  private readonly _inner;
  constructor(inner: InnerSchema<I>);
  _parse(value: unknown, ctx: ParseContext): O;
  _schemaType(): SchemaType;
  _toJSONSchema(tracker: RefTracker): JSONSchemaObject;
  _clone(): BrandedSchema<O, I>;
}
export declare class ReadonlySchema<O, I = unknown> extends Schema<O, I> {
  private readonly _inner;
  constructor(inner: InnerSchema<I>);
  _parse(value: unknown, ctx: ParseContext): O;
  _schemaType(): SchemaType;
  _toJSONSchema(tracker: RefTracker): JSONSchemaObject;
  _clone(): ReadonlySchema<O, I>;
}
//# sourceMappingURL=schema.d.ts.map
