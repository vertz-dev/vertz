import type { CircuitBreaker } from './circuit-breaker';
import type { SessionPayload } from './types';

export interface OnUserCreatedPayload {
  user: { id: string; email: string };
  isNewUser: boolean;
  rawProfile?: Record<string, unknown>;
}

export interface AuthCallbackContext {
  db: unknown;
}

export function createAuthProxy(options: {
  projectId: string;
  cloudBaseUrl?: string;
  environment?: string;
  authToken: string;
  circuitBreaker?: CircuitBreaker;
  fetchTimeout?: number;
  maxBodySize?: number;
  onUserCreated?: (payload: OnUserCreatedPayload, ctx: AuthCallbackContext) => Promise<void>;
  onUserAuthenticated?: (payload: SessionPayload) => Promise<void>;
}): (request: Request) => Promise<Response> {
  const {
    projectId,
    cloudBaseUrl = 'https://cloud.vtz.app',
    environment = process.env.NODE_ENV ?? 'development',
    authToken,
    fetchTimeout = 10_000,
    maxBodySize = 1_048_576,
  } = options;

  const isProduction = environment !== 'development';

  const HEADER_WHITELIST = ['cookie', 'content-type', 'accept', 'x-forwarded-for', 'user-agent'];

  return async (request: Request): Promise<Response> => {
    // Body size check
    const contentLength = request.headers.get('content-length');
    if (contentLength && parseInt(contentLength, 10) > maxBodySize) {
      return new Response(JSON.stringify({ error: 'payload_too_large', message: 'Payload Too Large' }), {
        status: 413,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Read body (if present) and check size
    let body: string | null = null;
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      body = await request.text();
      if (body.length > maxBodySize) {
        return new Response(JSON.stringify({ error: 'payload_too_large', message: 'Payload Too Large' }), {
          status: 413,
          headers: { 'Content-Type': 'application/json' },
        });
      }
    }

    // Build cloud URL
    const url = new URL(request.url);
    const authPath = url.pathname.replace(/^\/api\/auth/, '');
    const cloudUrl = `${cloudBaseUrl}/auth/v1${authPath}${url.search}`;

    // Build headers — whitelist + Vertz headers
    const headers = new Headers();
    for (const name of HEADER_WHITELIST) {
      const value = request.headers.get(name);
      if (value) {
        headers.set(name, value);
      }
    }
    headers.set('Authorization', `Bearer ${authToken}`);
    headers.set('X-Vertz-Project', projectId);
    headers.set('X-Vertz-Environment', environment);
    // Set Host to cloud endpoint (not forwarded from client)
    const cloudHost = new URL(cloudBaseUrl).host;
    headers.set('Host', cloudHost);

    // Proxy the request
    let cloudResponse: Response;
    try {
      cloudResponse = await fetch(cloudUrl, {
        method: request.method,
        headers,
        body,
        signal: AbortSignal.timeout(fetchTimeout),
      });
    } catch {
      return new Response(JSON.stringify({ error: 'bad_gateway', message: 'Cloud auth service unavailable' }), {
        status: 502,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Try to parse as JSON for token/lifecycle extraction
    const responseText = await cloudResponse.text();
    let responseBody: Record<string, unknown> | null = null;
    try {
      responseBody = JSON.parse(responseText);
    } catch {
      // Non-JSON response — pass through unchanged
      const responseHeaders = new Headers(cloudResponse.headers);
      return new Response(responseText, {
        status: cloudResponse.status,
        headers: responseHeaders,
      });
    }

    // Extract _tokens and set cookies
    const responseHeaders = new Headers(cloudResponse.headers);
    const tokens = responseBody?._tokens as { jwt?: string; refreshToken?: string } | undefined;

    if (tokens) {
      const securePart = isProduction ? '; Secure' : '';

      if (tokens.jwt) {
        responseHeaders.append(
          'Set-Cookie',
          `vertz.sid=${tokens.jwt}; HttpOnly; SameSite=Lax; Path=/${securePart}`,
        );
      }

      if (tokens.refreshToken) {
        responseHeaders.append(
          'Set-Cookie',
          `vertz.ref=${tokens.refreshToken}; HttpOnly; SameSite=Lax; Path=/api/auth${securePart}`,
        );
      }

      // Strip _tokens from response body
      delete responseBody!._tokens;
    }

    // Strip _lifecycle from response body (Phase 3 will process it)
    if (responseBody && '_lifecycle' in responseBody) {
      delete responseBody._lifecycle;
    }

    // Remove Content-Length after body manipulation (let runtime use chunked transfer)
    responseHeaders.delete('content-length');

    const finalBody = JSON.stringify(responseBody);
    return new Response(finalBody, {
      status: cloudResponse.status,
      headers: responseHeaders,
    });
  };
}
