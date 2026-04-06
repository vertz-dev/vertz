import { agent } from '@vertz/agents';
import { s } from '@vertz/schema';
import type { SandboxClient } from '../lib/sandbox-client';
import type { GitHubClient } from '../lib/github-client';
import { createGitHubTools } from '../tools/github';
import { createSandboxTools } from '../tools/sandbox-tools';

export function createPlannerAgent(sandbox: SandboxClient, github: GitHubClient) {
  const ghTools = createGitHubTools(github);
  const sbTools = createSandboxTools(sandbox);

  return agent('planner', {
    description:
      'Reads a GitHub issue and produces a design doc following Vertz conventions',
    state: s.object({
      issueNumber: s.number(),
      repo: s.string(),
    }),
    initialState: { issueNumber: 0, repo: '' },
    tools: {
      readIssue: ghTools.readIssue,
      readFile: sbTools.readFile,
      writeFile: sbTools.writeFile,
      searchCode: sbTools.searchCode,
      listFiles: sbTools.listFiles,
    },
    model: { provider: 'minimax' as const, model: 'MiniMax-M1' },
    prompt: {
      system: `You are a software architect for the Vertz framework.
Given a GitHub issue, produce a design doc in the Vertz format:
API Surface, Manifesto Alignment, Non-Goals, Unknowns, Type Flow Map, E2E Acceptance Test, Implementation Plan.
Follow the conventions in .claude/rules/design-and-planning.md strictly.
Write the design doc to plans/ in the repo using the writeFile tool.`,
      maxTokens: 4096,
    },
    loop: {
      maxIterations: 30,
      tokenBudget: { max: 50_000, warningThreshold: 0.8, stopThreshold: 0.95 },
      contextCompression: {
        maxMessages: 60,
        compress: async (msgs) => {
          const recent = msgs.slice(-20);
          return [
            { role: 'system' as const, content: 'Previous conversation compressed.' },
            ...recent,
          ];
        },
      },
    },
  });
}
