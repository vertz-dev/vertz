/**
 * AccessContext — client-side access control context + can() function.
 *
 * Provides reactive access checks via signal-api pattern (like query()/form()).
 * can() must be called in the component body (synchronous render) — it reads
 * context via useContext(), which requires the Provider to be on the call stack.
 */

import { type Context, createContext, type UnwrapSignals, useContext } from '../component/context';
import { computed } from '../runtime/signal';
import type { ReadonlySignal, Signal } from '../runtime/signal-types';
import type { AccessCheck, AccessCheckData, AccessSet, DenialReason } from './access-set-types';

// ============================================================================
// Context
// ============================================================================

export interface AccessContextValue {
  accessSet: Signal<AccessSet | null>;
  loading: Signal<boolean>;
}

export const AccessContext: Context<AccessContextValue> = createContext<AccessContextValue>(
  undefined,
  '@vertz/ui::AccessContext',
);

/**
 * Read the access context. Returns getter-wrapped object (wrapSignalProps
 * applied by Provider). Throws if no provider — consistent with useRouter(),
 * useDialogStack(), and all other use* hooks.
 */
export function useAccessContext(): UnwrapSignals<AccessContextValue> {
  const ctx = useContext(AccessContext);
  if (!ctx) {
    throw new Error('useAccessContext must be called within AccessContext.Provider');
  }
  return ctx;
}

// ============================================================================
// can()
// ============================================================================

/**
 * Signal-backed fallback for when no provider is present — fail-secure.
 * Uses computed() for consistency with the provider path, so the return shape
 * is always signal-backed regardless of provider presence.
 */
function createFallbackDenied(): AccessCheck {
  return {
    allowed: computed(() => false),
    reasons: computed(() => ['not_authenticated'] as DenialReason[]),
    reason: computed(() => 'not_authenticated' as DenialReason),
    meta: computed(() => undefined),
    loading: computed(() => false),
    // signal-api pattern: compiler auto-unwraps .value (same as query()/form())
  } as unknown as AccessCheck;
}

const __DEV__ = typeof process !== 'undefined' && process.env.NODE_ENV !== 'production';

/**
 * Check if the current user has a specific entitlement.
 *
 * Must be called in the component body (like query()/form()).
 * Returns an AccessCheck with ReadonlySignal properties that the
 * compiler auto-unwraps via signal-api registration.
 *
 * **UI-advisory only.** Server always re-validates before mutations.
 * `can()` controls UI visibility, not authorization.
 *
 * @param entitlement - The entitlement to check
 * @param entity - Optional entity with pre-computed `__access` metadata
 */
export function can(
  entitlement: string,
  entity?: { __access?: Record<string, AccessCheckData> },
): AccessCheck {
  // Use useContext directly (not useAccessContext) because can() needs
  // graceful fallback to FALLBACK_DENIED when no provider is present.
  const ctx = useContext(AccessContext);

  if (!ctx) {
    if (__DEV__) {
      console.warn('can() called without AccessContext.Provider — all checks denied');
    }
    return createFallbackDenied();
  }

  // Create computed signals that derive from the context's access set.
  // ctx properties are getter-wrapped (by Provider's wrapSignalProps),
  // so ctx.accessSet reads signal.value and is tracked by computed().
  const accessData: ReadonlySignal<AccessCheckData | null> = computed(() => {
    // entity.__access takes precedence (resource-scoped check)
    if (entity?.__access?.[entitlement]) return entity.__access[entitlement];
    // Fall back to global access set
    const set = ctx.accessSet as AccessSet | null;
    return set?.entitlements[entitlement] ?? null;
  });

  return {
    allowed: computed(() => accessData.value?.allowed ?? false),
    reasons: computed(() => accessData.value?.reasons ?? []),
    reason: computed(() => accessData.value?.reason),
    meta: computed(() => accessData.value?.meta),
    loading: computed(() => {
      const set = ctx.accessSet as AccessSet | null;
      if (!set) return ctx.loading as boolean;
      return false;
    }),
    // signal-api pattern: compiler auto-unwraps .value (same as query()/form())
  } as unknown as AccessCheck;
}
