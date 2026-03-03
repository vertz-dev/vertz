import { createApp } from './app';
import { createEnv } from './env';
import { deepFreeze } from './immutability';
import { createMiddleware } from './middleware';

export const vertz: {
  readonly env: typeof createEnv;
  readonly middleware: typeof createMiddleware;
  readonly app: typeof createApp;
  /** @since 0.2.0 — preferred alias for `app` */
  readonly server: typeof createApp;
} = /* @__PURE__ */ deepFreeze({
  env: createEnv,
  middleware: createMiddleware,
  app: createApp,
  server: createApp,
});
