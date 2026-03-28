import type { SchemaLike } from '@vertz/db';
import type { ResponseDescriptor } from './response';

// ---------------------------------------------------------------------------
// ActionDef — explicit return type for action()
// ---------------------------------------------------------------------------

export interface ActionDef<TInput = unknown, TOutput = unknown> {
  readonly method?: string;
  readonly path?: string;
  readonly body?: SchemaLike<TInput>;
  readonly response: SchemaLike<TOutput>;
  readonly handler: (
    input: TInput,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- action() can't type ctx/row — entity/service constraints provide these
    ctx: any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- action() can't type row — entity constraint provides this
    row: any,
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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- action() can't type ctx/row — entity/service constraints provide these
    ctx: any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- action() can't type row — entity constraint provides this
    row: any,
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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- action() can't type ctx/row — entity/service constraints provide these
    ctx: any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- action() can't type row — entity constraint provides this
    row: any,
  ) => Promise<TOutput | ResponseDescriptor<TOutput>>;
}): ActionDef<unknown, TOutput>;

// ---------------------------------------------------------------------------
// Implementation — identity function at runtime
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- implementation signature matches both overloads
export function action(config: any): any {
  return config;
}
