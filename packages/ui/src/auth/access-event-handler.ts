/**
 * Access Event Handler — inline signal updates for access events.
 *
 * Processes WebSocket events and updates the accessSet signal directly,
 * enabling reactive UI updates without a full refetch.
 */

import type { Signal } from '../runtime/signal-types';
import type { ClientAccessEvent } from './access-event-client';
import type { AccessCheckData, AccessSet, DenialReason } from './access-set-types';

/**
 * Handle an access event by updating the accessSet signal inline.
 *
 * @param accessSet - The signal holding the current AccessSet
 * @param event - The access event to process
 * @param flagEntitlementMap - Maps entitlement names to their required flags
 *   (e.g., { 'project:export': ['export-v2'] }). Used to re-evaluate
 *   entitlements when a flag is toggled.
 */
export function handleAccessEvent(
  accessSet: Signal<AccessSet | null>,
  event: ClientAccessEvent,
  flagEntitlementMap?: Record<string, string[]>,
): void {
  const current = accessSet.value;
  if (!current) return;

  switch (event.type) {
    case 'access:flag_toggled':
      handleFlagToggle(accessSet, current, event.flag, event.enabled, flagEntitlementMap);
      break;
    case 'access:limit_updated':
      handleLimitUpdate(
        accessSet,
        current,
        event.entitlement,
        event.consumed,
        event.remaining,
        event.max,
      );
      break;
    case 'access:plan_assigned':
      handlePlanAssigned(accessSet, current, event.planId);
      break;
    case 'access:limit_reset':
      handleLimitReset(accessSet, current, event.entitlement, event.max);
      break;
    case 'access:role_changed':
    case 'access:plan_changed':
    case 'access:addon_attached':
    case 'access:addon_detached':
      // These are handled at the caller level (jittered refetch)
      break;
  }
}

function handleFlagToggle(
  accessSet: Signal<AccessSet | null>,
  current: AccessSet,
  flag: string,
  enabled: boolean,
  flagEntitlementMap?: Record<string, string[]>,
): void {
  const newFlags = { ...current.flags, [flag]: enabled };
  const newEntitlements = { ...current.entitlements };

  // Re-evaluate entitlements that depend on this flag
  if (flagEntitlementMap) {
    for (const [name, requiredFlags] of Object.entries(flagEntitlementMap)) {
      if (!requiredFlags.includes(flag)) continue;

      if (!enabled) {
        // Flag disabled -> mark entitlement as denied
        newEntitlements[name] = {
          allowed: false,
          reasons: ['flag_disabled'],
          reason: 'flag_disabled',
          meta: { disabledFlags: [flag] },
        };
      } else {
        // Flag enabled -> remove flag_disabled if that was the only reason
        const existing = newEntitlements[name];
        if (existing?.reason === 'flag_disabled') {
          // Best effort: mark as allowed. Server will correct on next full refresh.
          newEntitlements[name] = { allowed: true, reasons: [] };
        }
      }
    }
  }

  accessSet.value = { ...current, flags: newFlags, entitlements: newEntitlements };
}

function handlePlanAssigned(
  accessSet: Signal<AccessSet | null>,
  current: AccessSet,
  planId: string,
): void {
  accessSet.value = { ...current, plan: planId };
}

function handleLimitReset(
  accessSet: Signal<AccessSet | null>,
  current: AccessSet,
  entitlement: string,
  max: number,
): void {
  const existingEntry = current.entitlements[entitlement];
  if (!existingEntry) return;

  const newLimit = { max, consumed: 0, remaining: max };
  const newEntitlements = { ...current.entitlements };

  // Remove limit_reached denial since we reset
  const reasons = existingEntry.reasons.filter((r) => r !== 'limit_reached');
  // Re-evaluate allowed: if limit_reached was the only reason, it's now allowed
  const wasOnlyLimitBlocked =
    existingEntry.reasons.length > 0 && existingEntry.reasons.every((r) => r === 'limit_reached');

  newEntitlements[entitlement] = {
    ...existingEntry,
    allowed: wasOnlyLimitBlocked ? true : existingEntry.allowed || reasons.length === 0,
    reasons,
    reason: reasons[0],
    meta: { ...existingEntry.meta, limit: newLimit },
  };

  accessSet.value = { ...current, entitlements: newEntitlements };
}

function handleLimitUpdate(
  accessSet: Signal<AccessSet | null>,
  current: AccessSet,
  entitlement: string,
  consumed: number,
  remaining: number,
  max: number,
): void {
  const existingEntry = current.entitlements[entitlement];
  if (!existingEntry) return;

  const newLimit = { max, consumed, remaining };
  const newEntitlements = { ...current.entitlements };

  if (remaining <= 0) {
    // Limit reached -> mark as denied
    const reasons: DenialReason[] = [...existingEntry.reasons];
    if (!reasons.includes('limit_reached')) reasons.push('limit_reached');
    const entry: AccessCheckData = {
      ...existingEntry,
      allowed: false,
      reasons,
      reason: reasons[0],
      meta: { ...existingEntry.meta, limit: newLimit },
    };
    newEntitlements[entitlement] = entry;
  } else {
    // Has remaining -> update limit meta, keep allowed state
    newEntitlements[entitlement] = {
      ...existingEntry,
      meta: { ...existingEntry.meta, limit: newLimit },
    };
  }

  accessSet.value = { ...current, entitlements: newEntitlements };
}
