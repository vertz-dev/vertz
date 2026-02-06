import type { Schema } from '@vertz/schema';

export interface MiddlewareDef<
  TRequires extends Record<string, unknown> = Record<string, unknown>,
  TProvides extends Record<string, unknown> = Record<string, unknown>,
> {
  inject?: Record<string, unknown>;
  headers?: Schema<any>;
  params?: Schema<any>;
  query?: Schema<any>;
  body?: Schema<any>;
  requires?: Schema<TRequires>;
  provides?: Schema<TProvides>;
  handler: (ctx: Record<string, unknown>) => Promise<TProvides> | TProvides;
}
