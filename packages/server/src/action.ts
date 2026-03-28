import type { SchemaLike } from '@vertz/db';
import type { ResponseDescriptor } from './response';

// ---------------------------------------------------------------------------
// ActionDef — explicit return type for action()
// ---------------------------------------------------------------------------

/** Return type for action() with body — assignable to both ServiceActionDef and EntityActionDef. */
export interface ActionDef<TInput = unknown, TOutput = unknown> {
  readonly method?: string;
  readonly path?: string;
  readonly body: SchemaLike<TInput>;
  readonly response: SchemaLike<TOutput>;
  readonly handler: (
    input: TInput,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- action() can't type ctx — entity/service constraints provide this
    ctx: any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- action() can't type row — entity constraint provides this; optional for service compat
    row?: any,
  ) => Promise<TOutput | ResponseDescriptor<TOutput>>;
}

/** Return type for action() without body — assignable to ServiceActionDef only. */
export interface ActionDefNoBody<TOutput = unknown> {
  readonly method?: string;
  readonly path?: string;
  readonly response: SchemaLike<TOutput>;
  readonly handler: (
    input: unknown,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- action() can't type ctx — entity/service constraints provide this
    ctx: any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- action() can't type row — optional for service compat
    row?: any,
  ) => Promise<TOutput | ResponseDescriptor<TOutput>>;
}

// ---------------------------------------------------------------------------
// Overload 1: With body — TInput inferred from SchemaLike<TInput>
// ---------------------------------------------------------------------------

export function action<TInput, TOutput>(config: {
  readonly method?: string;
  readonly path?: string;
  readonly body: SchemaLike<TInput>;
  readonly response: SchemaLike<TOutput>;
  readonly handler: (
    input: TInput,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- action() can't type ctx — entity/service constraints provide this
    ctx: any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- action() can't type row — entity constraint provides this; optional for service compat
    row?: any,
  ) => Promise<TOutput | ResponseDescriptor<TOutput>>;
}): ActionDef<TInput, TOutput>;

// ---------------------------------------------------------------------------
// Overload 2: Without body — TInput is unknown
// ---------------------------------------------------------------------------

export function action<TOutput>(config: {
  readonly method?: string;
  readonly path?: string;
  readonly response: SchemaLike<TOutput>;
  readonly handler: (
    input: unknown,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- action() can't type ctx — entity/service constraints provide this
    ctx: any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- action() can't type row — optional for service compat
    row?: any,
  ) => Promise<TOutput | ResponseDescriptor<TOutput>>;
}): ActionDefNoBody<TOutput>;

// ---------------------------------------------------------------------------
// Implementation — identity function at runtime
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- implementation signature matches both overloads
export function action(config: any): any {
  return config;
}
