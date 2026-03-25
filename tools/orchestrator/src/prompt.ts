/**
 * Prompt templates for Claude Code agents.
 *
 * The agent runs inside the vertz repo with CLAUDE.md and .claude/rules/ already loaded.
 * The prompt focuses on WHAT to do (the issue), not HOW (the rules handle that).
 */

import type { Issue } from './github';

function classifyIssue(issue: Issue): 'bug' | 'feature' | 'chore' | 'test' {
  const title = issue.title.toLowerCase();
  if (title.startsWith('fix(') || title.startsWith('fix:')) return 'bug';
  if (title.startsWith('feat(') || title.startsWith('feat:')) return 'feature';
  if (title.startsWith('test(') || title.startsWith('test:')) return 'test';
  if (title.startsWith('chore(') || title.startsWith('chore:')) return 'chore';
  // Check labels
  const labels = new Set(issue.labels.map((l) => l.name));
  if (labels.has('bug')) return 'bug';
  if (labels.has('enhancement')) return 'feature';
  return 'bug'; // default to bug workflow (simpler, no design doc)
}

function branchPrefix(type: 'bug' | 'feature' | 'chore' | 'test'): string {
  switch (type) {
    case 'bug': return 'fix';
    case 'feature': return 'feat';
    case 'chore': return 'chore';
    case 'test': return 'test';
  }
}

const BUG_WORKFLOW = `
## Workflow: Bug Fix

Follow the bug fix workflow from .claude/rules/:

1. **Read the issue** — understand the bug, expected vs actual behavior
2. **Explore the codebase** — find the relevant files, understand the current behavior
3. **Create branch** — \`git checkout -b <branch-name> main\`
4. **Write a failing test** (RED) — reproduce the bug as a test
5. **Fix the bug** (GREEN) — minimal change to make the test pass
6. **Refactor** — clean up if needed, keep tests green
7. **Quality gates** — run ALL:
   - \`bun test\` (at minimum the changed packages)
   - \`bun run typecheck\`
   - \`bunx biome check --write <changed-files>\`
8. **Commit** — \`<type>(<scope>): <description> (#ISSUE)\`
9. **Rebase on latest main** — MANDATORY before pushing:
   \`\`\`bash
   git fetch origin main
   git rebase origin/main
   \`\`\`
   If there are conflicts: resolve them, \`git add\` the resolved files, \`git rebase --continue\`. Then re-run quality gates to confirm nothing broke.
10. **Push & open PR** — push the branch, open PR to main with "Fixes #ISSUE" in the body
11. **Monitor CI** — check PR status, fix if needed

NO design doc needed for bugs. Go straight to implementation.
`;

const FEATURE_WORKFLOW = `
## Workflow: Feature

Follow the FULL feature workflow from .claude/rules/:

### Phase 0: Design (if not trivial)
If this feature changes public API or involves non-obvious design decisions:
1. Write a design doc in \`plans/\` with required sections (API Surface, Manifesto Alignment, Non-Goals, Unknowns, Type Flow Map, E2E Acceptance Test)
2. Self-review the design from 3 perspectives: DX, Product/scope, Technical
3. Iterate until the design is solid
4. Commit the design doc

If the feature is a straightforward addition (wiring props, adding a missing export, etc.), skip the design doc.

### Phase 1+: Implementation
1. **Create branch** — \`git checkout -b <branch-name> main\`
2. **Implement with strict TDD** — one test at a time (red → green → refactor)
3. **Quality gates after every green**:
   - \`bun test\`
   - \`bun run typecheck\`
   - \`bunx biome check --write <changed-files>\`
4. **Commit each phase**
5. **Self-review** — adversarially review your own changes. Look for:
   - Does it deliver what the issue asks?
   - TDD compliance?
   - Type gaps or missing edge cases?
   - Security issues?
6. **Fix any findings**, re-run quality gates
7. **Rebase on latest main** — MANDATORY before pushing:
   \`\`\`bash
   git fetch origin main
   git rebase origin/main
   \`\`\`
   If there are conflicts: resolve them, \`git add\` the resolved files, \`git rebase --continue\`. Then re-run quality gates to confirm nothing broke.
8. **Push & open PR** — push the branch, open PR to main
9. **Monitor CI** — check PR status, fix if needed
`;

const TEST_WORKFLOW = `
## Workflow: Test Addition

1. **Read the issue** — understand what tests are needed
2. **Explore the codebase** — find existing test patterns
3. **Create branch** — \`git checkout -b <branch-name> main\`
4. **Write the tests** — follow existing patterns in the repo
5. **Quality gates**:
   - \`bun test\`
   - \`bun run typecheck\`
   - \`bunx biome check --write <changed-files>\`
6. **Commit**
7. **Rebase on latest main** — MANDATORY before pushing:
   \`\`\`bash
   git fetch origin main
   git rebase origin/main
   \`\`\`
   Resolve any conflicts, re-run quality gates.
8. **Push & open PR**
9. **Monitor CI**
`;

export function buildPrompt(issue: Issue): string {
  const type = classifyIssue(issue);
  const prefix = branchPrefix(type);

  const workflow = type === 'feature'
    ? FEATURE_WORKFLOW
    : type === 'test'
      ? TEST_WORKFLOW
      : BUG_WORKFLOW;

  // Derive a short branch name from the issue title
  const slug = issue.title
    .replace(/^\w+\([^)]*\):\s*/, '') // remove type(scope): prefix
    .replace(/\[.*?\]\s*/g, '')       // remove [tags]
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40);

  const branchName = `${prefix}/${slug}`;

  return `You are an autonomous coding agent. Your task is to fully resolve GitHub issue #${issue.number}.

## Issue #${issue.number}: ${issue.title}

${issue.body || '(no description)'}

## Step 0: Validate the Issue Is Still Relevant

BEFORE creating a branch or writing any code, verify the issue still exists:

1. **Read the files mentioned in the issue** — check if the bug/gap still exists in the current codebase on \`origin/main\`
2. **Check recent git history** — run \`git log --oneline -20 origin/main\` and look for commits that may have already fixed this
3. **If the issue is already fixed or no longer applicable:**
   - Leave a comment on the issue: \`gh issue comment ${issue.number} --repo vertz-dev/vertz --body "This issue appears to be already resolved by <commit/PR>. Closing."\`
   - Close the issue: \`gh issue close ${issue.number} --repo vertz-dev/vertz --reason completed\`
   - Remove the in-progress label: \`gh issue edit ${issue.number} --repo vertz-dev/vertz --remove-label in-progress\`
   - **STOP here** — do NOT create a branch or PR
4. **If the issue is still valid** — proceed with the workflow below

## Branch

IMPORTANT: Always start from the latest main to avoid merge conflicts.

\`\`\`bash
git fetch origin main
git checkout -b ${branchName} origin/main
\`\`\`

${workflow}

## Critical Rules

- **Read CLAUDE.md and .claude/rules/** before starting — they define the exact process
- **Strict TDD** — every behavior needs a failing test first
- **Quality gates are mandatory** — tests + typecheck + lint must ALL pass before pushing
- **PR must reference the issue** — include "Fixes #${issue.number}" in the PR body
- **Be fully autonomous** — do NOT ask for user input. Make decisions based on the issue, code, and rules.
- **If blocked** — if something is truly ambiguous, leave a comment on the issue explaining the ambiguity and open the PR as draft
- **No shortcuts** — no \`@ts-ignore\`, no \`as any\`, no skipped tests, no \`--no-verify\`
- **Keep changes minimal** — only change what's needed to resolve the issue
- **Update docs** — if your changes introduce new APIs, change existing behavior, or add features:
  - **Public APIs** → update \`packages/mint-docs/\` (Mintlify documentation). New APIs get new pages or sections; changed behavior gets existing pages updated.
  - **Internal/framework APIs** → add or update docs in the relevant package's \`docs/\` folder or README explaining how to use it.
  - If you're unsure where the docs belong, default to \`packages/mint-docs/\`. Missing docs = incomplete PR.
- **Rebase before push** — ALWAYS \`git fetch origin main && git rebase origin/main\` before pushing. Resolve conflicts if any, then re-run quality gates. The PR MUST be conflict-free.
- **Changeset** — add a changeset file if the change affects published packages (not needed for examples)
`;
}
