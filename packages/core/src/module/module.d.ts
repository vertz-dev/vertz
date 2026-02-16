import type { NamedModuleDef } from './module-def';
import type { NamedRouterDef } from './router-def';
import type { NamedServiceDef } from './service';
export interface NamedModule {
  definition: NamedModuleDef;
  services: NamedServiceDef[];
  routers: NamedRouterDef<any, any>[];
  exports: NamedServiceDef[];
}
export declare function createModule(
  definition: NamedModuleDef,
  config: {
    services: NamedServiceDef[];
    routers: NamedRouterDef<any, any>[];
    exports: NamedServiceDef[];
  },
): NamedModule;
//# sourceMappingURL=module.d.ts.map
