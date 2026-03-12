import { createHandler } from '@vertz/cloudflare';
import type { AppBuilder } from '@vertz/core';
import type { RuntimeAdapter } from './types';

declare const Bun: {
  serve(options: { port: number; fetch: (request: Request) => Promise<Response> }): {
    port: number;
    stop(closeActiveConnections?: boolean): void;
  };
};

interface WorkerExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
}

export const cloudflareAdapter: RuntimeAdapter = {
  name: 'cloudflare',
  async createServer(handler) {
    // Wrap the raw handler as a minimal AppBuilder shape
    const app = { handler } as unknown as AppBuilder;
    const worker = createHandler(app);

    // Mock ExecutionContext for local testing
    const ctx: WorkerExecutionContext = {
      waitUntil: () => {},
      passThroughOnException: () => {},
    };

    const server = Bun.serve({
      port: 0,
      fetch: (req: Request) => worker.fetch(req, {}, ctx),
    });

    return {
      port: server.port,
      url: `http://localhost:${server.port}`,
      close: async () => server.stop(),
    };
  },
};

export const adapter = cloudflareAdapter;
