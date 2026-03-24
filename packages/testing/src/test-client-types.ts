import type { ModelDef } from '@vertz/db';
import type {
  EntityDefinition,
  ListResult,
  ServiceActionDef,
  ServiceDefinition,
} from '@vertz/server';

export type { ListResult } from '@vertz/server';

// ---------------------------------------------------------------------------
// ErrorBody — standard error response shape from Vertz
// ---------------------------------------------------------------------------

export interface ErrorBody {
  error: string;
  message: string;
  statusCode: number;
  details?: unknown;
}

// ---------------------------------------------------------------------------
// TestResponse — discriminated union with raw Response access
// ---------------------------------------------------------------------------

export type TestResponse<T = unknown> =
  | { ok: true; status: number; body: T; headers: Record<string, string>; raw: Response }
  | { ok: false; status: number; body: ErrorBody; headers: Record<string, string>; raw: Response };

// ---------------------------------------------------------------------------
// Request options
// ---------------------------------------------------------------------------

export interface RequestOptions<TBody = unknown> {
  body?: TBody;
  headers?: Record<string, string>;
}

export interface EntityListOptions {
  where?: Record<string, unknown>;
  orderBy?: Record<string, 'asc' | 'desc'>;
  limit?: number;
  after?: string;
  select?: Record<string, true>;
  include?: Record<string, unknown>;
  headers?: Record<string, string>;
}

export interface EntityRequestOptions {
  headers?: Record<string, string>;
}

export interface ServiceCallOptions {
  headers?: Record<string, string>;
}

// ---------------------------------------------------------------------------
// TestClient options
// ---------------------------------------------------------------------------

export interface TestClientOptions {
  defaultHeaders?: Record<string, string>;
}

// ---------------------------------------------------------------------------
// EntityTestProxy
// ---------------------------------------------------------------------------

export interface EntityTestProxy<TModel extends ModelDef> {
  list(
    options?: EntityListOptions,
  ): Promise<TestResponse<ListResult<TModel['table']['$response']>>>;
  get(
    id: string,
    options?: EntityRequestOptions,
  ): Promise<TestResponse<TModel['table']['$response']>>;
  create(
    body: TModel['table']['$create_input'],
    options?: EntityRequestOptions,
  ): Promise<TestResponse<TModel['table']['$response']>>;
  update(
    id: string,
    body: TModel['table']['$update_input'],
    options?: EntityRequestOptions,
  ): Promise<TestResponse<TModel['table']['$response']>>;
  delete(id: string, options?: EntityRequestOptions): Promise<TestResponse<null>>;
}

// ---------------------------------------------------------------------------
// ServiceTestProxy — direct method access via mapped type
// ---------------------------------------------------------------------------

/** Extract TActions from a ServiceDefinition's phantom type field */
type InferActions<TDef> = TDef extends { readonly __actions?: infer A }
  ? A extends Record<string, ServiceActionDef<infer _I, infer _O, infer _C>>
    ? A
    : Record<string, ServiceActionDef>
  : Record<string, ServiceActionDef>;

type ExtractInput<T> =
  T extends ServiceActionDef<infer TInput, infer _O, infer _C> ? TInput : unknown;
type ExtractOutput<T> =
  T extends ServiceActionDef<infer _I, infer TOutput, infer _C> ? TOutput : unknown;

export type ServiceTestProxy<TDef extends ServiceDefinition> = {
  [K in Extract<keyof InferActions<TDef>, string>]: [unknown] extends [
    ExtractInput<InferActions<TDef>[K]>,
  ]
    ? (options?: ServiceCallOptions) => Promise<TestResponse<ExtractOutput<InferActions<TDef>[K]>>>
    : (
        body: ExtractInput<InferActions<TDef>[K]>,
        options?: ServiceCallOptions,
      ) => Promise<TestResponse<ExtractOutput<InferActions<TDef>[K]>>>;
};

// ---------------------------------------------------------------------------
// TestClient
// ---------------------------------------------------------------------------

export interface TestClient {
  entity<TModel extends ModelDef>(def: EntityDefinition<TModel>): EntityTestProxy<TModel>;

  service<TDef extends ServiceDefinition>(def: TDef): ServiceTestProxy<TDef>;

  /** Returns a new immutable client with merged default headers. */
  withHeaders(headers: Record<string, string>): TestClient;

  get(path: string, options?: RequestOptions): Promise<TestResponse>;
  post(path: string, options?: RequestOptions): Promise<TestResponse>;
  put(path: string, options?: RequestOptions): Promise<TestResponse>;
  patch(path: string, options?: RequestOptions): Promise<TestResponse>;
  delete(path: string, options?: RequestOptions): Promise<TestResponse>;
  head(path: string, options?: RequestOptions): Promise<TestResponse>;
}
