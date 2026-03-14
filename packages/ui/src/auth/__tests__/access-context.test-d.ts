/**
 * Type-level tests for can() and AccessCheck.
 *
 * These tests verify that the AccessCheck interface has the correct
 * shape and rejects invalid usage. Checked by `tsc --noEmit`.
 */

import type { ReadonlySignal } from '../../runtime/signal-types';
import { can, canSignals, type RawAccessCheck } from '../access-context';
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

// ─── canSignals() returns RawAccessCheck with ReadonlySignal properties ──

declare const raw: RawAccessCheck;

// allowed is ReadonlySignal<boolean>
const _rawAllowed: ReadonlySignal<boolean> = raw.allowed;
void _rawAllowed;

// loading is ReadonlySignal<boolean>
const _rawLoading: ReadonlySignal<boolean> = raw.loading;
void _rawLoading;

// reasons is ReadonlySignal<DenialReason[]>
const _rawReasons: ReadonlySignal<DenialReason[]> = raw.reasons;
void _rawReasons;

// reason is ReadonlySignal<DenialReason | undefined>
const _rawReason: ReadonlySignal<DenialReason | undefined> = raw.reason;
void _rawReason;

// meta is ReadonlySignal<DenialMeta | undefined>
const _rawMeta: ReadonlySignal<DenialMeta | undefined> = raw.meta;
void _rawMeta;

// ─── Negative: canSignals() properties are NOT plain values ─────────────

// @ts-expect-error - canSignals().allowed is ReadonlySignal<boolean>, not boolean
const _badAllowed: boolean = raw.allowed;
void _badAllowed;

// @ts-expect-error - canSignals() requires at least one argument
canSignals();
