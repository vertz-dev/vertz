import { describe, expect, it, vi, beforeEach } from 'bun:test';
import { createGitProvider, gitStatus, gitCommit, gitPush, gitLog } from '../git';
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

describe('Feature: Git tools', () => {
  let client: SandboxClient;

  beforeEach(() => {
    client = createMockClient();
  });

  describe('Given git tool declarations', () => {
    it('Then gitStatus is a tool declaration with kind "tool"', () => {
      expect(gitStatus.kind).toBe('tool');
      expect(gitStatus.parallel).toBe(true);
    });

    it('Then gitCommit is a tool declaration with kind "tool"', () => {
      expect(gitCommit.kind).toBe('tool');
    });

    it('Then gitPush is a tool declaration with kind "tool"', () => {
      expect(gitPush.kind).toBe('tool');
    });

    it('Then gitLog is a tool declaration with kind "tool"', () => {
      expect(gitLog.kind).toBe('tool');
      expect(gitLog.parallel).toBe(true);
    });
  });

  describe('Given a git provider created with a sandbox client', () => {
    describe('When gitStatus handler is called', () => {
      it('Then returns modified and untracked files', async () => {
        (client.exec as ReturnType<typeof vi.fn>)
          .mockResolvedValueOnce({
            stdout: ' M src/index.ts\n?? src/new.ts\n',
            stderr: '',
            exitCode: 0,
          });

        const provider = createGitProvider(client);
        const result = await provider.gitStatus({});

        expect(result.modified).toEqual(['src/index.ts']);
        expect(result.untracked).toEqual(['src/new.ts']);
      });
    });

    describe('When gitCommit handler is called', () => {
      it('Then stages files and creates a commit', async () => {
        (client.exec as ReturnType<typeof vi.fn>)
          .mockResolvedValueOnce({ stdout: '', stderr: '', exitCode: 0 }) // git add
          .mockResolvedValueOnce({
            stdout: '[feat/x abc1234] feat: add thing',
            stderr: '',
            exitCode: 0,
          }); // git commit

        const provider = createGitProvider(client);
        const result = await provider.gitCommit(
          { files: ['src/index.ts'], message: 'feat: add thing' },
        );

        expect(result.sha).toBe('abc1234');
        const calls = (client.exec as ReturnType<typeof vi.fn>).mock.calls;
        expect(calls[0][0]).toBe("git add 'src/index.ts'");
      });
    });

    describe('When gitPush handler is called', () => {
      it('Then pushes to the remote', async () => {
        (client.exec as ReturnType<typeof vi.fn>)
          .mockResolvedValueOnce({ stdout: '', stderr: '', exitCode: 0 });

        const provider = createGitProvider(client);
        const result = await provider.gitPush({ branch: 'feat/auth' });

        expect(result.success).toBe(true);
        const calls = (client.exec as ReturnType<typeof vi.fn>).mock.calls;
        expect(calls[0][0]).toBe("git push -u origin 'feat/auth'");
      });
    });

    describe('When gitLog handler is called', () => {
      it('Then returns recent commits', async () => {
        (client.exec as ReturnType<typeof vi.fn>)
          .mockResolvedValueOnce({
            stdout: 'abc1234 feat: add auth\ndef5678 fix: typo\n',
            stderr: '',
            exitCode: 0,
          });

        const provider = createGitProvider(client);
        const result = await provider.gitLog({ count: undefined });

        expect(result.commits).toHaveLength(2);
        expect(result.commits[0]).toEqual({
          sha: 'abc1234',
          message: 'feat: add auth',
        });
      });
    });
  });
});
