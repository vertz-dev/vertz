/**
 * Type-level tests for createHandler config.
 * Checked by `tsc --noEmit`, not by runtime tests.
 */

import { createHandler } from '../src/handler.js';
import { imageOptimizer } from '../src/image-optimizer.js';

declare const app: (env: unknown) => import('@vertz/core').AppBuilder;
declare const ssrCallback: (request: Request) => Promise<Response>;

// ─── Valid usage ─────────────────────────────────────────────

// Minimal config — basePath defaults to '/api', securityHeaders defaults to true
createHandler({
  app,
  ssr: ssrCallback,
});

// Config with explicit basePath
createHandler({
  app,
  basePath: '/api',
  ssr: ssrCallback,
});

// Config with imageOptimizer
createHandler({
  app,
  ssr: ssrCallback,
  imageOptimizer: imageOptimizer({ allowedDomains: ['cdn.example.com'] }),
});

// Config with securityHeaders explicitly false
createHandler({
  app,
  ssr: ssrCallback,
  securityHeaders: false,
});

// ─── Invalid usage ───────────────────────────────────────────

// @ts-expect-error — ssr is required
createHandler({ app, basePath: '/api' });

// @ts-expect-error — ssr is required (even with other options)
createHandler({ app, securityHeaders: true });

// @ts-expect-error — imageOptimizer must be a handler function, not a string
createHandler({ app, ssr: ssrCallback, imageOptimizer: 'invalid' });
