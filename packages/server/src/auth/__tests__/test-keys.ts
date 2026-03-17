/**
 * Shared RSA key pair for auth tests.
 * Generated once at module load, reused across all test files.
 */

import { generateKeyPairSync } from 'node:crypto';

const { publicKey, privateKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
});

export const TEST_PRIVATE_KEY = privateKey as string;
export const TEST_PUBLIC_KEY = publicKey as string;
