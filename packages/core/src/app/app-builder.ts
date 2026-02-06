import type { AppConfig } from '../types/app';
import type { NamedMiddlewareDef } from '../middleware/middleware-def';
import type { NamedModule } from '../module/module';
import { buildHandler, type ModuleRegistration } from './app-runner';

export interface AppBuilder {
  register(module: NamedModule, options?: Record<string, unknown>): AppBuilder;
  middlewares(list: NamedMiddlewareDef[]): AppBuilder;
  readonly handler: (request: Request) => Promise<Response>;
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
  };

  return builder;
}
