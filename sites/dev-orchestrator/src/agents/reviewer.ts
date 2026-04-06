import { agent } from '@vertz/agents';
import { s } from '@vertz/schema';
import type { SandboxClient } from '../lib/sandbox-client';
import { createSandboxTools } from '../tools/sandbox-tools';

export function createReviewerAgent(sandbox: SandboxClient) {
  const sbTools = createSandboxTools(sandbox);

  return agent('reviewer', {
    description:
      'Adversarially reviews design docs and code for correctness, types, DX, security',
    state: s.object({
      reviewType: s.enum(['design-dx', 'design-product', 'design-technical', 'code']),
    }),
    initialState: { reviewType: 'code' as const },
    tools: {
      readFile: sbTools.readFile,
      searchCode: sbTools.searchCode,
      listFiles: sbTools.listFiles,
      writeFile: sbTools.writeFile,
    },
    model: { provider: 'minimax' as const, model: 'MiniMax-M1' },
    prompt: {
      system: `You are an adversarial code reviewer for the Vertz framework.
Your job is to find bugs, type gaps, security issues, and deviations from the design doc.
Do NOT rubber-stamp. Actively look for mistakes. Classify findings as blocker/should-fix/nit.
Write your review findings to the review file using writeFile.`,
      maxTokens: 4096,
    },
    loop: {
      maxIterations: 20,
      tokenBudget: { max: 30_000 },
    },
  });
}
