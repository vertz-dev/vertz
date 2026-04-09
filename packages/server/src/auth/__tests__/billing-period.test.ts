import { describe, expect, it } from '@vertz/test';
import { calculateBillingPeriod } from '../billing-period';

describe('calculateBillingPeriod', () => {
  describe('monthly', () => {
    it('calculates monthly period anchored to startedAt', () => {
      const startedAt = new Date('2026-01-15T00:00:00Z');
      const now = new Date('2026-02-20T12:00:00Z');

      const { periodStart, periodEnd } = calculateBillingPeriod(startedAt, 'month', now);

      expect(periodStart).toEqual(new Date('2026-02-15T00:00:00Z'));
      expect(periodEnd).toEqual(new Date('2026-03-15T00:00:00Z'));
    });

    it('returns first period when now is within the first month', () => {
      const startedAt = new Date('2026-01-15T00:00:00Z');
      const now = new Date('2026-01-20T00:00:00Z');

      const { periodStart, periodEnd } = calculateBillingPeriod(startedAt, 'month', now);

      expect(periodStart).toEqual(new Date('2026-01-15T00:00:00Z'));
      expect(periodEnd).toEqual(new Date('2026-02-15T00:00:00Z'));
    });

    it('handles year boundary', () => {
      const startedAt = new Date('2025-11-15T00:00:00Z');
      const now = new Date('2026-01-10T00:00:00Z');

      const { periodStart, periodEnd } = calculateBillingPeriod(startedAt, 'month', now);

      // Third month: Jan 15 hasn't started yet, so we're in Dec 15 → Jan 15
      expect(periodStart).toEqual(new Date('2025-12-15T00:00:00Z'));
      expect(periodEnd).toEqual(new Date('2026-01-15T00:00:00Z'));
    });

    it('clamps Jan 31 + 1 month to Feb 28 (non-leap year)', () => {
      const startedAt = new Date('2026-01-31T00:00:00Z');
      const now = new Date('2026-02-15T00:00:00Z');

      const { periodStart, periodEnd } = calculateBillingPeriod(startedAt, 'month', now);

      expect(periodStart).toEqual(new Date('2026-01-31T00:00:00Z'));
      expect(periodEnd).toEqual(new Date('2026-02-28T00:00:00Z'));
    });

    it('clamps Jan 31 + 1 month to Feb 29 (leap year)', () => {
      const startedAt = new Date('2028-01-31T00:00:00Z');
      const now = new Date('2028-02-15T00:00:00Z');

      const { periodStart, periodEnd } = calculateBillingPeriod(startedAt, 'month', now);

      expect(periodStart).toEqual(new Date('2028-01-31T00:00:00Z'));
      expect(periodEnd).toEqual(new Date('2028-02-29T00:00:00Z'));
    });

    it('handles Mar 31 + 1 month clamped to Apr 30', () => {
      const startedAt = new Date('2026-03-31T00:00:00Z');
      const now = new Date('2026-04-15T00:00:00Z');

      const { periodStart, periodEnd } = calculateBillingPeriod(startedAt, 'month', now);

      expect(periodStart).toEqual(new Date('2026-03-31T00:00:00Z'));
      expect(periodEnd).toEqual(new Date('2026-04-30T00:00:00Z'));
    });

    it('returns first period when now is before startedAt', () => {
      const startedAt = new Date('2026-06-15T00:00:00Z');
      const now = new Date('2026-06-01T00:00:00Z');

      const { periodStart, periodEnd } = calculateBillingPeriod(startedAt, 'month', now);

      expect(periodStart).toEqual(new Date('2026-06-15T00:00:00Z'));
      expect(periodEnd).toEqual(new Date('2026-07-15T00:00:00Z'));
    });
  });

  describe('daily', () => {
    it('calculates daily period anchored to startedAt', () => {
      const startedAt = new Date('2026-01-01T10:00:00Z');
      const now = new Date('2026-01-03T14:00:00Z');

      const { periodStart, periodEnd } = calculateBillingPeriod(startedAt, 'day', now);

      expect(periodStart).toEqual(new Date('2026-01-03T10:00:00Z'));
      expect(periodEnd).toEqual(new Date('2026-01-04T10:00:00Z'));
    });
  });

  describe('hourly', () => {
    it('calculates hourly period anchored to startedAt', () => {
      const startedAt = new Date('2026-01-01T10:30:00Z');
      const now = new Date('2026-01-01T12:45:00Z');

      const { periodStart, periodEnd } = calculateBillingPeriod(startedAt, 'hour', now);

      expect(periodStart).toEqual(new Date('2026-01-01T12:30:00Z'));
      expect(periodEnd).toEqual(new Date('2026-01-01T13:30:00Z'));
    });
  });

  describe('quarterly', () => {
    it('calculates quarterly period anchored to startedAt', () => {
      const startedAt = new Date('2026-01-15T00:00:00Z');
      const now = new Date('2026-05-20T00:00:00Z');

      const { periodStart, periodEnd } = calculateBillingPeriod(startedAt, 'quarter', now);

      // Started Jan 15, quarter = 3 months. Q1: Jan 15 - Apr 15, Q2: Apr 15 - Jul 15
      expect(periodStart).toEqual(new Date('2026-04-15T00:00:00Z'));
      expect(periodEnd).toEqual(new Date('2026-07-15T00:00:00Z'));
    });

    it('returns first quarter when now is within it', () => {
      const startedAt = new Date('2026-01-15T00:00:00Z');
      const now = new Date('2026-03-10T00:00:00Z');

      const { periodStart, periodEnd } = calculateBillingPeriod(startedAt, 'quarter', now);

      expect(periodStart).toEqual(new Date('2026-01-15T00:00:00Z'));
      expect(periodEnd).toEqual(new Date('2026-04-15T00:00:00Z'));
    });
  });

  describe('yearly', () => {
    it('calculates yearly period anchored to startedAt', () => {
      const startedAt = new Date('2024-03-15T00:00:00Z');
      const now = new Date('2026-06-20T00:00:00Z');

      const { periodStart, periodEnd } = calculateBillingPeriod(startedAt, 'year', now);

      // Started Mar 15 2024, Y1: Mar 15 2024 - Mar 15 2025, Y2: Mar 15 2025 - Mar 15 2026, Y3: Mar 15 2026 - Mar 15 2027
      expect(periodStart).toEqual(new Date('2026-03-15T00:00:00Z'));
      expect(periodEnd).toEqual(new Date('2027-03-15T00:00:00Z'));
    });

    it('returns first year when now is within it', () => {
      const startedAt = new Date('2026-06-01T00:00:00Z');
      const now = new Date('2026-11-15T00:00:00Z');

      const { periodStart, periodEnd } = calculateBillingPeriod(startedAt, 'year', now);

      expect(periodStart).toEqual(new Date('2026-06-01T00:00:00Z'));
      expect(periodEnd).toEqual(new Date('2027-06-01T00:00:00Z'));
    });
  });
});
