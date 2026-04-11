import { afterEach, beforeEach, describe, expect, it, mock } from '@vertz/test';
import { createVtzAdapter } from '../vtz-adapter';

// Types matching globalThis.__vtz_http shape from the Rust bootstrap JS
type VtzServeResult = {
  id: number;
  port: number;
  hostname: string;
  close(): void;
};

type VtzHttpServe = (
  port: number,
  hostname: string,
  handler: (request: Request) => Promise<Response>,
) => Promise<VtzServeResult>;

// Mock server returned by __vtz_http.serve()
const mockClose = mock<() => void>(() => {});
const mockServer: VtzServeResult = {
  id: 1,
  port: 0,
  hostname: '',
  close: mockClose,
};
const mockServe = mock<VtzHttpServe>(async () => mockServer);

// Save and restore original
const originalVtzHttp = (globalThis as Record<string, unknown>).__vtz_http;

beforeEach(() => {
  (globalThis as Record<string, unknown>).__vtz_http = { serve: mockServe };
});

afterEach(() => {
  mockServe.mockClear();
  mockClose.mockClear();
  if (originalVtzHttp !== undefined) {
    (globalThis as Record<string, unknown>).__vtz_http = originalVtzHttp;
  } else {
    delete (globalThis as Record<string, unknown>).__vtz_http;
  }
});

describe('createVtzAdapter', () => {
  describe('listen', () => {
    it('passes port and handler to __vtz_http.serve', async () => {
      const adapter = createVtzAdapter();
      const handler = mock(async () => new Response());

      mockServer.port = 4000;
      mockServer.hostname = '127.0.0.1';

      await adapter.listen(4000, handler);

      expect(mockServe).toHaveBeenCalledTimes(1);
      const args = mockServe.mock.calls[0];
      expect(args?.[0]).toBe(4000);
      expect(args?.[2]).toBe(handler);
    });

    it('passes hostname from options to __vtz_http.serve', async () => {
      const adapter = createVtzAdapter();
      const handler = mock(async () => new Response());

      mockServer.port = 3000;
      mockServer.hostname = '0.0.0.0';

      await adapter.listen(3000, handler, { hostname: '0.0.0.0' });

      const args = mockServe.mock.calls[0];
      expect(args?.[1]).toBe('0.0.0.0');
    });

    it('defaults hostname to 0.0.0.0 when no options are provided', async () => {
      const adapter = createVtzAdapter();
      const handler = mock(async () => new Response());

      mockServer.port = 3000;
      mockServer.hostname = '0.0.0.0';

      await adapter.listen(3000, handler);

      const args = mockServe.mock.calls[0];
      expect(args?.[1]).toBe('0.0.0.0');
    });

    it('defaults hostname to 0.0.0.0 when options exist but hostname is omitted', async () => {
      const adapter = createVtzAdapter();
      const handler = mock(async () => new Response());

      mockServer.port = 3000;
      mockServer.hostname = '0.0.0.0';

      await adapter.listen(3000, handler, {});

      const args = mockServe.mock.calls[0];
      expect(args?.[1]).toBe('0.0.0.0');
    });

    it('returns a ServerHandle with port and hostname from the server', async () => {
      const adapter = createVtzAdapter();
      const handler = mock(async () => new Response());

      mockServer.port = 54321;
      mockServer.hostname = '192.168.1.100';

      const handle = await adapter.listen(0, handler);

      expect(handle.port).toBe(54321);
      expect(handle.hostname).toBe('192.168.1.100');
    });

    it('returns a ServerHandle whose close() calls server.close()', async () => {
      const adapter = createVtzAdapter();
      const handler = mock(async () => new Response());

      mockServer.port = 3000;
      mockServer.hostname = '127.0.0.1';

      const handle = await adapter.listen(3000, handler);

      expect(mockClose).not.toHaveBeenCalled();

      await handle.close();

      expect(mockClose).toHaveBeenCalledTimes(1);
    });

    it('propagates errors from __vtz_http.serve to the caller', async () => {
      const adapter = createVtzAdapter();
      const handler = mock(async () => new Response());

      mockServe.mockImplementationOnce(async () => {
        throw new Error('Failed to bind 0.0.0.0:3000');
      });

      await expect(adapter.listen(3000, handler)).rejects.toThrow('Failed to bind 0.0.0.0:3000');
    });
  });
});
