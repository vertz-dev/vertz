import { describe, test, expect } from 'vitest';
import { calculateDelay } from '../src/recorder.js';

describe('DemoRecorder', () => {
  describe('calculateDelay', () => {
    test('returns exact base delay when variance is 0', () => {
      const base = 1000;
      const result = calculateDelay(base, 0);
      expect(result).toBe(base);
    });

    test('returns value within variance range', () => {
      const base = 1000;
      const variance = 0.2; // 20% variance
      const minExpected = base * (1 - variance);
      const maxExpected = base * (1 + variance);

      // Test multiple times to account for randomness
      for (let i = 0; i < 100; i++) {
        const result = calculateDelay(base, variance);
        expect(result).toBeGreaterThanOrEqual(minExpected);
        expect(result).toBeLessThanOrEqual(maxExpected);
      }
    });

    test('returns different values with variance', () => {
      const base = 1000;
      const variance = 0.3;
      
      const results = new Set<number>();
      for (let i = 0; i < 50; i++) {
        results.add(calculateDelay(base, variance));
      }

      // Should get multiple different values
      expect(results.size).toBeGreaterThan(10);
    });

    test('handles small base values', () => {
      const base = 10;
      const variance = 0.5;
      const result = calculateDelay(base, variance);
      
      expect(result).toBeGreaterThanOrEqual(5);
      expect(result).toBeLessThanOrEqual(15);
    });
  });
});
