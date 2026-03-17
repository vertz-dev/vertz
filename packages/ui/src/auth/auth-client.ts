import type { AuthClientError, AuthErrorCode } from './auth-types';

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
