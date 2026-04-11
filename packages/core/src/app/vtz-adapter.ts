import type { ServerAdapter } from '../types/server-adapter';

export function createVtzAdapter(): ServerAdapter {
  return {
    async listen(port, handler, options) {
      const hostname = options?.hostname ?? '0.0.0.0';
      const server = await globalThis.__vtz_http!.serve(port, hostname, handler);

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
