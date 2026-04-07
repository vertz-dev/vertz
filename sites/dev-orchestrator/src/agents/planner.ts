import { agent } from '@vertz/agents';
import { s } from '@vertz/schema';
import { readIssue } from '../tools/github';
import { readFile, writeFile, searchCode, listFiles } from '../tools/sandbox-tools';

export const plannerAgent = agent('planner', {
  description:
    'Reads a GitHub issue and produces a design doc following Vertz conventions',
  state: s.object({
    issueNumber: s.number(),
    repo: s.string(),
  }),
  initialState: { issueNumber: 0, repo: '' },
  tools: {
    readIssue,
    readFile,
    writeFile,
    searchCode,
    listFiles,
  },
  model: { provider: 'minimax' as const, model: 'MiniMax-M2.7' },
  prompt: {
    system: `You are a software architect for the Vertz framework.
Given a GitHub issue, produce a design doc in the Vertz format:
API Surface, Manifesto Alignment, Non-Goals, Unknowns, Type Flow Map, E2E Acceptance Test, Implementation Plan.
The Implementation Plan MUST contain numbered phases, each with a clear scope and acceptance criteria.
Write the design doc to the EXACT path provided in the user message using the writeFile tool.
Follow the conventions in .claude/rules/design-and-planning.md strictly.`,
    maxTokens: 4096,
  },
  loop: {
    maxIterations: 30,
    tokenBudget: { max: 50_000, warningThreshold: 0.8, stopThreshold: 0.95 },
    contextCompression: {
      maxMessages: 60,
      compress: async (msgs) => {
        const writtenFiles: string[] = [];
        for (const msg of msgs) {
          if (msg.role === 'tool' && msg.toolName === 'writeFile') {
            try {
              const parsed = JSON.parse(msg.content);
              if (parsed.success) writtenFiles.push(msg.toolName);
            } catch { /* skip */ }
          }
        }

        const recent = msgs.slice(-15);
        const summary = writtenFiles.length > 0
          ? `Previous work: wrote ${writtenFiles.length} file(s) to sandbox.`
          : 'Previous conversation compressed.';

        return [
          { role: 'system' as const, content: `${summary} Continue from current state.` },
          ...recent,
        ];
      },
    },
  },
});
