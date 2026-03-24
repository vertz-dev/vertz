/**
 * Shared key pairs for auth tests.
 * Generated once at module load, reused across all test files.
 */

import { generateKeyPairSync } from 'node:crypto';
import type { JWTAlgorithm } from '../types';

// RSA (RS256) — default
const rsaKeys = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
});

export const TEST_PRIVATE_KEY = rsaKeys.privateKey as string;
export const TEST_PUBLIC_KEY = rsaKeys.publicKey as string;

// EC P-256 (ES256)
const ecKeys = generateKeyPairSync('ec', {
  namedCurve: 'P-256',
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
});

export const TEST_EC_PRIVATE_KEY = ecKeys.privateKey as string;
export const TEST_EC_PUBLIC_KEY = ecKeys.publicKey as string;

/** Generate a test key pair for the given algorithm. */
export function generateTestKeyPair(algorithm: JWTAlgorithm): {
  privateKey: string;
  publicKey: string;
} {
  if (algorithm === 'ES256') {
    return { privateKey: TEST_EC_PRIVATE_KEY, publicKey: TEST_EC_PUBLIC_KEY };
  }
  return { privateKey: TEST_PRIVATE_KEY, publicKey: TEST_PUBLIC_KEY };
}
