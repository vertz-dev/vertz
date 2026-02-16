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
export declare function buildCtx(config: CtxConfig): HandlerCtx;
//# sourceMappingURL=ctx-builder.d.ts.map
