/**
 * Client-side access set types.
 *
 * Mirrors server types (no server imports). See "Known Limitations"
 * in the design doc for drift risk documentation.
 */

export type DenialReason =
  | 'plan_required'
  | 'role_required'
  | 'limit_reached'
  | 'flag_disabled'
  | 'hierarchy_denied'
  | 'step_up_required'
  | 'not_authenticated';

export interface DenialMeta {
  requiredPlans?: string[];
  requiredRoles?: string[];
  disabledFlags?: string[];
  limit?: { key?: string; max: number; consumed: number; remaining: number };
  fvaMaxAge?: number;
}

export interface AccessCheckData {
  allowed: boolean;
  reasons: DenialReason[];
  reason?: DenialReason;
  meta?: DenialMeta;
}

export interface AccessSet {
  entitlements: Record<string, AccessCheckData>;
  flags: Record<string, boolean>;
  /** @deprecated Use `plans` for multi-level. Kept for backward compat. */
  plan: string | null;
  /** Plan per billing level. Keys are entity names. */
  plans: Record<string, string | null>;
  computedAt: string;
}

/** Public return type of can(). All properties are ReadonlySignal (compiler auto-unwraps). */
export interface AccessCheck {
  readonly allowed: boolean;
  readonly reasons: DenialReason[];
  readonly reason: DenialReason | undefined;
  readonly meta: DenialMeta | undefined;
  readonly loading: boolean;
}
