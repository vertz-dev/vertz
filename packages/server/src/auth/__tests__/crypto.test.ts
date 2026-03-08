import { describe, expect, it } from 'bun:test';
import { sha256Hex, timingSafeEqual } from '../crypto';

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
});
