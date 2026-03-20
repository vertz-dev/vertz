/**
 * Cloud health check — verifies connectivity to the Vertz Cloud API.
 */

import { CLOUD_DEFAULTS, type CloudConfig } from './cloud-config';

// ============================================================================
// Types
// ============================================================================

export interface CloudHealthResult {
  status: 'healthy' | 'unhealthy';
  latencyMs: number;
  lastError?: string;
}

// ============================================================================
// Health check
// ============================================================================

export async function checkCloudHealth(config: CloudConfig): Promise<CloudHealthResult> {
  const baseUrl = (config.baseUrl ?? CLOUD_DEFAULTS.baseUrl).replace(/\/$/, '');
  const timeoutMs = config.timeoutMs ?? CLOUD_DEFAULTS.timeoutMs;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const start = performance.now();

  try {
    const response = await fetch(`${baseUrl}/api/v1/health`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${config.apiKey}` },
      signal: controller.signal,
    });

    const latencyMs = Math.round(performance.now() - start);

    if (!response.ok) {
      return {
        status: 'unhealthy',
        latencyMs,
        lastError: `HTTP ${response.status}`,
      };
    }

    return { status: 'healthy', latencyMs };
  } catch (error) {
    const latencyMs = Math.round(performance.now() - start);
    return {
      status: 'unhealthy',
      latencyMs,
      lastError: (error as Error).message,
    };
  } finally {
    clearTimeout(timer);
  }
}
