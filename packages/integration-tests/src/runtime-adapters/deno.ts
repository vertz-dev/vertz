/**
 * Deno runtime adapter for integration tests.
 *
 * This adapter cannot be tested from the Bun or Vitest test runners because
 * Deno.serve is only available in the Deno runtime. It will be exercised
 * when integration tests run under Deno via `deno task test`.
 */
import type { RuntimeAdapter } from './types';

declare const Deno: {
  serve(
    options: {
      port: number;
      signal: AbortSignal;
      onListen: () => void;
    },
    handler: (req: Request) => Promise<Response>,
  ): { addr: { port: number }; finished: Promise<void> };
};

export const denoAdapter: RuntimeAdapter = {
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
