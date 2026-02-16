import type { AccumulateProvides, NamedMiddlewareDef } from '../middleware/middleware-def';
import type { NamedModule } from '../module/module';
import type { AppConfig } from '../types/app';
import type { ListenOptions, ServerHandle } from '../types/server-adapter';
export interface RouteInfo {
  method: string;
  path: string;
}
export interface AppBuilder<
  TMiddlewareCtx extends Record<string, unknown> = Record<string, unknown>,
> {
  register(module: NamedModule, options?: Record<string, unknown>): AppBuilder<TMiddlewareCtx>;
  middlewares<const M extends readonly NamedMiddlewareDef<any, any>[]>(
    list: M,
  ): AppBuilder<AccumulateProvides<M>>;
  readonly handler: (request: Request) => Promise<Response>;
  listen(port?: number, options?: ListenOptions): Promise<ServerHandle>;
  /** Exposes registered routes for testing/inspection */
  readonly router: {
    routes: RouteInfo[];
  };
}
export declare function createApp(config: AppConfig): AppBuilder;
//# sourceMappingURL=app-builder.d.ts.map
