import { describe, expect, it } from 'bun:test';
import { oklchToRgba } from '../css/native-token-resolver';

describe('oklchToRgba', () => {
  describe('Given pure white oklch', () => {
    it('Then converts to [1, 1, 1, 1]', () => {
      const result = oklchToRgba('oklch(1 0 0)');
      expect(result[0]).toBeCloseTo(1, 2);
      expect(result[1]).toBeCloseTo(1, 2);
      expect(result[2]).toBeCloseTo(1, 2);
      expect(result[3]).toBe(1);
    });
  });

  describe('Given pure black oklch', () => {
    it('Then converts to [0, 0, 0, 1]', () => {
      const result = oklchToRgba('oklch(0 0 0)');
      expect(result[0]).toBeCloseTo(0, 2);
      expect(result[1]).toBeCloseTo(0, 2);
      expect(result[2]).toBeCloseTo(0, 2);
      expect(result[3]).toBe(1);
    });
  });

  describe('Given a red oklch value', () => {
    it('Then converts to approximately red', () => {
      // red-600 from Tailwind
      const result = oklchToRgba('oklch(0.577 0.245 27.325)');
      // Should be a reddish color
      expect(result[0]).toBeGreaterThan(0.5); // high red
      expect(result[1]).toBeLessThan(0.3); // low green
      expect(result[2]).toBeLessThan(0.3); // low blue
    });
  });

  describe('Given a zinc/neutral oklch value', () => {
    it('Then converts to a gray', () => {
      // zinc-500
      const result = oklchToRgba('oklch(0.552 0.016 285.938)');
      // Near-neutral gray — r, g, b should be close to each other
      const diff = Math.max(Math.abs(result[0] - result[1]), Math.abs(result[1] - result[2]));
      expect(diff).toBeLessThan(0.1);
    });
  });

  describe('Given invalid input', () => {
    it('Then returns black', () => {
      const result = oklchToRgba('not-oklch');
      expect(result).toEqual([0, 0, 0, 1]);
    });
  });
});
