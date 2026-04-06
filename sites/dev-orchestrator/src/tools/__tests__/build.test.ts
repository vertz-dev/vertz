import { describe, expect, it, vi, beforeEach } from 'bun:test';
import { createBuildTools } from '../build';
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

  describe('Given build tools created with a sandbox client', () => {
    describe('When runTests handler is called', () => {
      it('Then executes vtz test and returns pass/fail with output', async () => {
        (client.exec as ReturnType<typeof vi.fn>)
          .mockResolvedValueOnce({
            stdout: 'Tests: 5 passed (5)',
            stderr: '',
            exitCode: 0,
          });

        const tools = createBuildTools(client);
        const result = await tools.runTests.handler!({ packages: undefined }, {} as any);

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

        const tools = createBuildTools(client);
        const result = await tools.runTests.handler!({ packages: undefined }, {} as any);

        expect(result.passed).toBe(false);
      });
    });

    describe('When runTypecheck handler is called', () => {
      it('Then executes typecheck and returns pass/fail', async () => {
        (client.exec as ReturnType<typeof vi.fn>)
          .mockResolvedValueOnce({ stdout: '', stderr: '', exitCode: 0 });

        const tools = createBuildTools(client);
        const result = await tools.runTypecheck.handler!({ packages: undefined }, {} as any);

        expect(result.passed).toBe(true);
      });
    });

    describe('When runLint handler is called', () => {
      it('Then executes lint and returns pass/fail', async () => {
        (client.exec as ReturnType<typeof vi.fn>)
          .mockResolvedValueOnce({ stdout: 'All clean', stderr: '', exitCode: 0 });

        const tools = createBuildTools(client);
        const result = await tools.runLint.handler!({ files: undefined }, {} as any);

        expect(result.passed).toBe(true);
        expect(result.output).toBe('All clean');
      });
    });
  });
});
