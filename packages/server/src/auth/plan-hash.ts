/**
 * Plan Hash — SHA-256 of canonical JSON for plan versioning.
 *
 * Computes a deterministic hash of a plan's config (features, limits, price).
 * Title and description are excluded — cosmetic changes don't create new versions.
 */

import { sha256Hex } from './crypto';

export interface PlanHashInput {
  features?: readonly string[] | string[];
  limits?: Record<string, unknown>;
  price?: { amount: number; interval: string } | null;
}

/**
 * Compute SHA-256 hash of canonical JSON representation of plan config.
 * Keys are sorted recursively for deterministic output regardless of object key order.
 */
export async function computePlanHash(config: PlanHashInput): Promise<string> {
  const canonical = {
    features: config.features ?? [],
    limits: config.limits ?? {},
    price: config.price ?? null,
  };
  const json = JSON.stringify(canonical, sortedReplacer);
  return sha256Hex(json);
}

/**
 * JSON.stringify replacer that sorts object keys for canonical JSON.
 */
function sortedReplacer(_key: string, value: unknown): unknown {
  if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
    const sorted: Record<string, unknown> = {};
    for (const k of Object.keys(value).sort()) {
      sorted[k] = (value as Record<string, unknown>)[k];
    }
    return sorted;
  }
  return value;
}
