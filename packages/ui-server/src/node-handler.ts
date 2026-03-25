/**
 * Native Node HTTP adapter for SSR.
 *
 * Writes directly to Node's ServerResponse, avoiding the overhead of
 * web Request/Response conversions on every request.
 *
 * @module @vertz/ui-server/node
 */

import type { IncomingMessage, ServerResponse } from 'node:http';
import type { SSRAuth } from '@vertz/ui/internals';
import type { SSRHandlerOptions } from './ssr-handler';
import {
  precomputeHandlerState,
  resolveRouteModulepreload,
  resolveSession,
} from './ssr-handler-shared';
import { ssrRenderSinglePass } from './ssr-single-pass';
import { injectIntoTemplate } from './template-inject';

export type NodeHandlerOptions = SSRHandlerOptions;

export function createNodeHandler(
  options: NodeHandlerOptions,
): (req: IncomingMessage, res: ServerResponse) => void {
  const {
    module,
    ssrTimeout,
    nonce,
    fallbackMetrics,
    routeChunkManifest,
    cacheControl,
    sessionResolver,
    manifest,
  } = options;

  const { template, linkHeader, modulepreloadTags } = precomputeHandlerState(options);

  return (req: IncomingMessage, res: ServerResponse): void => {
    void (async () => {
      try {
        const url = req.url ?? '/';

        // Resolve session (construct minimal Request for the resolver)
        let sessionScript = '';
        let ssrAuth: SSRAuth | undefined;
        if (sessionResolver) {
          const fullUrl = `http://${req.headers.host ?? 'localhost'}${url}`;
          const webRequest = new Request(fullUrl, {
            method: req.method ?? 'GET',
            headers: req.headers as Record<string, string>,
          });
          const result = await resolveSession(webRequest, sessionResolver, nonce);
          sessionScript = result.sessionScript;
          ssrAuth = result.ssrAuth;
        }

        // Render SSR HTML
        const result = await ssrRenderSinglePass(module, url, {
          ssrTimeout,
          fallbackMetrics,
          ssrAuth,
          manifest,
        });

        // SSR redirect
        if (result.redirect) {
          res.writeHead(302, { Location: result.redirect.to });
          res.end();
          return;
        }

        // Resolve modulepreload tags
        const resolvedModulepreloadTags = resolveRouteModulepreload(
          routeChunkManifest,
          result.matchedRoutePatterns,
          modulepreloadTags,
        );

        // Combine head tags
        const allHeadTags = [result.headTags, resolvedModulepreloadTags].filter(Boolean).join('\n');

        // Inject into template
        const html = injectIntoTemplate({
          template,
          appHtml: result.html,
          appCss: result.css,
          ssrData: result.ssrData,
          nonce,
          headTags: allHeadTags || undefined,
          sessionScript,
        });

        // Write response headers
        const headers: Record<string, string> = {
          'Content-Type': 'text/html; charset=utf-8',
        };
        if (linkHeader) headers.Link = linkHeader;
        if (cacheControl) headers['Cache-Control'] = cacheControl;

        res.writeHead(200, headers);
        res.end(html);
      } catch (err) {
        console.error('[SSR] Render failed:', err instanceof Error ? err.message : err);
        if (!res.headersSent) {
          res.writeHead(500, { 'Content-Type': 'text/plain' });
        }
        res.end('Internal Server Error');
      }
    })();
  };
}
