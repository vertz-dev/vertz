import { tool } from '@vertz/agents';
import type { InferToolProvider } from '@vertz/agents';
import { s } from '@vertz/schema';
import type { SandboxClient } from '../lib/sandbox-client';

// ---------------------------------------------------------------------------
// Tool declarations
// ---------------------------------------------------------------------------

export const gitStatus = tool({
  description: 'Show git status in the sandbox',
  input: s.object({}),
  output: s.object({
    modified: s.array(s.string()),
    untracked: s.array(s.string()),
  }),
  parallel: true,
});

export const gitCommit = tool({
  description: 'Stage files and create a git commit in the sandbox',
  input: s.object({
    files: s.array(s.string()),
    message: s.string(),
  }),
  output: s.object({ sha: s.string() }),
});

export const gitPush = tool({
  description: 'Push commits to the remote in the sandbox',
  input: s.object({ branch: s.string() }),
  output: s.object({ success: s.boolean() }),
});

export const gitLog = tool({
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
});

export const gitCheckoutBranch = tool({
  description: 'Create and checkout a new branch in the sandbox',
  input: s.object({ branch: s.string() }),
  output: s.object({ success: s.boolean() }),
});

// ---------------------------------------------------------------------------
// Tool provider
// ---------------------------------------------------------------------------

const gitTools = { gitStatus, gitCommit, gitPush, gitLog, gitCheckoutBranch };

export function createGitProvider(sandbox: SandboxClient): InferToolProvider<typeof gitTools> {
  return {
    gitStatus: async () => {
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
    gitCommit: async ({ files, message }: { files: string[]; message: string }) => {
      const escapedFiles = files.map((f) => `'${f.replace(/'/g, "'\\''")}'`).join(' ');
      await sandbox.exec(`git add ${escapedFiles}`);
      const escapedMsg = message.replace(/'/g, "'\\''");
      const result = await sandbox.exec(`git commit -m '${escapedMsg}'`);
      const match = result.stdout.match(/\[[\w/]+ ([a-f0-9]+)\]/);
      return { sha: match?.[1] ?? 'unknown' };
    },
    gitPush: async ({ branch }: { branch: string }) => {
      const escapedBranch = branch.replace(/'/g, "'\\''");
      const result = await sandbox.exec(`git push -u origin '${escapedBranch}'`);
      return { success: result.exitCode === 0 };
    },
    gitLog: async ({ count }: { count?: number }) => {
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
    gitCheckoutBranch: async ({ branch }: { branch: string }) => {
      const escapedBranch = branch.replace(/'/g, "'\\''");
      const result = await sandbox.exec(`git checkout -b '${escapedBranch}'`);
      return { success: result.exitCode === 0 };
    },
  };
}
