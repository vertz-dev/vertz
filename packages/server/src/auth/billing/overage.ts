/**
 * Overage Computation — calculates overage charges for limit usage.
 *
 * Formula: (consumed - max) * rate, capped if cap is specified.
 * Returns 0 if usage is within the limit.
 */

export interface OverageInput {
  consumed: number;
  max: number;
  rate: number;
  cap?: number;
}

/**
 * Compute overage charge for a given usage period.
 *
 * @returns The overage charge amount (0 if within limit)
 */
export function computeOverage(input: OverageInput): number {
  const { consumed, max, rate } = input;

  if (max === -1) return 0; // Unlimited — no overage possible
  if (consumed <= max) return 0;

  const overageUnits = consumed - max;
  const charge = overageUnits * rate;

  if (input.cap !== undefined && charge > input.cap) {
    return input.cap;
  }

  return charge;
}
