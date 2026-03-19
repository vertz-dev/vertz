import { createRemoteJWKSet, type JWTVerifyGetKey } from 'jose';

export interface JWKSClient {
  getKey: JWTVerifyGetKey;
  refresh(): Promise<void>;
}

export function createJWKSClient(options: {
  url: string;
  cacheTtl?: number;
  cooldown?: number;
}): JWKSClient {
  const { url, cacheTtl = 600_000, cooldown = 30_000 } = options;

  const jwks = createRemoteJWKSet(new URL(url), {
    cacheMaxAge: cacheTtl,
    cooldownDuration: cooldown,
  });

  return {
    getKey: jwks,
    async refresh() {
      // jose's reload() is marked @ignore in types but exists at runtime.
      // It invalidates the cache so the next getKey call re-fetches.
      if ('reload' in jwks && typeof (jwks as { reload: unknown }).reload === 'function') {
        await (jwks as { reload: () => Promise<void> }).reload();
      }
    },
  };
}
