import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import type { RuntimeAdapter } from './types';

/**
 * Inline bridge from Node HTTP to web-standard Request/Response.
 *
 * This is a test-only utility. In production, use `createNodeHandler`
 * from `@vertz/ui-server/node` which writes directly to ServerResponse
 * without this bridge overhead.
 */
function createRequestListener(
  handler: (req: Request) => Promise<Response>,
): (req: IncomingMessage, res: ServerResponse) => void {
  return (req, res) => {
    void (async () => {
      try {
        const url = `http://${req.headers.host ?? 'localhost'}${req.url ?? '/'}`;
        const webRequest = new Request(url, {
          method: req.method ?? 'GET',
          headers: req.headers as Record<string, string>,
        });

        const webResponse = await handler(webRequest);

        // Write status + headers
        const headers: Record<string, string> = {};
        webResponse.headers.forEach((value, key) => {
          headers[key] = value;
        });
        res.writeHead(webResponse.status, headers);

        // Write body — read web ReadableStream via async iteration, write to res
        if (webResponse.body) {
          const reader = webResponse.body.getReader();
          try {
            for (;;) {
              const { done, value } = await reader.read();
              if (done) break;
              res.write(value);
            }
          } finally {
            reader.releaseLock();
          }
          res.end();
        } else {
          res.end();
        }
      } catch (err) {
        console.error('[Node adapter] Handler error:', err);
        if (!res.headersSent) {
          res.writeHead(500, { 'Content-Type': 'text/plain' });
        }
        res.end('Internal Server Error');
      }
    })();
  };
}

export const nodeAdapter: RuntimeAdapter = {
  name: 'node',
  async createServer(handler) {
    const server = createServer(createRequestListener(handler));
    await new Promise<void>((resolve) => server.listen(0, () => resolve()));

    const address = server.address();
    if (!address || typeof address === 'string') {
      throw new Error('Failed to get server address');
    }

    return {
      port: address.port,
      url: `http://localhost:${address.port}`,
      close: async () =>
        new Promise<void>((resolve, reject) => {
          server.close((err) => (err ? reject(err) : resolve()));
        }),
    };
  },
};

export const adapter = nodeAdapter;
