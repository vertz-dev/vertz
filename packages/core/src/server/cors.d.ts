import type { CorsConfig } from '../types/app';
export declare function handleCors(config: CorsConfig, request: Request): Response | null;
export declare function applyCorsHeaders(
  config: CorsConfig,
  request: Request,
  response: Response,
): Response;
//# sourceMappingURL=cors.d.ts.map
