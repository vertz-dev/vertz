import type { DeepReadonly } from './deep-readonly';

export interface RawRequest {
  readonly request: Request;
  readonly method: string;
  readonly url: string;
  readonly headers: Headers;
}

export interface HandlerCtx {
  params: Record<string, string>;
  body: unknown;
  query: Record<string, string>;
  headers: Record<string, string>;
  raw: RawRequest;
  options: Record<string, unknown>;
  env: Record<string, unknown>;
  [key: string]: unknown;
}

export type Deps<T extends Record<string, unknown>> = DeepReadonly<T>;

export type Ctx<T extends Record<string, unknown>> = DeepReadonly<T>;
