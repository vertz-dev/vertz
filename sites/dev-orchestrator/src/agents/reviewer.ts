import { agent } from '@vertz/agents';
import { s } from '@vertz/schema';
import { readFile, searchCode, listFiles, writeFile } from '../tools/sandbox-tools';

export const reviewerAgent = agent('reviewer', {
  description:
    'Adversarially reviews design docs and code for correctness, types, DX, security',
  state: s.object({
    reviewType: s.enum(['design-dx', 'design-product', 'design-technical', 'code']),
  }),
  initialState: { reviewType: 'code' as const },
  tools: {
    readFile,
    searchCode,
    listFiles,
    writeFile,
  },
  model: { provider: 'minimax' as const, model: 'MiniMax-M2.7' },
  prompt: {
    system: `You are an adversarial code reviewer for the Vertz framework.
Your job is to find bugs, type gaps, security issues, and deviations from the design doc.
Do NOT rubber-stamp. Actively look for mistakes. Classify findings as blocker/should-fix/nit.

## Workflow (follow this order strictly)

1. Read the design doc from the path provided in the user message using readFile.
2. Read 2-3 relevant source files to verify technical feasibility and check for gaps.
   Do NOT exhaustively explore the codebase — focus on the files most relevant to the design.
3. Write your review to the EXACT review file path provided in the user message using writeFile.
4. After writing the review, respond with a short summary (2-3 sentences) of your verdict.
   This final text response signals that you are DONE.

IMPORTANT: Do not keep reading more files after you have enough context. Write the review and finish.
A focused review of 3-5 files is better than an exhaustive exploration that runs out of iterations.`,
    maxTokens: 4096,
  },
  loop: {
    maxIterations: 30,
    tokenBudget: { max: 50_000, warningThreshold: 0.8, stopThreshold: 0.95 },
    contextCompression: {
      maxMessages: 40,
      compress: async (msgs) => {
        const filesRead: string[] = [];
        const filesWritten: string[] = [];

        for (const msg of msgs) {
          if (msg.role === 'tool') {
            try {
              const parsed = JSON.parse(msg.content);
              if (msg.toolName === 'readFile' && !parsed.error) {
                filesRead.push('a file');
              }
              if (msg.toolName === 'writeFile' && parsed.success) {
                filesWritten.push('a file');
              }
            } catch { /* skip */ }
          }
        }

        const recent = msgs.slice(-15);
        const parts: string[] = ['Previous review work compressed.'];
        if (filesRead.length > 0) parts.push(`Read ${filesRead.length} file(s).`);
        if (filesWritten.length > 0) parts.push(`Wrote ${filesWritten.length} review file(s).`);
        parts.push('Continue from current state. If you have written the review, respond with a summary and stop.');

        return [
          { role: 'system' as const, content: parts.join(' ') },
          ...recent,
        ];
      },
    },
  },
});
