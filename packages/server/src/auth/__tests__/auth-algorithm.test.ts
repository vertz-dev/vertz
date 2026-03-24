/**
 * Tests for JWT algorithm configuration in createAuth().
 * Phase 2: createAuth plumbing, key generation, key-algorithm validation.
 */

import { afterEach, describe, expect, it } from 'bun:test';
import { createPrivateKey, createPublicKey, generateKeyPairSync } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as jose from 'jose';
import { createAuth } from '../index';

const rsaKeyPair = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
});

const ecKeyPair = generateKeyPairSync('ec', {
  namedCurve: 'P-256',
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
});

const ecP384KeyPair = generateKeyPairSync('ec', {
  namedCurve: 'P-384',
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
});

const baseConfig = {
  session: { strategy: 'jwt' as const, ttl: '60s' },
  isProduction: false,
};

let tmpDirs: string[] = [];

function createTmpDir(): string {
  const dir = join(tmpdir(), `vertz-auth-test-${crypto.randomUUID()}`);
  mkdirSync(dir, { recursive: true });
  tmpDirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of tmpDirs) {
    rmSync(dir, { recursive: true, force: true });
  }
  tmpDirs = [];
});

describe('createAuth algorithm plumbing', () => {
  describe('Given session.algorithm: "ES256" with EC key pair', () => {
    it('Then the returned JWT has alg: "ES256"', async () => {
      const auth = createAuth({
        ...baseConfig,
        session: { strategy: 'jwt', ttl: '60s', algorithm: 'ES256' },
        privateKey: ecKeyPair.privateKey as string,
        publicKey: ecKeyPair.publicKey as string,
      });

      const result = await auth.api.signUp(
        { email: 'test@example.com', password: 'SecurePass123!' },
        { headers: new Headers() },
      );

      expect(result.ok).toBe(true);
      if (!result.ok) return;

      const header = jose.decodeProtectedHeader(result.data.tokens!.jwt);
      expect(header.alg).toBe('ES256');

      auth.dispose();
    });

    it('Then GET /.well-known/jwks.json returns JWK with kty: "EC", crv: "P-256", alg: "ES256"', async () => {
      const auth = createAuth({
        ...baseConfig,
        session: { strategy: 'jwt', ttl: '60s', algorithm: 'ES256' },
        privateKey: ecKeyPair.privateKey as string,
        publicKey: ecKeyPair.publicKey as string,
      });

      const response = await auth.handler(
        new Request('http://localhost/api/auth/.well-known/jwks.json'),
      );

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.keys).toHaveLength(1);
      expect(body.keys[0].kty).toBe('EC');
      expect(body.keys[0].crv).toBe('P-256');
      expect(body.keys[0].alg).toBe('ES256');

      auth.dispose();
    });
  });

  describe('Given session.algorithm: "ES256" with RSA key pair', () => {
    it('Then createAuth() throws key type mismatch error', () => {
      expect(() =>
        createAuth({
          ...baseConfig,
          session: { strategy: 'jwt', ttl: '60s', algorithm: 'ES256' },
          privateKey: rsaKeyPair.privateKey as string,
          publicKey: rsaKeyPair.publicKey as string,
        }),
      ).toThrow(/algorithm 'ES256' requires an EC \(P-256\) key pair, but an RSA key was provided/);
    });
  });

  describe('Given session.algorithm: "RS256" with EC key pair', () => {
    it('Then createAuth() throws key type mismatch error', () => {
      expect(() =>
        createAuth({
          ...baseConfig,
          session: { strategy: 'jwt', ttl: '60s', algorithm: 'RS256' },
          privateKey: ecKeyPair.privateKey as string,
          publicKey: ecKeyPair.publicKey as string,
        }),
      ).toThrow(/algorithm 'RS256' requires an RSA key pair, but an EC key was provided/);
    });
  });

  describe('Given session.algorithm: "ES256" with EC P-384 key pair', () => {
    it('Then createAuth() throws curve mismatch error', () => {
      expect(() =>
        createAuth({
          ...baseConfig,
          session: { strategy: 'jwt', ttl: '60s', algorithm: 'ES256' },
          privateKey: ecP384KeyPair.privateKey as string,
          publicKey: ecP384KeyPair.publicKey as string,
        }),
      ).toThrow(
        /algorithm 'ES256' requires an EC P-256 key pair, but an EC P-384 key was provided/,
      );
    });
  });

  describe('Given ES256 algorithm with no keys in dev mode', () => {
    it('Then auto-generates EC P-256 key pair', () => {
      const keyDir = createTmpDir();
      const auth = createAuth({
        ...baseConfig,
        session: { strategy: 'jwt', ttl: '60s', algorithm: 'ES256' },
        devKeyPath: keyDir,
      });

      const privPem = readFileSync(join(keyDir, 'jwt-private.pem'), 'utf-8');
      const pubPem = readFileSync(join(keyDir, 'jwt-public.pem'), 'utf-8');

      // Verify it's an EC key
      const privKey = createPrivateKey(privPem);
      expect(privKey.asymmetricKeyType).toBe('ec');

      const pubKey = createPublicKey(pubPem);
      expect(pubKey.asymmetricKeyType).toBe('ec');

      auth.dispose();
    });
  });

  describe('Given no algorithm (default) with no keys in dev mode', () => {
    it('Then auto-generates RSA key pair (backward compat)', () => {
      const keyDir = createTmpDir();
      const auth = createAuth({
        ...baseConfig,
        devKeyPath: keyDir,
      });

      const privPem = readFileSync(join(keyDir, 'jwt-private.pem'), 'utf-8');
      const privKey = createPrivateKey(privPem);
      expect(privKey.asymmetricKeyType).toBe('rsa');

      auth.dispose();
    });
  });

  describe('Given ES256 algorithm with stale RSA dev keys on disk', () => {
    it('Then auto-regenerates EC P-256 key pair', () => {
      const keyDir = createTmpDir();

      // First: generate RSA keys (default algorithm)
      const auth1 = createAuth({
        ...baseConfig,
        devKeyPath: keyDir,
      });
      auth1.dispose();

      // Verify RSA keys exist
      const privKeyBefore = createPrivateKey(
        readFileSync(join(keyDir, 'jwt-private.pem'), 'utf-8'),
      );
      expect(privKeyBefore.asymmetricKeyType).toBe('rsa');

      // Second: switch to ES256 — should regenerate
      const auth2 = createAuth({
        ...baseConfig,
        session: { strategy: 'jwt', ttl: '60s', algorithm: 'ES256' },
        devKeyPath: keyDir,
      });
      auth2.dispose();

      // Verify EC keys now
      const privKeyAfter = createPrivateKey(readFileSync(join(keyDir, 'jwt-private.pem'), 'utf-8'));
      expect(privKeyAfter.asymmetricKeyType).toBe('ec');
    });
  });

  describe('Given default algorithm (RS256) with explicit RS256 keys', () => {
    it('Then GET /.well-known/jwks.json returns JWK with kty: "RSA", alg: "RS256"', async () => {
      const auth = createAuth({
        ...baseConfig,
        privateKey: rsaKeyPair.privateKey as string,
        publicKey: rsaKeyPair.publicKey as string,
      });

      const response = await auth.handler(
        new Request('http://localhost/api/auth/.well-known/jwks.json'),
      );

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.keys[0].kty).toBe('RSA');
      expect(body.keys[0].alg).toBe('RS256');

      auth.dispose();
    });
  });
});
