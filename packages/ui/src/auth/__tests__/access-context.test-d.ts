/**
 * Type-level tests for can() and AccessCheck.
 *
 * These tests verify that the AccessCheck interface has the correct
 * shape and rejects invalid usage. Checked by `tsc --noEmit`.
 */

import { can } from '../access-context';
import type { AccessCheck, DenialMeta, DenialReason } from '../access-set-types';

// ─── Positive: can('x') returns AccessCheck with correct properties ──────

declare const check: AccessCheck;

// allowed is boolean
const _allowed: boolean = check.allowed;
void _allowed;

// loading is boolean
const _loading: boolean = check.loading;
void _loading;

// reasons is DenialReason[]
const _reasons: DenialReason[] = check.reasons;
void _reasons;

// reason is DenialReason | undefined
const _reason: DenialReason | undefined = check.reason;
void _reason;

// meta is DenialMeta | undefined
const _meta: DenialMeta | undefined = check.meta;
void _meta;

// ─── Negative: can() with no args is rejected ────────────────────────────

// @ts-expect-error - can() requires at least one argument (entitlement string)
can();

// ─── Negative: accessing nonexistent property is rejected ────────────────

// @ts-expect-error - AccessCheck does not have a 'nonexistent' property
check.nonexistent;
