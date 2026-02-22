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

const defaultConfigStore: ConfigStore = {
  async read(_path: string): Promise<string | null> {
    return null;
  },
  async write(_path: string, _content: string): Promise<void> {
    // No-op in default implementation
  },
  async remove(_path: string): Promise<void> {
    // No-op in default implementation
  },
};

export function createAuthManager(
  config: AuthConfig,
  store: ConfigStore = defaultConfigStore,
): AuthManager {
  const credentialsPath = `${config.configDir}/credentials.json`;

  async function loadCredentials(): Promise<StoredCredentials> {
    const content = await store.read(credentialsPath);
    if (!content) return {};
    return JSON.parse(content) as StoredCredentials;
  }

  async function saveCredentials(credentials: StoredCredentials): Promise<void> {
    await store.write(credentialsPath, JSON.stringify(credentials, null, 2));
  }

  async function setApiKey(apiKey: string): Promise<void> {
    const credentials = await loadCredentials();
    credentials.apiKey = apiKey;
    await saveCredentials(credentials);
  }

  async function getApiKey(): Promise<string | undefined> {
    const credentials = await loadCredentials();
    return credentials.apiKey;
  }

  async function clearCredentials(): Promise<void> {
    await store.remove(credentialsPath);
  }

  async function getAccessToken(): Promise<string | undefined> {
    const credentials = await loadCredentials();

    if (!credentials.accessToken) return undefined;

    // Check if token is expired
    if (credentials.expiresAt && Date.now() >= credentials.expiresAt) {
      return undefined;
    }

    return credentials.accessToken;
  }

  async function storeTokens(tokenResponse: TokenResponse): Promise<void> {
    const credentials = await loadCredentials();
    credentials.accessToken = tokenResponse.access_token;

    if (tokenResponse.refresh_token) {
      credentials.refreshToken = tokenResponse.refresh_token;
    }

    if (tokenResponse.expires_in) {
      credentials.expiresAt = Date.now() + tokenResponse.expires_in * 1000;
    }

    await saveCredentials(credentials);
  }

  async function initiateDeviceCodeFlow(
    client: FetchClient,
    deviceAuthUrl: string,
    clientId: string,
    scopes: string[] = [],
  ): Promise<DeviceCodeResponse> {
    const body: Record<string, string> = { client_id: clientId };
    if (scopes.length > 0) {
      body.scope = scopes.join(' ');
    }

    const response = await client.request<DeviceCodeResponse>('POST', deviceAuthUrl, { body });
    if (!response.ok) {
      throw response.error;
    }
    return response.data.data;
  }

  async function pollForToken(
    client: FetchClient,
    tokenUrl: string,
    deviceCode: string,
    clientId: string,
    interval: number,
    expiresIn: number,
  ): Promise<TokenResponse> {
    const deadline = Date.now() + expiresIn * 1000;

    while (Date.now() < deadline) {
      await sleep(interval * 1000);

      const response = await client.request<TokenResponse>('POST', tokenUrl, {
        body: {
          grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
          device_code: deviceCode,
          client_id: clientId,
        },
      });

      if (response.ok) {
        await storeTokens(response.data.data);
        return response.data.data;
      }

      // Handle error case
      const error = response.error;
      // Check for "authorization_pending" - keep polling
      if (isAuthPendingError(error)) {
        continue;
      }
      // Check for "slow_down" - increase interval
      if (isSlowDownError(error)) {
        interval += 5;
        continue;
      }
      throw error;
    }

    throw new AuthError('Device code expired');
  }

  async function refreshAccessToken(
    client: FetchClient,
    tokenUrl: string,
    clientId: string,
  ): Promise<TokenResponse | null> {
    const credentials = await loadCredentials();

    if (!credentials.refreshToken) {
      return null;
    }

    const response = await client.request<TokenResponse>('POST', tokenUrl, {
      body: {
        grant_type: 'refresh_token',
        refresh_token: credentials.refreshToken,
        client_id: clientId,
      },
    });

    if (!response.ok) {
      // Refresh token may be invalid/expired
      return null;
    }

    await storeTokens(response.data.data);
    return response.data.data;
  }

  return {
    clearCredentials,
    getAccessToken,
    getApiKey,
    initiateDeviceCodeFlow,
    loadCredentials,
    pollForToken,
    refreshAccessToken,
    setApiKey,
    storeTokens,
  };
}

export class AuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AuthError';
  }
}

function isAuthPendingError(error: unknown): boolean {
  if (typeof error === 'object' && error !== null && 'body' in error) {
    const body = (error as { body: unknown }).body;
    if (typeof body === 'object' && body !== null && 'error' in body) {
      return (body as { error: string }).error === 'authorization_pending';
    }
  }
  return false;
}

function isSlowDownError(error: unknown): boolean {
  if (typeof error === 'object' && error !== null && 'body' in error) {
    const body = (error as { body: unknown }).body;
    if (typeof body === 'object' && body !== null && 'error' in body) {
      return (body as { error: string }).error === 'slow_down';
    }
  }
  return false;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
