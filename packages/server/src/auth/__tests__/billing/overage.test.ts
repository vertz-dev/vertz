import { describe, expect, it } from 'bun:test';
import { computeOverage } from '../../billing/overage';

describe('Feature: Overage computation', () => {
  describe('Given usage exceeds the limit', () => {
    it('computes overage charge as (consumed - max) * rate', () => {
      const result = computeOverage({ consumed: 150, max: 100, rate: 0.01 });
      expect(result).toBe(0.5);
    });
  });

  describe('Given usage is within the limit', () => {
    it('returns $0.00', () => {
      const result = computeOverage({ consumed: 50, max: 100, rate: 0.01 });
      expect(result).toBe(0);
    });
  });

  describe('Given usage is exactly at the limit', () => {
    it('returns $0.00', () => {
      const result = computeOverage({ consumed: 100, max: 100, rate: 0.01 });
      expect(result).toBe(0);
    });
  });

  describe('Given overage with a cap', () => {
    it('caps the charge at the cap amount', () => {
      // 1000 over * $0.01 = $10, but cap is $5
      const result = computeOverage({ consumed: 1100, max: 100, rate: 0.01, cap: 5 });
      expect(result).toBe(5);
    });
  });

  describe('Given unlimited limit (max = -1)', () => {
    it('returns $0.00 — no overage possible', () => {
      const result = computeOverage({ consumed: 999999, max: -1, rate: 0.01 });
      expect(result).toBe(0);
    });
  });
});
