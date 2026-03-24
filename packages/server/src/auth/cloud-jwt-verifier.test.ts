import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import * as jose from 'jose';
import { createCloudJWTVerifier } from './cloud-jwt-verifier';
import { createJWKSClient } from './jwks-client';

let privateKey: CryptoKey;
let publicJwk: jose.JWK;
let kid: string;
let mockServer: ReturnType<typeof Bun.serve>;
let jwksUrl: string;
let differentPrivateKey: CryptoKey;

// ES256 key pair for algorithm tests
let ecPrivateKey: CryptoKey;
let ecPublicJwk: jose.JWK;
let ecKid: string;
let ecMockServer: ReturnType<typeof Bun.serve>;
let ecJwksUrl: string;

const ISSUER = 'https://cloud.vtz.app';
const AUDIENCE = 'proj_test123';

beforeAll(async () => {
  const kp = await jose.generateKeyPair('RS256');
  privateKey = kp.privateKey as CryptoKey;
  publicJwk = await jose.exportJWK(kp.publicKey);
  kid = 'test-key-1';
  publicJwk.kid = kid;
  publicJwk.use = 'sig';
  publicJwk.alg = 'RS256';

  const differentKp = await jose.generateKeyPair('RS256');
  differentPrivateKey = differentKp.privateKey as CryptoKey;

  mockServer = Bun.serve({
    port: 0,
    fetch() {
      return new Response(JSON.stringify({ keys: [publicJwk] }), {
        headers: { 'Content-Type': 'application/json' },
      });
    },
  });

  jwksUrl = `http://localhost:${mockServer.port}/.well-known/jwks.json`;

  // ES256 setup
  const ecKp = await jose.generateKeyPair('ES256');
  ecPrivateKey = ecKp.privateKey as CryptoKey;
  ecPublicJwk = await jose.exportJWK(ecKp.publicKey);
  ecKid = 'test-ec-key-1';
  ecPublicJwk.kid = ecKid;
  ecPublicJwk.use = 'sig';
  ecPublicJwk.alg = 'ES256';

  ecMockServer = Bun.serve({
    port: 0,
    fetch() {
      return new Response(JSON.stringify({ keys: [ecPublicJwk] }), {
        headers: { 'Content-Type': 'application/json' },
      });
    },
  });

  ecJwksUrl = `http://localhost:${ecMockServer.port}/.well-known/jwks.json`;
});

afterAll(() => {
  mockServer?.stop();
  ecMockServer?.stop();
});

function signJWT(
  claims: Record<string, unknown>,
  options?: { key?: CryptoKey; expiresIn?: string; audience?: string; issuer?: string },
) {
  const key = options?.key ?? privateKey;
  const builder = new jose.SignJWT(claims)
    .setProtectedHeader({ alg: 'RS256', kid })
    .setIssuedAt()
    .setExpirationTime(options?.expiresIn ?? '1h');

  if (options?.issuer !== null) {
    builder.setIssuer(options?.issuer ?? ISSUER);
  }
  if (options?.audience !== null) {
    builder.setAudience(options?.audience ?? AUDIENCE);
  }

  return builder.sign(key);
}

describe('createCloudJWTVerifier', () => {
  it('returns SessionPayload with sub, email, role, iat, exp for valid JWT', async () => {
    const client = createJWKSClient({ url: jwksUrl });
    const verifier = createCloudJWTVerifier({
      jwksClient: client,
      issuer: ISSUER,
      audience: AUDIENCE,
    });

    const jwt = await signJWT({
      sub: 'user_123',
      email: 'test@example.com',
      role: 'user',
      jti: 'jwt_abc',
      sid: 'sess_abc',
    });

    const payload = await verifier.verify(jwt);
    expect(payload).not.toBeNull();
    expect(payload!.sub).toBe('user_123');
    expect(payload!.email).toBe('test@example.com');
    expect(payload!.role).toBe('user');
    expect(payload!.jti).toBe('jwt_abc');
    expect(payload!.sid).toBe('sess_abc');
    expect(typeof payload!.iat).toBe('number');
    expect(typeof payload!.exp).toBe('number');
  });

  it('returns null for expired JWT', async () => {
    const client = createJWKSClient({ url: jwksUrl });
    const verifier = createCloudJWTVerifier({
      jwksClient: client,
      issuer: ISSUER,
      audience: AUDIENCE,
    });

    const jwt = await signJWT(
      { sub: 'user_123', email: 'test@example.com', role: 'user', jti: 'jwt_abc', sid: 'sess_abc' },
      { expiresIn: '0s' },
    );

    // Small delay to ensure expiration
    await new Promise((r) => setTimeout(r, 10));

    const payload = await verifier.verify(jwt);
    expect(payload).toBeNull();
  });

  it('returns null for JWT signed with different private key (signature mismatch)', async () => {
    const client = createJWKSClient({ url: jwksUrl });
    const verifier = createCloudJWTVerifier({
      jwksClient: client,
      issuer: ISSUER,
      audience: AUDIENCE,
    });

    const jwt = await signJWT(
      { sub: 'user_123', email: 'test@example.com', role: 'user', jti: 'jwt_abc', sid: 'sess_abc' },
      { key: differentPrivateKey },
    );

    const payload = await verifier.verify(jwt);
    expect(payload).toBeNull();
  });

  it('returns null for JWT with wrong audience (different projectId)', async () => {
    const client = createJWKSClient({ url: jwksUrl });
    const verifier = createCloudJWTVerifier({
      jwksClient: client,
      issuer: ISSUER,
      audience: AUDIENCE,
    });

    const jwt = await signJWT(
      { sub: 'user_123', email: 'test@example.com', role: 'user', jti: 'jwt_abc', sid: 'sess_abc' },
      { audience: 'proj_different' },
    );

    const payload = await verifier.verify(jwt);
    expect(payload).toBeNull();
  });

  it('returns null for JWT missing required claims (sub, email, role)', async () => {
    const client = createJWKSClient({ url: jwksUrl });
    const verifier = createCloudJWTVerifier({
      jwksClient: client,
      issuer: ISSUER,
      audience: AUDIENCE,
    });

    // Missing email and role
    const jwt = await signJWT({ sub: 'user_123', jti: 'jwt_abc', sid: 'sess_abc' });

    const payload = await verifier.verify(jwt);
    expect(payload).toBeNull();
  });
});

describe('createCloudJWTVerifier with ES256', () => {
  function signES256JWT(
    claims: Record<string, unknown>,
    options?: { expiresIn?: string; audience?: string; issuer?: string },
  ) {
    const builder = new jose.SignJWT(claims)
      .setProtectedHeader({ alg: 'ES256', kid: ecKid })
      .setIssuedAt()
      .setExpirationTime(options?.expiresIn ?? '1h');

    if (options?.issuer !== null) {
      builder.setIssuer(options?.issuer ?? ISSUER);
    }
    if (options?.audience !== null) {
      builder.setAudience(options?.audience ?? AUDIENCE);
    }

    return builder.sign(ecPrivateKey);
  }

  it('returns the payload for a valid ES256-signed JWT', async () => {
    const client = createJWKSClient({ url: ecJwksUrl });
    const verifier = createCloudJWTVerifier({
      jwksClient: client,
      issuer: ISSUER,
      audience: AUDIENCE,
      algorithms: ['ES256'],
    });

    const jwt = await signES256JWT({
      sub: 'user_456',
      email: 'ec@example.com',
      role: 'admin',
      jti: 'jwt_ec1',
      sid: 'sess_ec1',
    });

    const payload = await verifier.verify(jwt);
    expect(payload).not.toBeNull();
    expect(payload!.sub).toBe('user_456');
    expect(payload!.email).toBe('ec@example.com');
    expect(payload!.role).toBe('admin');
  });

  it('returns null when verifying an RS256 JWT with algorithms: ["ES256"]', async () => {
    const client = createJWKSClient({ url: jwksUrl });
    const verifier = createCloudJWTVerifier({
      jwksClient: client,
      issuer: ISSUER,
      audience: AUDIENCE,
      algorithms: ['ES256'],
    });

    // Sign with RS256 key
    const jwt = await signJWT({
      sub: 'user_123',
      email: 'test@example.com',
      role: 'user',
      jti: 'jwt_rs',
      sid: 'sess_rs',
    });

    const payload = await verifier.verify(jwt);
    expect(payload).toBeNull();
  });

  it('returns the payload with default algorithms (RS256 backward compat)', async () => {
    const client = createJWKSClient({ url: jwksUrl });
    const verifier = createCloudJWTVerifier({
      jwksClient: client,
      issuer: ISSUER,
      audience: AUDIENCE,
      // No algorithms specified — defaults to ['RS256']
    });

    const jwt = await signJWT({
      sub: 'user_789',
      email: 'default@example.com',
      role: 'user',
      jti: 'jwt_def',
      sid: 'sess_def',
    });

    const payload = await verifier.verify(jwt);
    expect(payload).not.toBeNull();
    expect(payload!.sub).toBe('user_789');
  });
});
