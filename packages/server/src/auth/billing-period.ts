/**
 * Billing Period — calculates the current billing period for an org.
 *
 * Periods are anchored to the org plan's startedAt date.
 * A "month" period runs from startedAt + N months to startedAt + (N+1) months.
 */

import type { BillingPeriod } from './define-access';

export interface Period {
  periodStart: Date;
  periodEnd: Date;
}

/**
 * Calculate the billing period that contains `now`, anchored to `startedAt`.
 *
 * For 'month': walks from startedAt adding 1 month at a time until we find
 * the period containing now. For 'day'/'hour': uses fixed-duration periods.
 */
export function calculateBillingPeriod(
  startedAt: Date,
  per: BillingPeriod,
  now: Date = new Date(),
): Period {
  if (per === 'month') {
    return calculateMultiMonthPeriod(startedAt, now, 1);
  }

  if (per === 'quarter') {
    return calculateMultiMonthPeriod(startedAt, now, 3);
  }

  if (per === 'year') {
    return calculateMultiMonthPeriod(startedAt, now, 12);
  }

  // day / hour — fixed duration
  const durationMs = per === 'day' ? 24 * 60 * 60 * 1000 : 60 * 60 * 1000;
  const elapsed = now.getTime() - startedAt.getTime();
  const periodsElapsed = Math.floor(elapsed / durationMs);
  const periodStart = new Date(startedAt.getTime() + periodsElapsed * durationMs);
  const periodEnd = new Date(periodStart.getTime() + durationMs);

  return { periodStart, periodEnd };
}

function calculateMultiMonthPeriod(startedAt: Date, now: Date, monthInterval: number): Period {
  // Guard: if now is before startedAt, return the first period
  if (now.getTime() < startedAt.getTime()) {
    return { periodStart: new Date(startedAt), periodEnd: addMonths(startedAt, monthInterval) };
  }

  // Fast-forward: calculate approximate months elapsed (UTC consistently)
  const approxMonths =
    (now.getUTCFullYear() - startedAt.getUTCFullYear()) * 12 +
    (now.getUTCMonth() - startedAt.getUTCMonth());

  // Align to the interval boundary
  const periodsElapsed = Math.floor(approxMonths / monthInterval);
  let periodStart = addMonths(startedAt, periodsElapsed * monthInterval);

  // If we overshot, go back one interval
  if (periodStart.getTime() > now.getTime()) {
    periodStart = addMonths(startedAt, (periodsElapsed - 1) * monthInterval);
  }

  // If the next period start is before now, move forward one interval
  const nextStart = addMonths(startedAt, (periodsElapsed + 1) * monthInterval);
  if (nextStart.getTime() <= now.getTime()) {
    periodStart = nextStart;
  }

  const periodEnd = addMonths(startedAt, getMonthOffset(startedAt, periodStart) + monthInterval);

  return { periodStart, periodEnd };
}

function addMonths(base: Date, months: number): Date {
  const result = new Date(base);
  const targetMonth = result.getUTCMonth() + months;
  result.setUTCMonth(targetMonth);
  // Clamp to end-of-month if day overflowed (e.g., Jan 31 + 1 month = Mar 3 → Feb 28)
  const expectedMonth = (((base.getUTCMonth() + months) % 12) + 12) % 12;
  if (result.getUTCMonth() !== expectedMonth) {
    result.setUTCDate(0); // Goes to last day of previous month = target month's last day
  }
  return result;
}

function getMonthOffset(base: Date, target: Date): number {
  return (
    (target.getUTCFullYear() - base.getUTCFullYear()) * 12 +
    (target.getUTCMonth() - base.getUTCMonth())
  );
}
