import type { NamedMiddlewareDef } from '../middleware/middleware-def';
import type { NamedModule } from '../module/module';
import type { AppConfig } from '../types/app';
import type { ListenOptions, ServerHandle } from '../types/server-adapter';
import { buildHandler, type ModuleRegistration } from './app-runner';
import { detectAdapter } from './detect-adapter';

export interface AppBuilder {
  register(module: NamedModule, options?: Record<string, unknown>): AppBuilder;
  middlewares(list: NamedMiddlewareDef[]): AppBuilder;
  readonly handler: (request: Request) => Promise<Response>;
  listen(port?: number, options?: ListenOptions): Promise<ServerHandle>;
}

export function createApp(config: AppConfig): AppBuilder {
  const registrations: ModuleRegistration[] = [];
  let globalMiddlewares: NamedMiddlewareDef[] = [];
  let cachedHandler: ((request: Request) => Promise<Response>) | null = null;

  const builder: AppBuilder = {
    register(module, options) {
      registrations.push({ module, options });
      return builder;
    },
    middlewares(list) {
      globalMiddlewares = list;
      return builder;
    },
    get handler() {
      if (!cachedHandler) {
        cachedHandler = buildHandler(config, registrations, globalMiddlewares);
      }
      return cachedHandler;
    },
    async listen(port?: number, options?: ListenOptions) {
      const adapter = detectAdapter();
      return adapter.listen(port ?? 3000, builder.handler, options);
    },
  };

  return builder;
}
