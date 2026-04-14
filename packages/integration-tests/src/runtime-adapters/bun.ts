import type { RuntimeAdapter } from './types';

declare const __vtz_http: {
  serve(
    port: number,
    hostname: string,
    handler: (req: Request) => Promise<Response>,
  ): Promise<{ id: number; port: number; hostname: string; close(): void }>;
};

export const bunAdapter: RuntimeAdapter = {
  name: 'bun',
  async createServer(handler) {
    const server = await __vtz_http.serve(0, '0.0.0.0', handler);
    return {
      port: server.port,
      url: `http://localhost:${server.port}`,
      close: async () => server.close(),
    };
  },
};

export const adapter = bunAdapter;
