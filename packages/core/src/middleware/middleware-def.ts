import { deepFreeze } from '../immutability';
import type { MiddlewareDef } from '../types/middleware';

export interface NamedMiddlewareDef<
  TRequires extends Record<string, unknown> = Record<string, unknown>,
  TProvides extends Record<string, unknown> = Record<string, unknown>,
> extends MiddlewareDef<TRequires, TProvides> {
  name: string;
}

/**
 * Identity type for middleware type accumulation.
 * Uses `{}` intentionally as it is the identity element for intersection types.
 */
// biome-ignore lint/complexity/noBannedTypes: {} is the correct identity for type-level intersections
type EmptyProvides = {};

/**
 * Extracts TProvides from a NamedMiddlewareDef by inspecting the handler return type.
 * Uses the handler signature to extract the provides type without variance issues.
 */
type ExtractProvides<T> = T extends { handler: (...args: never[]) => Promise<infer P> | infer P }
  ? P extends Record<string, unknown>
    ? P
    : EmptyProvides
  : EmptyProvides;

/**
 * Recursively accumulates the TProvides types from a tuple of middleware definitions
 * into an intersection type. Given [M1<P1>, M2<P2>, M3<P3>], produces P1 & P2 & P3.
 */
// biome-ignore lint/suspicious/noExplicitAny: variance boundary — must accept any NamedMiddlewareDef generics
export type AccumulateProvides<T extends readonly NamedMiddlewareDef<any, any>[]> =
  // biome-ignore lint/suspicious/noExplicitAny: recursive type requires same variance boundary
  T extends readonly [infer First, ...infer Rest extends readonly NamedMiddlewareDef<any, any>[]]
    ? ExtractProvides<First> & AccumulateProvides<Rest>
    : EmptyProvides;

export function createMiddleware<
  TRequires extends Record<string, unknown> = Record<string, unknown>,
  TProvides extends Record<string, unknown> = Record<string, unknown>,
>(def: NamedMiddlewareDef<TRequires, TProvides>): NamedMiddlewareDef<TRequires, TProvides> {
  return deepFreeze(def);
}
