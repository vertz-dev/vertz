import { createServer } from 'node:http';
import { createRequestListener } from '@mjackson/node-fetch-server';
export const nodeAdapter = {
  name: 'node',
  async createServer(handler) {
    const server = createServer(createRequestListener(handler));
    await new Promise((resolve) => server.listen(0, () => resolve()));
    const address = server.address();
    if (!address || typeof address === 'string') {
      throw new Error('Failed to get server address');
    }
    return {
      port: address.port,
      url: `http://localhost:${address.port}`,
      close: async () =>
        new Promise((resolve, reject) => {
          server.close((err) => (err ? reject(err) : resolve()));
        }),
    };
  },
};
export const adapter = nodeAdapter;
//# sourceMappingURL=node.js.map
