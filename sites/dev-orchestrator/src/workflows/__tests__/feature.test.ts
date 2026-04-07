import { describe, expect, it } from 'bun:test';
import { featureWorkflow } from '../feature';

describe('Feature: Feature workflow definition', () => {
  describe('Given the static feature workflow', () => {
    const ctx = { workflow: { input: { issueNumber: 42, repo: 'vertz-dev/vertz' } }, prev: {} };

    it('Then has kind "workflow" and name "feature"', () => {
      expect(featureWorkflow.kind).toBe('workflow');
      expect(featureWorkflow.name).toBe('feature');
    });

    it('Then has an input schema requiring issueNumber and repo', () => {
      expect(featureWorkflow.input).toBeDefined();
    });

    it('Then has 9 steps in the correct order', () => {
      expect(featureWorkflow.steps).toHaveLength(9);
      const stepNames = featureWorkflow.steps.map((s) => s.name);
      expect(stepNames).toEqual([
        'plan',
        'review-dx',
        'review-product',
        'review-technical',
        'publish-design-pr',
        'human-approval',
        'implement',
        'code-review',
        'ci-monitor',
      ]);
    });

    it('Then each step has kind "step"', () => {
      for (const s of featureWorkflow.steps) {
        expect(s.kind).toBe('step');
      }
    });

    it('Then the human-approval step has an approval config', () => {
      const approvalStep = featureWorkflow.steps.find((s) => s.name === 'human-approval');
      expect(approvalStep).toBeDefined();
      expect(approvalStep!.approval).toBeDefined();
      expect(approvalStep!.approval!.timeout).toBe('7d');
    });

    it('Then the plan step uses the planner agent', () => {
      const planStep = featureWorkflow.steps.find((s) => s.name === 'plan');
      expect(planStep!.agent).toBeDefined();
      expect(planStep!.agent!.name).toBe('planner');
    });

    it('Then the implement step uses the implementer agent', () => {
      const implStep = featureWorkflow.steps.find((s) => s.name === 'implement');
      expect(implStep!.agent).toBeDefined();
      expect(implStep!.agent!.name).toBe('implementer');
    });

    it('Then the ci-monitor step uses the ci-monitor agent', () => {
      const ciStep = featureWorkflow.steps.find((s) => s.name === 'ci-monitor');
      expect(ciStep!.agent).toBeDefined();
      expect(ciStep!.agent!.name).toBe('ci-monitor');
    });

    it('Then the review steps use the reviewer agent', () => {
      const reviewSteps = featureWorkflow.steps.filter((s) => s.name.startsWith('review-'));
      expect(reviewSteps).toHaveLength(3);
      for (const rs of reviewSteps) {
        expect(rs.agent).toBeDefined();
        expect(rs.agent!.name).toBe('reviewer');
      }
    });

    it('Then the code-review step uses the reviewer agent', () => {
      const codeReview = featureWorkflow.steps.find((s) => s.name === 'code-review');
      expect(codeReview!.agent).toBeDefined();
      expect(codeReview!.agent!.name).toBe('reviewer');
    });

    it('Then the publish-design-pr step uses the publisher agent', () => {
      const pubStep = featureWorkflow.steps.find((s) => s.name === 'publish-design-pr');
      expect(pubStep).toBeDefined();
      expect(pubStep!.agent).toBeDefined();
      expect(pubStep!.agent!.name).toBe('publisher');
    });

    describe('When step inputs are resolved with issue #42', () => {
      it('Then the plan step references the artifact path, not inline content', () => {
        const planStep = featureWorkflow.steps.find((s) => s.name === 'plan')!;
        const result = planStep.input!(ctx);
        const msg = typeof result === 'string' ? result : result.message;
        expect(msg).toContain('plans/issue-42.md');
        expect(msg).toContain('#42');
      });

      it('Then the implement step references file paths, not inline prev content', () => {
        const implStep = featureWorkflow.steps.find((s) => s.name === 'implement')!;
        const result = implStep.input!(ctx);
        const msg = typeof result === 'string' ? result : result.message;
        expect(msg).toContain('plans/issue-42.md');
        expect(msg).toContain('reviews/issue-42/dx.md');
        expect(msg).toContain('reviews/issue-42/product.md');
        expect(msg).toContain('reviews/issue-42/technical.md');
        expect(msg).toContain('implementation-summary.md');
        // Must be short — no inline 42KB content
        expect(msg.length).toBeLessThan(1000);
      });

      it('Then review steps reference the design doc path', () => {
        for (const name of ['review-dx', 'review-product', 'review-technical']) {
          const step = featureWorkflow.steps.find((s) => s.name === name)!;
          const result = step.input!(ctx);
          const msg = typeof result === 'string' ? result : result.message;
          expect(msg).toContain('plans/issue-42.md');
          expect(msg).toContain('reviews/issue-42/');
        }
      });

      it('Then the code-review step references the implementation summary path', () => {
        const step = featureWorkflow.steps.find((s) => s.name === 'code-review')!;
        const result = step.input!(ctx);
        const msg = typeof result === 'string' ? result : result.message;
        expect(msg).toContain('implementation-summary.md');
      });

      it('Then the publish-design-pr step references branch name, artifact paths, and repo', () => {
        const step = featureWorkflow.steps.find((s) => s.name === 'publish-design-pr')!;
        const result = step.input!(ctx);
        const msg = typeof result === 'string' ? result : result.message;
        expect(msg).toContain('docs/issue-42-design');
        expect(msg).toContain('plans/issue-42.md');
        expect(msg).toContain('reviews/issue-42/dx.md');
        expect(msg).toContain('reviews/issue-42/product.md');
        expect(msg).toContain('reviews/issue-42/technical.md');
        expect(msg).toContain('vertz-dev/vertz');
        expect(msg).toContain('#42');
      });
    });
  });
});
