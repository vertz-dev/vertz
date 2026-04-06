import { tool } from '@vertz/agents';
import { s } from '@vertz/schema';
import type { SandboxClient } from '../lib/sandbox-client';

export function createGitTools(sandbox: SandboxClient) {
  const gitStatus = tool({
    description: 'Show git status in the sandbox',
    input: s.object({}),
    output: s.object({
      modified: s.array(s.string()),
      untracked: s.array(s.string()),
    }),
    parallel: true,
    async handler() {
      const result = await sandbox.exec('git status --porcelain');
      const modified: string[] = [];
      const untracked: string[] = [];

      for (const line of result.stdout.split('\n')) {
        if (!line.trim()) continue;
        const status = line.slice(0, 2);
        const file = line.slice(3).trim();
        if (status === '??') {
          untracked.push(file);
        } else {
          modified.push(file);
        }
      }

      return { modified, untracked };
    },
  });

  const gitCommit = tool({
    description: 'Stage files and create a git commit in the sandbox',
    input: s.object({
      files: s.array(s.string()),
      message: s.string(),
    }),
    output: s.object({ sha: s.string() }),
    async handler({ files, message }) {
      await sandbox.exec(`git add ${files.join(' ')}`);
      const result = await sandbox.exec(`git commit -m "${message}"`);
      const match = result.stdout.match(/\[[\w/]+ ([a-f0-9]+)\]/);
      return { sha: match?.[1] ?? 'unknown' };
    },
  });

  const gitPush = tool({
    description: 'Push commits to the remote in the sandbox',
    input: s.object({ branch: s.string() }),
    output: s.object({ success: s.boolean() }),
    async handler({ branch }) {
      const result = await sandbox.exec(`git push -u origin ${branch}`);
      return { success: result.exitCode === 0 };
    },
  });

  const gitLog = tool({
    description: 'Show recent git commits in the sandbox',
    input: s.object({
      count: s.number().optional(),
    }),
    output: s.object({
      commits: s.array(s.object({
        sha: s.string(),
        message: s.string(),
      })),
    }),
    parallel: true,
    async handler({ count }) {
      const result = await sandbox.exec(
        `git log --oneline -n ${count ?? 10}`,
      );
      const commits = result.stdout
        .split('\n')
        .filter((l) => l.trim())
        .map((line) => {
          const spaceIdx = line.indexOf(' ');
          return {
            sha: line.slice(0, spaceIdx),
            message: line.slice(spaceIdx + 1),
          };
        });
      return { commits };
    },
  });

  return { gitStatus, gitCommit, gitPush, gitLog };
}
