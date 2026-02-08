import type { RuntimeAdapter } from './types';

declare const Bun: {
  serve(options: { port: number; fetch: (request: Request) => Promise<Response> }): {
    port: number;
    stop(closeActiveConnections?: boolean): void;
  };
};

export const bunAdapter: RuntimeAdapter = {
  name: 'bun',
  async createServer(handler) {
    const server = Bun.serve({ fetch: handler, port: 0 });
    return {
      port: server.port,
      url: `http://localhost:${server.port}`,
      close: async () => server.stop(),
    };
  },
};

export const adapter = bunAdapter;
