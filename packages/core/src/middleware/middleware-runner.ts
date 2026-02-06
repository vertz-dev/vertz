export interface ResolvedMiddleware {
  name: string;
  handler: (ctx: Record<string, unknown>) => Promise<unknown> | unknown;
  resolvedInject: Record<string, unknown>;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export async function runMiddlewareChain(
  middlewares: ResolvedMiddleware[],
  requestCtx: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const accumulated: Record<string, unknown> = {};

  for (const mw of middlewares) {
    const ctx = { ...requestCtx, ...mw.resolvedInject, ...accumulated };
    const contribution = await mw.handler(ctx);

    if (isPlainObject(contribution)) {
      Object.assign(accumulated, contribution);
    }
  }

  return accumulated;
}
