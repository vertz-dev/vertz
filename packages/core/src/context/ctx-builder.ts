import type { RawRequest } from '../types/context';
import { makeImmutable } from '../immutability';

export interface CtxConfig {
  params: Record<string, unknown>;
  body: unknown;
  query: Record<string, unknown>;
  headers: Record<string, unknown>;
  raw: RawRequest;
  middlewareState: Record<string, unknown>;
  services: Record<string, unknown>;
  options: Record<string, unknown>;
  env: Record<string, unknown>;
}

export function buildCtx(config: CtxConfig): Record<string, unknown> {
  return makeImmutable(
    {
      params: config.params,
      body: config.body,
      query: config.query,
      headers: config.headers,
      raw: config.raw,
      options: config.options,
      env: config.env,
      ...config.middlewareState,
      ...config.services,
    },
    'ctx',
  );
}
