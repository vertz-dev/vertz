function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
export async function runMiddlewareChain(middlewares, requestCtx) {
  const accumulated = {};
  for (const mw of middlewares) {
    const ctx = { ...requestCtx, ...mw.resolvedInject, ...accumulated };
    const contribution = await mw.handler(ctx);
    if (isPlainObject(contribution)) {
      Object.assign(accumulated, contribution);
    }
  }
  return accumulated;
}
//# sourceMappingURL=middleware-runner.js.map
