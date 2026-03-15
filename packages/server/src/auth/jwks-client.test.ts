import { afterAll, afterEach, beforeAll, describe, expect, it } from 'bun:test';
import * as jose from 'jose';
import { createJWKSClient } from './jwks-client';

// Generate a fresh RS256 key pair for testing
let privateKey: CryptoKey;
let publicJwk: jose.JWK;
let kid: string;
let mockServer: ReturnType<typeof Bun.serve>;
let jwksUrl: string;
let requestCount: number;

beforeAll(async () => {
  const { publicKey, privateKey: privKey } = await jose.generateKeyPair('RS256');
  privateKey = privKey as CryptoKey;
  publicJwk = await jose.exportJWK(publicKey);
  kid = 'test-key-1';
  publicJwk.kid = kid;
  publicJwk.use = 'sig';
  publicJwk.alg = 'RS256';
  requestCount = 0;

  mockServer = Bun.serve({
    port: 0,
    fetch() {
      requestCount++;
      return new Response(JSON.stringify({ keys: [publicJwk] }), {
        headers: { 'Content-Type': 'application/json' },
      });
    },
  });

  jwksUrl = `http://localhost:${mockServer.port}/.well-known/jwks.json`;
});

afterAll(() => {
  mockServer?.stop();
});

afterEach(() => {
  requestCount = 0;
});

describe('createJWKSClient', () => {
  it('resolves the CryptoKey for verification when kid matches', async () => {
    const client = createJWKSClient({ url: jwksUrl });

    // Sign a JWT with the private key
    const jwt = await new jose.SignJWT({ sub: 'user_1' })
      .setProtectedHeader({ alg: 'RS256', kid })
      .setIssuedAt()
      .setExpirationTime('1h')
      .sign(privateKey);

    // Verify using the JWKS client's getKey
    const { payload } = await jose.jwtVerify(jwt, client.getKey);
    expect(payload.sub).toBe('user_1');
  });

  it('returns cached key without additional HTTP request within cache TTL', async () => {
    const client = createJWKSClient({ url: jwksUrl, cacheTtl: 60_000 });
    requestCount = 0;

    // First verification — fetches JWKS
    const jwt1 = await new jose.SignJWT({ sub: 'user_1' })
      .setProtectedHeader({ alg: 'RS256', kid })
      .setIssuedAt()
      .setExpirationTime('1h')
      .sign(privateKey);

    await jose.jwtVerify(jwt1, client.getKey);
    const firstCount = requestCount;
    expect(firstCount).toBeGreaterThanOrEqual(1);

    // Second verification — should use cache
    const jwt2 = await new jose.SignJWT({ sub: 'user_2' })
      .setProtectedHeader({ alg: 'RS256', kid })
      .setIssuedAt()
      .setExpirationTime('1h')
      .sign(privateKey);

    await jose.jwtVerify(jwt2, client.getKey);
    expect(requestCount).toBe(firstCount); // No additional request
  });

  it('rejects when kid is not found after refresh', async () => {
    const client = createJWKSClient({ url: jwksUrl });

    const unknownKey = await jose.generateKeyPair('RS256');
    const jwt = await new jose.SignJWT({ sub: 'user_1' })
      .setProtectedHeader({ alg: 'RS256', kid: 'unknown-kid' })
      .setIssuedAt()
      .setExpirationTime('1h')
      .sign(unknownKey.privateKey);

    await expect(jose.jwtVerify(jwt, client.getKey)).rejects.toThrow();
  });

  it('forces a re-fetch on next verification after refresh() is called', async () => {
    const client = createJWKSClient({ url: jwksUrl, cacheTtl: 600_000 });
    requestCount = 0;

    // Initial fetch + verify
    const jwt1 = await new jose.SignJWT({ sub: 'user_1' })
      .setProtectedHeader({ alg: 'RS256', kid })
      .setIssuedAt()
      .setExpirationTime('1h')
      .sign(privateKey);
    await jose.jwtVerify(jwt1, client.getKey);
    const countAfterFirst = requestCount;

    // Verify again — should use cache (no additional request)
    const jwt2 = await new jose.SignJWT({ sub: 'user_2' })
      .setProtectedHeader({ alg: 'RS256', kid })
      .setIssuedAt()
      .setExpirationTime('1h')
      .sign(privateKey);
    await jose.jwtVerify(jwt2, client.getKey);
    expect(requestCount).toBe(countAfterFirst); // Cache hit

    // Mark cache as stale
    await client.refresh();

    // Next verification should trigger a new JWKS fetch
    const jwt3 = await new jose.SignJWT({ sub: 'user_3' })
      .setProtectedHeader({ alg: 'RS256', kid })
      .setIssuedAt()
      .setExpirationTime('1h')
      .sign(privateKey);
    await jose.jwtVerify(jwt3, client.getKey);
    expect(requestCount).toBeGreaterThan(countAfterFirst);
  });
});
