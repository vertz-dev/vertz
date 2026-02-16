import { createApp } from './app';
import { createEnv } from './env';
import { deepFreeze } from './immutability';
import { createMiddleware } from './middleware';
import { createModule, createModuleDef } from './module';
export const vertz = /* @__PURE__ */ deepFreeze({
  env: createEnv,
  middleware: createMiddleware,
  moduleDef: createModuleDef,
  module: createModule,
  app: createApp,
  server: createApp,
});
//# sourceMappingURL=vertz.js.map
