import { workflow } from '@vertz/agents';
import { s } from '@vertz/schema';
import { planPath, reviewPath, implementationSummaryPath } from '../lib/artifact-paths';
import { plannerAgent } from '../agents/planner';
import { reviewerAgent } from '../agents/reviewer';
import { implementerAgent } from '../agents/implementer';
import { ciMonitorAgent } from '../agents/ci-monitor';

interface FeatureInput {
  readonly issueNumber: number;
  readonly repo: string;
}

function input(ctx: { workflow: { input: unknown } }): FeatureInput {
  return ctx.workflow.input as FeatureInput;
}

export const featureWorkflow = workflow('feature', {
  input: s.object({
    issueNumber: s.number(),
    repo: s.string(),
  }),
})
  .step('plan', {
    agent: plannerAgent,
    input: (ctx) => ({
      message: [
        `Read issue #${input(ctx).issueNumber} from ${input(ctx).repo} and create a design doc following the Vertz format.`,
        `Write it to: ${planPath(input(ctx).issueNumber)}`,
      ].join('\n'),
    }),
  })
  .step('review-dx', {
    agent: reviewerAgent,
    input: (ctx) => ({
      message: [
        'Review the design doc from a DX perspective. Is the API intuitive? Will developers love it?',
        '',
        `Design doc: ${planPath(input(ctx).issueNumber)}`,
        `Write review to: ${reviewPath(input(ctx).issueNumber, 'dx')}`,
      ].join('\n'),
    }),
  })
  .step('review-product', {
    agent: reviewerAgent,
    input: (ctx) => ({
      message: [
        'Review the design doc from a product/scope perspective. Does it fit the roadmap? Right scope?',
        '',
        `Design doc: ${planPath(input(ctx).issueNumber)}`,
        `Write review to: ${reviewPath(input(ctx).issueNumber, 'product')}`,
      ].join('\n'),
    }),
  })
  .step('review-technical', {
    agent: reviewerAgent,
    input: (ctx) => ({
      message: [
        'Review the design doc from a technical perspective. Can it be built as designed? Hidden complexity?',
        '',
        `Design doc: ${planPath(input(ctx).issueNumber)}`,
        `Write review to: ${reviewPath(input(ctx).issueNumber, 'technical')}`,
      ].join('\n'),
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
      message: [
        'Implement the approved design using strict TDD.',
        '',
        `1. Read the design doc: ${planPath(input(ctx).issueNumber)}`,
        '2. Read the review feedback:',
        `   - DX: ${reviewPath(input(ctx).issueNumber, 'dx')}`,
        `   - Product: ${reviewPath(input(ctx).issueNumber, 'product')}`,
        `   - Technical: ${reviewPath(input(ctx).issueNumber, 'technical')}`,
        '3. Extract the phases from the Implementation Plan section of the design doc.',
        '4. Implement ONE phase at a time. For each phase:',
        '   a. Write failing tests first',
        '   b. Write minimal code to pass',
        '   c. Run quality gates (runTests, runTypecheck, runLint)',
        '   d. Commit when green (gitCommit)',
        '5. After all phases pass, push (gitPush).',
        `6. Write a brief implementation summary to: ${implementationSummaryPath(input(ctx).issueNumber)}`,
      ].join('\n'),
    }),
  })
  .step('code-review', {
    agent: reviewerAgent,
    input: (ctx) => ({
      message: [
        'Adversarially review the implementation. Check: delivers what the design doc asks, TDD compliance, no type gaps, no security issues.',
        '',
        `Design doc: ${planPath(input(ctx).issueNumber)}`,
        `Implementation summary: ${implementationSummaryPath(input(ctx).issueNumber)}`,
        `Write review to: ${reviewPath(input(ctx).issueNumber, 'code')}`,
      ].join('\n'),
    }),
  })
  .step('ci-monitor', {
    agent: ciMonitorAgent,
    input: (ctx) => ({
      message: [
        'Monitor CI for the PR. Check status, report if green or diagnose failures.',
        '',
        `Implementation summary: ${implementationSummaryPath(input(ctx).issueNumber)}`,
      ].join('\n'),
    }),
  })
  .build();
