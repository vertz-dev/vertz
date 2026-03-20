/**
 * Cloud configuration types and validation for Vertz Cloud storage.
 *
 * Configures how the access system connects to Vertz Cloud
 * for wallet counts, plan versions, and billing data.
 */

// ============================================================================
// Types
// ============================================================================

/** Cloud failure mode — behavior when the cloud API is unavailable */
export type CloudFailMode = 'closed' | 'open' | 'cached';

/** Cloud storage configuration */
export interface CloudConfig {
  /** API key for authenticating with Vertz Cloud (format: vtz_live_* or vtz_test_*) */
  apiKey: string;
  /** Behavior on cloud failure. Defaults to 'closed' (deny). */
  failMode?: CloudFailMode;
  /** Base URL for the Vertz Cloud API. Defaults to 'https://api.vertz.cloud'. */
  baseUrl?: string;
  /** Timeout in milliseconds for cloud API calls. Defaults to 2000. */
  timeoutMs?: number;
}

/** Storage configuration for defineAccess() */
export interface StorageConfig {
  /** Local database reference (developer's SQLite or Postgres) */
  local?: unknown;
  /** Cloud configuration — when provided, wallet/billing data routes to Vertz Cloud */
  cloud?: CloudConfig;
}

// ============================================================================
// Defaults
// ============================================================================

export const CLOUD_DEFAULTS = {
  baseUrl: 'https://api.vertz.cloud',
  timeoutMs: 2000,
  failMode: 'closed' as CloudFailMode,
} as const;

// ============================================================================
// Validation
// ============================================================================

const VALID_FAIL_MODES: readonly CloudFailMode[] = ['closed', 'open', 'cached'];

export function validateCloudConfig(config: CloudConfig): void {
  if (!config.apiKey) {
    throw new Error('apiKey is required');
  }

  if (config.failMode && !VALID_FAIL_MODES.includes(config.failMode)) {
    throw new Error("failMode must be 'closed', 'open', or 'cached'");
  }

  if (config.timeoutMs !== undefined && config.timeoutMs <= 0) {
    throw new Error('timeoutMs must be a positive number');
  }
}
