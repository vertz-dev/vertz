import type { IncomingMessage, ServerResponse } from 'node:http';

export interface ApiMiddlewareOptions {
  /** Path prefix to match. Requests not starting with this are passed to next(). @default '/api/' */
  pathPrefix?: string;
  /** Port for URL construction when Host header is missing. @default 3000 */
  port?: number;
}

/**
 * Convert Node http IncomingMessage to Web Request.
 */
export function toWebRequest(req: IncomingMessage, port?: number): Request {
  return new Request(buildUrl(req, port ?? 3000), {
    method: req.method || 'GET',
    headers: buildHeaders(req),
  });
}

/**
 * Convert Web Response to Node http ServerResponse.
 */
export async function toNodeResponse(res: ServerResponse, webResponse: Response): Promise<void> {
  const headers: Record<string, string> = {};
  webResponse.headers.forEach((value, key) => {
    headers[key] = value;
  });

  res.writeHead(webResponse.status, headers);

  const body = await webResponse.text();
  res.end(body);
}

/**
 * Create Connect-compatible middleware that bridges Node HTTP to a Web Request handler.
 *
 * - Matches requests by pathPrefix (default '/api/'), calls next() for non-matching
 * - Skips /api/openapi.json (handled by dev server's OpenAPI middleware)
 * - Buffers request body for non-GET/HEAD methods
 * - Converts Node request -> Web Request
 * - Calls the handler, converts Web Response -> Node Response
 * - Catches errors and responds with 500 JSON
 */
export function createApiMiddleware(
  handler: (request: Request) => Promise<Response>,
  options?: ApiMiddlewareOptions,
): (req: IncomingMessage, res: ServerResponse, next: () => void) => void {
  const pathPrefix = options?.pathPrefix ?? '/api/';
  const port = options?.port ?? 3000;

  return (req, res, next) => {
    const url = req.url || '/';

    if (!url.startsWith(pathPrefix) || url === '/api/openapi.json') {
      return next();
    }

    if (req.method === 'GET' || req.method === 'HEAD') {
      const webReq = toWebRequest(req, port);
      handler(webReq)
        .then((webRes) => toNodeResponse(res, webRes))
        .catch((err) => {
          if (!res.headersSent) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(
              JSON.stringify({
                error: { code: 'InternalError', message: String(err) },
              }),
            );
          }
        });
    } else {
      const chunks: Buffer[] = [];
      req.on('data', (chunk: Buffer) => chunks.push(chunk));
      req.on('end', async () => {
        try {
          const bodyStr = Buffer.concat(chunks).toString('utf-8');
          const webReq = new Request(buildUrl(req, port), {
            method: req.method || 'POST',
            headers: buildHeaders(req),
            body: bodyStr,
          });

          const webRes = await handler(webReq);
          await toNodeResponse(res, webRes);
        } catch (err) {
          if (!res.headersSent) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(
              JSON.stringify({
                error: { code: 'InternalError', message: String(err) },
              }),
            );
          }
        }
      });
    }
  };
}

function buildUrl(req: IncomingMessage, port: number): string {
  const host = req.headers.host || `localhost:${port}`;
  const protocol = (req.socket as { encrypted?: boolean }).encrypted ? 'https' : 'http';
  return `${protocol}://${host}${req.url || '/'}`;
}

function buildHeaders(req: IncomingMessage): Record<string, string> {
  const headers: Record<string, string> = {};
  for (const [key, value] of Object.entries(req.headers)) {
    if (typeof value === 'string') {
      headers[key] = value;
    } else if (Array.isArray(value)) {
      headers[key] = value.join(', ');
    }
  }
  return headers;
}
