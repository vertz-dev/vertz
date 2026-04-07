import { agent } from '@vertz/agents';
import { s } from '@vertz/schema';
import type { SandboxClient } from '../lib/sandbox-client';
import type { GitHubClient } from '../lib/github-client';
import { createGitHubTools } from '../tools/github';
import { createSandboxTools } from '../tools/sandbox-tools';
import { createGitTools } from '../tools/git';

export function createCiMonitorAgent(sandbox: SandboxClient, github: GitHubClient) {
  const ghTools = createGitHubTools(github);
  const sbTools = createSandboxTools(sandbox);
  const gitTools = createGitTools(sandbox);

  return agent('ci-monitor', {
    description:
      'Monitors GitHub CI status, diagnoses failures, and triggers fixes',
    state: s.object({
      prNumber: s.number(),
      attempts: s.number(),
    }),
    initialState: { prNumber: 0, attempts: 0 },
    tools: {
      ghPrChecks: ghTools.ghPrChecks,
      readFile: sbTools.readFile,
      gitLog: gitTools.gitLog,
    },
    model: { provider: 'minimax' as const, model: 'MiniMax-M1' },
    prompt: {
      system: `You monitor GitHub CI for a PR. Check status, diagnose failures, report results.
If CI fails, analyze the error and report what needs to be fixed.
Use ghPrChecks to check CI status and readFile to inspect failing code.`,
      maxTokens: 2048,
    },
    loop: {
      maxIterations: 10,
      tokenBudget: { max: 20_000 },
    },
  });
}
