import type { CorsConfig } from '../types/app';

const DEFAULT_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'];
const DEFAULT_HEADERS = ['Content-Type', 'Authorization'];

function resolveOrigin(config: CorsConfig, requestOrigin: string | null): string | null {
  if (config.origins === true || config.origins === '*') return '*';
  if (!requestOrigin) return null;
  if (Array.isArray(config.origins)) {
    return config.origins.includes(requestOrigin) ? requestOrigin : null;
  }
  if (typeof config.origins === 'string') {
    return config.origins === requestOrigin ? requestOrigin : null;
  }
  return null;
}

export function handleCors(config: CorsConfig, request: Request): Response | null {
  const requestOrigin = request.headers.get('origin');
  const origin = resolveOrigin(config, requestOrigin);

  if (request.method === 'OPTIONS') {
    const headers: Record<string, string> = {};

    if (origin) headers['access-control-allow-origin'] = origin;

    const methods = config.methods ?? DEFAULT_METHODS;
    headers['access-control-allow-methods'] = methods.join(', ');

    const allowHeaders = config.headers ?? DEFAULT_HEADERS;
    headers['access-control-allow-headers'] = allowHeaders.join(', ');

    if (config.maxAge !== undefined) {
      headers['access-control-max-age'] = String(config.maxAge);
    }

    if (config.credentials) {
      headers['access-control-allow-credentials'] = 'true';
    }

    return new Response(null, { status: 204, headers });
  }

  return null;
}

export function applyCorsHeaders(config: CorsConfig, request: Request, response: Response): Response {
  const requestOrigin = request.headers.get('origin');
  const origin = resolveOrigin(config, requestOrigin);

  if (!origin) return response;

  const headers = new Headers(response.headers);
  headers.set('access-control-allow-origin', origin);

  if (config.credentials) {
    headers.set('access-control-allow-credentials', 'true');
  }

  if (config.exposedHeaders?.length) {
    headers.set('access-control-expose-headers', config.exposedHeaders.join(', '));
  }

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
