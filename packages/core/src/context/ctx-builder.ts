import { makeImmutable } from '../immutability';
import type { HandlerCtx, RawRequest } from '../types/context';

export interface CtxConfig {
  params: Record<string, unknown>;
  body: unknown;
  query: Record<string, string>;
  headers: Record<string, unknown>;
  raw: RawRequest;
  middlewareState: Record<string, unknown>;
  services: Record<string, unknown>;
  options: Record<string, unknown>;
  env: Record<string, unknown>;
}

const RESERVED_KEYS = ['params', 'body', 'query', 'headers', 'raw', 'options', 'env'];

function validateCollisions(config: CtxConfig): void {
  const middlewareKeys = Object.keys(config.middlewareState);

  for (const key of middlewareKeys) {
    if (RESERVED_KEYS.includes(key)) {
      throw new Error(`Middleware cannot provide reserved ctx key: "${key}"`);
    }
  }

  for (const key of Object.keys(config.services)) {
    if (RESERVED_KEYS.includes(key)) {
      throw new Error(`Service name cannot shadow reserved ctx key: "${key}"`);
    }
    if (middlewareKeys.includes(key)) {
      throw new Error(`Service name "${key}" collides with middleware-provided key`);
    }
  }
}

export function buildCtx(config: CtxConfig): HandlerCtx {
  if (process.env.NODE_ENV === 'development') {
    validateCollisions(config);
  }

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
