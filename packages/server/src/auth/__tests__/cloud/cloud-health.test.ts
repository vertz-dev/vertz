import { afterEach, describe, expect, it } from '@vertz/test';
import type { Server } from 'bun';
import { type CloudHealthResult, checkCloudHealth } from '../../cloud/cloud-health';

let mockServer: Server | null = null;

afterEach(() => {
  if (mockServer) {
    mockServer.stop(true);
    mockServer = null;
  }
});

describe('Feature: Cloud health check', () => {
  describe('Given the cloud API is healthy', () => {
    describe('When calling checkCloudHealth()', () => {
      it('Then returns healthy status with latency', async () => {
        mockServer = Bun.serve({
          port: 0,
          fetch: () => new Response(JSON.stringify({ status: 'ok' }), { status: 200 }),
        });

        const result = await checkCloudHealth({
          apiKey: 'vtz_live_test',
          baseUrl: `http://localhost:${mockServer.port}`,
        });

        expect(result.status).toBe('healthy');
        expect(result.latencyMs).toBeGreaterThanOrEqual(0);
        expect(result.lastError).toBeUndefined();
      });
    });
  });

  describe('Given the cloud API is down', () => {
    describe('When calling checkCloudHealth()', () => {
      it('Then returns unhealthy status with error', async () => {
        mockServer = Bun.serve({
          port: 0,
          fetch: () => new Response('Service Unavailable', { status: 503 }),
        });

        const result = await checkCloudHealth({
          apiKey: 'vtz_live_test',
          baseUrl: `http://localhost:${mockServer.port}`,
        });

        expect(result.status).toBe('unhealthy');
        expect(result.lastError).toBeDefined();
      });
    });
  });

  describe('Given the cloud API times out', () => {
    describe('When calling checkCloudHealth()', () => {
      it('Then returns unhealthy status with timeout error', async () => {
        mockServer = Bun.serve({
          port: 0,
          fetch: async () => {
            await new Promise((resolve) => setTimeout(resolve, 5000));
            return new Response('{}');
          },
        });

        const result = await checkCloudHealth({
          apiKey: 'vtz_live_test',
          baseUrl: `http://localhost:${mockServer.port}`,
          timeoutMs: 50,
        });

        expect(result.status).toBe('unhealthy');
        expect(result.lastError).toBeDefined();
      });
    });
  });

  describe('Given the cloud API is unreachable', () => {
    describe('When calling checkCloudHealth()', () => {
      it('Then returns unhealthy status', async () => {
        const result = await checkCloudHealth({
          apiKey: 'vtz_live_test',
          baseUrl: 'http://localhost:1', // unlikely to be running
          timeoutMs: 100,
        });

        expect(result.status).toBe('unhealthy');
        expect(result.lastError).toBeDefined();
      });
    });
  });
});
