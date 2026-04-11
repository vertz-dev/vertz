/**
 * Type declarations for the vtz runtime globals.
 *
 * These globals are injected by the vtz Rust runtime's bootstrap JS.
 * They are `undefined` when running on other runtimes (Bun, Node).
 */

declare global {
  // eslint-disable-next-line no-var -- globals must use var
  var __vtz_runtime: boolean | undefined;
  // eslint-disable-next-line no-var -- globals must use var
  var __vtz_http:
    | {
        serve(
          port: number,
          hostname: string,
          handler: (request: Request) => Promise<Response>,
        ): Promise<{ id: number; port: number; hostname: string; close(): void }>;
      }
    | undefined;
}

export {};
