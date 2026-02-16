/**
 * Development server abstraction for Vite SSR.
 *
 * Provides a turnkey dev server with:
 * - Vite middleware mode
 * - SSR module loading with transformation
 * - Module invalidation per request
 * - HTML transformation (HMR injection)
 * - Error stack fixing
 * - HTTP server creation
 * - Graceful shutdown
 *
 * @example
 * ```ts
 * import { createDevServer } from '@vertz/ui-server';
 *
 * createDevServer({
 *   entry: './src/entry-server.ts',
 *   port: 5173,
 * }).listen();
 * ```
 */
import type { IncomingMessage, Server, ServerResponse } from 'node:http';
import type { InlineConfig, ViteDevServer } from 'vite';
export interface DevServerOptions {
  /**
   * Path to the SSR entry module (relative to project root).
   * This module should export a `renderToString` function.
   */
  entry: string;
  /**
   * Port to listen on.
   * @default 5173
   */
  port?: number;
  /**
   * Host to bind to.
   * @default '0.0.0.0'
   */
  host?: string;
  /**
   * Custom Vite configuration.
   * Merged with default middleware mode config.
   */
  viteConfig?: InlineConfig;
  /**
   * Custom middleware to run before SSR handler.
   * Useful for API routes, static file serving, etc.
   */
  middleware?: (req: IncomingMessage, res: ServerResponse, next: () => void) => void;
  /**
   * Skip invalidating modules on each request.
   * Useful for debugging or performance testing.
   * @default false
   */
  skipModuleInvalidation?: boolean;
  /**
   * Log requests to console.
   * @default true
   */
  logRequests?: boolean;
}
export interface DevServer {
  /**
   * Start the server and listen on the configured port.
   */
  listen(): Promise<void>;
  /**
   * Close the server.
   */
  close(): Promise<void>;
  /**
   * The underlying Vite dev server.
   */
  vite: ViteDevServer;
  /**
   * The underlying HTTP server.
   */
  httpServer: Server;
}
/**
 * Create a Vite SSR development server.
 */
export declare function createDevServer(options: DevServerOptions): DevServer;
//# sourceMappingURL=dev-server.d.ts.map
