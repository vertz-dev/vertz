import { afterEach, beforeEach, describe, expect, it, vi } from 'bun:test';
import { docsBuildCommand, docsDevCommand, docsInitCommand } from '../docs';

const mockDocsInitAction = vi.fn();
const mockDocsBuildAction = vi.fn();
const mockLoadDocsConfig = vi.fn();

vi.mock('@vertz/docs-framework', () => ({
  docsInitAction: (...args: unknown[]) => mockDocsInitAction(...args),
  docsBuildAction: (...args: unknown[]) => mockDocsBuildAction(...args),
  loadDocsConfig: (...args: unknown[]) => mockLoadDocsConfig(...args),
}));

beforeEach(() => {
  mockDocsInitAction.mockClear();
  mockDocsBuildAction.mockClear();
  mockLoadDocsConfig.mockClear();
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
  it('returns err because dev server is not yet implemented', async () => {
    mockLoadDocsConfig.mockResolvedValue({});

    const result = await docsDevCommand();

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toContain('not yet implemented');
      expect(result.error.message).toContain('3001');
      expect(result.error.message).toContain('localhost');
    }
  });

  it('uses custom port and host in error message', async () => {
    mockLoadDocsConfig.mockResolvedValue({});

    const result = await docsDevCommand({ port: 4000, host: '0.0.0.0' });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toContain('4000');
      expect(result.error.message).toContain('0.0.0.0');
    }
  });

  it('returns err when config loading fails', async () => {
    mockLoadDocsConfig.mockRejectedValue(new Error('config not found'));

    const result = await docsDevCommand();

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toBe('config not found');
    }
  });
});
