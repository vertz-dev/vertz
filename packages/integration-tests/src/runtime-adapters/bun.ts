import type { RuntimeAdapter } from './types';

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
