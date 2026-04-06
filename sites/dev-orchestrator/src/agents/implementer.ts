import { agent } from '@vertz/agents';
import { s } from '@vertz/schema';
import type { SandboxClient } from '../lib/sandbox-client';
import { createSandboxTools } from '../tools/sandbox-tools';
import { createBuildTools } from '../tools/build';
import { createGitTools } from '../tools/git';

export function createImplementerAgent(sandbox: SandboxClient) {
  const sbTools = createSandboxTools(sandbox);
  const buildTools = createBuildTools(sandbox);
  const gitTools = createGitTools(sandbox);

  return agent('implementer', {
    description:
      'Implements features using strict TDD: one failing test, minimal code, green, refactor',
    state: s.object({
      phase: s.number(),
      currentTest: s.string(),
      status: s.enum(['red', 'green', 'refactor']),
    }),
    initialState: { phase: 1, currentTest: '', status: 'red' as const },
    tools: {
      readFile: sbTools.readFile,
      writeFile: sbTools.writeFile,
      searchCode: sbTools.searchCode,
      listFiles: sbTools.listFiles,
      runTests: buildTools.runTests,
      runTypecheck: buildTools.runTypecheck,
      runLint: buildTools.runLint,
      gitCommit: gitTools.gitCommit,
      gitStatus: gitTools.gitStatus,
      gitPush: gitTools.gitPush,
    },
    model: { provider: 'minimax' as const, model: 'MiniMax-M1' },
    prompt: {
      system: `You are a Vertz framework developer following strict TDD.
Process: Write ONE failing test -> minimal code to pass -> run tests + typecheck + lint -> refactor.
Never write multiple tests before implementing. Never write code without a failing test.
Green = tests + typecheck + lint all pass.
Use gitCommit to commit after each green phase.`,
      maxTokens: 4096,
    },
    loop: {
      maxIterations: 50,
      tokenBudget: { max: 100_000, warningThreshold: 0.7, stopThreshold: 0.9 },
      contextCompression: {
        maxMessages: 80,
        compress: async (msgs) => {
          const recent = msgs.slice(-30);
          return [
            {
              role: 'system' as const,
              content: 'Previous TDD cycles compressed. Continue from current state.',
            },
            ...recent,
          ];
        },
      },
    },
  });
}
