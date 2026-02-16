import type { HandlerCtx } from '../types/context';
import type { RouterDef, ServiceDef } from '../types/module';
import type { NamedServiceDef } from './service';
type InferOutput<T, TDefault = unknown> = T extends {
  _output: infer O;
}
  ? O
  : T extends {
        parse(v: unknown): infer P;
      }
    ? P
    : TDefault;
type TypedHandlerCtx<
  TParams = unknown,
  TQuery = unknown,
  THeaders = unknown,
  TBody = unknown,
  TMiddleware extends Record<string, unknown> = Record<string, unknown>,
> = Omit<HandlerCtx, 'params' | 'query' | 'headers' | 'body'> & {
  params: TParams;
  query: TQuery;
  headers: THeaders;
  body: TBody;
} & TMiddleware;
export interface RouteConfig<
  TParams = unknown,
  TQuery = unknown,
  THeaders = unknown,
  TBody = unknown,
  TMiddleware extends Record<string, unknown> = Record<string, unknown>,
> {
  params?: TParams;
  body?: TBody;
  query?: TQuery;
  response?: unknown;
  /** Error schemas for errors-as-values pattern. Keys are HTTP status codes. */
  errors?: Record<number, unknown>;
  headers?: THeaders;
  middlewares?: unknown[];
  handler: (
    ctx: TypedHandlerCtx<
      InferOutput<TParams>,
      InferOutput<TQuery, Record<string, string>>,
      InferOutput<THeaders>,
      InferOutput<TBody>,
      TMiddleware
    >,
  ) => unknown;
}
export interface Route {
  method: string;
  path: string;
  config: RouteConfig<unknown, unknown, unknown, unknown, Record<string, unknown>>;
}
/**
 * Extracts the TMethods type from a NamedServiceDef or ServiceDef.
 * Returns `unknown` for non-service types.
 */
export type ExtractMethods<T> =
  T extends NamedServiceDef<any, any, infer M>
    ? M
    : T extends ServiceDef<any, any, infer M>
      ? M
      : unknown;
/**
 * Resolves an inject map by extracting TMethods from each NamedServiceDef value.
 * Given `{ userService: NamedServiceDef<..., ..., UserMethods> }`,
 * produces `{ userService: UserMethods }`.
 */
export type ResolveInjectMap<T extends Record<string, unknown>> = {
  [K in keyof T]: ExtractMethods<T[K]>;
};
type HttpMethodFn<
  TMiddleware extends Record<string, unknown> = Record<string, unknown>,
  TInject extends Record<string, unknown> = Record<string, unknown>,
> = <TParams, TQuery, THeaders, TBody>(
  path: `/${string}`,
  config: RouteConfig<TParams, TQuery, THeaders, TBody, TMiddleware & ResolveInjectMap<TInject>>,
) => NamedRouterDef<TMiddleware, TInject>;
export interface NamedRouterDef<
  TMiddleware extends Record<string, unknown> = Record<string, unknown>,
  TInject extends Record<string, unknown> = Record<string, unknown>,
> extends RouterDef<TInject> {
  moduleName: string;
  routes: Route[];
  get: HttpMethodFn<TMiddleware, TInject>;
  post: HttpMethodFn<TMiddleware, TInject>;
  put: HttpMethodFn<TMiddleware, TInject>;
  patch: HttpMethodFn<TMiddleware, TInject>;
  delete: HttpMethodFn<TMiddleware, TInject>;
  head: HttpMethodFn<TMiddleware, TInject>;
}
export declare function createRouterDef<
  TMiddleware extends Record<string, unknown> = Record<string, unknown>,
  TInject extends Record<string, unknown> = Record<string, unknown>,
>(moduleName: string, config: RouterDef<TInject>): NamedRouterDef<TMiddleware, TInject>;
//# sourceMappingURL=router-def.d.ts.map
