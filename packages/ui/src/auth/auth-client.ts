import { err, ok, type Result } from '@vertz/fetch';
import type { SdkMethodWithMeta } from '../form/form';
import type { FormSchema } from '../form/validation';
import type { AuthClientError, AuthErrorCode } from './auth-types';

export interface CreateAuthMethodOptions<TBody, TResult> {
  basePath: string;
  endpoint: string;
  httpMethod: string;
  schema: FormSchema<TBody>;
  onSuccess: (result: TResult) => void;
}

/**
 * Parse an error response from the auth server into an AuthClientError.
 */
export async function parseAuthError(res: Response): Promise<AuthClientError> {
  let code: AuthErrorCode = 'SERVER_ERROR';
  let message = 'An unexpected error occurred';
  let retryAfter: number | undefined;

  try {
    const body = await res.json();
    if (body.code) code = body.code as AuthErrorCode;
    if (body.message) message = body.message;
  } catch {
    // Response body not JSON — use status-based defaults
  }

  if (res.status === 401) {
    code = code === 'SERVER_ERROR' ? 'INVALID_CREDENTIALS' : code;
    message = message === 'An unexpected error occurred' ? 'Invalid email or password' : message;
  } else if (res.status === 409) {
    code = code === 'SERVER_ERROR' ? 'USER_EXISTS' : code;
    message =
      message === 'An unexpected error occurred'
        ? 'An account with this email already exists'
        : message;
  } else if (res.status === 429) {
    code = 'RATE_LIMITED';
    const retryHeader = res.headers.get('Retry-After');
    if (retryHeader) retryAfter = Number.parseInt(retryHeader, 10);
  }

  return { code, message, statusCode: res.status, retryAfter };
}

/**
 * Create an SdkMethodWithMeta for an auth endpoint.
 *
 * The returned function is callable (satisfies SdkMethod) and has
 * url, method, and meta.bodySchema attached for form() integration.
 */
export function createAuthMethod<TBody, TResult>({
  basePath,
  endpoint,
  httpMethod,
  schema,
  onSuccess,
}: CreateAuthMethodOptions<TBody, TResult>): SdkMethodWithMeta<TBody, TResult> {
  const url = `${basePath}/${endpoint}`;

  const fn = async (body: TBody): Promise<Result<TResult, Error>> => {
    let res: Response;
    try {
      res = await fetch(url, {
        method: httpMethod,
        headers: {
          'Content-Type': 'application/json',
          'X-VTZ-Request': '1',
        },
        credentials: 'include',
        body: JSON.stringify(body),
      });
    } catch (e) {
      const networkError: AuthClientError = {
        code: 'NETWORK_ERROR',
        message: e instanceof Error ? e.message : 'Network error',
        statusCode: 0,
      };
      return err(Object.assign(new Error(networkError.message), networkError));
    }

    if (!res.ok) {
      const authError = await parseAuthError(res);
      return err(Object.assign(new Error(authError.message), authError));
    }

    const data = (await res.json()) as TResult;
    onSuccess(data);
    return ok(data);
  };

  return Object.assign(fn, {
    url,
    method: httpMethod,
    meta: { bodySchema: schema },
  }) as SdkMethodWithMeta<TBody, TResult>;
}
