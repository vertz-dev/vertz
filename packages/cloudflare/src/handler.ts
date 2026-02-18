import type { AppBuilder } from '@vertz/core';

export interface CloudflareHandlerOptions {
  basePath?: string;
}

export function createHandler(app: AppBuilder, options?: CloudflareHandlerOptions) {
  const handler = app.handler;

  return {
    async fetch(request: Request, _env: unknown, _ctx: ExecutionContext): Promise<Response> {
      // If basePath, strip it from the URL before routing
      if (options?.basePath) {
        const url = new URL(request.url);
        if (url.pathname.startsWith(options.basePath)) {
          url.pathname = url.pathname.slice(options.basePath.length) || '/';
          request = new Request(url.toString(), request);
        }
      }
      try {
        return await handler(request);
      } catch (error) {
        console.error('Unhandled error in worker:', error);
        return new Response('Internal Server Error', { status: 500 });
      }
    },
  };
}
