import { afterEach, beforeAll, describe, expect, it } from '@vertz/test';
import * as jose from 'jose';
import { createJWKSClient } from './jwks-client';

// Generate a fresh RS256 key pair for testing
let privateKey: CryptoKey;
let publicJwk: jose.JWK;
let kid: string;

// Track servers for cleanup
const openServers: ReturnType<typeof Bun.serve>[] = [];

beforeAll(async () => {
  const { publicKey, privateKey: privKey } = await jose.generateKeyPair('RS256');
  privateKey = privKey as CryptoKey;
  publicJwk = await jose.exportJWK(publicKey);
  kid = 'test-key-1';
  publicJwk.kid = kid;
  publicJwk.use = 'sig';
  publicJwk.alg = 'RS256';
});

afterEach(() => {
  for (const server of openServers) server.stop();
  openServers.length = 0;
});

/** Create a per-test mock JWKS server with its own request counter. */
function createMockServer() {
  let requestCount = 0;
  const server = Bun.serve({
    port: 0,
    fetch() {
      requestCount++;
      return new Response(JSON.stringify({ keys: [publicJwk] }), {
        headers: { 'Content-Type': 'application/json' },
      });
    },
  });
  openServers.push(server);
  const url = `http://localhost:${server.port}/.well-known/jwks.json`;
  return {
    server,
    url,
    getRequestCount: () => requestCount,
    resetRequestCount: () => {
      requestCount = 0;
    },
  };
}

describe('createJWKSClient', () => {
  it('resolves the CryptoKey for verification when kid matches', async () => {
    const { url } = createMockServer();
    const client = createJWKSClient({ url });

    const jwt = await new jose.SignJWT({ sub: 'user_1' })
      .setProtectedHeader({ alg: 'RS256', kid })
      .setIssuedAt()
      .setExpirationTime('1h')
      .sign(privateKey);

    const { payload } = await jose.jwtVerify(jwt, client.getKey);
    expect(payload.sub).toBe('user_1');
  });

  it('returns cached key without additional HTTP request within cache TTL', async () => {
    const { url, getRequestCount } = createMockServer();
    const client = createJWKSClient({ url, cacheTtl: 60_000 });

    // First verification — fetches JWKS
    const jwt1 = await new jose.SignJWT({ sub: 'user_1' })
      .setProtectedHeader({ alg: 'RS256', kid })
      .setIssuedAt()
      .setExpirationTime('1h')
      .sign(privateKey);

    await jose.jwtVerify(jwt1, client.getKey);
    const firstCount = getRequestCount();
    expect(firstCount).toBeGreaterThanOrEqual(1);

    // Second verification — should use cache
    const jwt2 = await new jose.SignJWT({ sub: 'user_2' })
      .setProtectedHeader({ alg: 'RS256', kid })
      .setIssuedAt()
      .setExpirationTime('1h')
      .sign(privateKey);

    await jose.jwtVerify(jwt2, client.getKey);
    expect(getRequestCount()).toBe(firstCount); // No additional request
  });

  it('rejects when kid is not found after refresh', async () => {
    const { url } = createMockServer();
    const client = createJWKSClient({ url });

    const unknownKey = await jose.generateKeyPair('RS256');
    const jwt = await new jose.SignJWT({ sub: 'user_1' })
      .setProtectedHeader({ alg: 'RS256', kid: 'unknown-kid' })
      .setIssuedAt()
      .setExpirationTime('1h')
      .sign(unknownKey.privateKey);

    await expect(jose.jwtVerify(jwt, client.getKey)).rejects.toThrow();
  });

  it('throws when JWKS endpoint is unreachable and no cached keys exist', async () => {
    const client = createJWKSClient({ url: 'http://127.0.0.1:1/.well-known/jwks.json' });

    const jwt = await new jose.SignJWT({ sub: 'user_1' })
      .setProtectedHeader({ alg: 'RS256', kid })
      .setIssuedAt()
      .setExpirationTime('1h')
      .sign(privateKey);

    await expect(jose.jwtVerify(jwt, client.getKey)).rejects.toThrow();
  });

  it('resolves key after refresh when a new kid appears on the JWKS endpoint', async () => {
    // Generate a second key pair
    const kp2 = await jose.generateKeyPair('RS256');
    const pubJwk2 = await jose.exportJWK(kp2.publicKey);
    const kid2 = 'test-key-2';
    pubJwk2.kid = kid2;
    pubJwk2.use = 'sig';
    pubJwk2.alg = 'RS256';

    // Server that initially only has key 1, then adds key 2 after rotation
    let serveRotated = false;
    const rotatingServer = Bun.serve({
      port: 0,
      fetch() {
        const keys = serveRotated ? [publicJwk, pubJwk2] : [publicJwk];
        return new Response(JSON.stringify({ keys }), {
          headers: { 'Content-Type': 'application/json' },
        });
      },
    });
    openServers.push(rotatingServer);

    const client = createJWKSClient({
      url: `http://localhost:${rotatingServer.port}/.well-known/jwks.json`,
    });

    // JWT signed with key 2 — should fail initially (kid2 not in JWKS)
    const jwt = await new jose.SignJWT({ sub: 'user_rotated' })
      .setProtectedHeader({ alg: 'RS256', kid: kid2 })
      .setIssuedAt()
      .setExpirationTime('1h')
      .sign(kp2.privateKey);

    // Add key 2 to the JWKS endpoint
    serveRotated = true;
    await client.refresh();

    // Now verification should succeed
    const { payload } = await jose.jwtVerify(jwt, client.getKey);
    expect(payload.sub).toBe('user_rotated');
  });

  it('forces a re-fetch on next verification after refresh() is called', async () => {
    const { url, getRequestCount, resetRequestCount } = createMockServer();
    const client = createJWKSClient({ url, cacheTtl: 600_000 });
    resetRequestCount();

    // Initial fetch + verify
    const jwt1 = await new jose.SignJWT({ sub: 'user_1' })
      .setProtectedHeader({ alg: 'RS256', kid })
      .setIssuedAt()
      .setExpirationTime('1h')
      .sign(privateKey);
    await jose.jwtVerify(jwt1, client.getKey);
    const countAfterFirst = getRequestCount();

    // Verify again — should use cache (no additional request)
    const jwt2 = await new jose.SignJWT({ sub: 'user_2' })
      .setProtectedHeader({ alg: 'RS256', kid })
      .setIssuedAt()
      .setExpirationTime('1h')
      .sign(privateKey);
    await jose.jwtVerify(jwt2, client.getKey);
    expect(getRequestCount()).toBe(countAfterFirst); // Cache hit

    // Mark cache as stale
    await client.refresh();

    // Next verification should trigger a new JWKS fetch
    const jwt3 = await new jose.SignJWT({ sub: 'user_3' })
      .setProtectedHeader({ alg: 'RS256', kid })
      .setIssuedAt()
      .setExpirationTime('1h')
      .sign(privateKey);
    await jose.jwtVerify(jwt3, client.getKey);
    expect(getRequestCount()).toBeGreaterThan(countAfterFirst);
  });
});
