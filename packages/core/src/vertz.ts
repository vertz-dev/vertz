import { createEnv } from './env';
import { createMiddleware } from './middleware';
import { createModuleDef, createModule } from './module';
import { createApp } from './app';
import { deepFreeze } from './immutability';

export const vertz = deepFreeze({
  env: createEnv,
  middleware: createMiddleware,
  moduleDef: createModuleDef,
  module: createModule,
  app: createApp,
});
