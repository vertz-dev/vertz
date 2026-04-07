import { describe, expect, it, vi, beforeEach } from 'bun:test';
import { createSandboxProvider, readFile, writeFile, searchCode, listFiles } from '../sandbox-tools';
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

describe('Feature: Sandbox tools', () => {
  let client: SandboxClient;

  beforeEach(() => {
    client = createMockClient();
  });

  describe('Given sandbox tool declarations', () => {
    it('Then readFile is a tool declaration with kind "tool"', () => {
      expect(readFile.kind).toBe('tool');
      expect(readFile.parallel).toBe(true);
    });

    it('Then writeFile is a tool declaration with kind "tool"', () => {
      expect(writeFile.kind).toBe('tool');
    });

    it('Then searchCode is a tool declaration with kind "tool"', () => {
      expect(searchCode.kind).toBe('tool');
      expect(searchCode.parallel).toBe(true);
    });

    it('Then listFiles is a tool declaration with kind "tool"', () => {
      expect(listFiles.kind).toBe('tool');
      expect(listFiles.parallel).toBe(true);
    });
  });

  describe('Given a sandbox provider created with a client', () => {
    describe('When readFile handler is called', () => {
      it('Then returns the file content', async () => {
        (client.readFile as ReturnType<typeof vi.fn>)
          .mockResolvedValueOnce('export const x = 1;');

        const provider = createSandboxProvider(client);
        const result = await provider.readFile({ path: 'src/index.ts' });

        expect(result.content).toBe('export const x = 1;');
      });
    });

    describe('When writeFile handler is called', () => {
      it('Then writes the content and returns success', async () => {
        const provider = createSandboxProvider(client);
        const result = await provider.writeFile(
          { path: 'src/new.ts', content: 'const y = 2;' },
        );

        expect(result.success).toBe(true);
        expect(client.writeFile).toHaveBeenCalledWith('src/new.ts', 'const y = 2;');
      });
    });

    describe('When searchCode handler is called', () => {
      it('Then returns matching results', async () => {
        (client.searchFiles as ReturnType<typeof vi.fn>)
          .mockResolvedValueOnce([
            { file: 'src/a.ts', line: 3, content: 'TODO: fix' },
          ]);

        const provider = createSandboxProvider(client);
        const result = await provider.searchCode(
          { pattern: 'TODO', path: undefined },
        );

        expect(result.matches).toHaveLength(1);
        expect(result.matches[0].file).toBe('src/a.ts');
      });
    });

    describe('When listFiles handler is called', () => {
      it('Then returns file list', async () => {
        (client.listFiles as ReturnType<typeof vi.fn>)
          .mockResolvedValueOnce(['index.ts', 'utils.ts']);

        const provider = createSandboxProvider(client);
        const result = await provider.listFiles({ path: 'src/' });

        expect(result.files).toEqual(['index.ts', 'utils.ts']);
      });
    });
  });
});
