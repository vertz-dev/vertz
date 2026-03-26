/**
 * CloudWalletStore — HTTP client adapter for the Vertz Cloud wallet API.
 *
 * Implements WalletStore by delegating to the cloud API endpoints.
 * Used when `defineAccess({ storage: { cloud: { apiKey } } })` is configured.
 */

import type { ConsumeResult, WalletStore } from '../wallet-store';
import { CLOUD_DEFAULTS, type CloudConfig } from './cloud-config';

// ============================================================================
// CloudWalletStore
// ============================================================================

export class CloudWalletStore implements WalletStore {
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly timeoutMs: number;

  constructor(config: CloudConfig) {
    this.apiKey = config.apiKey;
    this.baseUrl = (config.baseUrl ?? CLOUD_DEFAULTS.baseUrl).replace(/\/$/, '');
    this.timeoutMs = config.timeoutMs ?? CLOUD_DEFAULTS.timeoutMs;
  }

  async getConsumption(
    tenantId: string,
    entitlement: string,
    periodStart: Date,
    periodEnd: Date,
  ): Promise<number> {
    const body = {
      tenantId,
      limitKey: entitlement,
      periodStart: periodStart.toISOString(),
      periodEnd: periodEnd.toISOString(),
    };

    const data = await this.post<{ consumed: number }>('/api/v1/wallet/check', body);
    return data.consumed;
  }

  async consume(
    tenantId: string,
    entitlement: string,
    periodStart: Date,
    periodEnd: Date,
    limit: number,
    amount = 1,
  ): Promise<ConsumeResult> {
    const body = {
      tenantId,
      limitKey: entitlement,
      periodStart: periodStart.toISOString(),
      periodEnd: periodEnd.toISOString(),
      limit,
      amount,
    };

    const data = await this.post<CloudConsumeResponse>('/api/v1/wallet/consume', body);

    if (data.consumed === true) {
      return {
        success: true,
        consumed: data.newCount,
        limit,
        remaining: data.remaining,
      };
    }

    return {
      success: false,
      consumed: data.currentCount,
      limit,
      remaining: data.remaining,
    };
  }

  async unconsume(
    tenantId: string,
    entitlement: string,
    periodStart: Date,
    periodEnd: Date,
    amount = 1,
  ): Promise<void> {
    const body = {
      tenantId,
      limitKey: entitlement,
      periodStart: periodStart.toISOString(),
      periodEnd: periodEnd.toISOString(),
      amount,
    };

    await this.post('/api/v1/wallet/unconsume', body);
  }

  async getBatchConsumption(
    tenantId: string,
    limitKeys: string[],
    periodStart: Date,
    periodEnd: Date,
  ): Promise<Map<string, number>> {
    const body = {
      tenantId,
      limitKeys,
      periodStart: periodStart.toISOString(),
      periodEnd: periodEnd.toISOString(),
    };

    const data = await this.post<{ consumption: Record<string, number> }>(
      '/api/v1/wallet/batch-check',
      body,
    );

    return new Map(Object.entries(data.consumption));
  }

  dispose(): void {
    // No-op — HTTP client has no persistent resources to clean up
  }

  // ==========================================================================
  // Private helpers
  // ==========================================================================

  private async post<T>(path: string, body: unknown): Promise<T> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await fetch(`${this.baseUrl}${path}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new CloudWalletError(`Cloud wallet API error (${response.status})`, response.status);
      }

      return (await response.json()) as T;
    } catch (error) {
      if (error instanceof CloudWalletError) throw error;
      if ((error as Error).name === 'AbortError') {
        throw new CloudWalletError(`Cloud wallet API timeout after ${this.timeoutMs}ms`, 0);
      }
      throw new CloudWalletError(`Cloud wallet API request failed: ${(error as Error).message}`, 0);
    } finally {
      clearTimeout(timer);
    }
  }
}

// ============================================================================
// Types
// ============================================================================

type CloudConsumeResponse =
  | { consumed: true; newCount: number; max: number; remaining: number }
  | { consumed: false; currentCount: number; max: number; remaining: number; reason?: string };

// ============================================================================
// Error class
// ============================================================================

export class CloudWalletError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
  ) {
    super(message);
    this.name = 'CloudWalletError';
  }
}
