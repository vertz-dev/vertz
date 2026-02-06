export interface ResolvedMiddleware {
  name: string;
  handler: (ctx: Record<string, unknown>) => Promise<unknown> | unknown;
  resolvedInject: Record<string, unknown>;
}

export async function runMiddlewareChain(
  middlewares: ResolvedMiddleware[],
  requestCtx: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const accumulated: Record<string, unknown> = {};

  for (const mw of middlewares) {
    const ctx = { ...requestCtx, ...mw.resolvedInject, ...accumulated };
    const contribution = await mw.handler(ctx);

    if (contribution && typeof contribution === 'object') {
      Object.assign(accumulated, contribution);
    }
  }

  return accumulated;
}
