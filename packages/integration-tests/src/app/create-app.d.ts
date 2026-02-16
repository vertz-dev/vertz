import type { RuntimeAdapter } from '../runtime-adapters/types';
export interface TestServer {
  handler: (request: Request) => Promise<Response>;
  fetch: (path: string, init?: RequestInit) => Promise<Response>;
  stop: () => void | Promise<void>;
  port: number;
  url: string;
}
export declare function createIntegrationApp(): TestServer;
export declare function createIntegrationServer(adapter: RuntimeAdapter): Promise<TestServer>;
//# sourceMappingURL=create-app.d.ts.map
