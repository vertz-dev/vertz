export const denoAdapter = {
  name: 'deno',
  async createServer(handler) {
    const controller = new AbortController();
    const server = Deno.serve(
      {
        port: 0,
        signal: controller.signal,
        onListen: () => {},
      },
      handler,
    );
    const addr = server.addr;
    return {
      port: addr.port,
      url: `http://localhost:${addr.port}`,
      close: async () => {
        controller.abort();
        await server.finished;
      },
    };
  },
};
export const adapter = denoAdapter;
//# sourceMappingURL=deno.js.map
