import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import type { Server } from 'bun';
import { CloudWalletStore } from '../../cloud/cloud-wallet-store';

// ============================================================================
// Mock cloud server
// ============================================================================

let mockServer: Server | null = null;
let lastRequest: { method: string; url: string; body: unknown; headers: Headers } | null = null;
let mockResponse: { status: number; body: unknown } = { status: 200, body: {} };

function startMockServer(): number {
  mockServer = Bun.serve({
    port: 0,
    fetch: async (req) => {
      const url = new URL(req.url);
      const body = req.method !== 'GET' ? await req.json() : null;
      lastRequest = { method: req.method, url: url.pathname, body, headers: req.headers };
      return new Response(JSON.stringify(mockResponse.body), {
        status: mockResponse.status,
        headers: { 'Content-Type': 'application/json' },
      });
    },
  });
  return mockServer.port;
}

beforeEach(() => {
  lastRequest = null;
  mockResponse = { status: 200, body: {} };
});

afterEach(() => {
  if (mockServer) {
    mockServer.stop(true);
    mockServer = null;
  }
});

// ============================================================================
// Tests
// ============================================================================

describe('Feature: CloudWalletStore', () => {
  describe('Given a CloudWalletStore connected to the cloud API', () => {
    describe('When calling getConsumption()', () => {
      it('Then calls POST /api/v1/wallet/check with correct payload', async () => {
        const port = startMockServer();
        mockResponse = {
          status: 200,
          body: { allowed: true, consumed: 47, max: 100, remaining: 53 },
        };

        const store = new CloudWalletStore({
          apiKey: 'vtz_live_test123',
          baseUrl: `http://localhost:${port}`,
        });

        const periodStart = new Date('2026-03-01T00:00:00Z');
        const periodEnd = new Date('2026-04-01T00:00:00Z');

        const consumed = await store.getConsumption(
          'tenant',
          'tenant_abc',
          'prompt:create',
          periodStart,
          periodEnd,
        );

        expect(consumed).toBe(47);
        expect(lastRequest?.method).toBe('POST');
        expect(lastRequest?.url).toBe('/api/v1/wallet/check');
        expect(lastRequest?.body).toEqual({
          resourceType: 'tenant',
          resourceId: 'tenant_abc',
          limitKey: 'prompt:create',
          periodStart: periodStart.toISOString(),
          periodEnd: periodEnd.toISOString(),
        });
      });

      it('Then includes the API key in Authorization header', async () => {
        const port = startMockServer();
        mockResponse = {
          status: 200,
          body: { allowed: true, consumed: 0, max: 100, remaining: 100 },
        };

        const store = new CloudWalletStore({
          apiKey: 'vtz_live_secret',
          baseUrl: `http://localhost:${port}`,
        });

        await store.getConsumption(
          'tenant',
          'tenant_abc',
          'prompt:create',
          new Date('2026-03-01'),
          new Date('2026-04-01'),
        );

        expect(lastRequest?.headers.get('Authorization')).toBe('Bearer vtz_live_secret');
      });
    });

    describe('When calling consume()', () => {
      it('Then calls POST /api/v1/wallet/consume and returns ConsumeResult', async () => {
        const port = startMockServer();
        mockResponse = {
          status: 200,
          body: { consumed: true, newCount: 48, max: 100, remaining: 52 },
        };

        const store = new CloudWalletStore({
          apiKey: 'vtz_live_test123',
          baseUrl: `http://localhost:${port}`,
        });

        const periodStart = new Date('2026-03-01T00:00:00Z');
        const periodEnd = new Date('2026-04-01T00:00:00Z');

        const result = await store.consume(
          'tenant',
          'tenant_abc',
          'prompt:create',
          periodStart,
          periodEnd,
          100,
          1,
        );

        expect(result).toEqual({
          success: true,
          consumed: 48,
          limit: 100,
          remaining: 52,
        });
        expect(lastRequest?.url).toBe('/api/v1/wallet/consume');
        expect(lastRequest?.body).toEqual({
          resourceType: 'tenant',
          resourceId: 'tenant_abc',
          limitKey: 'prompt:create',
          periodStart: periodStart.toISOString(),
          periodEnd: periodEnd.toISOString(),
          limit: 100,
          amount: 1,
        });
      });

      it('Then returns failure when cloud reports limit reached', async () => {
        const port = startMockServer();
        mockResponse = {
          status: 200,
          body: {
            consumed: false,
            reason: 'limit_reached',
            currentCount: 100,
            max: 100,
            remaining: 0,
          },
        };

        const store = new CloudWalletStore({
          apiKey: 'vtz_live_test123',
          baseUrl: `http://localhost:${port}`,
        });

        const result = await store.consume(
          'tenant',
          'tenant_abc',
          'prompt:create',
          new Date('2026-03-01'),
          new Date('2026-04-01'),
          100,
          1,
        );

        expect(result).toEqual({
          success: false,
          consumed: 100,
          limit: 100,
          remaining: 0,
        });
      });
    });

    describe('When calling unconsume()', () => {
      it('Then calls POST /api/v1/wallet/unconsume', async () => {
        const port = startMockServer();
        mockResponse = { status: 200, body: { success: true } };

        const store = new CloudWalletStore({
          apiKey: 'vtz_live_test123',
          baseUrl: `http://localhost:${port}`,
        });

        const periodStart = new Date('2026-03-01T00:00:00Z');
        const periodEnd = new Date('2026-04-01T00:00:00Z');

        await store.unconsume('tenant', 'tenant_abc', 'prompt:create', periodStart, periodEnd, 1);

        expect(lastRequest?.url).toBe('/api/v1/wallet/unconsume');
        expect(lastRequest?.body).toEqual({
          resourceType: 'tenant',
          resourceId: 'tenant_abc',
          limitKey: 'prompt:create',
          periodStart: periodStart.toISOString(),
          periodEnd: periodEnd.toISOString(),
          amount: 1,
        });
      });
    });
  });

  describe('Given a CloudWalletStore for getBatchConsumption', () => {
    describe('When calling getBatchConsumption()', () => {
      it('Then calls POST /api/v1/wallet/batch-check with correct payload', async () => {
        const port = startMockServer();
        mockResponse = {
          status: 200,
          body: { consumption: { 'prompt:create': 42, 'task:create': 7 } },
        };

        const store = new CloudWalletStore({
          apiKey: 'vtz_live_test123',
          baseUrl: `http://localhost:${port}`,
        });

        const periodStart = new Date('2026-03-01T00:00:00Z');
        const periodEnd = new Date('2026-04-01T00:00:00Z');

        const result = await store.getBatchConsumption(
          'tenant',
          'tenant_abc',
          ['prompt:create', 'task:create'],
          periodStart,
          periodEnd,
        );

        expect(result).toBeInstanceOf(Map);
        expect(result.get('prompt:create')).toBe(42);
        expect(result.get('task:create')).toBe(7);
        expect(lastRequest?.method).toBe('POST');
        expect(lastRequest?.url).toBe('/api/v1/wallet/batch-check');
        expect(lastRequest?.body).toEqual({
          resourceType: 'tenant',
          resourceId: 'tenant_abc',
          limitKeys: ['prompt:create', 'task:create'],
          periodStart: periodStart.toISOString(),
          periodEnd: periodEnd.toISOString(),
        });
      });

      it('Then returns an empty Map when no limit keys provided', async () => {
        const port = startMockServer();
        mockResponse = {
          status: 200,
          body: { consumption: {} },
        };

        const store = new CloudWalletStore({
          apiKey: 'vtz_live_test123',
          baseUrl: `http://localhost:${port}`,
        });

        const result = await store.getBatchConsumption(
          'tenant',
          'tenant_abc',
          [],
          new Date('2026-03-01'),
          new Date('2026-04-01'),
        );

        expect(result.size).toBe(0);
      });
    });
  });

  describe('Given the cloud API returns an error', () => {
    describe('When calling any wallet method', () => {
      it('Then throws an error with the response details', async () => {
        const port = startMockServer();
        mockResponse = {
          status: 500,
          body: { error: 'Internal server error' },
        };

        const store = new CloudWalletStore({
          apiKey: 'vtz_live_test123',
          baseUrl: `http://localhost:${port}`,
        });

        await expect(
          store.getConsumption(
            'tenant',
            'tenant_abc',
            'prompt:create',
            new Date('2026-03-01'),
            new Date('2026-04-01'),
          ),
        ).rejects.toThrow('Cloud wallet API error (500)');
      });
    });
  });

  describe('Given the cloud API times out', () => {
    describe('When calling a wallet method', () => {
      it('Then throws a timeout error', async () => {
        // Slow server that takes 5 seconds
        const slowServer = Bun.serve({
          port: 0,
          fetch: async () => {
            await new Promise((resolve) => setTimeout(resolve, 5000));
            return new Response('{}');
          },
        });

        const store = new CloudWalletStore({
          apiKey: 'vtz_live_test123',
          baseUrl: `http://localhost:${slowServer.port}`,
          timeoutMs: 100, // 100ms timeout for test speed
        });

        try {
          await expect(
            store.getConsumption(
              'tenant',
              'tenant_abc',
              'prompt:create',
              new Date('2026-03-01'),
              new Date('2026-04-01'),
            ),
          ).rejects.toThrow();
        } finally {
          slowServer.stop(true);
        }
      });
    });
  });

  describe('Given dispose() is called', () => {
    describe('When calling dispose', () => {
      it('Then does not throw', () => {
        const store = new CloudWalletStore({
          apiKey: 'vtz_live_test123',
          baseUrl: 'http://localhost:9999',
        });
        expect(() => store.dispose()).not.toThrow();
      });
    });
  });
});
