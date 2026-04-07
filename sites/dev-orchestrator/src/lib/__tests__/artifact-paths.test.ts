import { describe, expect, it } from 'bun:test';
import { planPath, reviewPath, implementationSummaryPath, designBranchName } from '../artifact-paths';

describe('artifact-paths', () => {
  describe('planPath', () => {
    it('returns the design doc path for an issue number', () => {
      expect(planPath(42)).toBe('/home/daytona/workspace/plans/issue-42.md');
    });
  });

  describe('reviewPath', () => {
    it('returns the DX review path', () => {
      expect(reviewPath(42, 'dx')).toBe('/home/daytona/workspace/reviews/issue-42/dx.md');
    });

    it('returns the product review path', () => {
      expect(reviewPath(42, 'product')).toBe(
        '/home/daytona/workspace/reviews/issue-42/product.md',
      );
    });

    it('returns the technical review path', () => {
      expect(reviewPath(42, 'technical')).toBe(
        '/home/daytona/workspace/reviews/issue-42/technical.md',
      );
    });

    it('returns the code review path', () => {
      expect(reviewPath(42, 'code')).toBe('/home/daytona/workspace/reviews/issue-42/code.md');
    });
  });

  describe('implementationSummaryPath', () => {
    it('returns the implementation summary path', () => {
      expect(implementationSummaryPath(42)).toBe(
        '/home/daytona/workspace/reviews/issue-42/implementation-summary.md',
      );
    });
  });

  describe('designBranchName', () => {
    it('returns the design branch name for an issue number', () => {
      expect(designBranchName(1748)).toBe('docs/issue-1748-design');
    });
  });
});
