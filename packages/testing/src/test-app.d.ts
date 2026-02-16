import { type NamedMiddlewareDef, type NamedModule, type NamedServiceDef } from '@vertz/server';
import type { DeepPartial } from './types';
/**
 * Route map entry shape that each route in AppRouteMap must follow.
 */
export interface RouteMapEntry {
  params: Record<string, string>;
  query: Record<string, string>;
  body: unknown;
  headers: Record<string, string>;
  response: unknown;
}
/**
 * TestResponse with typed body based on route's response type.
 */
export interface TestResponse<TResponse = unknown> {
  status: number;
  body: TResponse;
  headers: Record<string, string>;
  ok: boolean;
}
export interface TestRequestBuilder<TResponse = unknown>
  extends PromiseLike<TestResponse<TResponse>> {
  mock<TDeps, TState, TMethods>(
    service: NamedServiceDef<TDeps, TState, TMethods>,
    impl: DeepPartial<TMethods>,
  ): TestRequestBuilder<TResponse>;
  mockMiddleware<TReq extends Record<string, unknown>, TProv extends Record<string, unknown>>(
    middleware: NamedMiddlewareDef<TReq, TProv>,
    result: TProv,
  ): TestRequestBuilder<TResponse>;
}
/**
 * Input options for a request, with typed body from the route map.
 */
export interface RequestOptions<TBody = unknown> {
  body?: TBody;
  headers?: Record<string, string>;
}
/**
 * Untyped test app interface for backwards compatibility.
 */
export interface TestApp {
  register(module: NamedModule, options?: Record<string, unknown>): TestApp;
  mock<TDeps, TState, TMethods>(
    service: NamedServiceDef<TDeps, TState, TMethods>,
    impl: DeepPartial<TMethods>,
  ): TestApp;
  mockMiddleware<TReq extends Record<string, unknown>, TProv extends Record<string, unknown>>(
    middleware: NamedMiddlewareDef<TReq, TProv>,
    result: TProv,
  ): TestApp;
  env(vars: Record<string, unknown>): TestApp;
  get(path: string, options?: RequestOptions): TestRequestBuilder;
  post(path: string, options?: RequestOptions): TestRequestBuilder;
  put(path: string, options?: RequestOptions): TestRequestBuilder;
  patch(path: string, options?: RequestOptions): TestRequestBuilder;
  delete(path: string, options?: RequestOptions): TestRequestBuilder;
  head(path: string, options?: RequestOptions): TestRequestBuilder;
}
/**
 * Typed test app interface with route map for type-safe requests.
 * @template TRouteMap - Route map interface mapping route keys (e.g., 'GET /users') to their types.
 */
export interface TestAppWithRoutes<TRouteMap extends RouteMapEntry> {
  register(module: NamedModule, options?: Record<string, unknown>): TestAppWithRoutes<TRouteMap>;
  mock<TDeps, TState, TMethods>(
    service: NamedServiceDef<TDeps, TState, TMethods>,
    impl: DeepPartial<TMethods>,
  ): TestAppWithRoutes<TRouteMap>;
  mockMiddleware<TReq extends Record<string, unknown>, TProv extends Record<string, unknown>>(
    middleware: NamedMiddlewareDef<TReq, TProv>,
    result: TProv,
  ): TestAppWithRoutes<TRouteMap>;
  env(vars: Record<string, unknown>): TestAppWithRoutes<TRouteMap>;
  get<TKey extends `GET ${string}` & keyof TRouteMap>(
    path: string,
    options?: RequestOptions<
      TRouteMap[TKey] extends {
        body: infer TBody;
      }
        ? TBody
        : never
    >,
  ): TestRequestBuilder<
    TRouteMap[TKey] extends {
      response: infer TResponse;
    }
      ? TResponse
      : unknown
  >;
  post<TKey extends `POST ${string}` & keyof TRouteMap>(
    path: string,
    options?: RequestOptions<
      TRouteMap[TKey] extends {
        body: infer TBody;
      }
        ? TBody
        : never
    >,
  ): TestRequestBuilder<
    TRouteMap[TKey] extends {
      response: infer TResponse;
    }
      ? TResponse
      : unknown
  >;
  put<TKey extends `PUT ${string}` & keyof TRouteMap>(
    path: string,
    options?: RequestOptions<
      TRouteMap[TKey] extends {
        body: infer TBody;
      }
        ? TBody
        : never
    >,
  ): TestRequestBuilder<
    TRouteMap[TKey] extends {
      response: infer TResponse;
    }
      ? TResponse
      : unknown
  >;
  patch<TKey extends `PATCH ${string}` & keyof TRouteMap>(
    path: string,
    options?: RequestOptions<
      TRouteMap[TKey] extends {
        body: infer TBody;
      }
        ? TBody
        : never
    >,
  ): TestRequestBuilder<
    TRouteMap[TKey] extends {
      response: infer TResponse;
    }
      ? TResponse
      : unknown
  >;
  delete<TKey extends `DELETE ${string}` & keyof TRouteMap>(
    path: string,
    options?: RequestOptions<
      TRouteMap[TKey] extends {
        body: infer TBody;
      }
        ? TBody
        : never
    >,
  ): TestRequestBuilder<
    TRouteMap[TKey] extends {
      response: infer TResponse;
    }
      ? TResponse
      : unknown
  >;
  head<TKey extends `HEAD ${string}` & keyof TRouteMap>(
    path: string,
    options?: RequestOptions<
      TRouteMap[TKey] extends {
        body: infer TBody;
      }
        ? TBody
        : never
    >,
  ): TestRequestBuilder<
    TRouteMap[TKey] extends {
      response: infer TResponse;
    }
      ? TResponse
      : unknown
  >;
}
/**
 * Creates a test app for making HTTP requests against registered modules.
 * Returns an untyped app for backwards compatibility.
 * @returns A test app instance for registering modules and making requests.
 */
export declare function createTestApp(): TestApp;
/**
 * Creates a typed test app with route map for type-safe requests.
 * @template TRouteMap - Route map interface mapping route keys to their types.
 * @returns A typed test app instance.
 */
export declare function createTestApp<
  TRouteMap extends RouteMapEntry,
>(): TestAppWithRoutes<TRouteMap>;
//# sourceMappingURL=test-app.d.ts.map
