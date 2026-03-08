/**
 * Crypto utilities for auth module
 * SHA-256 hashing, timing-safe comparison, AES-256-GCM encryption, PKCE
 */

/**
 * Constant-time comparison for hex-encoded hash strings.
 * Prevents timing side-channel attacks on token hash comparison.
 */
export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  const encoder = new TextEncoder();
  const bufA = encoder.encode(a);
  const bufB = encoder.encode(b);
  let result = 0;
  for (let i = 0; i < bufA.length; i++) {
    result |= bufA[i] ^ bufB[i];
  }
  return result === 0;
}

export async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = new Uint8Array(hashBuffer);
  return Array.from(hashArray)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

// ============================================================================
// Base64url helpers
// ============================================================================

function toBase64Url(buffer: Uint8Array): string {
  return btoa(String.fromCharCode(...buffer))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

function fromBase64Url(str: string): Uint8Array {
  const padded = str.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

// ============================================================================
// AES-256-GCM Encryption / Decryption
// ============================================================================

async function deriveKey(passphrase: string): Promise<CryptoKey> {
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(passphrase),
    'HKDF',
    false,
    ['deriveKey'],
  );
  return crypto.subtle.deriveKey(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: new TextEncoder().encode('vertz-oauth-state'),
      info: new TextEncoder().encode('aes-256-gcm'),
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

/**
 * Encrypt plaintext with AES-256-GCM.
 * Returns base64url(iv + ciphertext).
 */
export async function encrypt(plaintext: string, key: string): Promise<string> {
  const aesKey = await deriveKey(key);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(plaintext);
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, aesKey, encoded);
  const combined = new Uint8Array(iv.length + ciphertext.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(ciphertext), iv.length);
  return toBase64Url(combined);
}

/**
 * Decrypt ciphertext encrypted with AES-256-GCM.
 * Returns null on failure (wrong key, tampered data).
 */
export async function decrypt(ciphertext: string, key: string): Promise<string | null> {
  try {
    const aesKey = await deriveKey(key);
    const combined = fromBase64Url(ciphertext);
    const iv = combined.slice(0, 12);
    const data = combined.slice(12);
    const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, aesKey, data);
    return new TextDecoder().decode(decrypted);
  } catch {
    return null;
  }
}

// ============================================================================
// PKCE (Proof Key for Code Exchange)
// ============================================================================

/**
 * Generate a PKCE code_verifier (32 random bytes, base64url-encoded).
 */
export function generateCodeVerifier(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return toBase64Url(bytes);
}

/**
 * Generate a PKCE code_challenge from a code_verifier (SHA-256, base64url-encoded).
 */
export async function generateCodeChallenge(verifier: string): Promise<string> {
  const data = new TextEncoder().encode(verifier);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return toBase64Url(new Uint8Array(hash));
}

/**
 * Generate a random nonce (16 random bytes, hex-encoded).
 */
export function generateNonce(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}
