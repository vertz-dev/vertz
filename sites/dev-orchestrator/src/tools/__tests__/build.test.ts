import { describe, expect, it, vi, beforeEach } from 'bun:test';
import { createBuildProvider, runTests, runTypecheck, runLint } from '../build';
import type { SandboxClient } from '../../lib/sandbox-client';

function createMockClient(): SandboxClient {
  return {
    exec: vi.fn().mockResolvedValue({ stdout: '', stderr: '', exitCode: 0 }),
    readFile: vi.fn().mockResolvedValue(''),
    writeFile: vi.fn().mockResolvedValue(undefined),
    searchFiles: vi.fn().mockResolvedValue([]),
    listFiles: vi.fn().mockResolvedValue([]),
    destroy: vi.fn().mockResolvedValue(undefined),
  };
}

describe('Feature: Build tools', () => {
  let client: SandboxClient;

  beforeEach(() => {
    client = createMockClient();
  });

  describe('Given build tool declarations', () => {
    it('Then runTests is a tool declaration with kind "tool"', () => {
      expect(runTests.kind).toBe('tool');
    });

    it('Then runTypecheck is a tool declaration with kind "tool"', () => {
      expect(runTypecheck.kind).toBe('tool');
    });

    it('Then runLint is a tool declaration with kind "tool"', () => {
      expect(runLint.kind).toBe('tool');
    });
  });

  describe('Given a build provider created with a sandbox client', () => {
    describe('When runTests handler is called', () => {
      it('Then executes vtz test and returns pass/fail with output', async () => {
        (client.exec as ReturnType<typeof vi.fn>)
          .mockResolvedValueOnce({
            stdout: 'Tests: 5 passed (5)',
            stderr: '',
            exitCode: 0,
          });

        const provider = createBuildProvider(client);
        const result = await provider.runTests({ packages: undefined });

        expect(result.passed).toBe(true);
        expect(result.output).toContain('5 passed');
      });

      it('Then returns failed when exit code is non-zero', async () => {
        (client.exec as ReturnType<typeof vi.fn>)
          .mockResolvedValueOnce({
            stdout: 'FAIL: 1 test failed',
            stderr: '',
            exitCode: 1,
          });

        const provider = createBuildProvider(client);
        const result = await provider.runTests({ packages: undefined });

        expect(result.passed).toBe(false);
      });
    });

    describe('When runTypecheck handler is called', () => {
      it('Then executes typecheck and returns pass/fail', async () => {
        (client.exec as ReturnType<typeof vi.fn>)
          .mockResolvedValueOnce({ stdout: '', stderr: '', exitCode: 0 });

        const provider = createBuildProvider(client);
        const result = await provider.runTypecheck({ packages: undefined });

        expect(result.passed).toBe(true);
      });
    });

    describe('When runLint handler is called', () => {
      it('Then executes lint and returns pass/fail', async () => {
        (client.exec as ReturnType<typeof vi.fn>)
          .mockResolvedValueOnce({ stdout: 'All clean', stderr: '', exitCode: 0 });

        const provider = createBuildProvider(client);
        const result = await provider.runLint({ files: undefined });

        expect(result.passed).toBe(true);
        expect(result.output).toBe('All clean');
      });
    });
  });
});
