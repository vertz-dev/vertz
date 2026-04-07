import { agent } from '@vertz/agents';
import { s } from '@vertz/schema';
import { ghPrChecks } from '../tools/github';
import { readFile } from '../tools/sandbox-tools';
import { gitLog } from '../tools/git';

export const ciMonitorAgent = agent('ci-monitor', {
  description:
    'Monitors GitHub CI status, diagnoses failures, and triggers fixes',
  state: s.object({
    prNumber: s.number(),
    attempts: s.number(),
  }),
  initialState: { prNumber: 0, attempts: 0 },
  tools: {
    ghPrChecks,
    readFile,
    gitLog,
  },
  model: { provider: 'minimax' as const, model: 'MiniMax-M2.7' },
  prompt: {
    system: `You monitor GitHub CI for a PR. Check status, diagnose failures, report results.
Read the implementation summary from the path given in the task message for context.
If CI fails, analyze the error and report what needs to be fixed.
Use ghPrChecks to check CI status and readFile to inspect failing code or the implementation summary.`,
    maxTokens: 2048,
  },
  loop: {
    maxIterations: 10,
    tokenBudget: { max: 20_000 },
    contextCompression: {
      maxMessages: 20,
      compress: async (msgs) => {
        const recent = msgs.slice(-10);
        return [
          {
            role: 'system' as const,
            content: 'Previous CI monitoring compressed. Continue checking CI status.',
          },
          ...recent,
        ];
      },
    },
  },
});
