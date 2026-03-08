/**
 * TOTP (RFC 6238) — Time-based One-Time Password implementation
 * Uses Web Crypto API for HMAC-SHA1, no external dependencies.
 */

import { timingSafeEqual as cryptoTimingSafeEqual } from 'node:crypto';
import { hashPassword, verifyPassword } from './password';

// ============================================================================
// Base32 Encoding/Decoding (RFC 4648)
// ============================================================================

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function base32Encode(buffer: Uint8Array): string {
  let bits = 0;
  let value = 0;
  let result = '';

  for (let i = 0; i < buffer.length; i++) {
    value = (value << 8) | buffer[i];
    bits += 8;

    while (bits >= 5) {
      result += BASE32_ALPHABET[(value >>> (bits - 5)) & 0x1f];
      bits -= 5;
    }
  }

  if (bits > 0) {
    result += BASE32_ALPHABET[(value << (5 - bits)) & 0x1f];
  }

  return result;
}

export function base32Decode(encoded: string): Uint8Array {
  // Strip padding
  const str = encoded.replace(/=+$/, '').toUpperCase();
  const output: number[] = [];
  let bits = 0;
  let value = 0;

  for (let i = 0; i < str.length; i++) {
    const idx = BASE32_ALPHABET.indexOf(str[i]);
    if (idx === -1) continue;
    value = (value << 5) | idx;
    bits += 5;

    if (bits >= 8) {
      output.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }

  return new Uint8Array(output);
}

// ============================================================================
// TOTP Core
// ============================================================================

const TOTP_PERIOD = 30;
const TOTP_DIGITS = 6;

/**
 * Generate a 20-byte random TOTP secret, base32-encoded.
 */
export function generateTotpSecret(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(20));
  return base32Encode(bytes);
}

/**
 * Generate a TOTP code for a given secret and timestamp.
 * Uses HMAC-SHA1 per RFC 6238 with a 30-second period and 6 digits.
 */
export async function generateTotpCode(secret: string, timestamp?: number): Promise<string> {
  const time = timestamp ?? Date.now();
  const counter = Math.floor(time / 1000 / TOTP_PERIOD);
  return hmacOtp(secret, counter);
}

/**
 * Verify a TOTP code with optional drift tolerance.
 * drift=1 checks t-1, t, t+1 (3 windows).
 */
export async function verifyTotpCode(
  secret: string,
  code: string,
  timestamp?: number,
  drift = 1,
): Promise<boolean> {
  const time = timestamp ?? Date.now();
  const counter = Math.floor(time / 1000 / TOTP_PERIOD);

  for (let i = -drift; i <= drift; i++) {
    const expected = await hmacOtp(secret, counter + i);
    if (timingSafeEqual(code, expected)) {
      return true;
    }
  }

  return false;
}

/**
 * Generate an otpauth:// URI for QR code display.
 */
export function generateTotpUri(secret: string, email: string, issuer: string): string {
  const label = `${encodeURIComponent(issuer)}:${encodeURIComponent(email)}`;
  const params = new URLSearchParams({
    secret,
    issuer,
    algorithm: 'SHA1',
    digits: String(TOTP_DIGITS),
    period: String(TOTP_PERIOD),
  });
  return `otpauth://totp/${label}?${params.toString()}`;
}

// ============================================================================
// Backup Codes
// ============================================================================

const BACKUP_CODE_LENGTH = 8;
const BACKUP_CODE_CHARS = 'abcdefghijklmnopqrstuvwxyz0123456789';

/**
 * Generate a set of random backup codes.
 */
export function generateBackupCodes(count = 10): string[] {
  const codes: string[] = [];
  const seen = new Set<string>();

  while (codes.length < count) {
    const bytes = crypto.getRandomValues(new Uint8Array(BACKUP_CODE_LENGTH));
    let code = '';
    for (let i = 0; i < BACKUP_CODE_LENGTH; i++) {
      code += BACKUP_CODE_CHARS[bytes[i] % BACKUP_CODE_CHARS.length];
    }
    if (!seen.has(code)) {
      seen.add(code);
      codes.push(code);
    }
  }

  return codes;
}

/**
 * Hash a backup code using bcrypt (same as password hashing).
 */
export async function hashBackupCode(code: string): Promise<string> {
  return hashPassword(code);
}

/**
 * Verify a backup code against a bcrypt hash.
 */
export async function verifyBackupCode(code: string, hash: string): Promise<boolean> {
  return verifyPassword(code, hash);
}

// ============================================================================
// Internal Helpers
// ============================================================================

/**
 * HMAC-based OTP (HOTP) per RFC 4226.
 */
async function hmacOtp(secret: string, counter: number): Promise<string> {
  const keyBytes = base32Decode(secret);
  const key = await crypto.subtle.importKey(
    'raw',
    keyBytes.buffer as ArrayBuffer,
    { name: 'HMAC', hash: 'SHA-1' },
    false,
    ['sign'],
  );

  // Counter as 8-byte big-endian
  const counterBuffer = new ArrayBuffer(8);
  const view = new DataView(counterBuffer);
  view.setUint32(4, counter, false); // lower 32 bits

  const hmac = await crypto.subtle.sign('HMAC', key, counterBuffer);
  const hmacBytes = new Uint8Array(hmac);

  // Dynamic truncation
  const offset = hmacBytes[hmacBytes.length - 1] & 0x0f;
  const binary =
    ((hmacBytes[offset] & 0x7f) << 24) |
    ((hmacBytes[offset + 1] & 0xff) << 16) |
    ((hmacBytes[offset + 2] & 0xff) << 8) |
    (hmacBytes[offset + 3] & 0xff);

  const otp = binary % 10 ** TOTP_DIGITS;
  return otp.toString().padStart(TOTP_DIGITS, '0');
}

/**
 * Constant-time string comparison using Node.js crypto.
 * Pads to equal length to avoid timing leak on length mismatch.
 */
function timingSafeEqual(a: string, b: string): boolean {
  const maxLen = Math.max(a.length, b.length);
  const bufA = Buffer.alloc(maxLen);
  const bufB = Buffer.alloc(maxLen);
  bufA.write(a);
  bufB.write(b);
  const equal = cryptoTimingSafeEqual(bufA, bufB);
  return equal && a.length === b.length;
}
