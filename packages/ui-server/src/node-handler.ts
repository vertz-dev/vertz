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
import { escapeAttr } from './html-serializer';
import { toPrefetchSession } from './ssr-access-evaluator';
import { ssrRenderAot } from './ssr-aot-pipeline';
import type { SSRHandlerOptions } from './ssr-handler';
import {
  precomputeHandlerState,
  resolveRouteModulepreload,
  resolveSession,
} from './ssr-handler-shared';
import { ssrRenderProgressive, ssrRenderSinglePass, ssrStreamNavQueries } from './ssr-single-pass';
import { safeSerialize } from './ssr-streaming-runtime';
import { injectHtmlAttributes, injectIntoTemplate } from './template-inject';

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
    progressiveHTML,
    aotManifest,
    aotDataResolver,
    htmlAttributes,
  } = options;

  const { template, linkHeader, modulepreloadTags, splitResult } = precomputeHandlerState(options);

  // Determine whether progressive streaming is usable
  const useProgressive =
    progressiveHTML &&
    splitResult &&
    !(manifest?.routeEntries && Object.keys(manifest.routeEntries).length > 0);

  return (req: IncomingMessage, res: ServerResponse): void => {
    void (async () => {
      try {
        const url = req.url ?? '/';

        // Nav pre-fetch: SSE response — session resolver NOT called
        // Use pathname only (no query string) to match web handler behavior
        if (req.headers['x-vertz-nav'] === '1') {
          const pathname = url.split('?')[0]!;
          await handleNavRequest(req, res, module, pathname, ssrTimeout);
          return;
        }

        // Construct web Request for session resolver and htmlAttributes callbacks
        let webRequest: Request | undefined;
        if (sessionResolver || htmlAttributes) {
          const fullUrl = `http://${req.headers.host ?? 'localhost'}${url}`;
          webRequest = new Request(fullUrl, {
            method: req.method ?? 'GET',
            headers: req.headers as Record<string, string>,
          });
        }

        // Resolve session
        let sessionScript = '';
        let ssrAuth: SSRAuth | undefined;
        if (sessionResolver && webRequest) {
          const result = await resolveSession(webRequest, sessionResolver, nonce);
          sessionScript = result.sessionScript;
          ssrAuth = result.ssrAuth;
        }

        // Resolve per-request html attributes
        let requestTemplate = template;
        let requestHeadTemplate = splitResult?.headTemplate;
        if (htmlAttributes && webRequest) {
          const attrs = htmlAttributes(webRequest);
          if (attrs && Object.keys(attrs).length > 0) {
            requestTemplate = injectHtmlAttributes(template, attrs);
            if (requestHeadTemplate) {
              requestHeadTemplate = injectHtmlAttributes(requestHeadTemplate, attrs);
            }
          }
        }

        if (useProgressive) {
          await handleProgressiveRequest(
            req,
            res,
            module,
            {
              headTemplate: requestHeadTemplate ?? splitResult!.headTemplate,
              tailTemplate: splitResult!.tailTemplate,
            },
            url,
            ssrTimeout,
            nonce,
            fallbackMetrics,
            linkHeader,
            modulepreloadTags,
            routeChunkManifest,
            cacheControl,
            sessionScript,
            ssrAuth,
            manifest,
          );
          return;
        }

        // Buffered path: render to string, write to res.end()
        const prefetchSession = ssrAuth ? toPrefetchSession(ssrAuth) : undefined;

        const result = aotManifest
          ? await ssrRenderAot(module, url, {
              aotManifest,
              manifest,
              ssrTimeout,
              fallbackMetrics,
              ssrAuth,
              prefetchSession,
              aotDataResolver,
            })
          : await ssrRenderSinglePass(module, url, {
              ssrTimeout,
              fallbackMetrics,
              ssrAuth,
              manifest,
              prefetchSession,
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
          template: requestTemplate,
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

        // Return 404 when no route matched (fallback content rendered but URL is invalid)
        const status = result.matchedRoutePatterns?.length ? 200 : 404;
        res.writeHead(status, headers);
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

/**
 * Handle progressive HTML streaming.
 * Streams head → render chunks → tail directly to ServerResponse
 * with backpressure and client disconnect handling.
 */
async function handleProgressiveRequest(
  req: IncomingMessage,
  res: ServerResponse,
  module: SSRHandlerOptions['module'],
  split: { headTemplate: string; tailTemplate: string },
  url: string,
  ssrTimeout?: number,
  nonce?: string,
  fallbackMetrics?: SSRHandlerOptions['fallbackMetrics'],
  linkHeader?: string,
  staticModulepreloadTags?: string,
  routeChunkManifest?: SSRHandlerOptions['routeChunkManifest'],
  cacheControl?: string,
  sessionScript?: string,
  ssrAuth?: SSRAuth,
  manifest?: SSRHandlerOptions['manifest'],
): Promise<void> {
  const result = await ssrRenderProgressive(module, url, {
    ssrTimeout,
    fallbackMetrics,
    ssrAuth,
    manifest,
  });

  // SSR redirect — before any streaming
  if (result.redirect) {
    res.writeHead(302, { Location: result.redirect.to });
    res.end();
    return;
  }

  // Resolve modulepreload
  const resolvedModulepreloadTags = resolveRouteModulepreload(
    routeChunkManifest,
    result.matchedRoutePatterns,
    staticModulepreloadTags,
  );

  // Build head chunk with injections
  let headChunk = split.headTemplate;
  const headCloseIdx = headChunk.lastIndexOf('</head>');
  if (headCloseIdx !== -1) {
    const injections: string[] = [];
    if (result.css) injections.push(result.css);
    if (result.headTags) injections.push(result.headTags);
    if (resolvedModulepreloadTags) injections.push(resolvedModulepreloadTags);
    if (sessionScript) injections.push(sessionScript);

    if (injections.length > 0) {
      headChunk =
        headChunk.slice(0, headCloseIdx) +
        injections.join('\n') +
        '\n' +
        headChunk.slice(headCloseIdx);
    }
  } else {
    if (result.css) headChunk += result.css;
    if (result.headTags) headChunk += result.headTags;
    if (resolvedModulepreloadTags) headChunk += resolvedModulepreloadTags;
    if (sessionScript) headChunk += sessionScript;
  }

  // Write response headers
  const headers: Record<string, string> = {
    'Content-Type': 'text/html; charset=utf-8',
  };
  if (linkHeader) headers.Link = linkHeader;
  if (cacheControl) headers['Cache-Control'] = cacheControl;

  // Return 404 when no route matched
  const status = result.matchedRoutePatterns?.length ? 200 : 404;
  res.writeHead(status, headers);

  // 1. Send head chunk immediately
  res.write(headChunk);

  // 2. Pipe render stream chunks with backpressure + disconnect detection
  let clientDisconnected = false;
  req.on('close', () => {
    clientDisconnected = true;
  });

  if (result.renderStream) {
    const reader = result.renderStream.getReader();
    let renderError: Error | undefined;

    try {
      for (;;) {
        if (clientDisconnected) {
          reader.cancel();
          break;
        }

        const { done, value } = await reader.read();
        if (done) break;

        const canContinue = res.write(value);
        if (!canContinue && !clientDisconnected) {
          await new Promise<void>((resolve) => res.once('drain', resolve));
        }
      }
    } catch (err) {
      renderError = err instanceof Error ? err : new Error(String(err));
    } finally {
      reader.releaseLock();
    }

    // Emit in-band error script if render errored after head was sent
    if (renderError && !clientDisconnected) {
      console.error('[SSR] Render error after head sent:', renderError.message);
      const nonceAttr = nonce != null ? ` nonce="${escapeAttr(nonce)}"` : '';
      const errorScript =
        `<script${nonceAttr}>document.dispatchEvent(new CustomEvent('vertz:ssr-error',` +
        `{detail:{message:${safeSerialize(renderError.message)}}}))</script>`;
      res.write(errorScript);
    }
  }

  if (clientDisconnected) return;

  // 3. Build and send tail chunk (SSR data + closing tags)
  let tail = '';
  if (result.ssrData.length > 0) {
    const nonceAttr = nonce != null ? ` nonce="${escapeAttr(nonce)}"` : '';
    tail += `<script${nonceAttr}>window.__VERTZ_SSR_DATA__=${safeSerialize(result.ssrData)};</script>`;
  }
  tail += split.tailTemplate;
  res.end(tail);
}

/**
 * Handle a nav pre-fetch request.
 * Streams SSE events directly to ServerResponse with disconnect detection.
 */
async function handleNavRequest(
  req: IncomingMessage,
  res: ServerResponse,
  module: SSRHandlerOptions['module'],
  url: string,
  ssrTimeout?: number,
): Promise<void> {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
  });

  try {
    const stream = await ssrStreamNavQueries(module, url, { ssrTimeout });

    let clientDisconnected = false;
    req.on('close', () => {
      clientDisconnected = true;
    });

    const reader = stream.getReader();
    try {
      for (;;) {
        if (clientDisconnected) {
          reader.cancel();
          break;
        }

        const { done, value } = await reader.read();
        if (done) break;

        const canContinue = res.write(value);
        if (!canContinue && !clientDisconnected) {
          await new Promise<void>((resolve) => res.once('drain', resolve));
        }
      }
    } finally {
      reader.releaseLock();
    }
  } catch {
    // Graceful degradation — send done event so client falls back
    res.write('event: done\ndata: {}\n\n');
  }

  if (!res.writableEnded) {
    res.end();
  }
}
