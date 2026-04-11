import type { ServerAdapter } from '../types/server-adapter';

declare const globalThis: {
  __vtz_http: {
    serve(
      port: number,
      hostname: string,
      handler: (request: Request) => Promise<Response>,
    ): Promise<{ id: number; port: number; hostname: string; close(): void }>;
  };
};

export function createVtzAdapter(): ServerAdapter {
  return {
    async listen(port, handler, options) {
      const hostname = options?.hostname ?? '0.0.0.0';
      const server = await globalThis.__vtz_http.serve(port, hostname, handler);

      return {
        port: server.port,
        hostname: server.hostname,
        async close() {
          server.close();
        },
      };
    },
  };
}
