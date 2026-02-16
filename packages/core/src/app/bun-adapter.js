export function createBunAdapter() {
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
//# sourceMappingURL=bun-adapter.js.map
