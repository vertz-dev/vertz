/** Configuration for the auth testing client. */
export interface AuthClientConfig {
  /** Base URL of the running server (e.g. `http://localhost:3000`). */
  baseURL: string;
}

/** A cookie in the format expected by Playwright's `context.addCookies()`. */
export interface AuthCookie {
  name: string;
  value: string;
  domain: string;
  path: string;
}

/** Result returned by auth client methods. */
export interface AuthClientResult {
  cookies: AuthCookie[];
}

/** Programmatic auth client for E2E test setup. */
export interface AuthClient {
  signup(input: { email: string; password: string }): Promise<AuthClientResult>;
  signIn(input: { email: string; password: string }): Promise<AuthClientResult>;
  switchTenant(input: { tenantId: string; cookies: AuthCookie[] }): Promise<AuthClientResult>;
}

/**
 * Extract Set-Cookie headers from a Response into Playwright-compatible
 * cookie objects.
 */
function extractCookies(res: Response, baseURL: string): AuthCookie[] {
  const cookies: AuthCookie[] = [];
  const url = new URL(baseURL);

  for (const header of res.headers.getSetCookie()) {
    const [nameValue] = header.split(';');
    if (!nameValue) continue;
    const eqIdx = nameValue.indexOf('=');
    if (eqIdx > 0) {
      cookies.push({
        name: nameValue.slice(0, eqIdx),
        value: nameValue.slice(eqIdx + 1),
        domain: url.hostname,
        path: '/',
      });
    }
  }

  return cookies;
}

/** Format AuthCookie[] into a Cookie header string. */
function cookieHeader(cookies: AuthCookie[]): string {
  return cookies.map((c) => `${c.name}=${c.value}`).join('; ');
}

/** POST to an auth endpoint and return parsed cookies, or throw on error. */
async function authPost(
  baseURL: string,
  path: string,
  body: Record<string, unknown>,
  cookies?: AuthCookie[],
): Promise<AuthClientResult> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-VTZ-Request': '1',
  };
  if (cookies) {
    headers.Cookie = cookieHeader(cookies);
  }

  const res = await fetch(`${baseURL}/api/auth${path}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Auth ${path} failed (${res.status}): ${text}`);
  }

  return { cookies: extractCookies(res, baseURL) };
}

/**
 * Creates a programmatic auth client for server-side / E2E test usage.
 *
 * Wraps the Vertz auth HTTP endpoints, handles cookie parsing, and returns
 * cookies in Playwright-compatible format.
 *
 * @example
 * ```ts
 * const client = createAuthClient({ baseURL: 'http://localhost:3000' });
 * const { cookies } = await client.signup({ email: 'test@test.local', password: 'Pass123!' });
 * await context.addCookies(cookies); // Playwright browser context
 * ```
 */
export function createAuthClient(config: AuthClientConfig): AuthClient {
  const { baseURL } = config;

  return {
    async signup(input) {
      return authPost(baseURL, '/signup', input);
    },
    async signIn(input) {
      return authPost(baseURL, '/signin', input);
    },
    async switchTenant(input) {
      return authPost(baseURL, '/switch-tenant', { tenantId: input.tenantId }, input.cookies);
    },
  };
}
