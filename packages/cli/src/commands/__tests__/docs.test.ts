import { afterEach, beforeEach, describe, expect, it, vi } from '@vertz/test';
import { docsBuildCommand, docsDevCommand, docsInitCommand } from '../docs';

const mockDocsInitAction = vi.fn();
const mockDocsBuildAction = vi.fn();
const mockDocsDevAction = vi.fn();

vi.mock('@vertz/docs', () => ({
  docsInitAction: (...args: unknown[]) => mockDocsInitAction(...args),
  docsBuildAction: (...args: unknown[]) => mockDocsBuildAction(...args),
  docsDevAction: (...args: unknown[]) => mockDocsDevAction(...args),
}));

beforeEach(() => {
  mockDocsInitAction.mockClear();
  mockDocsBuildAction.mockClear();
  mockDocsDevAction.mockClear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('docsInitCommand', () => {
  it('returns ok when docsInitAction succeeds', async () => {
    mockDocsInitAction.mockResolvedValue({ ok: true, data: undefined });
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    const result = await docsInitCommand();

    expect(result.ok).toBe(true);
    expect(mockDocsInitAction).toHaveBeenCalledWith({
      projectDir: expect.stringContaining('/'),
    });
    expect(consoleSpy).toHaveBeenCalledWith('Docs project initialized successfully.');
    consoleSpy.mockRestore();
  });

  it('resolves dir option relative to cwd', async () => {
    mockDocsInitAction.mockResolvedValue({ ok: true, data: undefined });
    vi.spyOn(console, 'log').mockImplementation(() => {});

    await docsInitCommand({ dir: 'my-docs' });

    const call = mockDocsInitAction.mock.calls[0];
    expect(call[0].projectDir).toMatch(/my-docs$/);
  });

  it('returns err when docsInitAction fails', async () => {
    const error = new Error('init failed');
    mockDocsInitAction.mockResolvedValue({ ok: false, error });

    const result = await docsInitCommand();

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toBe('init failed');
    }
  });

  it('returns err when import throws', async () => {
    mockDocsInitAction.mockRejectedValue(new Error('module not found'));

    const result = await docsInitCommand();

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toBe('module not found');
    }
  });
});

describe('docsBuildCommand', () => {
  it('returns ok when docsBuildAction succeeds', async () => {
    mockDocsBuildAction.mockResolvedValue({ ok: true, data: undefined });
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    const result = await docsBuildCommand();

    expect(result.ok).toBe(true);
    expect(consoleSpy).toHaveBeenCalledWith('Docs built successfully.');
    consoleSpy.mockRestore();
  });

  it('passes output and baseUrl options', async () => {
    mockDocsBuildAction.mockResolvedValue({ ok: true, data: undefined });
    vi.spyOn(console, 'log').mockImplementation(() => {});

    await docsBuildCommand({ output: 'dist/docs', baseUrl: '/docs' });

    const call = mockDocsBuildAction.mock.calls[0];
    expect(call[0].outputDir).toMatch(/dist\/docs$/);
    expect(call[0].baseUrl).toBe('/docs');
  });

  it('returns err when docsBuildAction fails', async () => {
    const error = new Error('build failed');
    mockDocsBuildAction.mockResolvedValue({ ok: false, error });

    const result = await docsBuildCommand();

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toBe('build failed');
    }
  });
});

describe('docsDevCommand', () => {
  it('calls docsDevAction with project dir, port, and host', async () => {
    const mockServer = { port: 3001, hostname: 'localhost', stop: vi.fn() };
    mockDocsDevAction.mockResolvedValue({ ok: true, data: mockServer });
    vi.spyOn(console, 'log').mockImplementation(() => {});

    // docsDevCommand waits for SIGINT/SIGTERM, so we need to emit it
    const promise = docsDevCommand();
    // Give it a tick to register signal handlers, then send SIGINT
    await new Promise((r) => setTimeout(r, 10));
    process.emit('SIGINT');

    const result = await promise;
    expect(result.ok).toBe(true);
    expect(mockDocsDevAction).toHaveBeenCalledWith({
      projectDir: expect.stringContaining('/'),
      port: 3001,
      host: 'localhost',
    });
    expect(mockServer.stop).toHaveBeenCalled();
  });

  it('passes custom port and host', async () => {
    const mockServer = { port: 4000, hostname: '0.0.0.0', stop: vi.fn() };
    mockDocsDevAction.mockResolvedValue({ ok: true, data: mockServer });
    vi.spyOn(console, 'log').mockImplementation(() => {});

    const promise = docsDevCommand({ port: 4000, host: '0.0.0.0' });
    await new Promise((r) => setTimeout(r, 10));
    process.emit('SIGINT');

    await promise;
    expect(mockDocsDevAction).toHaveBeenCalledWith({
      projectDir: expect.stringContaining('/'),
      port: 4000,
      host: '0.0.0.0',
    });
  });

  it('returns err when docsDevAction fails', async () => {
    const error = new Error('config not found');
    mockDocsDevAction.mockResolvedValue({ ok: false, error });

    const result = await docsDevCommand();

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toBe('config not found');
    }
  });
});
