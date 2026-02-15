import { createApp } from './app';
import { createEnv } from './env';
import { deepFreeze } from './immutability';
import { createMiddleware } from './middleware';
import { createModule, createModuleDef } from './module';

export const vertz: {
  readonly env: typeof createEnv;
  readonly middleware: typeof createMiddleware;
  readonly moduleDef: typeof createModuleDef;
  readonly module: typeof createModule;
  readonly app: typeof createApp;
  /** @since 0.2.0 — preferred alias for `app` */
  readonly server: typeof createApp;
} = deepFreeze({
  env: createEnv,
  middleware: createMiddleware,
  moduleDef: createModuleDef,
  module: createModule,
  app: createApp,
  server: createApp,
});
