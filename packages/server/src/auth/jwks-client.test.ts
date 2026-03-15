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

    rotatingServer.stop();
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
