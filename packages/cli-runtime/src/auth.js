const defaultConfigStore = {
  async read(_path) {
    return null;
  },
  async write(_path, _content) {
    // No-op in default implementation
  },
  async remove(_path) {
    // No-op in default implementation
  },
};
export function createAuthManager(config, store = defaultConfigStore) {
  const credentialsPath = `${config.configDir}/credentials.json`;
  async function loadCredentials() {
    const content = await store.read(credentialsPath);
    if (!content) return {};
    return JSON.parse(content);
  }
  async function saveCredentials(credentials) {
    await store.write(credentialsPath, JSON.stringify(credentials, null, 2));
  }
  async function setApiKey(apiKey) {
    const credentials = await loadCredentials();
    credentials.apiKey = apiKey;
    await saveCredentials(credentials);
  }
  async function getApiKey() {
    const credentials = await loadCredentials();
    return credentials.apiKey;
  }
  async function clearCredentials() {
    await store.remove(credentialsPath);
  }
  async function getAccessToken() {
    const credentials = await loadCredentials();
    if (!credentials.accessToken) return undefined;
    // Check if token is expired
    if (credentials.expiresAt && Date.now() >= credentials.expiresAt) {
      return undefined;
    }
    return credentials.accessToken;
  }
  async function storeTokens(tokenResponse) {
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
  async function initiateDeviceCodeFlow(client, deviceAuthUrl, clientId, scopes = []) {
    const body = { client_id: clientId };
    if (scopes.length > 0) {
      body.scope = scopes.join(' ');
    }
    const response = await client.request('POST', deviceAuthUrl, { body });
    return response.data;
  }
  async function pollForToken(client, tokenUrl, deviceCode, clientId, interval, expiresIn) {
    const deadline = Date.now() + expiresIn * 1000;
    while (Date.now() < deadline) {
      await sleep(interval * 1000);
      try {
        const response = await client.request('POST', tokenUrl, {
          body: {
            grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
            device_code: deviceCode,
            client_id: clientId,
          },
        });
        await storeTokens(response.data);
        return response.data;
      } catch (error) {
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
    }
    throw new AuthError('Device code expired');
  }
  async function refreshAccessToken(client, tokenUrl, clientId) {
    const credentials = await loadCredentials();
    if (!credentials.refreshToken) {
      return null;
    }
    try {
      const response = await client.request('POST', tokenUrl, {
        body: {
          grant_type: 'refresh_token',
          refresh_token: credentials.refreshToken,
          client_id: clientId,
        },
      });
      await storeTokens(response.data);
      return response.data;
    } catch {
      // Refresh token may be invalid/expired
      return null;
    }
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
  constructor(message) {
    super(message);
    this.name = 'AuthError';
  }
}
function isAuthPendingError(error) {
  if (typeof error === 'object' && error !== null && 'body' in error) {
    const body = error.body;
    if (typeof body === 'object' && body !== null && 'error' in body) {
      return body.error === 'authorization_pending';
    }
  }
  return false;
}
function isSlowDownError(error) {
  if (typeof error === 'object' && error !== null && 'body' in error) {
    const body = error.body;
    if (typeof body === 'object' && body !== null && 'error' in body) {
      return body.error === 'slow_down';
    }
  }
  return false;
}
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
//# sourceMappingURL=auth.js.map
