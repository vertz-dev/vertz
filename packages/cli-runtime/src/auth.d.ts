import type { FetchClient } from '@vertz/fetch';
export interface AuthConfig {
  configDir: string;
}
export interface StoredCredentials {
  accessToken?: string;
  refreshToken?: string;
  apiKey?: string;
  expiresAt?: number;
}
export interface DeviceCodeResponse {
  device_code: string;
  user_code: string;
  verification_uri: string;
  expires_in: number;
  interval: number;
}
export interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  token_type: string;
}
export interface ConfigStore {
  read: (path: string) => Promise<string | null>;
  write: (path: string, content: string) => Promise<void>;
  remove: (path: string) => Promise<void>;
}
export interface AuthManager {
  clearCredentials: () => Promise<void>;
  getAccessToken: () => Promise<string | undefined>;
  getApiKey: () => Promise<string | undefined>;
  initiateDeviceCodeFlow: (
    client: FetchClient,
    deviceAuthUrl: string,
    clientId: string,
    scopes?: string[],
  ) => Promise<DeviceCodeResponse>;
  loadCredentials: () => Promise<StoredCredentials>;
  pollForToken: (
    client: FetchClient,
    tokenUrl: string,
    deviceCode: string,
    clientId: string,
    interval: number,
    expiresIn: number,
  ) => Promise<TokenResponse>;
  refreshAccessToken: (
    client: FetchClient,
    tokenUrl: string,
    clientId: string,
  ) => Promise<TokenResponse | null>;
  setApiKey: (apiKey: string) => Promise<void>;
  storeTokens: (tokenResponse: TokenResponse) => Promise<void>;
}
export declare function createAuthManager(config: AuthConfig, store?: ConfigStore): AuthManager;
export declare class AuthError extends Error {
  constructor(message: string);
}
//# sourceMappingURL=auth.d.ts.map
