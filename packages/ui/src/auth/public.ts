/**
 * @vertz/ui/auth — client-side access control.
 *
 * Provides AccessContext, can(), AccessGate, and createAccessProvider
 * for UI-advisory access checks without network requests.
 */

export type { AccessContextValue } from './access-context';
export { AccessContext, can, useAccessContext } from './access-context';
export type { AccessGateProps } from './access-gate';
export { AccessGate } from './access-gate';
export type {
  AccessCheck,
  AccessCheckData,
  AccessSet,
  DenialMeta,
  DenialReason,
} from './access-set-types';
export { createAccessProvider } from './create-access-provider';
