import type { NamedMiddlewareDef } from '../middleware/middleware-def';
import type { NamedModule } from '../module/module';
import type { AppConfig } from '../types/app';
export interface ModuleRegistration {
  module: NamedModule;
  options?: Record<string, unknown>;
}
export declare function buildHandler(
  config: AppConfig,
  registrations: ModuleRegistration[],
  globalMiddlewares: NamedMiddlewareDef<any, any>[],
): (request: Request) => Promise<Response>;
//# sourceMappingURL=app-runner.d.ts.map
