import type { AccumulateProvides, NamedMiddlewareDef } from '../middleware/middleware-def';
import type { NamedModule } from '../module/module';
import type { AppConfig } from '../types/app';
import type { ListenOptions, ServerHandle } from '../types/server-adapter';
import { buildHandler, type ModuleRegistration } from './app-runner';
import { detectAdapter } from './detect-adapter';

const DEFAULT_PORT = 3000;

export interface AppBuilder<
  TMiddlewareCtx extends Record<string, unknown> = Record<string, unknown>,
> {
  register(module: NamedModule, options?: Record<string, unknown>): AppBuilder<TMiddlewareCtx>;
  // biome-ignore lint/suspicious/noExplicitAny: variance boundary — middleware TProvides must be accepted as-is
  middlewares<const M extends readonly NamedMiddlewareDef<any, any>[]>(
    list: M,
  ): AppBuilder<AccumulateProvides<M>>;
  readonly handler: (request: Request) => Promise<Response>;
  listen(port?: number, options?: ListenOptions): Promise<ServerHandle>;
}

export function createApp(config: AppConfig): AppBuilder {
  const registrations: ModuleRegistration[] = [];
  // biome-ignore lint/suspicious/noExplicitAny: runtime layer accepts any middleware generics
  let globalMiddlewares: NamedMiddlewareDef<any, any>[] = [];
  let cachedHandler: ((request: Request) => Promise<Response>) | null = null;

  const builder: AppBuilder = {
    register(module, options) {
      registrations.push({ module, options });
      return builder;
    },
    middlewares(list) {
      globalMiddlewares = [...list];
      return builder;
    },
    get handler() {
      if (!cachedHandler) {
        cachedHandler = buildHandler(config, registrations, globalMiddlewares);
      }
      return cachedHandler;
    },
    async listen(port, options) {
      const adapter = detectAdapter();
      return adapter.listen(port ?? DEFAULT_PORT, builder.handler, options);
    },
  };

  return builder;
}
