import { createHandler } from '@vertz/cloudflare';
import type { AppBuilder } from '@vertz/core';
import type { RuntimeAdapter } from './types';

declare const __vtz_http: {
  serve(
    port: number,
    hostname: string,
    handler: (req: Request) => Promise<Response>,
  ): Promise<{ id: number; port: number; hostname: string; close(): void }>;
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

    const server = await __vtz_http.serve(0, '0.0.0.0', (req: Request) =>
      worker.fetch(req, {}, ctx),
    );

    return {
      port: server.port,
      url: `http://localhost:${server.port}`,
      close: async () => server.close(),
    };
  },
};

export const adapter = cloudflareAdapter;
