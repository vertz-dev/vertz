import { agent } from '@vertz/agents';
import { s } from '@vertz/schema';
import { readFile } from '../tools/sandbox-tools';
import { gitCheckoutBranch, gitCommit, gitPush } from '../tools/git';
import { createPr } from '../tools/github';

export const publisherAgent = agent('publisher', {
  description:
    'Creates a branch, commits design artifacts, and opens a PR for human review',
  state: s.object({
    issueNumber: s.number(),
    repo: s.string(),
  }),
  initialState: { issueNumber: 0, repo: '' },
  tools: {
    readFile,
    gitCheckoutBranch,
    gitCommit,
    gitPush,
    createPr,
  },
  model: { provider: 'minimax' as const, model: 'MiniMax-M2.7' },
  prompt: {
    system: `You publish design artifacts as a pull request for human review.

Your job:
1. Create a new branch using gitCheckoutBranch (use the exact branch name from the user message).
2. Read the design doc and review files using readFile to understand what was produced.
3. Commit ALL the artifact files using gitCommit (plan file + all review files).
4. Push the branch using gitPush.
5. Create a pull request using createPr with:
   - A clear title referencing the issue number
   - A body that summarizes the design doc and review findings
   - The head branch you created
   - Base branch "main"

After the PR is created, respond with ONLY a JSON object: {"prNumber": <number>, "prUrl": "<url>"}

Important:
- Use the EXACT file paths provided in the user message
- The branch name is provided — do not invent your own
- Commit message format: "docs(design): add design doc for #<issueNumber>"
- Include all review files in the same commit as the design doc`,
    maxTokens: 2048,
  },
  loop: {
    maxIterations: 15,
    tokenBudget: { max: 20_000, warningThreshold: 0.8, stopThreshold: 0.95 },
  },
});
