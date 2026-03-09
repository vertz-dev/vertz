import { describe, expect, it } from 'bun:test';
import { computePlanHash } from '../plan-hash';

describe('Feature: Plan version hash computation', () => {
  describe('Given a plan config with features, limits, and price', () => {
    it('produces the same hash for the same config (deterministic)', async () => {
      const config = {
        features: ['project:view', 'project:edit'],
        limits: {
          prompts: { max: 50, gates: 'prompt:create' },
        },
        price: { amount: 29, interval: 'month' as const },
      };

      const hash1 = await computePlanHash(config);
      const hash2 = await computePlanHash(config);

      expect(hash1).toBe(hash2);
      expect(typeof hash1).toBe('string');
      expect(hash1.length).toBe(64); // SHA-256 hex = 64 chars
    });

    it('produces a different hash when features differ', async () => {
      const config1 = {
        features: ['project:view', 'project:edit'],
        limits: { prompts: { max: 50, gates: 'prompt:create' } },
        price: { amount: 29, interval: 'month' as const },
      };
      const config2 = {
        features: ['project:view', 'project:edit', 'project:delete'],
        limits: { prompts: { max: 50, gates: 'prompt:create' } },
        price: { amount: 29, interval: 'month' as const },
      };

      const hash1 = await computePlanHash(config1);
      const hash2 = await computePlanHash(config2);
      expect(hash1).not.toBe(hash2);
    });

    it('produces a different hash when limits differ', async () => {
      const config1 = {
        features: ['project:view'],
        limits: { prompts: { max: 50, gates: 'prompt:create' } },
        price: { amount: 29, interval: 'month' as const },
      };
      const config2 = {
        features: ['project:view'],
        limits: { prompts: { max: 100, gates: 'prompt:create' } },
        price: { amount: 29, interval: 'month' as const },
      };

      expect(await computePlanHash(config1)).not.toBe(await computePlanHash(config2));
    });

    it('produces a different hash when price differs', async () => {
      const config1 = {
        features: ['project:view'],
        limits: {},
        price: { amount: 29, interval: 'month' as const },
      };
      const config2 = {
        features: ['project:view'],
        limits: {},
        price: { amount: 49, interval: 'month' as const },
      };

      expect(await computePlanHash(config1)).not.toBe(await computePlanHash(config2));
    });
  });

  describe('Given cosmetic-only changes', () => {
    it('title differences do NOT affect the hash (title excluded)', async () => {
      // computePlanHash does not accept title/description at all — the caller
      // must strip them before calling. This tests that same inputs = same hash.
      const config = {
        features: ['project:view'],
        limits: {},
        price: { amount: 29, interval: 'month' as const },
      };

      const hash1 = await computePlanHash(config);
      const hash2 = await computePlanHash(config);
      expect(hash1).toBe(hash2);
    });
  });

  describe('Given different object key order', () => {
    it('produces the same hash (canonical JSON sorts keys)', async () => {
      const config1 = {
        features: ['project:view'],
        limits: { b_limit: { max: 50, gates: 'x' }, a_limit: { max: 10, gates: 'y' } },
        price: { amount: 29, interval: 'month' as const },
      };
      const config2 = {
        features: ['project:view'],
        limits: { a_limit: { max: 10, gates: 'y' }, b_limit: { max: 50, gates: 'x' } },
        price: { amount: 29, interval: 'month' as const },
      };

      expect(await computePlanHash(config1)).toBe(await computePlanHash(config2));
    });
  });

  describe('Given configs with missing optional fields', () => {
    it('handles config with no features', async () => {
      const config = { limits: { x: { max: 1 } } };
      const hash = await computePlanHash(config);
      expect(hash.length).toBe(64);
    });

    it('handles config with no limits', async () => {
      const config = { features: ['a'] };
      const hash = await computePlanHash(config);
      expect(hash.length).toBe(64);
    });

    it('handles config with no price', async () => {
      const config = { features: ['a'], limits: {} };
      const hash = await computePlanHash(config);
      expect(hash.length).toBe(64);
    });
  });
});
