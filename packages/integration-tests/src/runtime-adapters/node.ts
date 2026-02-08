import { createServer } from 'node:http';
import { createRequestListener } from '@mjackson/node-fetch-server';
import type { RuntimeAdapter } from './types';

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
