import type { ServerAdapter } from '../types/server-adapter';

declare const Bun: {
  serve(options: {
    port: number;
    hostname?: string;
    fetch: (request: Request) => Promise<Response>;
  }): { port: number; hostname: string; stop(closeActiveConnections?: boolean): void };
};

export function createBunAdapter(): ServerAdapter {
  return {
    async listen(port, handler, options) {
      const server = Bun.serve({
        port,
        hostname: options?.hostname,
        fetch: handler,
      });

      return {
        port: server.port,
        hostname: server.hostname,
        async close() {
          server.stop(true);
        },
      };
    },
  };
}
