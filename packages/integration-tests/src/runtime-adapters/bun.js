export const bunAdapter = {
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
//# sourceMappingURL=bun.js.map
