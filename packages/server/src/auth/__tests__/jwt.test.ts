/**
 * JWT utility tests — parseDuration, createJWT, verifyJWT (RS256 + ES256)
 */

import { describe, expect, it } from 'bun:test';
import { createPrivateKey, createPublicKey, generateKeyPairSync } from 'node:crypto';
import * as jose from 'jose';
import { createJWT, parseDuration, verifyJWT } from '../jwt';
import type { AuthUser } from '../types';
import { TEST_PRIVATE_KEY, TEST_PUBLIC_KEY } from './test-keys';

// ES256 (EC P-256) key pair for algorithm tests
const ecKeyPair = generateKeyPairSync('ec', {
  namedCurve: 'P-256',
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
});
const ecPrivateKey = createPrivateKey(ecKeyPair.privateKey);
const ecPublicKey = createPublicKey(ecKeyPair.publicKey);

const privateKey = createPrivateKey(TEST_PRIVATE_KEY);
const publicKey = createPublicKey(TEST_PUBLIC_KEY);

const testUser: AuthUser = {
  id: 'user-123',
  email: 'test@example.com',
  role: 'user',
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe('parseDuration', () => {
  it('returns number input as-is', () => {
    expect(parseDuration(5000)).toBe(5000);
  });

  it('parses seconds', () => {
    expect(parseDuration('60s')).toBe(60_000);
  });

  it('parses minutes', () => {
    expect(parseDuration('15m')).toBe(900_000);
  });

  it('parses hours', () => {
    expect(parseDuration('1h')).toBe(3_600_000);
  });

  it('parses days', () => {
    expect(parseDuration('7d')).toBe(604_800_000);
  });

  it('throws on invalid format with helpful message', () => {
    expect(() => parseDuration('invalid')).toThrow(
      'Invalid duration: "invalid". Expected format: <number><unit>',
    );
  });

  it('throws on empty string', () => {
    expect(() => parseDuration('')).toThrow('Invalid duration');
  });
});

describe('createJWT', () => {
  it('creates a valid JWT string with RS256', async () => {
    const jwt = await createJWT(testUser, privateKey, 60_000);
    expect(jwt).toBeDefined();
    expect(jwt.split('.')).toHaveLength(3);
  });

  it('includes custom claims via options object', async () => {
    const jwt = await createJWT(testUser, privateKey, 60_000, {
      claims: () => ({
        jti: 'test-jti',
        sid: 'test-sid',
      }),
    });

    const payload = await verifyJWT(jwt, publicKey);
    expect(payload?.jti).toBe('test-jti');
    expect(payload?.sid).toBe('test-sid');
  });

  it('sets iss claim when issuer is provided', async () => {
    const token = await createJWT(testUser, privateKey, 60_000, {
      claims: () => ({ jti: 'jti-iss', sid: 'sid-iss' }),
      issuer: 'https://myapp.example.com',
    });

    const decoded = jose.decodeJwt(token);
    expect(decoded.iss).toBe('https://myapp.example.com');
  });

  it('sets aud claim when audience is provided', async () => {
    const token = await createJWT(testUser, privateKey, 60_000, {
      claims: () => ({ jti: 'jti-aud', sid: 'sid-aud' }),
      audience: 'myapp',
    });

    const decoded = jose.decodeJwt(token);
    expect(decoded.aud).toBe('myapp');
  });

  it('does not set iss or aud when no options provided', async () => {
    const token = await createJWT(testUser, privateKey, 60_000);

    const decoded = jose.decodeJwt(token);
    expect(decoded.iss).toBeUndefined();
    expect(decoded.aud).toBeUndefined();
  });

  it('does not set iss or aud when only claims callback provided', async () => {
    const token = await createJWT(testUser, privateKey, 60_000, {
      claims: () => ({ jti: 'jti-no-iss', sid: 'sid-no-iss' }),
    });

    const decoded = jose.decodeJwt(token);
    expect(decoded.iss).toBeUndefined();
    expect(decoded.aud).toBeUndefined();
  });
});

describe('verifyJWT', () => {
  it('returns payload for valid token', async () => {
    const jwt = await createJWT(testUser, privateKey, 60_000, {
      claims: () => ({ jti: 'jti-1', sid: 'sid-1' }),
    });

    const payload = await verifyJWT(jwt, publicKey);
    expect(payload).not.toBeNull();
    expect(payload?.sub).toBe('user-123');
    expect(payload?.email).toBe('test@example.com');
    expect(payload?.role).toBe('user');
    expect(payload?.jti).toBe('jti-1');
    expect(payload?.sid).toBe('sid-1');
  });

  it('returns null for expired token', async () => {
    const jwt = await createJWT(testUser, privateKey, 1, {
      claims: () => ({ jti: 'jti-exp', sid: 'sid-exp' }),
    });

    // Wait for expiration
    await new Promise((resolve) => setTimeout(resolve, 1100));

    const payload = await verifyJWT(jwt, publicKey);
    expect(payload).toBeNull();
  });

  it('returns null for wrong key', async () => {
    const jwt = await createJWT(testUser, privateKey, 60_000, {
      claims: () => ({ jti: 'jti-2', sid: 'sid-2' }),
    });

    // Generate a different key pair
    const { publicKey: otherPub } = generateKeyPairSync('rsa', {
      modulusLength: 2048,
      publicKeyEncoding: { type: 'spki', format: 'pem' },
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    });
    const otherPublicKey = createPublicKey(otherPub);

    const payload = await verifyJWT(jwt, otherPublicKey);
    expect(payload).toBeNull();
  });

  it('returns null for tampered token', async () => {
    const jwt = await createJWT(testUser, privateKey, 60_000, {
      claims: () => ({ jti: 'jti-3', sid: 'sid-3' }),
    });

    const tampered = `${jwt.slice(0, -5)}XXXXX`;
    const payload = await verifyJWT(tampered, publicKey);
    expect(payload).toBeNull();
  });

  it('returns null for garbage input', async () => {
    const payload = await verifyJWT('not-a-jwt', publicKey);
    expect(payload).toBeNull();
  });

  it('returns null when required claims are missing (no jti/sid)', async () => {
    // Create a JWT without jti and sid claims
    const jwt = await createJWT(testUser, privateKey, 60_000);

    const payload = await verifyJWT(jwt, publicKey);
    expect(payload).toBeNull();
  });

  it('returns payload when iss/aud match expected values', async () => {
    const token = await createJWT(testUser, privateKey, 60_000, {
      claims: () => ({ jti: 'jti-match', sid: 'sid-match' }),
      issuer: 'https://myapp.example.com',
      audience: 'myapp',
    });

    const payload = await verifyJWT(token, publicKey, {
      issuer: 'https://myapp.example.com',
      audience: 'myapp',
    });
    expect(payload).not.toBeNull();
    expect(payload?.sub).toBe('user-123');
  });

  it('returns null when issuer does not match', async () => {
    const token = await createJWT(testUser, privateKey, 60_000, {
      claims: () => ({ jti: 'jti-iss-bad', sid: 'sid-iss-bad' }),
      issuer: 'https://staging.example.com',
      audience: 'myapp',
    });

    const payload = await verifyJWT(token, publicKey, {
      issuer: 'https://production.example.com',
      audience: 'myapp',
    });
    expect(payload).toBeNull();
  });

  it('returns null when audience does not match', async () => {
    const token = await createJWT(testUser, privateKey, 60_000, {
      claims: () => ({ jti: 'jti-aud-bad', sid: 'sid-aud-bad' }),
      issuer: 'https://myapp.example.com',
      audience: 'wrong-audience',
    });

    const payload = await verifyJWT(token, publicKey, {
      issuer: 'https://myapp.example.com',
      audience: 'myapp',
    });
    expect(payload).toBeNull();
  });

  it('returns null when token lacks iss/aud but options require them', async () => {
    const token = await createJWT(testUser, privateKey, 60_000, {
      claims: () => ({ jti: 'jti-no-claims', sid: 'sid-no-claims' }),
    });

    const payload = await verifyJWT(token, publicKey, {
      issuer: 'https://myapp.example.com',
      audience: 'myapp',
    });
    expect(payload).toBeNull();
  });

  it('returns payload when token has iss/aud but no verify options', async () => {
    const token = await createJWT(testUser, privateKey, 60_000, {
      claims: () => ({ jti: 'jti-no-opts', sid: 'sid-no-opts' }),
      issuer: 'https://myapp.example.com',
      audience: 'myapp',
    });

    const payload = await verifyJWT(token, publicKey);
    expect(payload).not.toBeNull();
    expect(payload?.sub).toBe('user-123');
  });

  it('returns null when iss/aud are correct but jti/sid are missing', async () => {
    const token = await createJWT(testUser, privateKey, 60_000, {
      issuer: 'https://myapp.example.com',
      audience: 'myapp',
    });

    const payload = await verifyJWT(token, publicKey, {
      issuer: 'https://myapp.example.com',
      audience: 'myapp',
    });
    expect(payload).toBeNull();
  });
});

describe('createJWT with ES256', () => {
  it('creates a JWT with alg: "ES256" in the header', async () => {
    const jwt = await createJWT(testUser, ecPrivateKey, 60_000, {
      algorithm: 'ES256',
      claims: () => ({ jti: 'jti-es', sid: 'sid-es' }),
    });

    const header = jose.decodeProtectedHeader(jwt);
    expect(header.alg).toBe('ES256');
  });

  it('verifyJWT with algorithm: "ES256" returns the payload', async () => {
    const jwt = await createJWT(testUser, ecPrivateKey, 60_000, {
      algorithm: 'ES256',
      claims: () => ({ jti: 'jti-es-v', sid: 'sid-es-v' }),
    });

    const payload = await verifyJWT(jwt, ecPublicKey, { algorithm: 'ES256' });
    expect(payload).not.toBeNull();
    expect(payload?.sub).toBe('user-123');
    expect(payload?.email).toBe('test@example.com');
    expect(payload?.jti).toBe('jti-es-v');
    expect(payload?.sid).toBe('sid-es-v');
  });

  it('returns null when verifying ES256 JWT with algorithm: "RS256"', async () => {
    const jwt = await createJWT(testUser, ecPrivateKey, 60_000, {
      algorithm: 'ES256',
      claims: () => ({ jti: 'jti-mismatch', sid: 'sid-mismatch' }),
    });

    // Verify with RS256 algorithm — should reject
    const payload = await verifyJWT(jwt, ecPublicKey, { algorithm: 'RS256' });
    expect(payload).toBeNull();
  });
});

describe('createJWT defaults to RS256 (backward compat)', () => {
  it('uses RS256 when no algorithm specified', async () => {
    const jwt = await createJWT(testUser, privateKey, 60_000, {
      claims: () => ({ jti: 'jti-default', sid: 'sid-default' }),
    });

    const header = jose.decodeProtectedHeader(jwt);
    expect(header.alg).toBe('RS256');
  });

  it('verifyJWT defaults to RS256 when no algorithm specified', async () => {
    const jwt = await createJWT(testUser, privateKey, 60_000, {
      claims: () => ({ jti: 'jti-def-v', sid: 'sid-def-v' }),
    });

    const payload = await verifyJWT(jwt, publicKey);
    expect(payload).not.toBeNull();
    expect(payload?.sub).toBe('user-123');
  });
});
