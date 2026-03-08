/**
 * Factor Verification Age (FVA) — step-up authentication utility
 */

import type { SessionPayload } from './types';

/**
 * Check if the session's factor verification is still fresh.
 * Returns true if `fva` exists and (now - fva) < maxAgeSeconds.
 */
export function checkFva(payload: SessionPayload, maxAgeSeconds: number): boolean {
  if (payload.fva === undefined) return false;
  const now = Math.floor(Date.now() / 1000);
  return now - payload.fva < maxAgeSeconds;
}
