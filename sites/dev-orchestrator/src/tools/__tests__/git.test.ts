import { describe, expect, it, vi, beforeEach, mock } from '@vertz/test';
import type { ToolContext } from '@vertz/agents';
import { createGitProvider, gitStatus, gitCommit, gitPush, gitLog, gitCheckoutBranch } from '../git';
import type { SandboxClient } from '../../lib/sandbox-client';

const dummyCtx = { agentId: 'test', agentName: 'test' } as unknown as ToolContext;

function createMockClient(): SandboxClient {
  return {
    exec: mock().mockResolvedValue({ stdout: '', stderr: '', exitCode: 0 }),
    readFile: mock().mockResolvedValue(''),
    writeFile: mock().mockResolvedValue(undefined),
    searchFiles: mock().mockResolvedValue([]),
    listFiles: mock().mockResolvedValue([]),
    destroy: mock().mockResolvedValue(undefined),
  } as unknown as SandboxClient;
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

    it('Then gitCheckoutBranch is a tool declaration with kind "tool"', () => {
      expect(gitCheckoutBranch.kind).toBe('tool');
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
        const result = await provider.gitStatus({}, dummyCtx);

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
          { files: ['src/index.ts'], message: 'feat: add thing' }, dummyCtx,
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
        const result = await provider.gitPush({ branch: 'feat/auth' }, dummyCtx);

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
        const result = await provider.gitLog({ count: undefined }, dummyCtx);

        expect(result.commits).toHaveLength(2);
        expect(result.commits[0]).toEqual({
          sha: 'abc1234',
          message: 'feat: add auth',
        });
      });
    });

    describe('When gitCheckoutBranch handler is called', () => {
      it('Then creates and checks out a new branch', async () => {
        (client.exec as ReturnType<typeof vi.fn>)
          .mockResolvedValueOnce({ stdout: '', stderr: '', exitCode: 0 });

        const provider = createGitProvider(client);
        const result = await provider.gitCheckoutBranch({ branch: 'docs/issue-1748-design' }, dummyCtx);

        expect(result.success).toBe(true);
        const calls = (client.exec as ReturnType<typeof vi.fn>).mock.calls;
        expect(calls[0][0]).toBe("git checkout -b 'docs/issue-1748-design'");
      });

      it('Then returns success false when checkout fails', async () => {
        (client.exec as ReturnType<typeof vi.fn>)
          .mockResolvedValueOnce({ stdout: '', stderr: 'fatal: branch already exists', exitCode: 1 });

        const provider = createGitProvider(client);
        const result = await provider.gitCheckoutBranch({ branch: 'docs/issue-1748-design' }, dummyCtx);

        expect(result.success).toBe(false);
      });
    });
  });
});
