import { describe, expect, it } from 'bun:test';
import {
  decrypt,
  encrypt,
  generateCodeChallenge,
  generateCodeVerifier,
  generateNonce,
  sha256Hex,
  timingSafeEqual,
} from '../crypto';

describe('crypto', () => {
  describe('sha256Hex', () => {
    it('produces consistent SHA-256 hex output for same input', async () => {
      const hash1 = await sha256Hex('hello');
      const hash2 = await sha256Hex('hello');
      expect(hash1).toBe(hash2);
    });

    it('produces 64-char hex string', async () => {
      const hash = await sha256Hex('test-input');
      expect(hash).toHaveLength(64);
      expect(hash).toMatch(/^[0-9a-f]{64}$/);
    });

    it('produces different hashes for different inputs', async () => {
      const hash1 = await sha256Hex('input-a');
      const hash2 = await sha256Hex('input-b');
      expect(hash1).not.toBe(hash2);
    });
  });

  describe('timingSafeEqual', () => {
    it('returns true for matching hex strings', () => {
      const a = 'abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789';
      expect(timingSafeEqual(a, a)).toBe(true);
    });

    it('returns false for non-matching hex strings', () => {
      const a = 'abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789';
      const b = 'abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456780';
      expect(timingSafeEqual(a, b)).toBe(false);
    });
  });

  describe('encrypt/decrypt', () => {
    const TEST_KEY = 'test-encryption-key-at-least-32-chars!!';

    it('encrypt produces different output for same input (random IV)', async () => {
      const a = await encrypt('hello world', TEST_KEY);
      const b = await encrypt('hello world', TEST_KEY);
      expect(a).not.toBe(b);
    });

    it('decrypt recovers original plaintext', async () => {
      const ciphertext = await encrypt('secret data', TEST_KEY);
      const plaintext = await decrypt(ciphertext, TEST_KEY);
      expect(plaintext).toBe('secret data');
    });

    it('decrypt returns null for tampered ciphertext', async () => {
      const ciphertext = await encrypt('secret data', TEST_KEY);
      const tampered = `X${ciphertext.slice(1)}`;
      const result = await decrypt(tampered, TEST_KEY);
      expect(result).toBeNull();
    });

    it('decrypt returns null for wrong key', async () => {
      const ciphertext = await encrypt('secret data', TEST_KEY);
      const result = await decrypt(ciphertext, 'wrong-key-at-least-32-characters!!!');
      expect(result).toBeNull();
    });
  });

  describe('PKCE', () => {
    it('generateCodeVerifier produces URL-safe base64 string', () => {
      const verifier = generateCodeVerifier();
      expect(verifier).toMatch(/^[A-Za-z0-9_-]+$/);
    });

    it('generateCodeVerifier produces 43-char string (32 bytes base64url)', () => {
      const verifier = generateCodeVerifier();
      expect(verifier).toHaveLength(43);
    });

    it('generateCodeChallenge produces SHA-256 of verifier', async () => {
      const verifier = generateCodeVerifier();
      const challenge = await generateCodeChallenge(verifier);
      expect(challenge).toBeDefined();
      expect(challenge).toMatch(/^[A-Za-z0-9_-]+$/);
    });

    it('generateCodeChallenge is consistent for same verifier', async () => {
      const verifier = generateCodeVerifier();
      const a = await generateCodeChallenge(verifier);
      const b = await generateCodeChallenge(verifier);
      expect(a).toBe(b);
    });
  });

  describe('generateNonce', () => {
    it('produces 32-char hex string', () => {
      const nonce = generateNonce();
      expect(nonce).toHaveLength(32);
      expect(nonce).toMatch(/^[0-9a-f]{32}$/);
    });

    it('produces unique values', () => {
      const a = generateNonce();
      const b = generateNonce();
      expect(a).not.toBe(b);
    });
  });
});
