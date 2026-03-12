/**
 * Type-level tests for createHandler config — image optimizer integration.
 * Checked by `tsc --noEmit`, not by runtime tests.
 */

import { createHandler } from '../src/handler.js';
import { imageOptimizer } from '../src/image-optimizer.js';

declare const app: (env: unknown) => import('@vertz/core').AppBuilder;

// ─── Valid usage ─────────────────────────────────────────────

// Config with imageOptimizer
createHandler({
  app,
  basePath: '/api',
  imageOptimizer: imageOptimizer({ allowedDomains: ['cdn.example.com'] }),
});

// Config without imageOptimizer (optional)
createHandler({
  app,
  basePath: '/api',
});

// ─── Invalid usage ───────────────────────────────────────────

// @ts-expect-error — imageOptimizer must be a handler function, not a string
createHandler({ app, basePath: '/api', imageOptimizer: 'invalid' });
