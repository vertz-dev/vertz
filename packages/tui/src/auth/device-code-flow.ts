import type { AuthConfig, AuthTokens, DeviceCodeResponse, TokenResponse } from './types';
import { AuthDeniedError, AuthExpiredError } from './types';

interface DeviceCodeErrorBody {
  error: string;
  error_description?: string;
}

/** Request a device code from the authorization server. */
export async function requestDeviceCode(config: AuthConfig): Promise<DeviceCodeResponse> {
  const fetcher = config.fetcher ?? globalThis.fetch;
  const body: Record<string, string> = { client_id: config.clientId };
  if (config.scopes?.length) {
    body.scope = config.scopes.join(' ');
  }
  const response = await fetcher(config.deviceCodeUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(body),
  });
  if (!response.ok) {
    throw new Error(`Device code request failed: ${response.status}`);
  }
  return response.json() as Promise<DeviceCodeResponse>;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Poll the token endpoint until authorization completes, is denied, or expires.
 * Handles `authorization_pending`, `slow_down`, `access_denied`, and `expired_token`.
 */
export async function pollTokenUntilComplete(
  config: AuthConfig,
  deviceCode: DeviceCodeResponse,
  signal?: AbortSignal,
): Promise<AuthTokens> {
  const fetcher = config.fetcher ?? globalThis.fetch;
  let interval = deviceCode.interval * 1000;
  const deadline = Date.now() + deviceCode.expires_in * 1000;

  while (Date.now() < deadline) {
    if (signal?.aborted) {
      throw new AuthExpiredError();
    }

    await sleep(interval);

    if (signal?.aborted) {
      throw new AuthExpiredError();
    }

    const response = await fetcher(config.tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
        device_code: deviceCode.device_code,
        client_id: config.clientId,
      }),
    });

    if (response.ok) {
      const tokenData = (await response.json()) as TokenResponse;
      const tokens: AuthTokens = {
        accessToken: tokenData.access_token,
        refreshToken: tokenData.refresh_token,
        expiresIn: tokenData.expires_in,
      };
      if (config.onTokens) {
        await config.onTokens(tokens);
      }
      return tokens;
    }

    const errorBody = (await response.json()) as DeviceCodeErrorBody;

    switch (errorBody.error) {
      case 'authorization_pending':
        // Continue polling at the current interval
        break;
      case 'slow_down':
        // Increase interval by 5 seconds per RFC 8628 section 3.5
        interval += 5000;
        break;
      case 'access_denied':
        throw new AuthDeniedError();
      case 'expired_token':
        throw new AuthExpiredError();
      default:
        throw new Error(
          `Token request failed: ${errorBody.error}${errorBody.error_description ? ` — ${errorBody.error_description}` : ''}`,
        );
    }
  }

  throw new AuthExpiredError();
}
