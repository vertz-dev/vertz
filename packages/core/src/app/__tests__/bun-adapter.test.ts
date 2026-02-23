import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createBunAdapter } from '../bun-adapter';

// Mock the global Bun.serve that the adapter depends on
const mockStop = vi.fn();
const mockServer = {
  port: 0,
  hostname: '',
  stop: mockStop,
};
const mockServe = vi.fn(() => mockServer);

beforeEach(() => {
  // Install the global Bun mock before each test
  (globalThis as Record<string, unknown>).Bun = { serve: mockServe };
});

afterEach(() => {
  vi.restoreAllMocks();
  mockServe.mockClear();
  mockStop.mockClear();
  // Clean up global
  delete (globalThis as Record<string, unknown>).Bun;
});

describe('createBunAdapter', () => {
  describe('listen', () => {
    it('passes the port and handler to Bun.serve', async () => {
      const adapter = createBunAdapter();
      const handler = vi.fn();

      mockServer.port = 4000;
      mockServer.hostname = 'localhost';

      await adapter.listen(4000, handler);

      expect(mockServe).toHaveBeenCalledOnce();
      const serveArg = mockServe.mock.calls[0][0];
      expect(serveArg.port).toBe(4000);
      expect(serveArg.fetch).toBe(handler);
    });

    it('passes hostname from options to Bun.serve', async () => {
      const adapter = createBunAdapter();
      const handler = vi.fn();

      mockServer.port = 3000;
      mockServer.hostname = '0.0.0.0';

      await adapter.listen(3000, handler, { hostname: '0.0.0.0' });

      const serveArg = mockServe.mock.calls[0][0];
      expect(serveArg.hostname).toBe('0.0.0.0');
    });

    it('passes undefined hostname when no options are provided', async () => {
      const adapter = createBunAdapter();
      const handler = vi.fn();

      mockServer.port = 3000;
      mockServer.hostname = 'localhost';

      await adapter.listen(3000, handler);

      const serveArg = mockServe.mock.calls[0][0];
      expect(serveArg.hostname).toBeUndefined();
    });

    it('passes undefined hostname when options exist but hostname is omitted', async () => {
      const adapter = createBunAdapter();
      const handler = vi.fn();

      mockServer.port = 3000;
      mockServer.hostname = 'localhost';

      await adapter.listen(3000, handler, {});

      const serveArg = mockServe.mock.calls[0][0];
      expect(serveArg.hostname).toBeUndefined();
    });

    it('returns a ServerHandle with the port from Bun.serve', async () => {
      const adapter = createBunAdapter();
      const handler = vi.fn();

      mockServer.port = 8080;
      mockServer.hostname = '127.0.0.1';

      const handle = await adapter.listen(8080, handler);

      expect(handle.port).toBe(8080);
    });

    it('returns a ServerHandle with the hostname from Bun.serve', async () => {
      const adapter = createBunAdapter();
      const handler = vi.fn();

      mockServer.port = 3000;
      mockServer.hostname = '127.0.0.1';

      const handle = await adapter.listen(3000, handler);

      expect(handle.hostname).toBe('127.0.0.1');
    });

    it('returns a ServerHandle whose close() stops the server with active connections closed', async () => {
      const adapter = createBunAdapter();
      const handler = vi.fn();

      mockServer.port = 3000;
      mockServer.hostname = 'localhost';

      const handle = await adapter.listen(3000, handler);

      expect(mockStop).not.toHaveBeenCalled();

      await handle.close();

      expect(mockStop).toHaveBeenCalledOnce();
      expect(mockStop).toHaveBeenCalledWith(true);
    });

    it('reflects the actual port Bun.serve binds to (e.g. when Bun picks a different port)', async () => {
      const adapter = createBunAdapter();
      const handler = vi.fn();

      // Simulate Bun picking a different port than requested (e.g. port 0 → random port)
      mockServer.port = 54321;
      mockServer.hostname = 'localhost';

      const handle = await adapter.listen(0, handler);

      expect(handle.port).toBe(54321);
    });
  });
});
