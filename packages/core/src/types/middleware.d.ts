import type { Schema } from '@vertz/schema';
export interface MiddlewareDef<
  TRequires extends Record<string, unknown> = Record<string, unknown>,
  TProvides extends Record<string, unknown> = Record<string, unknown>,
> {
  inject?: Record<string, unknown>;
  headers?: Schema<unknown>;
  params?: Schema<unknown>;
  query?: Schema<unknown>;
  body?: Schema<unknown>;
  requires?: Schema<TRequires>;
  provides?: Schema<TProvides>;
  handler: (ctx: Record<string, unknown>) => Promise<TProvides> | TProvides;
}
//# sourceMappingURL=middleware.d.ts.map
