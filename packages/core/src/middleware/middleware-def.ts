import type { MiddlewareDef } from '../types/middleware';
import { deepFreeze } from '../immutability';

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
  return deepFreeze(def);
}
