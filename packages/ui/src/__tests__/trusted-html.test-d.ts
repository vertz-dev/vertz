/**
 * Type-level tests for the TrustedHTML brand and trusted() helper.
 * Checked by `tsc --noEmit`, not the test runner.
 */

import { trusted, type TrustedHTML } from '../trusted-html';

// ─── trusted() produces a TrustedHTML ─────────────────────────────

const safe: TrustedHTML = trusted('<b>ok</b>');

// ─── TrustedHTML is assignable to string (widening is fine) ────────

const asString: string = safe;
void asString;

// ─── A raw string is NOT assignable to TrustedHTML ────────────────

// @ts-expect-error — plain string lacks the TrustedHTML brand
const _bad: TrustedHTML = 'attacker-controlled';

// ─── trusted() requires a string argument ─────────────────────────

// @ts-expect-error — number is not a string
trusted(42);

// ─── Re-exported from @vertz/ui barrel ────────────────────────────

import { trusted as trustedFromBarrel } from '../index';
const __safe: TrustedHTML = trustedFromBarrel('<i>ok</i>');
void __safe;
