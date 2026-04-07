import { describe, expect, it } from 'bun:test';
import { createFeatureWorkflow } from '../feature';
import type { SandboxClient } from '../../lib/sandbox-client';
import type { GitHubClient } from '../../lib/github-client';

function stubSandbox(): SandboxClient {
  return {
    exec: async () => ({ stdout: '', stderr: '', exitCode: 0 }),
    readFile: async () => '',
    writeFile: async () => {},
    searchFiles: async () => [],
    listFiles: async () => [],
    destroy: async () => {},
  };
}

function stubGitHub(): GitHubClient {
  return {
    getIssue: async () => ({ title: '', body: '', labels: [] }),
    getPrChecks: async () => ({ status: 'success' as const, checks: [] }),
    createPr: async () => ({ number: 1, url: '' }),
    commentOnIssue: async () => ({ commentId: 1 }),
  };
}

describe('Feature: Feature workflow definition', () => {
  describe('Given a feature workflow created with sandbox and GitHub clients', () => {
    const wf = createFeatureWorkflow(stubSandbox(), stubGitHub());

    it('Then has kind "workflow" and name "feature"', () => {
      expect(wf.kind).toBe('workflow');
      expect(wf.name).toBe('feature');
    });

    it('Then has an input schema requiring issueNumber and repo', () => {
      expect(wf.input).toBeDefined();
    });

    it('Then has 8 steps in the correct order', () => {
      expect(wf.steps).toHaveLength(8);
      const stepNames = wf.steps.map((s) => s.name);
      expect(stepNames).toEqual([
        'plan',
        'review-dx',
        'review-product',
        'review-technical',
        'human-approval',
        'implement',
        'code-review',
        'ci-monitor',
      ]);
    });

    it('Then each step has kind "step"', () => {
      for (const s of wf.steps) {
        expect(s.kind).toBe('step');
      }
    });

    it('Then the human-approval step has an approval config', () => {
      const approvalStep = wf.steps.find((s) => s.name === 'human-approval');
      expect(approvalStep).toBeDefined();
      expect(approvalStep!.approval).toBeDefined();
      expect(approvalStep!.approval!.timeout).toBe('7d');
    });

    it('Then the plan step uses the planner agent', () => {
      const planStep = wf.steps.find((s) => s.name === 'plan');
      expect(planStep!.agent).toBeDefined();
      expect(planStep!.agent!.name).toBe('planner');
    });

    it('Then the implement step uses the implementer agent', () => {
      const implStep = wf.steps.find((s) => s.name === 'implement');
      expect(implStep!.agent).toBeDefined();
      expect(implStep!.agent!.name).toBe('implementer');
    });

    it('Then the ci-monitor step uses the ci-monitor agent', () => {
      const ciStep = wf.steps.find((s) => s.name === 'ci-monitor');
      expect(ciStep!.agent).toBeDefined();
      expect(ciStep!.agent!.name).toBe('ci-monitor');
    });

    it('Then the review steps use the reviewer agent', () => {
      const reviewSteps = wf.steps.filter((s) => s.name.startsWith('review-'));
      expect(reviewSteps).toHaveLength(3);
      for (const rs of reviewSteps) {
        expect(rs.agent).toBeDefined();
        expect(rs.agent!.name).toBe('reviewer');
      }
    });

    it('Then the code-review step uses the reviewer agent', () => {
      const codeReview = wf.steps.find((s) => s.name === 'code-review');
      expect(codeReview!.agent).toBeDefined();
      expect(codeReview!.agent!.name).toBe('reviewer');
    });
  });
});
