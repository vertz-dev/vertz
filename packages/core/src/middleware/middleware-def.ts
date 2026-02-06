import type { MiddlewareDef } from '../types/middleware';

export interface NamedMiddlewareDef<
  TRequires extends Record<string, unknown> = Record<string, unknown>,
  TProvides extends Record<string, unknown> = Record<string, unknown>,
> extends MiddlewareDef<TRequires, TProvides> {
  name: string;
}

export function createMiddleware<
  TRequires extends Record<string, unknown> = Record<string, unknown>,
  TProvides extends Record<string, unknown> = Record<string, unknown>,
>(def: NamedMiddlewareDef<TRequires, TProvides>): NamedMiddlewareDef<TRequires, TProvides> {
  return def;
}
