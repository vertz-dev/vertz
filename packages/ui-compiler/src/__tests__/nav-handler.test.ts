import type { Plugin, ViteDevServer } from 'vite';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { handleNavRequest } from '../nav-handler';
import vertzPlugin from '../vite-plugin';

// ─── Helpers ───────────────────────────────────────────────────

/** Get the virtual module loader for a given ID. */
function callLoad(plugin: Plugin, id: string): string | undefined {
  const load = plugin.load as (id: string) => string | undefined;
  return load?.call(plugin, id);
}

// ─── discoverQueries codegen ──────────────────────────────────

describe('SSR entry discoverQueries export', () => {
  it('should include discoverQueries export in generated SSR entry', () => {
    const plugin = vertzPlugin({ ssr: true }) as Plugin;
    const code = callLoad(plugin, '\0vertz:ssr-entry');
    expect(code).toBeDefined();
    expect(code).toContain('export async function discoverQueries');
  });

  it('should call createApp() only once in discoverQueries (no Pass 2)', () => {
    const plugin = vertzPlugin({ ssr: true }) as Plugin;
    const code = callLoad(plugin, '\0vertz:ssr-entry') ?? '';
    // Extract only the discoverQueries function body
    const discoverStart = code.indexOf('export async function discoverQueries');
    expect(discoverStart).toBeGreaterThan(-1);
    const discoverSection = code.slice(discoverStart);
    const createAppCalls = discoverSection.match(/createApp\(\)/g);
    expect(createAppCalls).toHaveLength(1);
  });

  it('should return { resolved: [...] } from discoverQueries', () => {
    const plugin = vertzPlugin({ ssr: true }) as Plugin;
    const code = callLoad(plugin, '\0vertz:ssr-entry') ?? '';
    const discoverStart = code.indexOf('export async function discoverQueries');
    const discoverSection = code.slice(discoverStart);
    expect(discoverSection).toContain('return {');
    expect(discoverSection).toContain('resolved:');
  });
});

// ─── Nav handler ──────────────────────────────────────────────

function createMockReq(overrides: Record<string, unknown> = {}) {
  return {
    url: '/tasks',
    headers: {} as Record<string, string>,
    ...overrides,
  } as unknown as import('node:http').IncomingMessage;
}

function createMockRes() {
  const writes: string[] = [];
  return {
    writeHead: vi.fn(),
    write: vi.fn((chunk: string) => {
      writes.push(chunk);
      return true;
    }),
    end: vi.fn(),
    _writes: writes,
  } as unknown as import('node:http').ServerResponse & { _writes: string[] };
}

function createMockServer(
  discoverResult: { resolved: Array<{ key: string; data: unknown }> } = { resolved: [] },
) {
  const moduleGraph = {
    getModuleById: vi.fn().mockReturnValue(null),
    invalidateModule: vi.fn(),
  };
  return {
    moduleGraph,
    ssrLoadModule: vi.fn().mockResolvedValue({
      discoverQueries: vi.fn().mockResolvedValue(discoverResult),
    }),
    ssrFixStacktrace: vi.fn(),
  } as unknown as ViteDevServer;
}

describe('handleNavRequest', () => {
  it('should call next() for requests without X-Vertz-Nav header', async () => {
    const req = createMockReq();
    const res = createMockRes();
    const next = vi.fn();
    const server = createMockServer();

    await handleNavRequest(req, res, next, server);

    expect(next).toHaveBeenCalled();
    expect(res.writeHead).not.toHaveBeenCalled();
  });

  it('should respond with text/event-stream content type', async () => {
    const req = createMockReq({ headers: { 'x-vertz-nav': '1' } });
    const res = createMockRes();
    const next = vi.fn();
    const server = createMockServer();

    await handleNavRequest(req, res, next, server);

    expect(res.writeHead).toHaveBeenCalledWith(
      200,
      expect.objectContaining({
        'Content-Type': 'text/event-stream',
      }),
    );
  });

  it('should stream resolved query data as SSE events', async () => {
    const req = createMockReq({ headers: { 'x-vertz-nav': '1' } });
    const res = createMockRes();
    const next = vi.fn();
    const server = createMockServer({
      resolved: [{ key: 'task-list', data: { items: [{ id: 1 }] } }],
    });

    await handleNavRequest(req, res, next, server);

    const output = res._writes.join('');
    expect(output).toContain('event: data');
    expect(output).toContain('"key":"task-list"');
    expect(output).toContain('"items"');
  });

  it('should send done event after all data events', async () => {
    const req = createMockReq({ headers: { 'x-vertz-nav': '1' } });
    const res = createMockRes();
    const next = vi.fn();
    const server = createMockServer({
      resolved: [{ key: 'q1', data: 'v1' }],
    });

    await handleNavRequest(req, res, next, server);

    const output = res._writes.join('');
    expect(output).toContain('event: done');
    expect(res.end).toHaveBeenCalled();
    // done should come after data
    const dataIdx = output.indexOf('event: data');
    const doneIdx = output.indexOf('event: done');
    expect(doneIdx).toBeGreaterThan(dataIdx);
  });

  it('should send done event even when SSR entry throws', async () => {
    const req = createMockReq({ headers: { 'x-vertz-nav': '1' } });
    const res = createMockRes();
    const next = vi.fn();
    const server = {
      moduleGraph: {
        getModuleById: vi.fn().mockReturnValue(null),
        invalidateModule: vi.fn(),
      },
      ssrLoadModule: vi.fn().mockRejectedValue(new Error('SSR crash')),
      ssrFixStacktrace: vi.fn(),
    } as unknown as ViteDevServer;

    await handleNavRequest(req, res, next, server);

    const output = res._writes.join('');
    expect(output).toContain('event: done');
    expect(res.end).toHaveBeenCalled();
  });

  it('should escape data with safeSerialize to prevent injection', async () => {
    const req = createMockReq({ headers: { 'x-vertz-nav': '1' } });
    const res = createMockRes();
    const next = vi.fn();
    const server = createMockServer({
      resolved: [{ key: 'xss', data: { html: '</script><script>alert(1)</script>' } }],
    });

    await handleNavRequest(req, res, next, server);

    const output = res._writes.join('');
    // Should NOT contain raw </script> — must be escaped
    expect(output).not.toContain('</script>');
    expect(output).toContain('\\u003c');
  });

  it('should invalidate SSR module tree before loading entry', async () => {
    const req = createMockReq({ headers: { 'x-vertz-nav': '1' } });
    const res = createMockRes();
    const next = vi.fn();

    const mockMod = {
      id: '\0vertz:ssr-entry',
      ssrImportedModules: new Set(),
    };
    const server = {
      moduleGraph: {
        getModuleById: vi.fn().mockReturnValue(mockMod),
        invalidateModule: vi.fn(),
      },
      ssrLoadModule: vi.fn().mockResolvedValue({
        discoverQueries: vi.fn().mockResolvedValue({ resolved: [] }),
      }),
      ssrFixStacktrace: vi.fn(),
    } as unknown as ViteDevServer;

    await handleNavRequest(req, res, next, server);

    expect(server.moduleGraph.invalidateModule).toHaveBeenCalledWith(mockMod);
  });

  it('should send empty done event when no queries exist', async () => {
    const req = createMockReq({ headers: { 'x-vertz-nav': '1' } });
    const res = createMockRes();
    const next = vi.fn();
    const server = createMockServer({ resolved: [] });

    await handleNavRequest(req, res, next, server);

    const output = res._writes.join('');
    expect(output).not.toContain('event: data');
    expect(output).toContain('event: done');
    expect(res.end).toHaveBeenCalled();
  });
});
