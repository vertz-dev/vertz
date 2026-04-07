import { describe, expect, it, vi, beforeEach } from 'bun:test';
import { createSandboxTools } from '../sandbox-tools';
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

  describe('Given sandbox tools created with a client', () => {
    describe('When readFile handler is called', () => {
      it('Then returns the file content', async () => {
        (client.readFile as ReturnType<typeof vi.fn>)
          .mockResolvedValueOnce('export const x = 1;');

        const tools = createSandboxTools(client);
        const result = await tools.readFile.handler!(
          { path: 'src/index.ts' },
          {} as any,
        );

        expect(result.content).toBe('export const x = 1;');
      });
    });

    describe('When writeFile handler is called', () => {
      it('Then writes the content and returns success', async () => {
        const tools = createSandboxTools(client);
        const result = await tools.writeFile.handler!(
          { path: 'src/new.ts', content: 'const y = 2;' },
          {} as any,
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

        const tools = createSandboxTools(client);
        const result = await tools.searchCode.handler!(
          { pattern: 'TODO', path: undefined },
          {} as any,
        );

        expect(result.matches).toHaveLength(1);
        expect(result.matches[0].file).toBe('src/a.ts');
      });
    });

    describe('When listFiles handler is called', () => {
      it('Then returns file list', async () => {
        (client.listFiles as ReturnType<typeof vi.fn>)
          .mockResolvedValueOnce(['index.ts', 'utils.ts']);

        const tools = createSandboxTools(client);
        const result = await tools.listFiles.handler!(
          { path: 'src/' },
          {} as any,
        );

        expect(result.files).toEqual(['index.ts', 'utils.ts']);
      });
    });
  });
});
