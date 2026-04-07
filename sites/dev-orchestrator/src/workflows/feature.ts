import { workflow } from '@vertz/agents';
import { s } from '@vertz/schema';
import type { SandboxClient } from '../lib/sandbox-client';
import type { GitHubClient } from '../lib/github-client';
import { createPlannerAgent } from '../agents/planner';
import { createReviewerAgent } from '../agents/reviewer';
import { createImplementerAgent } from '../agents/implementer';
import { createCiMonitorAgent } from '../agents/ci-monitor';

interface FeatureInput {
  readonly issueNumber: number;
  readonly repo: string;
}

interface StepResultLike {
  readonly response?: string;
}

function input(ctx: { workflow: { input: unknown } }): FeatureInput {
  return ctx.workflow.input as FeatureInput;
}

function prev(ctx: { prev: Record<string, unknown> }, name: string): string {
  return (ctx.prev[name] as StepResultLike)?.response ?? '';
}

export function createFeatureWorkflow(sandbox: SandboxClient, github: GitHubClient) {
  const plannerAgent = createPlannerAgent(sandbox, github);
  const reviewerAgent = createReviewerAgent(sandbox);
  const implementerAgent = createImplementerAgent(sandbox);
  const ciMonitorAgent = createCiMonitorAgent(sandbox, github);

  return workflow('feature', {
    input: s.object({
      issueNumber: s.number(),
      repo: s.string(),
    }),
  })
    .step('plan', {
      agent: plannerAgent,
      input: (ctx) => ({
        message: `Read issue #${input(ctx).issueNumber} from ${input(ctx).repo} and create a design doc following the Vertz format. Write it to plans/ in the repo.`,
      }),
    })
    .step('review-dx', {
      agent: reviewerAgent,
      input: (ctx) => ({
        message: `Review this design doc from a DX perspective. Is the API intuitive? Will developers love it?\n\n${prev(ctx, 'plan')}`,
      }),
    })
    .step('review-product', {
      agent: reviewerAgent,
      input: (ctx) => ({
        message: `Review this design doc from a product/scope perspective. Does it fit the roadmap? Right scope?\n\n${prev(ctx, 'plan')}`,
      }),
    })
    .step('review-technical', {
      agent: reviewerAgent,
      input: (ctx) => ({
        message: `Review this design doc from a technical perspective. Can it be built as designed? Hidden complexity?\n\n${prev(ctx, 'plan')}`,
      }),
    })
    .step('human-approval', {
      approval: {
        message: (ctx) =>
          `Design doc for #${input(ctx).issueNumber} reviewed by DX, Product, and Technical agents. Waiting for approval comment from a repo collaborator.`,
        timeout: '7d',
      },
    })
    .step('implement', {
      agent: implementerAgent,
      input: (ctx) => ({
        message: `Implement the approved design using strict TDD. Follow the implementation plan phases. Run quality gates (vtz run test, vtz run typecheck, vtz run lint) after each green. Commit after each phase. Push when all phases pass.\n\nDesign:\n${prev(ctx, 'plan')}\n\nReview feedback:\n${prev(ctx, 'review-dx')}\n${prev(ctx, 'review-product')}\n${prev(ctx, 'review-technical')}`,
      }),
    })
    .step('code-review', {
      agent: reviewerAgent,
      input: (ctx) => ({
        message: `Adversarially review the implementation. Check: delivers what the design doc asks, TDD compliance, no type gaps, no security issues.\n\nDesign:\n${prev(ctx, 'plan')}\n\nImplementation:\n${prev(ctx, 'implement')}`,
      }),
    })
    .step('ci-monitor', {
      agent: ciMonitorAgent,
      input: (ctx) => ({
        message: `Monitor CI for the PR. Check status, report if green or diagnose failures.\n\nContext:\n${prev(ctx, 'implement')}`,
      }),
    })
    .build();
}
