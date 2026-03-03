export interface ResolvedMiddleware {
  name: string;
  handler: (ctx: Record<string, unknown>) => Promise<unknown> | unknown;
  resolvedInject: Record<string, unknown>;
}

const DANGEROUS_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function safeAssign(target: Record<string, unknown>, source: Record<string, unknown>): void {
  for (const key of Object.keys(source)) {
    if (!DANGEROUS_KEYS.has(key)) {
      target[key] = source[key];
    }
  }
}

export async function runMiddlewareChain(
  middlewares: ResolvedMiddleware[],
  requestCtx: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const accumulated: Record<string, unknown> = Object.create(null);

  for (const mw of middlewares) {
    const ctx = { ...requestCtx, ...mw.resolvedInject, ...accumulated };
    const contribution = await mw.handler(ctx);

    if (isPlainObject(contribution)) {
      safeAssign(accumulated, contribution);
    }
  }

  return accumulated;
}
