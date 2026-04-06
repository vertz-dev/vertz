import { describe, expect, it, vi, beforeEach } from 'bun:test';
import { wrapSandbox, type DaytonaSandbox } from '../sandbox-client';

function createMockSandbox(): DaytonaSandbox {
  return {
    process: {
      executeCommand: vi.fn().mockResolvedValue({ result: '', exitCode: 0 }),
    },
    fs: {
      downloadFile: vi.fn().mockResolvedValue(Buffer.from('')),
      uploadFile: vi.fn().mockResolvedValue(undefined),
      findFiles: vi.fn().mockResolvedValue([]),
      listFiles: vi.fn().mockResolvedValue([]),
    },
    delete: vi.fn().mockResolvedValue(undefined),
  };
}

describe('Feature: Sandbox client', () => {
  let mockSandbox: DaytonaSandbox;

  beforeEach(() => {
    mockSandbox = createMockSandbox();
  });

  describe('Given a wrapped sandbox', () => {
    describe('When exec is called with a shell command', () => {
      it('Then returns stdout, stderr, and exitCode', async () => {
        (mockSandbox.process.executeCommand as ReturnType<typeof vi.fn>)
          .mockResolvedValueOnce({ result: 'hello world', exitCode: 0 });

        const client = wrapSandbox(mockSandbox);
        const result = await client.exec('echo hello world');

        expect(result.stdout).toBe('hello world');
        expect(result.stderr).toBe('');
        expect(result.exitCode).toBe(0);
      });

      it('Then delegates to the default work directory', async () => {
        (mockSandbox.process.executeCommand as ReturnType<typeof vi.fn>)
          .mockResolvedValueOnce({ result: '', exitCode: 0 });

        const client = wrapSandbox(mockSandbox);
        await client.exec('ls');

        expect(mockSandbox.process.executeCommand).toHaveBeenCalledWith(
          'ls',
          '/home/daytona/workspace',
          undefined,
          undefined,
        );
      });

      it('Then uses the custom workDir when provided', async () => {
        (mockSandbox.process.executeCommand as ReturnType<typeof vi.fn>)
          .mockResolvedValueOnce({ result: '', exitCode: 0 });

        const client = wrapSandbox(mockSandbox);
        await client.exec('ls', { workDir: '/tmp' });

        expect(mockSandbox.process.executeCommand).toHaveBeenCalledWith(
          'ls',
          '/tmp',
          undefined,
          undefined,
        );
      });

      it('Then passes the timeout to the sandbox', async () => {
        (mockSandbox.process.executeCommand as ReturnType<typeof vi.fn>)
          .mockResolvedValueOnce({ result: '', exitCode: 0 });

        const client = wrapSandbox(mockSandbox);
        await client.exec('long-cmd', { timeout: 60 });

        expect(mockSandbox.process.executeCommand).toHaveBeenCalledWith(
          'long-cmd',
          '/home/daytona/workspace',
          undefined,
          60,
        );
      });
    });

    describe('When readFile is called', () => {
      it('Then returns the file content as a string', async () => {
        (mockSandbox.fs.downloadFile as ReturnType<typeof vi.fn>)
          .mockResolvedValueOnce(Buffer.from('file content here'));

        const client = wrapSandbox(mockSandbox);
        const content = await client.readFile('src/index.ts');

        expect(content).toBe('file content here');
        expect(mockSandbox.fs.downloadFile).toHaveBeenCalledWith('src/index.ts');
      });
    });

    describe('When writeFile is called', () => {
      it('Then uploads the content as a Buffer', async () => {
        const client = wrapSandbox(mockSandbox);
        await client.writeFile('src/new.ts', 'export const x = 1;');

        expect(mockSandbox.fs.uploadFile).toHaveBeenCalledWith(
          Buffer.from('export const x = 1;'),
          'src/new.ts',
        );
      });
    });

    describe('When readFile and writeFile are used together', () => {
      it('Then files persist across operations', async () => {
        const stored = new Map<string, string>();

        (mockSandbox.fs.uploadFile as ReturnType<typeof vi.fn>)
          .mockImplementation(async (content: Buffer, path: string) => {
            stored.set(path, content.toString());
          });
        (mockSandbox.fs.downloadFile as ReturnType<typeof vi.fn>)
          .mockImplementation(async (path: string) => {
            return Buffer.from(stored.get(path) ?? '');
          });

        const client = wrapSandbox(mockSandbox);

        await client.writeFile('test.txt', 'persisted data');
        const readBack = await client.readFile('test.txt');

        expect(readBack).toBe('persisted data');
      });
    });

    describe('When searchFiles is called', () => {
      it('Then returns matching files with line numbers', async () => {
        (mockSandbox.fs.findFiles as ReturnType<typeof vi.fn>)
          .mockResolvedValueOnce([
            { file: 'src/index.ts', line: 5, content: 'const TODO = true;' },
            { file: 'src/utils.ts', line: 12, content: '// TODO: fix this' },
          ]);

        const client = wrapSandbox(mockSandbox);
        const results = await client.searchFiles('TODO');

        expect(results).toHaveLength(2);
        expect(results[0]).toEqual({
          file: 'src/index.ts',
          line: 5,
          content: 'const TODO = true;',
        });
        expect(results[1]).toEqual({
          file: 'src/utils.ts',
          line: 12,
          content: '// TODO: fix this',
        });
      });

      it('Then uses the default work directory when no path is provided', async () => {
        (mockSandbox.fs.findFiles as ReturnType<typeof vi.fn>)
          .mockResolvedValueOnce([]);

        const client = wrapSandbox(mockSandbox);
        await client.searchFiles('pattern');

        expect(mockSandbox.fs.findFiles).toHaveBeenCalledWith(
          '/home/daytona/workspace',
          'pattern',
        );
      });

      it('Then uses the custom path when provided', async () => {
        (mockSandbox.fs.findFiles as ReturnType<typeof vi.fn>)
          .mockResolvedValueOnce([]);

        const client = wrapSandbox(mockSandbox);
        await client.searchFiles('pattern', 'src/lib');

        expect(mockSandbox.fs.findFiles).toHaveBeenCalledWith('src/lib', 'pattern');
      });
    });

    describe('When listFiles is called', () => {
      it('Then returns file names from the directory', async () => {
        (mockSandbox.fs.listFiles as ReturnType<typeof vi.fn>)
          .mockResolvedValueOnce([
            { name: 'index.ts' },
            { name: 'utils.ts' },
            { name: 'types.ts' },
          ]);

        const client = wrapSandbox(mockSandbox);
        const files = await client.listFiles('src/');

        expect(files).toEqual(['index.ts', 'utils.ts', 'types.ts']);
        expect(mockSandbox.fs.listFiles).toHaveBeenCalledWith('src/');
      });
    });

    describe('When destroy is called', () => {
      it('Then deletes the sandbox', async () => {
        const client = wrapSandbox(mockSandbox);
        await client.destroy();

        expect(mockSandbox.delete).toHaveBeenCalledTimes(1);
      });
    });
  });
});
