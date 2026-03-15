import { type CircuitBreaker, CircuitBreakerOpenError } from './circuit-breaker';

export interface CloudProxyLifecycleCallbacks {
  /** Fired when cloud indicates a new user was created (_lifecycle.isNewUser). */
  onUserCreated?: (payload: {
    user: { id: string; email: string; role: string; [key: string]: unknown };
    provider: { id: string; name: string };
    profile: Record<string, unknown>;
  }) => Promise<void>;
  /** Fired on every successful auth response that includes _tokens. */
  onUserAuthenticated?: (user: {
    id: string;
    email: string;
    role: string;
    [key: string]: unknown;
  }) => Promise<void>;
}

/** Carries a 5xx response through the circuit breaker's error path. */
class CloudUpstreamError extends Error {
  constructor(
    readonly status: number,
    readonly responseText: string,
    readonly responseHeaders: Headers,
  ) {
    super(`Cloud upstream error: ${status}`);
  }
}

interface FetchResult {
  status: number;
  text: string;
  headers: Headers;
}

export function createAuthProxy(options: {
  projectId: string;
  cloudBaseUrl?: string;
  environment?: string;
  authToken: string;
  circuitBreaker?: CircuitBreaker;
  fetchTimeout?: number;
  maxBodySize?: number;
  lifecycle?: CloudProxyLifecycleCallbacks;
}): (request: Request) => Promise<Response> {
  const {
    projectId,
    cloudBaseUrl = 'https://cloud.vtz.app',
    environment = process.env.NODE_ENV ?? 'development',
    authToken,
    circuitBreaker,
    fetchTimeout = 10_000,
    maxBodySize = 1_048_576,
    lifecycle,
  } = options;

  const isProduction = environment !== 'development';

  const HEADER_WHITELIST = ['cookie', 'content-type', 'accept', 'x-forwarded-for', 'user-agent'];

  return async (request: Request): Promise<Response> => {
    // Body size check
    const contentLength = request.headers.get('content-length');
    if (contentLength && parseInt(contentLength, 10) > maxBodySize) {
      return new Response(
        JSON.stringify({ error: 'payload_too_large', message: 'Payload Too Large' }),
        {
          status: 413,
          headers: { 'Content-Type': 'application/json' },
        },
      );
    }

    // Read body (if present) and check size
    let body: string | null = null;
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      body = await request.text();
      if (body.length > maxBodySize) {
        return new Response(
          JSON.stringify({ error: 'payload_too_large', message: 'Payload Too Large' }),
          {
            status: 413,
            headers: { 'Content-Type': 'application/json' },
          },
        );
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

    // Proxy the request — with optional circuit breaker
    let fetchResult: FetchResult;

    const doFetch = async (): Promise<FetchResult> => {
      const res = await fetch(cloudUrl, {
        method: request.method,
        headers,
        body,
        signal: AbortSignal.timeout(fetchTimeout),
      });
      const text = await res.text();
      const resHeaders = new Headers(res.headers);

      // 5xx → throw so circuit breaker counts it as failure
      if (res.status >= 500) {
        throw new CloudUpstreamError(res.status, text, resHeaders);
      }

      return { status: res.status, text, headers: resHeaders };
    };

    try {
      fetchResult = circuitBreaker ? await circuitBreaker.execute(doFetch) : await doFetch();
    } catch (error) {
      if (error instanceof CircuitBreakerOpenError) {
        return new Response(
          JSON.stringify({
            error: 'auth_service_unavailable',
            message: 'Auth service temporarily unavailable',
          }),
          { status: 503, headers: { 'Content-Type': 'application/json' } },
        );
      }

      if (error instanceof CloudUpstreamError) {
        // 5xx — counted as failure, now forward the response
        fetchResult = {
          status: error.status,
          text: error.responseText,
          headers: error.responseHeaders,
        };
      } else {
        // Network error / timeout
        return new Response(
          JSON.stringify({ error: 'bad_gateway', message: 'Cloud auth service unavailable' }),
          { status: 502, headers: { 'Content-Type': 'application/json' } },
        );
      }
    }

    // Try to parse as JSON for token/lifecycle extraction
    let responseBody: Record<string, unknown> | null = null;
    try {
      responseBody = JSON.parse(fetchResult.text);
    } catch {
      // Non-JSON response — pass through unchanged
      return new Response(fetchResult.text, {
        status: fetchResult.status,
        headers: fetchResult.headers,
      });
    }

    // Extract _tokens and set cookies
    const responseHeaders = fetchResult.headers;
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

    // Process lifecycle callbacks before stripping _lifecycle
    if (responseBody && lifecycle) {
      const lc = responseBody._lifecycle as
        | {
            isNewUser?: boolean;
            provider?: { id: string; name: string };
            rawProfile?: Record<string, unknown>;
          }
        | undefined;

      // Fire onUserCreated when cloud reports a new user
      if (lc?.isNewUser && lifecycle.onUserCreated) {
        const user = responseBody.user as
          | { id: string; email: string; role: string; [key: string]: unknown }
          | undefined;
        if (user) {
          await lifecycle.onUserCreated({
            user,
            provider: lc.provider ?? { id: 'unknown', name: 'Unknown' },
            profile: lc.rawProfile ?? {},
          });
        }
      }

      // Fire onUserAuthenticated on every successful auth response with tokens
      if (tokens && lifecycle.onUserAuthenticated) {
        const user = responseBody.user as
          | { id: string; email: string; role: string; [key: string]: unknown }
          | undefined;
        if (user) {
          await lifecycle.onUserAuthenticated(user);
        }
      }
    }

    // Strip _lifecycle from response body
    if (responseBody && '_lifecycle' in responseBody) {
      delete responseBody._lifecycle;
    }

    // Remove Content-Length after body manipulation (let runtime use chunked transfer)
    responseHeaders.delete('content-length');

    const finalBody = JSON.stringify(responseBody);
    return new Response(finalBody, {
      status: fetchResult.status,
      headers: responseHeaders,
    });
  };
}
