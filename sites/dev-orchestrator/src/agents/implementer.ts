import { agent } from '@vertz/agents';
import { s } from '@vertz/schema';
import { readFile, writeFile, searchCode, listFiles } from '../tools/sandbox-tools';
import { runTests, runTypecheck, runLint } from '../tools/build';
import { gitCommit, gitStatus, gitPush } from '../tools/git';

export const implementerAgent = agent('implementer', {
  description:
    'Implements features using strict TDD: one failing test, minimal code, green, refactor',
  state: s.object({
    phase: s.number(),
    currentTest: s.string(),
    status: s.enum(['red', 'green', 'refactor']),
  }),
  initialState: { phase: 1, currentTest: '', status: 'red' as const },
  tools: {
    readFile,
    writeFile,
    searchCode,
    listFiles,
    runTests,
    runTypecheck,
    runLint,
    gitCommit,
    gitStatus,
    gitPush,
  },
  model: { provider: 'minimax' as const, model: 'MiniMax-M2.7' },
  prompt: {
    system: `You are a Vertz framework developer following strict TDD.

WORKFLOW:
1. Read the design doc from the path given in the task message.
2. Read all review files from the paths given.
3. Extract the Implementation Plan section. Identify all numbered phases.
4. For EACH phase (in order):
   a. Read the phase's acceptance criteria
   b. Write ONE failing test for the first behavior
   c. Write minimal code to pass -> run quality gates (runTests, runTypecheck, runLint) -> refactor
   d. Repeat (b-c) for each behavior in the phase
   e. When the phase is green (all quality gates pass), commit with gitCommit
5. After all phases complete, push with gitPush.
6. Write a brief implementation summary to the summary path given in the task message.

RULES:
- Never write multiple tests before implementing.
- Never write code without a failing test.
- Green = tests + typecheck + lint all pass.
- If a quality gate fails, fix it before moving on.
- Commit after each completed phase, not after each test.`,
    maxTokens: 4096,
  },
  loop: {
    maxIterations: 50,
    tokenBudget: { max: 100_000, warningThreshold: 0.7, stopThreshold: 0.9 },
    contextCompression: {
      maxMessages: 60,
      compress: async (msgs) => {
        const completedCommits: string[] = [];
        let fileWriteCount = 0;
        let testRunCount = 0;

        for (const msg of msgs) {
          if (msg.role !== 'tool') continue;
          if (msg.toolName === 'gitCommit') {
            try {
              const result = JSON.parse(msg.content);
              if (result.sha) completedCommits.push(result.sha);
            } catch { /* skip */ }
          }
          if (msg.toolName === 'writeFile' && msg.content.includes('"success":true')) {
            fileWriteCount++;
          }
          if (msg.toolName === 'runTests') {
            testRunCount++;
          }
        }

        const recent = msgs.slice(-20);
        const summaryParts = [
          `Progress: ${completedCommits.length} phase commit(s) made.`,
          completedCommits.length > 0
            ? `Commit SHAs: ${completedCommits.join(', ')}`
            : 'No commits yet — still implementing.',
          `Files written: ${fileWriteCount}. Test runs: ${testRunCount}.`,
          'Continue implementing the next phase from the design doc.',
        ];

        return [
          { role: 'system' as const, content: summaryParts.join('\n') },
          ...recent,
        ];
      },
    },
  },
});
