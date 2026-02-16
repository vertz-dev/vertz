export interface ResolvedMiddleware {
  name: string;
  handler: (ctx: Record<string, unknown>) => Promise<unknown> | unknown;
  resolvedInject: Record<string, unknown>;
}
export declare function runMiddlewareChain(
  middlewares: ResolvedMiddleware[],
  requestCtx: Record<string, unknown>,
): Promise<Record<string, unknown>>;
//# sourceMappingURL=middleware-runner.d.ts.map
