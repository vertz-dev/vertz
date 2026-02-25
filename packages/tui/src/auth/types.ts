/** Configuration for the device code auth flow. */
export interface AuthConfig {
  /** OAuth client ID. */
  clientId: string;
  /** URL for the device authorization endpoint (POST). */
  deviceCodeUrl: string;
  /** URL for the token endpoint (POST). */
  tokenUrl: string;
  /** OAuth scopes to request. */
  scopes?: string[];
  /** Callback invoked when tokens are successfully obtained. */
  onTokens?: (tokens: AuthTokens) => void | Promise<void>;
  /** Custom fetch function. Defaults to globalThis.fetch. */
  fetcher?: (url: string, init: RequestInit) => Promise<Response>;
  /** Title displayed in the auth box. Defaults to "Authenticate". */
  title?: string;
}

/** RFC 8628 device authorization response. */
export interface DeviceCodeResponse {
  device_code: string;
  user_code: string;
  verification_uri: string;
  verification_uri_complete?: string;
  expires_in: number;
  interval: number;
}

/** OAuth 2.0 token response. */
export interface TokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  refresh_token?: string;
  scope?: string;
}

/** Normalized tokens returned to the consumer. */
export interface AuthTokens {
  accessToken: string;
  refreshToken?: string;
  expiresIn: number;
}

/** Status of the device code flow. */
export type AuthStatus =
  | 'idle'
  | 'requesting-code'
  | 'awaiting-approval'
  | 'polling'
  | 'success'
  | 'error'
  | 'expired'
  | 'denied'
  | 'cancelled';

/** Error thrown when the user denies authorization. */
export class AuthDeniedError extends Error {
  constructor() {
    super('Authorization request was denied by the user.');
    this.name = 'AuthDeniedError';
  }
}

/** Error thrown when the device code expires before approval. */
export class AuthExpiredError extends Error {
  constructor() {
    super('Device code expired before authorization was completed.');
    this.name = 'AuthExpiredError';
  }
}

/** Error thrown when the user cancels the flow (Esc key). */
export class AuthCancelledError extends Error {
  constructor() {
    super('Authentication was cancelled.');
    this.name = 'AuthCancelledError';
  }
}
