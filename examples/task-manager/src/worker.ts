/**
 * Cloudflare Worker entry point for the Task Manager SSR app.
 *
 * Uses createSSRHandler() from @vertz/ui-server to handle SSR HTML
 * and nav pre-fetch SSE requests. Static files are served by
 * Cloudflare's [site] configuration in wrangler.toml.
 */

import { createSSRHandler } from '@vertz/ui-server';
import * as ssrModule from './app';

// Template will be embedded during build or served from KV.
// For now, a minimal template that matches the production build output.
const template = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Task Manager — @vertz/ui demo</title>
</head>
<body>
<div id="app"><!--ssr-outlet--></div>
</body>
</html>`;

const handler = createSSRHandler({ module: ssrModule, template });

export default {
  async fetch(request: Request): Promise<Response> {
    return handler(request);
  },
};
